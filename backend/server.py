from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import logging
import uuid
import random
import re
import jwt
import bcrypt
import httpx
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, field_validator

# ---------------- Config ----------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
ADMIN_EMAIL = os.environ['ADMIN_EMAIL'].lower()
ADMIN_PASSWORD = os.environ['ADMIN_PASSWORD']

EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ['EMERGENT_EMAIL_KEY']
EMAIL_FROM_NAME = os.environ['EMAIL_FROM_NAME']

OTP_TTL_MINUTES = 10
OTP_RESEND_COOLDOWN = 45  # seconds

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ---------------- Helpers ----------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "type": "access",
        "exp": now_utc() + timedelta(days=7),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_admin(request: Request) -> dict:
    token = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.admin_users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def send_otp_email(recipient: str, code: str, name: str):
    html = f"""
    <table width="100%" cellpadding="0" cellspacing="0" style="font-family: Arial, sans-serif; background:#FDFBF7; padding:24px;">
      <tr><td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff; border:1px solid #E5E1D8; border-radius:16px; overflow:hidden;">
          <tr><td style="background:#D96C4E; padding:20px 28px;">
            <span style="color:#ffffff; font-size:18px; font-weight:bold;">Fatima's Spoken English Centre</span>
          </td></tr>
          <tr><td style="padding:28px;">
            <p style="color:#2D3047; font-size:16px; margin:0 0 12px;">Hi {name or 'there'},</p>
            <p style="color:#2D3047; font-size:15px; margin:0 0 20px;">Use the verification code below to confirm your enrolment. This code expires in {OTP_TTL_MINUTES} minutes.</p>
            <div style="text-align:center; margin:24px 0;">
              <span style="display:inline-block; background:#F3F0EA; color:#2D3047; font-size:34px; letter-spacing:10px; font-weight:bold; padding:16px 28px; border-radius:12px;">{code}</span>
            </div>
            <p style="color:#6B7280; font-size:13px; margin:0;">If you didn't request this, you can safely ignore this email.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
    """
    payload = {
        "to": [recipient],
        "subject": f"Your verification code: {code}",
        "html": html,
        "from_name": EMAIL_FROM_NAME,
    }
    async with httpx.AsyncClient(timeout=30) as http_client:
        resp = await http_client.post(
            f"{EMAIL_BASE_URL}/api/v1/email/send",
            headers={"X-Email-Key": EMAIL_KEY},
            json=payload,
        )
    resp.raise_for_status()


async def send_confirmation_email(recipient: str, name: str, course_name: str):
    html = f"""
    <table width="100%" cellpadding="0" cellspacing="0" style="font-family: Arial, sans-serif; background:#FDFBF7; padding:24px;">
      <tr><td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff; border:1px solid #E5E1D8; border-radius:16px; overflow:hidden;">
          <tr><td style="background:#D96C4E; padding:20px 28px;">
            <span style="color:#ffffff; font-size:18px; font-weight:bold;">Fatima's Spoken English Centre</span>
          </td></tr>
          <tr><td style="padding:28px;">
            <p style="color:#2D3047; font-size:16px; margin:0 0 12px;">Hi {name or 'there'},</p>
            <p style="color:#2D3047; font-size:15px; margin:0 0 16px;">Great news — your spot in the
              <strong>{course_name}</strong> course is <strong style="color:#D96C4E;">confirmed</strong>!</p>
            <p style="color:#2D3047; font-size:15px; margin:0 0 16px;">We're excited to have you join us. You'll receive
              the batch schedule and joining details shortly. If you have any questions, just reply to this email.</p>
            <p style="color:#6B7280; font-size:13px; margin:16px 0 0;">See you in class,<br/>Fatima</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
    """
    payload = {
        "to": [recipient],
        "subject": f"Your spot in {course_name} is confirmed!",
        "html": html,
        "from_name": EMAIL_FROM_NAME,
    }
    async with httpx.AsyncClient(timeout=30) as http_client:
        resp = await http_client.post(
            f"{EMAIL_BASE_URL}/api/v1/email/send",
            headers={"X-Email-Key": EMAIL_KEY},
            json=payload,
        )
    resp.raise_for_status()


async def course_enrolled_count(course_id: str) -> int:
    return await db.enrolments.count_documents({"course_id": course_id, "verified": True})


# ---------------- Models ----------------
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class CourseBase(BaseModel):
    name: str
    start_date: str
    description: str
    active: bool = True
    seats: int = 30

    @field_validator("name", "description", "start_date")
    @classmethod
    def not_blank(cls, v):
        if not v or not str(v).strip():
            raise ValueError("This field cannot be blank")
        return v.strip()

    @field_validator("seats")
    @classmethod
    def seats_valid(cls, v):
        if v < 1:
            raise ValueError("Seats must be at least 1")
        return v


class SignupRequest(BaseModel):
    name: str
    email: EmailStr
    password: str

    @field_validator("name")
    @classmethod
    def name_ok(cls, v):
        if not v or len(v.strip()) < 2:
            raise ValueError("Please enter your name")
        return v.strip()

    @field_validator("password")
    @classmethod
    def pw_ok(cls, v):
        if not v or len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v


