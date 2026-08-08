import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { CalendarDays, ArrowRight, Phone, CheckCircle2, Users } from "lucide-react";
import { api } from "../lib/api";
import { Header } from "../components/Header";

const HERO_IMG =
  "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzF8MHwxfHNlYXJjaHwxfHxzdHVkZW50cyUyMGxlYXJuaW5nJTIwZW5nbGlzaCUyMGZyaWVuZGx5fGVufDB8fHx8MTc4NjIyNjE0NHww&ixlib=rb-4.1.0&q=85";

function formatDate(d) {
  try {
    return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}

export default function Home() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get("/courses")
      .then((res) => setCourses(res.data))
      .catch(() => setCourses([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-8 sm:pt-16">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="inline-flex items-center gap-2 rounded-full bg-secondary/60 px-3 py-1 text-sm font-medium text-secondary-foreground">
              Spoken English coaching · Hyderabad
            </span>
            <h1 className="mt-4 font-heading text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground">
              Speak English with confidence.
            </h1>
            <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-xl leading-relaxed">
              Small friendly batches, real conversation practice, and personal guidance from
              Fatima. Pick a course below and enrol online — no phone call needed.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                to="/enrol"
                data-testid="hero-enrol-btn"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-base font-semibold text-primary-foreground transition-transform hover:scale-[1.03] active:scale-[0.98]"
              >
                Enrol Now <ArrowRight size={18} />
              </Link>
              <a
                href="#courses"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-6 py-3 text-base font-semibold text-foreground transition-colors hover:bg-muted"
              >
                View courses
              </a>
            </div>
            <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Phone size={16} /> Enrol online and Fatima will call to confirm your spot.
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="relative"
          >
            <img
              src={HERO_IMG}
              alt="Students learning English together"
              className="w-full max-h-[60vh] object-cover rounded-2xl border border-border shadow-sm"
            />
          </motion.div>
        </div>
      </section>

      {/* Courses */}
      <section id="courses" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <div className="mb-8">
          <h2 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight">
            Our courses
          </h2>
          <p className="mt-2 text-muted-foreground">Choose the level that fits you and enrol in a minute.</p>
        </div>

        {loading ? (
          <div data-testid="courses-loading" className="text-muted-foreground">Loading courses…</div>
        ) : courses.length === 0 ? (
          <div data-testid="courses-empty" className="rounded-2xl border border-border bg-card p-8 text-muted-foreground">
            No courses are open right now. Please check back soon.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((c, i) => (
              <motion.div
                key={c.id}
                data-testid={`course-card-${c.id}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
              >
                <h3 className="font-heading text-xl sm:text-2xl font-medium text-foreground">{c.name}</h3>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm font-medium text-foreground">
                    <CalendarDays size={15} /> Starts {formatDate(c.start_date)}
                  </div>
                  <div
                    data-testid={`spots-left-${c.id}`}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${c.spots_left <= 5 ? "bg-primary/10 text-primary" : "bg-secondary/60 text-secondary-foreground"}`}
                  >
                    <Users size={15} /> {c.spots_left} {c.spots_left === 1 ? "spot" : "spots"} left
                  </div>
                </div>
                <p className="mt-4 text-base leading-relaxed text-muted-foreground flex-1">{c.description}</p>
                <button
                  data-testid={`enrol-course-btn-${c.id}`}
                  onClick={() => navigate(`/enrol?course=${c.id}`)}
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-base font-semibold text-primary-foreground transition-transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  Enrol Now <ArrowRight size={18} />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      <footer className="border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-primary" />
            Fatima's Spoken English Centre · Hyderabad
          </div>
          <Link to="/admin/login" data-testid="admin-link" className="hover:text-foreground transition-colors">
            Admin
          </Link>
        </div>
      </footer>
    </div>
  );
}
