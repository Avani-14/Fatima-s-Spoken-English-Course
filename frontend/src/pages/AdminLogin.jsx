import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Lock, Loader2, ArrowLeft } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { formatApiErrorDetail } from "../lib/api";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

export default function AdminLogin() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user && user.email) navigate("/admin");
  }, [user, navigate]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/admin");
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || "Login failed");
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
            <Lock size={22} />
          </div>
          <h1 className="mt-5 font-heading text-2xl sm:text-3xl font-bold tracking-tight">Admin login</h1>
          <p className="mt-2 text-muted-foreground">Sign in to manage courses and view enrolments.</p>

          <form onSubmit={submit} className="mt-6 space-y-5">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" data-testid="admin-email" type="email" className="h-12 rounded-xl mt-1.5"
                value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@fatimaenglish.com" required />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" data-testid="admin-password" type="password" className="h-12 rounded-xl mt-1.5"
                value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            {error && <p data-testid="login-error" className="text-sm text-destructive">{error}</p>}
            <button
              type="submit"
              data-testid="admin-login-btn"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-base font-semibold text-primary-foreground transition-transform hover:scale-[1.01] active:scale-[0.98] disabled:opacity-60"
            >
              {loading && <Loader2 className="animate-spin" size={18} />}
              Sign in
            </button>
            <p className="text-center text-sm text-muted-foreground">
              First time here?{" "}
              <Link to="/admin/signup" data-testid="go-to-signup" className="font-semibold text-primary">Create admin account</Link>
            </p>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