class Course(CourseBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: now_utc().isoformat())


class EnrolmentForm(BaseModel):
    name: str
    gender: str
    age: int
    phone: str
    email: EmailStr
    course_id: str

    @field_validator("name")
    @classmethod
    def name_valid(cls, v):
        if not v or len(v.strip()) < 2:
            raise ValueError("Please enter your full name")
        return v.strip()

    @field_validator("gender")
    @classmethod
    def gender_valid(cls, v):
        if v not in ["Male", "Female", "Other", "Prefer not to say"]:
            raise ValueError("Please select a valid gender")
        return v

    @field_validator("age")
    @classmethod
    def age_valid(cls, v):
        if v < 5 or v > 100:
            raise ValueError("Please enter a valid age")
        return v

    @field_validator("phone")
    @classmethod
    def phone_valid(cls, v):
        digits = re.sub(r"\D", "", v or "")
        if len(digits) < 8:
            raise ValueError("Please enter a valid phone number")
        return v.strip()


class SendOtpRequest(EnrolmentForm):
    pass


class VerifyOtpRequest(EnrolmentForm):
    code: str


# ---------------- Auth Routes ----------------
@api_router.get("/auth/status")
async def auth_status():
    count = await db.admin_users.count_documents({})
    return {"admin_exists": count > 0}


@api_router.post("/auth/signup")
async def signup(body: SignupRequest):
    count = await db.admin_users.count_documents({})
    if count > 0:
        raise HTTPException(status_code=403, detail="An admin account already exists. Please log in.")
    email = body.email.lower()
    user = {
        "id": str(uuid.uuid4()),
        "email": email,
        "password_hash": hash_password(body.password),
        "name": body.name,
        "created_at": now_utc().isoformat(),
    }
    await db.admin_users.insert_one(user)
    token = create_access_token(user["id"], email)
    return {"token": token, "user": {"email": email, "name": body.name}}


@api_router.post("/auth/login")
async def login(body: LoginRequest):
    email = body.email.lower()
    user = await db.admin_users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], email)
    return {"token": token, "user": {"email": email, "name": user.get("name", "Admin")}}


@api_router.get("/auth/me")
async def me(admin: dict = Depends(get_current_admin)):
    return {"email": admin["email"], "name": admin.get("name", "Admin")}


@api_router.delete("/auth/account")
async def delete_account(admin: dict = Depends(get_current_admin)):
    await db.admin_users.delete_one({"id": admin["id"]})
    return {"status": "deleted", "message": "Admin account removed. Signup is now open again."}


# ---------------- Public Course Routes ----------------
@api_router.get("/courses")
async def public_courses():
    docs = await db.courses.find({"active": True}, {"_id": 0}).to_list(1000)
    result = []
    for c in docs:
        seats = c.get("seats", 0)
        enrolled = await course_enrolled_count(c["id"])
        spots_left = max(seats - enrolled, 0)
        if spots_left <= 0:
            continue  # auto-hide full batches from the public listing
        c["enrolled"] = enrolled
        c["spots_left"] = spots_left
        result.append(c)
    return result


# ---------------- Admin Course Routes ----------------
@api_router.get("/admin/courses")
async def admin_list_courses(admin: dict = Depends(get_current_admin)):
    docs = await db.courses.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for c in docs:
        seats = c.get("seats", 0)
        enrolled = await course_enrolled_count(c["id"])
        c["enrolled"] = enrolled
        c["spots_left"] = max(seats - enrolled, 0)
        c.setdefault("seats", 0)
    return docs


@api_router.post("/admin/courses", response_model=Course)
async def admin_create_course(body: CourseBase, admin: dict = Depends(get_current_admin)):
    course = Course(**body.model_dump())
    await db.courses.insert_one(course.model_dump())
    return course


