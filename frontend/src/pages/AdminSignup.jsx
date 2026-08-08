import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { UserPlus, Loader2, ArrowLeft } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api, formatApiErrorDetail } from "../lib/api";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

export default function AdminSignup() {
  const { user, signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [adminExists, setAdminExists] = useState(null);

  useEffect(() => {
    if (user && user.email) navigate("/admin");
  }, [user, navigate]);

  useEffect(() => {
    api.get("/auth/status").then((r) => setAdminExists(r.data.admin_exists)).catch(() => setAdminExists(false));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signup(form.name, form.email, form.password);
      navigate("/admin");
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-6">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={16} /> Back to site
        </Link>
      </div>
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <UserPlus size={22} />
          </div>
          <h1 className="mt-5 font-heading text-2xl sm:text-3xl font-bold tracking-tight">Create admin account</h1>

          {adminExists ? (
            <div data-testid="admin-exists-msg" className="mt-4">
              <p className="text-muted-foreground">An admin account already exists. Please log in instead.</p>
              <Link to="/admin/login" data-testid="go-to-login" className="mt-5 inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-base font-semibold text-primary-foreground transition-transform hover:scale-[1.02]">
                Go to login
              </Link>
            </div>
          ) : (
            <>
              <p className="mt-2 text-muted-foreground">Set up your account once. After this, sign in to manage the centre.</p>
              <form onSubmit={submit} className="mt-6 space-y-5">
                <div>
                  <Label htmlFor="name">Your name</Label>
                  <Input id="name" data-testid="signup-name" className="h-12 rounded-xl mt-1.5"
                    value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Fatima" required />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" data-testid="signup-email" type="email" className="h-12 rounded-xl mt-1.5"
                    value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" required />
                </div>
                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" data-testid="signup-password" type="password" className="h-12 rounded-xl mt-1.5"
                    value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 6 characters" required />
                </div>
                {error && <p data-testid="signup-error" className="text-sm text-destructive">{error}</p>}
                <button
                  type="submit"
                  data-testid="signup-btn"
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-base font-semibold text-primary-foreground transition-transform hover:scale-[1.01] active:scale-[0.98] disabled:opacity-60"
                >
                  {loading && <Loader2 className="animate-spin" size={18} />}
                  Create account
                </button>
                <p className="text-center text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <Link to="/admin/login" className="font-semibold text-primary">Log in</Link>
                </p>
              </form>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
