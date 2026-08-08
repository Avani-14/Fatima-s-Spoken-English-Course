import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  LogOut, Plus, Pencil, Trash2, GraduationCap, Users, BookOpen, Loader2, X, MailCheck,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api, formatApiErrorDetail } from "../lib/api";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Switch } from "../components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "../components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { toast } from "../components/ui/sonner";

function fmtDate(d) {
  try { return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); }
  catch { return d; }
}
function fmtDateTime(d) {
  try { return new Date(d).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return d; }
}

const EMPTY = { name: "", start_date: "", description: "", active: true, seats: 30 };

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("enrolments");

  const [courses, setCourses] = useState([]);
  const [enrolments, setEnrolments] = useState([]);
  const [loading, setLoading] = useState(true);

  // course editor
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null = new
  const [draft, setDraft] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // enrolment filters
  const [courseFilter, setCourseFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date_desc");

  useEffect(() => {
    if (user === false) navigate("/admin/login");
  }, [user, navigate]);

  const loadAll = async () => {
    try {
      const [c, e] = await Promise.all([
        api.get("/admin/courses"),
        api.get("/admin/enrolments"),
      ]);
      setCourses(c.data);
      setEnrolments(e.data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && user.email) loadAll();
  }, [user]);

  const openNew = () => { setEditing(null); setDraft(EMPTY); setEditorOpen(true); };
  const openEdit = (c) => {
    setEditing(c);
    setDraft({ name: c.name, start_date: c.start_date, description: c.description, active: c.active, seats: c.seats });
    setEditorOpen(true);
  };

  const saveCourse = async () => {
    if (!draft.name.trim() || !draft.start_date || !draft.description.trim()) {
      toast.error("Please fill all course fields");
      return;
    }
    if (!draft.seats || Number(draft.seats) < 1) {
      toast.error("Seats must be at least 1");
      return;
    }
    setSaving(true);
    try {
      const body = { ...draft, seats: Number(draft.seats) };
      if (editing) {
        await api.put(`/admin/courses/${editing.id}`, body);
        toast.success("Course updated");
      } else {
        await api.post("/admin/courses", body);
        toast.success("Course added");
      }
      setEditorOpen(false);
      loadAll();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  const acceptEnrolment = async (e) => {
    try {
      const res = await api.post(`/admin/enrolments/${e.id}/accept`);
      toast.success(res.data.message || "Confirmation sent");
      setEnrolments((prev) => prev.map((x) => (x.id === e.id ? { ...x, status: "accepted" } : x)));
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const toggleActive = async (c) => {
    try {
      await api.put(`/admin/courses/${c.id}`, { ...c, active: !c.active });
      setCourses((prev) => prev.map((x) => (x.id === c.id ? { ...x, active: !x.active } : x)));
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/admin/courses/${deleteTarget.id}`);
      toast.success("Course deleted");
      setDeleteTarget(null);
      loadAll();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const visibleEnrolments = useMemo(() => {
    let list = [...enrolments];
    if (courseFilter !== "all") list = list.filter((e) => e.course_id === courseFilter);
    list.sort((a, b) => {
      if (sortBy === "date_asc") return new Date(a.created_at) - new Date(b.created_at);
      if (sortBy === "name") return a.name.localeCompare(b.name);
      return new Date(b.created_at) - new Date(a.created_at);
    });
    return list;
  }, [enrolments, courseFilter, sortBy]);

  if (!user || !user.email) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <GraduationCap size={20} />
            </span>
            <span className="font-heading font-bold text-base sm:text-lg">Admin · Fatima's Centre</span>
          </div>
          <button
            data-testid="logout-btn"
            onClick={() => { logout(); navigate("/admin/login"); }}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted"
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            data-testid="tab-enrolments"
            onClick={() => setTab("enrolments")}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${tab === "enrolments" ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-muted"}`}
          >
            <Users size={16} /> Enrolments ({enrolments.length})
          </button>
          <button
            data-testid="tab-courses"
            onClick={() => setTab("courses")}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${tab === "courses" ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-muted"}`}
          >
            <BookOpen size={16} /> Courses ({courses.length})
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" size={28} /></div>
        ) : tab === "enrolments" ? (
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-5">
              <div>
                <h1 className="font-heading text-2xl sm:text-3xl font-semibold tracking-tight">Enrolments</h1>
                <p className="mt-1 text-muted-foreground text-sm">Verified sign-ups — who to call back.</p>
              </div>
              <div className="flex gap-3">
                <div className="w-44">
                  <Select value={courseFilter} onValueChange={setCourseFilter}>
                    <SelectTrigger data-testid="filter-course" className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All courses</SelectItem>
                      {courses.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-40">
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger data-testid="sort-by" className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date_desc">Newest first</SelectItem>
                      <SelectItem value="date_asc">Oldest first</SelectItem>
                      <SelectItem value="name">Name (A–Z)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {visibleEnrolments.length === 0 ? (
              <div data-testid="enrolments-empty" className="rounded-2xl border border-border bg-card p-8 text-muted-foreground">
                No enrolments yet.
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="enrolments-table">
                    <thead>
                      <tr className="border-b border-border bg-muted/50 text-left">
                        <th className="px-4 py-3 font-semibold">Name</th>
                        <th className="px-4 py-3 font-semibold">Gender</th>
                        <th className="px-4 py-3 font-semibold">Age</th>
                        <th className="px-4 py-3 font-semibold">Phone</th>
                        <th className="px-4 py-3 font-semibold">Email</th>
                        <th className="px-4 py-3 font-semibold">Course</th>
                        <th className="px-4 py-3 font-semibold whitespace-nowrap">Submitted</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleEnrolments.map((e) => (
                        <tr key={e.id} data-testid={`enrolment-row-${e.id}`} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-medium whitespace-nowrap">{e.name}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{e.gender}</td>
                          <td className="px-4 py-3">{e.age}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{e.phone}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{e.email}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{e.course_name}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{fmtDateTime(e.created_at)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span data-testid={`status-${e.id}`} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${e.status === "accepted" ? "bg-secondary/60 text-secondary-foreground" : "bg-muted text-muted-foreground"}`}>
                              {e.status === "accepted" ? "Confirmed" : "Pending"}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right">
                            {e.status === "accepted" ? (
                              <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><MailCheck size={15} /> Emailed</span>
                            ) : (
                              <button
                                data-testid={`accept-enrolment-${e.id}`}
                                onClick={() => acceptEnrolment(e)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.03] active:scale-[0.98]"
                              >
                                <MailCheck size={15} /> Accept
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.section>
        ) : (
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <div className="flex items-end justify-between gap-4 mb-5">
              <div>
                <h1 className="font-heading text-2xl sm:text-3xl font-semibold tracking-tight">Courses</h1>
                <p className="mt-1 text-muted-foreground text-sm">Active courses show on the public site.</p>
              </div>
              <button
                data-testid="add-course-btn"
                onClick={openNew}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.03] active:scale-[0.98]"
              >
                <Plus size={16} /> Add course
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {courses.map((c) => (
                <div key={c.id} data-testid={`admin-course-${c.id}`} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-heading text-lg font-medium">{c.name}</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">Starts {fmtDate(c.start_date)}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${c.active ? "bg-secondary/60 text-secondary-foreground" : "bg-muted text-muted-foreground"}`}>
                      {c.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div data-testid={`seats-info-${c.id}`} className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-foreground">
                    <Users size={13} /> {c.enrolled}/{c.seats} filled · {c.spots_left} left
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground line-clamp-3">{c.description}</p>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Switch data-testid={`toggle-active-${c.id}`} checked={c.active} onCheckedChange={() => toggleActive(c)} />
                      <span className="text-sm text-muted-foreground">Visible</span>
                    </div>
                    <div className="flex gap-2">
                      <button data-testid={`edit-course-${c.id}`} onClick={() => openEdit(c)}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted">
                        <Pencil size={14} /> Edit
                      </button>
                      <button data-testid={`delete-course-${c.id}`} onClick={() => setDeleteTarget(c)}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10">
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.section>
        )}
      </main>

      {/* Course editor dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading">{editing ? "Edit course" : "Add course"}</DialogTitle>
            <DialogDescription>Set the course details shown on the public site.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="c-name">Course name</Label>
              <Input id="c-name" data-testid="course-name-input" className="h-11 rounded-xl mt-1.5"
                value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Beginner" />
            </div>
            <div>
              <Label htmlFor="c-date">Start date</Label>
              <Input id="c-date" data-testid="course-date-input" type="date" className="h-11 rounded-xl mt-1.5"
                value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="c-seats">Total seats</Label>
              <Input id="c-seats" data-testid="course-seats-input" type="number" min={1} className="h-11 rounded-xl mt-1.5"
                value={draft.seats} onChange={(e) => setDraft({ ...draft, seats: e.target.value })} placeholder="e.g. 30" />
              <p className="mt-1 text-xs text-muted-foreground">The batch auto-hides from the public site once all seats are filled.</p>
            </div>
            <div>
              <Label htmlFor="c-desc">Description</Label>
              <Textarea id="c-desc" data-testid="course-desc-input" rows={4} className="rounded-xl mt-1.5"
                value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="What is taught and what the student gets out of it" />
            </div>
            <div className="flex items-center gap-2">
              <Switch data-testid="course-active-switch" checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: v })} />
              <span className="text-sm">Active (visible on public site)</span>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setEditorOpen(false)} className="inline-flex items-center gap-1 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-muted">
              <X size={15} /> Cancel
            </button>
            <button data-testid="save-course-btn" onClick={saveCourse} disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60">
              {saving && <Loader2 className="animate-spin" size={15} />} Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">Delete this course?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" will be permanently removed. Existing enrolments stay in your records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="confirm-delete-btn" onClick={doDelete} className="rounded-xl bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