@api_router.put("/admin/courses/{course_id}", response_model=Course)
async def admin_update_course(course_id: str, body: CourseBase, admin: dict = Depends(get_current_admin)):
    existing = await db.courses.find_one({"id": course_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Course not found")
    update = body.model_dump()
    await db.courses.update_one({"id": course_id}, {"$set": update})
    existing.update(update)
    return existing


@api_router.delete("/admin/courses/{course_id}")
async def admin_delete_course(course_id: str, admin: dict = Depends(get_current_admin)):
    res = await db.courses.delete_one({"id": course_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Course not found")
    return {"status": "deleted"}


# ---------------- Enrolment / OTP Routes ----------------
async def _validate_course(course_id: str):
    course = await db.courses.find_one({"id": course_id, "active": True}, {"_id": 0})
    if not course:
        raise HTTPException(status_code=400, detail="Selected course is not available")
    enrolled = await course_enrolled_count(course_id)
    if enrolled >= course.get("seats", 0):
        raise HTTPException(status_code=400, detail="This batch is full. Please choose another course.")
    return course


@api_router.post("/enrolment/send-otp")
async def send_otp(body: SendOtpRequest):
    await _validate_course(body.course_id)
    email = body.email.lower()

    existing = await db.otp_codes.find_one({"email": email}, {"_id": 0})
    if existing and existing.get("last_sent"):
        last = datetime.fromisoformat(existing["last_sent"])
        elapsed = (now_utc() - last).total_seconds()
        if elapsed < OTP_RESEND_COOLDOWN:
            raise HTTPException(status_code=429, detail=f"Please wait {int(OTP_RESEND_COOLDOWN - elapsed)}s before resending")

    code = f"{random.randint(0, 999999):06d}"
    doc = {
        "email": email,
        "code": code,
        "expires_at": (now_utc() + timedelta(minutes=OTP_TTL_MINUTES)).isoformat(),
        "last_sent": now_utc().isoformat(),
        "attempts": 0,
    }
    await db.otp_codes.update_one({"email": email}, {"$set": doc}, upsert=True)

    try:
        await send_otp_email(email, code, body.name)
    except Exception as e:
        logger.error(f"OTP email send failed: {e}")
        raise HTTPException(status_code=502, detail="Could not send verification email. Please try again.")

    return {"status": "sent", "message": f"Verification code sent to {email}", "cooldown": OTP_RESEND_COOLDOWN}


@api_router.post("/enrolment/verify")
async def verify_otp(body: VerifyOtpRequest):
    course = await _validate_course(body.course_id)
    email = body.email.lower()
    record = await db.otp_codes.find_one({"email": email}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=400, detail="Please request a verification code first")

    if datetime.fromisoformat(record["expires_at"]) < now_utc():
        raise HTTPException(status_code=400, detail="Verification code expired. Please resend.")

    if record.get("attempts", 0) >= 5:
        raise HTTPException(status_code=429, detail="Too many attempts. Please resend a new code.")

    if body.code.strip() != record["code"]:
        await db.otp_codes.update_one({"email": email}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Incorrect code. Please try again.")

    enrolment = {
        "id": str(uuid.uuid4()),
        "name": body.name,
        "gender": body.gender,
        "age": body.age,
        "phone": body.phone,
        "email": email,
        "course_id": body.course_id,
        "course_name": course["name"],
        "verified": True,
        "status": "pending",
        "created_at": now_utc().isoformat(),
    }
    await db.enrolments.insert_one(enrolment)
    await db.otp_codes.delete_one({"email": email})

    return {"status": "verified", "message": "Thanks! Fatima will call you soon to confirm your spot."}


# ---------------- Admin Enrolments ----------------
@api_router.get("/admin/enrolments")
async def admin_enrolments(admin: dict = Depends(get_current_admin)):
    docs = await db.enrolments.find({"verified": True}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    for d in docs:
        d.setdefault("status", "pending")
    return docs


@api_router.post("/admin/enrolments/{enrolment_id}/accept")
async def accept_enrolment(enrolment_id: str, admin: dict = Depends(get_current_admin)):
    e = await db.enrolments.find_one({"id": enrolment_id}, {"_id": 0})
    if not e:
        raise HTTPException(status_code=404, detail="Enrolment not found")
    if e.get("status") == "accepted":
        return {"status": "accepted", "message": "Already confirmed"}
    try:
        await send_confirmation_email(e["email"], e["name"], e.get("course_name", "your course"))
    except Exception as ex:
        logger.error(f"Confirmation email failed: {ex}")
        raise HTTPException(status_code=502, detail="Could not send confirmation email. Please try again.")
    await db.enrolments.update_one(
        {"id": enrolment_id},
        {"$set": {"status": "accepted", "accepted_at": now_utc().isoformat()}},
    )
    return {"status": "accepted", "message": f"Confirmation email sent to {e['email']}"}


@api_router.delete("/admin/enrolments/{enrolment_id}")
async def delete_enrolment(enrolment_id: str, admin: dict = Depends(get_current_admin)):
    res = await db.enrolments.delete_one({"id": enrolment_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Enrolment not found")
    return {"status": "deleted"}


# ---------------- Startup ----------------
@app.on_event("startup")
async def startup():
    # Seed default courses if none exist
    count = await db.courses.count_documents({})
    if count == 0:
        defaults = [
            Course(name="Beginner", start_date="2026-07-01", seats=30,
                   description="Start from the basics. Build everyday vocabulary, simple sentence patterns and the confidence to introduce yourself and hold short conversations in English."),
            Course(name="Intermediate", start_date="2026-07-15", seats=25,
                   description="Move from words to fluent sentences. Practice real-life conversations, improve grammar and pronunciation, and speak comfortably in group discussions."),
            Course(name="Advanced", start_date="2026-08-01", seats=20,
                   description="Polish your fluency for interviews and the workplace. Master public speaking, debates, professional emails and confident, natural spoken English."),
        ]
        await db.courses.insert_many([c.model_dump() for c in defaults])
        logger.info("Default courses seeded")

    # Backfill seats for any legacy course docs missing the field
    await db.courses.update_many({"seats": {"$exists": False}}, {"$set": {"seats": 30}})

    await db.otp_codes.create_index("email", unique=True)


@app.on_event("shutdown")
async def shutdown():
    client.close()


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
