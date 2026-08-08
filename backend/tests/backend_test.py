"""Backend tests for Fatima's Spoken English Centre.

Covers new iteration:
- /api/auth/status
- /api/auth/signup (single admin, 403 on second)
- /api/auth/login + /api/auth/me
- Seat limits (spots_left, batch-full block, auto-hide from public)
- Accept flow (/api/admin/enrolments/{id}/accept)
Plus regression: admin protection, course CRUD, enrolment validation, OTP flow.
"""
import os
import uuid
import asyncio
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).parent.parent / ".env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=", 1)[1].splitlines()[0]
BASE_URL = BASE_URL.strip().rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_NAME = "Fatima"
ADMIN_EMAIL = "fatima@fatimaenglish.com"
ADMIN_PASSWORD = "Fatima@2026"
OTP_TEST_EMAIL_DOMAIN = "resend.dev"

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


def _mongo():
    return AsyncIOMotorClient(MONGO_URL)


def _run(coro):
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


# ---------------- Session-scoped signup/token ----------------
@pytest.fixture(scope="session")
def token():
    """Ensure exactly one admin exists (Fatima) and return access token.

    Race-safe across xdist workers: if signup 403s (another worker won), reset
    admin_users to Fatima's account and retry login.
    """
    async def ensure_fatima_only():
        cli = _mongo()
        db = cli[DB_NAME]
        existing = await db.admin_users.find_one({"email": ADMIN_EMAIL})
        if not existing:
            # Wipe any other admin so Fatima signup can proceed
            await db.admin_users.delete_many({})
        cli.close()

    # Fast path: login
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if r.status_code == 200:
        return r.json()["token"]

    _run(ensure_fatima_only())
    r = requests.post(f"{API}/auth/signup", json={"name": ADMIN_NAME, "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if r.status_code == 200:
        return r.json()["token"]

    # Signup lost the race — another worker created a different admin. Retry login,
    # or wipe + signup once more.
    r2 = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if r2.status_code == 200:
        return r2.json()["token"]

    _run(ensure_fatima_only())
    r3 = requests.post(f"{API}/auth/signup", json={"name": ADMIN_NAME, "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r3.status_code == 200, r3.text
    return r3.json()["token"]


@pytest.fixture(scope="session")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# ---------------- Auth ----------------
class TestAuth:
    def test_status_and_signup_flow(self, token):
        # After token fixture, admin should exist
        r = requests.get(f"{API}/auth/status")
        assert r.status_code == 200
        assert r.json()["admin_exists"] is True

    def test_second_signup_forbidden(self, token):
        r = requests.post(f"{API}/auth/signup", json={
            "name": "Impostor", "email": "someone_else@resend.dev", "password": "secret123"
        })
        assert r.status_code == 403, r.text

    def test_login_success(self, token):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        data = r.json()
        assert "token" in data and isinstance(data["token"], str)
        assert data["user"]["email"] == ADMIN_EMAIL

    def test_login_wrong_password(self, token):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me_with_token(self, auth_headers):
        r = requests.get(f"{API}/auth/me", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_me_without_token(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


# ---------------- Public courses ----------------
class TestPublicCourses:
    def test_public_courses_shape(self, token):
        r = requests.get(f"{API}/courses")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) > 0
        for c in data:
            assert c.get("active") is True
            assert "seats" in c and "enrolled" in c and "spots_left" in c
            assert c["spots_left"] > 0  # full ones must be hidden
            assert "_id" not in c


# ---------------- Admin protection ----------------
class TestAdminProtection:
    @pytest.mark.parametrize("method,path", [
        ("GET", "/admin/courses"),
        ("POST", "/admin/courses"),
        ("PUT", "/admin/courses/x"),
        ("DELETE", "/admin/courses/x"),
        ("GET", "/admin/enrolments"),
        ("POST", "/admin/enrolments/x/accept"),
    ])
    def test_no_token(self, method, path):
        r = requests.request(method, f"{API}{path}", json={})
        assert r.status_code == 401, f"{method} {path} not protected"

    def test_bad_token(self):
        r = requests.get(f"{API}/admin/courses", headers={"Authorization": "Bearer badtoken"})
        assert r.status_code == 401


# ---------------- Course CRUD ----------------
class TestCourseCRUD:
    course_id = None

    def test_create(self, auth_headers):
        payload = {"name": "TEST_Course", "start_date": "2026-12-01", "description": "TEST description",
                   "active": True, "seats": 5}
        r = requests.post(f"{API}/admin/courses", json=payload, headers=auth_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == "TEST_Course"
        assert data["seats"] == 5
        TestCourseCRUD.course_id = data["id"]

    def test_update(self, auth_headers):
        payload = {"name": "TEST_Course_Updated", "start_date": "2026-12-15",
                   "description": "Updated", "active": True, "seats": 10}
        r = requests.put(f"{API}/admin/courses/{TestCourseCRUD.course_id}", json=payload, headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["seats"] == 10

    def test_seats_min_validation(self, auth_headers):
        payload = {"name": "TEST_bad", "start_date": "2026-12-01", "description": "d", "active": True, "seats": 0}
        r = requests.post(f"{API}/admin/courses", json=payload, headers=auth_headers)
        assert r.status_code == 422

    def test_delete(self, auth_headers):
        r = requests.delete(f"{API}/admin/courses/{TestCourseCRUD.course_id}", headers=auth_headers)
        assert r.status_code == 200
        r2 = requests.delete(f"{API}/admin/courses/{TestCourseCRUD.course_id}", headers=auth_headers)
        assert r2.status_code == 404


# ---------------- Seat limit flow (create seats=1, enrol, verify hidden, verify blocked) ----------------
class TestSeatLimit:
    test_course_id = None
    test_email = None

    def test_create_capped_course_and_fill(self, auth_headers):
        # Create seats=1 course
        r = requests.post(f"{API}/admin/courses", json={
            "name": "TEST_Capped", "start_date": "2026-11-01",
            "description": "Seat-limit test", "active": True, "seats": 1,
        }, headers=auth_headers)
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        TestSeatLimit.test_course_id = cid

        # Public listing should show spots_left=1
        pub = requests.get(f"{API}/courses").json()
        entry = next((c for c in pub if c["id"] == cid), None)
        assert entry is not None
        assert entry["spots_left"] == 1
        assert entry["seats"] == 1
        assert entry["enrolled"] == 0

        # Send OTP + verify enrolment for one student
        email = f"test_{uuid.uuid4().hex[:8]}@{OTP_TEST_EMAIL_DOMAIN}"
        TestSeatLimit.test_email = email
        payload = {"name": "Cap Tester", "gender": "Female", "age": 25,
                   "phone": "+919999900000", "email": email, "course_id": cid}
        r2 = requests.post(f"{API}/enrolment/send-otp", json=payload)
        if r2.status_code == 502:
            pytest.skip("Email provider unavailable")
        assert r2.status_code == 200, r2.text

        # Fetch OTP code from Mongo
        async def get_code():
            cli = _mongo()
            doc = await cli[DB_NAME].otp_codes.find_one({"email": email})
            cli.close()
            return doc["code"] if doc else None
        code = _run(get_code())
        assert code, "OTP not stored in Mongo"

        r3 = requests.post(f"{API}/enrolment/verify", json={**payload, "code": code})
        assert r3.status_code == 200, r3.text

    def test_full_course_auto_hidden(self):
        pub = requests.get(f"{API}/courses").json()
        ids = [c["id"] for c in pub]
        assert TestSeatLimit.test_course_id not in ids, "Full batch should be auto-hidden"

    def test_send_otp_blocked_when_full(self):
        email2 = f"test_{uuid.uuid4().hex[:8]}@{OTP_TEST_EMAIL_DOMAIN}"
        payload = {"name": "Second", "gender": "Male", "age": 30,
                   "phone": "+919999900001", "email": email2, "course_id": TestSeatLimit.test_course_id}
        r = requests.post(f"{API}/enrolment/send-otp", json=payload)
        assert r.status_code == 400
        assert "full" in r.json().get("detail", "").lower()

    def test_admin_still_sees_full_course(self, auth_headers):
        r = requests.get(f"{API}/admin/courses", headers=auth_headers)
        assert r.status_code == 200
        ids = [c["id"] for c in r.json()]
        assert TestSeatLimit.test_course_id in ids
        entry = next(c for c in r.json() if c["id"] == TestSeatLimit.test_course_id)
        assert entry["enrolled"] == 1
        assert entry["spots_left"] == 0


# ---------------- Accept flow ----------------
class TestAcceptFlow:
    accept_email = None
    accept_id = None

    def test_accept_pending_enrolment(self, auth_headers):
        # Create a dedicated pending enrolment directly in Mongo (independent of other tests)
        import uuid as _uuid
        from datetime import datetime, timezone
        email = f"test_accept_{_uuid.uuid4().hex[:8]}@resend.dev"
        eid = str(_uuid.uuid4())
        TestAcceptFlow.accept_email = email
        TestAcceptFlow.accept_id = eid
        # Fetch any active course_id for course_name
        cid = requests.get(f"{API}/courses").json()[0]["id"]
        cname = requests.get(f"{API}/courses").json()[0]["name"]
        async def insert():
            cli = _mongo()
            await cli[DB_NAME].enrolments.insert_one({
                "id": eid, "name": "Accept Tester", "gender": "Female", "age": 24,
                "phone": "+919999900002", "email": email, "course_id": cid,
                "course_name": cname, "verified": True, "status": "pending",
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            cli.close()
        _run(insert())

        r = requests.get(f"{API}/admin/enrolments", headers=auth_headers)
        assert r.status_code == 200
        target = next((e for e in r.json() if e["id"] == eid), None)
        assert target is not None
        assert target.get("status") == "pending"

        # Accept
        r2 = requests.post(f"{API}/admin/enrolments/{eid}/accept", headers=auth_headers)
        if r2.status_code == 502:
            pytest.skip("Email provider unavailable for confirmation email")
        assert r2.status_code == 200, r2.text
        assert r2.json().get("status") == "accepted"

        # Verify status persisted
        r3 = requests.get(f"{API}/admin/enrolments", headers=auth_headers)
        updated = next(e for e in r3.json() if e["id"] == eid)
        assert updated["status"] == "accepted"
        assert "accepted_at" in updated

        # Idempotent: second accept returns already-confirmed
        r4 = requests.post(f"{API}/admin/enrolments/{eid}/accept", headers=auth_headers)
        assert r4.status_code == 200
        assert "already" in r4.json().get("message", "").lower()

    def test_accept_unknown_id_404(self, auth_headers):
        r = requests.post(f"{API}/admin/enrolments/nonexistent-xyz/accept", headers=auth_headers)
        assert r.status_code == 404

    def test_accept_no_token(self):
        r = requests.post(f"{API}/admin/enrolments/whatever/accept")
        assert r.status_code == 401


# ---------------- Enrolment validation ----------------
class TestEnrolmentValidation:
    def _payload(self, course_id, **over):
        p = {"name": "Test User", "gender": "Male", "age": 25,
             "phone": "+919876543210", "email": "delivered@resend.dev", "course_id": course_id}
        p.update(over)
        return p

    def test_invalid_email(self):
        cid = requests.get(f"{API}/courses").json()[0]["id"]
        r = requests.post(f"{API}/enrolment/send-otp", json=self._payload(cid, email="not-an-email"))
        assert r.status_code == 422

    def test_invalid_age(self):
        cid = requests.get(f"{API}/courses").json()[0]["id"]
        r = requests.post(f"{API}/enrolment/send-otp", json=self._payload(cid, age=2))
        assert r.status_code == 422

    def test_bad_gender(self):
        cid = requests.get(f"{API}/courses").json()[0]["id"]
        r = requests.post(f"{API}/enrolment/send-otp", json=self._payload(cid, gender="X"))
        assert r.status_code == 422

    def test_invalid_course_id(self):
        r = requests.post(f"{API}/enrolment/send-otp", json=self._payload("nonexistent-course"))
        assert r.status_code == 400


# ---------------- Cleanup (module teardown) ----------------
@pytest.fixture(scope="session", autouse=True)
def _cleanup(token):
    yield
    # Remove test data but keep admin (main agent will clear at end)
    async def clean():
        cli = _mongo()
        db = cli[DB_NAME]
        if TestSeatLimit.test_email:
            await db.enrolments.delete_many({"email": TestSeatLimit.test_email})
            await db.otp_codes.delete_many({"email": TestSeatLimit.test_email})
        if TestAcceptFlow.accept_email:
            await db.enrolments.delete_many({"email": TestAcceptFlow.accept_email})
        if TestSeatLimit.test_course_id:
            await db.courses.delete_one({"id": TestSeatLimit.test_course_id})
        # Remove any TEST_ courses that leaked
        await db.courses.delete_many({"name": {"$regex": "^TEST_"}})
        cli.close()
    _run(clean())
