import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ShieldCheck, CheckCircle2, Loader2 } from "lucide-react";
import { api, formatApiErrorDetail } from "../lib/api";
import { Header } from "../components/Header";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { toast } from "../components/ui/sonner";

const GENDERS = ["Male", "Female", "Other", "Prefer not to say"];

export default function Enrol() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const preCourse = params.get("course") || "";

  const [courses, setCourses] = useState([]);
  const [step, setStep] = useState("form"); // form | otp | done
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    gender: "",
    age: "",
    phone: "",
    email: "",
    course_id: preCourse,
  });
  const [errors, setErrors] = useState({});
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    api.get("/courses").then((res) => {
      setCourses(res.data);
      if (preCourse && !res.data.find((c) => c.id === preCourse)) {
        setForm((f) => ({ ...f, course_id: "" }));
      }
    });
  }, [preCourse]);

  useEffect(() => {
    if (cooldown <= 0) return;
    timerRef.current = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timerRef.current);
  }, [cooldown]);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const validate = () => {
    const e = {};
    if (!form.name || form.name.trim().length < 2) e.name = "Please enter your full name";
    if (!form.gender) e.gender = "Please select your gender";
    const ageNum = Number(form.age);
    if (!form.age || Number.isNaN(ageNum) || ageNum < 5 || ageNum > 100)
      e.age = "Please enter a valid age";
    const digits = (form.phone || "").replace(/\D/g, "");
    if (digits.length < 8) e.phone = "Enter a valid phone number with country code";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Enter a valid email address";
    if (!form.course_id) e.course_id = "Please choose a course";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const payload = useMemo(
    () => ({ ...form, age: Number(form.age) }),
    [form]
  );

  const sendOtp = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await api.post("/enrolment/send-otp", payload);
      toast.success(res.data.message || "Verification code sent");
      setStep("otp");
      setCooldown(res.data.cooldown || 45);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Could not send code");
    } finally {
      setSubmitting(false);
    }
  };

  const resendOtp = async () => {
    if (cooldown > 0) return;
    setSubmitting(true);
    try {
      const res = await api.post("/enrolment/send-otp", payload);
      toast.success("New code sent");
      setCooldown(res.data.cooldown || 45);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setSubmitting(false);
    }
  };

  const verify = async () => {
    if (code.trim().length !== 6) {
      toast.error("Enter the 6-digit code");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/enrolment/verify", { ...payload, code: code.trim() });
      setStep("done");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Verification failed");
    } finally {
      setSubmitting(false);
    }
  };

  const fieldError = (k) =>
    errors[k] ? (
      <p data-testid={`error-${k}`} className="mt-1 text-sm text-destructive">
        {errors[k]}
      </p>
    ) : null;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft size={16} /> Back to courses
        </Link>

        {step === "form" && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <h1 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">Enrol now</h1>
            <p className="mt-2 text-muted-foreground">Fill in your details and verify your email to confirm.</p>

            <div className="mt-8 space-y-5">
              <div>
                <Label htmlFor="name">Full name</Label>
                <Input id="name" data-testid="input-name" className="h-12 rounded-xl mt-1.5" value={form.name}
                  onChange={(e) => set("name", e.target.value)} placeholder="Your full name" />
                {fieldError("name")}
              </div>

              <div>
                <Label>Gender</Label>
                <Select value={form.gender} onValueChange={(v) => set("gender", v)}>
                  <SelectTrigger data-testid="select-gender" className="h-12 rounded-xl mt-1.5">
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDERS.map((g) => (
                      <SelectItem key={g} value={g} data-testid={`gender-${g}`}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldError("gender")}
              </div>

              <div>
                <Label htmlFor="age">Age</Label>
                <Input id="age" data-testid="input-age" type="number" inputMode="numeric" className="h-12 rounded-xl mt-1.5"
                  value={form.age} onChange={(e) => set("age", e.target.value)} placeholder="e.g. 22" />
                {fieldError("age")}
              </div>

              <div>
                <Label htmlFor="phone">Phone number</Label>
                <Input id="phone" data-testid="input-phone" type="tel" className="h-12 rounded-xl mt-1.5"
                  value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 98765 43210" />
                {fieldError("phone")}
              </div>

              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" data-testid="input-email" type="email" className="h-12 rounded-xl mt-1.5"
                  value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@example.com" />
                {fieldError("email")}
                <p className="mt-1 text-xs text-muted-foreground">We'll send a verification code to this email.</p>
              </div>

              <div>
                <Label>Course</Label>
                <Select value={form.course_id} onValueChange={(v) => set("course_id", v)}>
                  <SelectTrigger data-testid="select-course" className="h-12 rounded-xl mt-1.5">
                    <SelectValue placeholder="Choose a course" />
                  </SelectTrigger>
                  <SelectContent>
                    {courses.map((c) => (
                      <SelectItem key={c.id} value={c.id} data-testid={`course-opt-${c.id}`}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldError("course_id")}
              </div>

              <button
                data-testid="send-otp-btn"
                disabled={submitting}
                onClick={sendOtp}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-base font-semibold text-primary-foreground transition-transform hover:scale-[1.01] active:scale-[0.98] disabled:opacity-60"
              >
                {submitting ? <Loader2 className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
                Continue to verify
              </button>
            </div>
          </motion.div>
        )}

        {step === "otp" && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <h1 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">Verify your email</h1>
            <p className="mt-2 text-muted-foreground">
              We sent a 6-digit code to <span className="font-semibold text-foreground">{form.email}</span>.
            </p>

            <div className="mt-8">
              <Label htmlFor="otp">Verification code</Label>
              <Input
                id="otp"
                data-testid="otp-input"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="h-14 rounded-xl mt-1.5 text-center text-2xl tracking-[0.5em] font-semibold"
              />

              <button
                data-testid="verify-otp-btn"
                disabled={submitting}
                onClick={verify}
                className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-base font-semibold text-primary-foreground transition-transform hover:scale-[1.01] active:scale-[0.98] disabled:opacity-60"
              >
                {submitting ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                Verify & enrol
              </button>

              <div className="mt-4 flex items-center justify-between text-sm">
                <button
                  data-testid="back-to-form-btn"
                  onClick={() => setStep("form")}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Edit details
                </button>
                <button
                  data-testid="resend-otp-btn"
                  onClick={resendOtp}
                  disabled={cooldown > 0 || submitting}
                  className="font-semibold text-primary disabled:text-muted-foreground disabled:cursor-not-allowed"
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend OTP"}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {step === "done" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            data-testid="enrol-success"
            className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm"
          >
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-secondary/60">
              <CheckCircle2 size={34} className="text-primary" />
            </div>
            <h1 className="mt-5 font-heading text-2xl sm:text-3xl font-bold tracking-tight">You're all set!</h1>
            <p className="mt-3 text-muted-foreground">
              Thanks! Fatima will call you soon to confirm your spot.
            </p>
            <button
              data-testid="back-home-btn"
              onClick={() => navigate("/")}
              className="mt-6 inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-base font-semibold text-primary-foreground transition-transform hover:scale-[1.03] active:scale-[0.98]"
            >
              Back to home
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
