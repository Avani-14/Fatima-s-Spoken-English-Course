"""Backend tests for Fatima's Spoken English Centre."""
import os
import time
import uuid
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio

load_dotenv(Path(__file__).parent.parent / ".env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else None
if not BASE_URL:
    # fallback: read frontend .env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"
ADMIN_EMAIL = "admin@fatimaenglish.com"
ADMIN_PASSWORD = "Fatima@2026"
OTP_TEST_EMAIL = "delivered@resend.dev"

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- Auth ----------
class TestAuth:
    def test_login_success(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        data = r.json()
        assert "token" in data and isinstance(data["token"], str)
        assert data["user"]["email"] == ADMIN_EMAIL

    def test_login_wrong_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me_with_token(self, auth_headers):
        r = requests.get(f"{API}/auth/me", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_me_without_token(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


# ---------- Public courses ----------
class TestPublicCourses:
    def test_public_courses_returns_only_active(self):
        r = requests.get(f"{API}/courses")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        for c in data:
            assert c.get("active") is True
            assert "_id" not in c


# ---------- Admin endpoints protection ----------
class TestAdminProtection:
    @pytest.mark.parametrize("method,path", [
        ("GET", "/admin/courses"),
        ("POST", "/admin/courses"),
        ("PUT", "/admin/courses/x"),
        ("DELETE", "/admin/courses/x"),
        ("GET", "/admin/enrolments"),
    ])
    def test_no_token(self, method, path):
        r = requests.request(method, f"{API}{path}", json={})
        assert r.status_code == 401, f"{method} {path} not protected"

    def test_bad_token(self, ):
        r = requests.get(f"{API}/admin/courses", headers={"Authorization": "Bearer badtoken"})
        assert r.status_code == 401


# ---------- Course CRUD ----------
class TestCourseCRUD:
    course_id = None

    def test_create(self, auth_headers):
        payload = {"name": "TEST_Course", "start_date": "2026-12-01", "description": "TEST description here", "active": True}
        r = requests.post(f"{API}/admin/courses", json=payload, headers=auth_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == "TEST_Course"
        assert data["active"] is True
        TestCourseCRUD.course_id = data["id"]

    def test_visible_in_public(self):
        r = requests.get(f"{API}/courses")
        ids = [c["id"] for c in r.json()]
        assert TestCourseCRUD.course_id in ids

    def test_update(self, auth_headers):
        payload = {"name": "TEST_Course_Updated", "start_date": "2026-12-15", "description": "Updated desc", "active": True}
        r = requests.put(f"{API}/admin/courses/{TestCourseCRUD.course_id}", json=payload, headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Course_Updated"

    def test_toggle_inactive_hides_from_public(self, auth_headers):
        payload = {"name": "TEST_Course_Updated", "start_date": "2026-12-15", "description": "Updated desc", "active": False}
        r = requests.put(f"{API}/admin/courses/{TestCourseCRUD.course_id}", json=payload, headers=auth_headers)
        assert r.status_code == 200
        # public should not include it
        pub = requests.get(f"{API}/courses").json()
        ids = [c["id"] for c in pub]
        assert TestCourseCRUD.course_id not in ids
        # admin should still see it
        adm = requests.get(f"{API}/admin/courses", headers=auth_headers).json()
        aids = [c["id"] for c in adm]
        assert TestCourseCRUD.course_id in aids

    def test_delete(self, auth_headers):
        r = requests.delete(f"{API}/admin/courses/{TestCourseCRUD.course_id}", headers=auth_headers)
        assert r.status_code == 200
        # delete again -> 404
        r2 = requests.delete(f"{API}/admin/courses/{TestCourseCRUD.course_id}", headers=auth_headers)
        assert r2.status_code == 404

    def test_validation_blank_name(self, auth_headers):
        payload = {"name": "  ", "start_date": "2026-12-01", "description": "d", "active": True}
        r = requests.post(f"{API}/admin/courses", json=payload, headers=auth_headers)
        assert r.status_code == 422


# ---------- Enrolment / OTP ----------
@pytest.fixture(scope="class")
def active_course_id(auth_headers):
    r = requests.get(f"{API}/courses")
    courses = r.json()
    assert len(courses) > 0
    return courses[0]["id"]


class TestEnrolmentValidation:
    def valid_payload(self, course_id, email=OTP_TEST_EMAIL):
        return {
            "name": "Test User",
            "gender": "Male",
            "age": 25,
            "phone": "+919876543210",
            "email": email,
            "course_id": course_id,
        }

    def test_invalid_email(self, active_course_id):
        p = self.valid_payload(active_course_id, email="not-an-email")
        r = requests.post(f"{API}/enrolment/send-otp", json=p)
        assert r.status_code == 422

    def test_invalid_age(self, active_course_id):
        p = self.valid_payload(active_course_id)
        p["age"] = 2
        r = requests.post(f"{API}/enrolment/send-otp", json=p)
        assert r.status_code == 422

    def test_short_phone(self, active_course_id):
        p = self.valid_payload(active_course_id)
        p["phone"] = "123"
        r = requests.post(f"{API}/enrolment/send-otp", json=p)
        assert r.status_code == 422

    def test_blank_name(self, active_course_id):
        p = self.valid_payload(active_course_id)
        p["name"] = ""
        r = requests.post(f"{API}/enrolment/send-otp", json=p)
        assert r.status_code == 422

    def test_bad_gender(self, active_course_id):
        p = self.valid_payload(active_course_id)
        p["gender"] = "X"
        r = requests.post(f"{API}/enrolment/send-otp", json=p)
        assert r.status_code == 422

    def test_invalid_course_id(self):
        p = {
            "name": "Test User", "gender": "Male", "age": 25,
            "phone": "+919876543210", "email": OTP_TEST_EMAIL,
            "course_id": "nonexistent-id-xyz",
        }
        r = requests.post(f"{API}/enrolment/send-otp", json=p)
        assert r.status_code == 400


class TestEnrolmentOTPFlow:
    """Uses a unique test email to avoid cooldown collisions."""

    @pytest.fixture(scope="class")
    def unique_email(self):
        # Clean up any residual otp for this email via mongo
        email = f"test_{uuid.uuid4().hex[:8]}@resend.dev"
        return email

    def _payload(self, course_id, email):
        return {
            "name": "OTP Tester",
            "gender": "Female",
            "age": 22,
            "phone": "+919999900000",
            "email": email,
            "course_id": course_id,
        }

    def test_send_otp_success(self, active_course_id, unique_email):
        r = requests.post(f"{API}/enrolment/send-otp", json=self._payload(active_course_id, unique_email))
        # Might return 502 if Emergent email cannot deliver to this address
        assert r.status_code in (200, 502), r.text
        if r.status_code == 502:
            pytest.skip("Email provider could not deliver; skipping downstream tests")
        data = r.json()
        assert data["status"] == "sent"
        assert data["cooldown"] == 45

    def test_resend_cooldown_429(self, active_course_id, unique_email):
        # Immediate resend should 429
        r = requests.post(f"{API}/enrolment/send-otp", json=self._payload(active_course_id, unique_email))
        # If prior test skipped, this may still 200; check either 429 or skip cleanly
        assert r.status_code in (429, 502)

    def test_wrong_code_rejected(self, active_course_id, unique_email, auth_headers):
        p = self._payload(active_course_id, unique_email)
        p["code"] = "000000"
        # ensure otp record exists
        r = requests.post(f"{API}/enrolment/verify", json=p)
        assert r.status_code == 400
        # confirm no enrolment created
        enrs = requests.get(f"{API}/admin/enrolments", headers=auth_headers).json()
        assert not any(e["email"] == unique_email for e in enrs)

    def test_verify_success_creates_enrolment(self, active_course_id, unique_email, auth_headers):
        # Read actual OTP from mongo
        async def fetch_code():
            cli = AsyncIOMotorClient(MONGO_URL)
            doc = await cli[DB_NAME].otp_codes.find_one({"email": unique_email})
            cli.close()
            return doc

        doc = asyncio.get_event_loop().run_until_complete(fetch_code())
        if not doc:
            pytest.skip("No OTP record in DB (send may have failed)")
        code = doc["code"]
        p = self._payload(active_course_id, unique_email)
        p["code"] = code
        r = requests.post(f"{API}/enrolment/verify", json=p)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "verified"

        enrs = requests.get(f"{API}/admin/enrolments", headers=auth_headers).json()
        match = [e for e in enrs if e["email"] == unique_email]
        assert len(match) == 1
        assert match[0]["verified"] is True
        assert match[0]["course_name"]
        assert "_id" not in match[0]

        # cleanup: delete enrolment via mongo
        async def cleanup():
            cli = AsyncIOMotorClient(MONGO_URL)
            await cli[DB_NAME].enrolments.delete_many({"email": unique_email})
            cli.close()
        asyncio.get_event_loop().run_until_complete(cleanup())
