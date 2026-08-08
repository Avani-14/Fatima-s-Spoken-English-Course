# PRD — Fatima's Spoken English Centre

## Original Problem Statement
Mobile-first full-stack website for a spoken-English coaching business (Hyderabad). Replace phone enquiries with an online course listing + OTP-verified enrolment form, storing sign-ups in a real database. Private admin area for the owner (Fatima) to manage courses and view enrolments.

## Architecture
- **Frontend:** React 19 + React Router + Tailwind + shadcn/ui + Framer Motion + Sonner. Warm/approachable theme (terracotta #D96C4E, bone-white bg, Outfit/Figtree fonts).
- **Backend:** FastAPI, all routes under `/api`. JWT (Bearer, 7-day) auth for single admin. Email OTP via Emergent-managed Resend.
- **DB:** MongoDB — collections: `admin_users`, `courses`, `enrolments`, `otp_codes`.

## User Personas
- **Visitor (18–28):** browses courses on phone, enrols online, verifies email OTP.
- **Admin (Fatima):** logs in, manages courses, reviews verified enrolments to call back.

## Core Requirements (static)
- Public course listing driven by DB (active only).
- Enrolment form with validation + mandatory email OTP before DB write.
- Admin: JWT login, course CRUD + active toggle, verified-enrolments dashboard (filter/sort).
- Enrolment/admin endpoints require auth; unverified attempts never written.

## Implemented (2026-06)
- Home/course listing, hero, footer with admin link.
- Enrolment flow: form → email OTP (6-digit, 10-min expiry, 45s resend cooldown) → confirmation.
- Admin login (admin@fatimaenglish.com), course CRUD with active toggle, enrolments table with course filter + sort.
- Backend seeds admin + 3 default courses. Real Resend email OTP. Tested 27/27 backend + all frontend flows pass.

## Backlog
- **P1:** Add SMS OTP (Twilio) as alternative/additional channel.
- **P1:** CSV export of enrolments.
- **P2:** Admin password change UI; forgot-password.
- **P2:** Per-course seat cap / enrolment counts.
- **P2:** Country-code dropdown for phone (currently free-text with validation).

## Next Tasks
- Await user feedback on live app; prioritize export or SMS if requested.
