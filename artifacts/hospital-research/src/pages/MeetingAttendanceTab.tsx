import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import i18n from "i18next";
import {
  Plus, Power, PowerOff, Trash2, Edit2, Users,
  Clock, CheckCircle2, XCircle, ChevronRight, ArrowLeft,
  FileText, Save, X, CalendarDays, MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  formatDateAST, formatTimeAST, formatDateTimeAST,
  toInputDateTimeAST, fromInputDateTimeAST,
} from "@/lib/ast";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalEvent {
  id: string; title: string; title_ar?: string | null;
  venue?: string | null; location?: string | null;
  start_time: string; end_time?: string | null;
  event_type?: string; organizer?: string | null;
}

interface MeetingForm {
  id: string; meeting_no: number; is_active: boolean;
  window_start?: string | null; window_end?: string | null;
  event_id?: string | null; calendar_events?: CalEvent | null;
  created_at: string; updated_at: string;
  my_submission?: Submission | null;
}

interface UserProfile {
  full_name?: string | null; full_name_ar?: string | null;
  role?: string | null; department?: string | null; signature_url?: string | null;
}

interface MeetingFormDetail extends MeetingForm {
  my_submission: Submission | null;
  my_profile: UserProfile;
}

interface Submission {
  id: string; form_id: string; user_id: string;
  submission_no: number; signature_url?: string | null;
  submitted_at: string; remarks?: string | null;
  user_name?: string | null; user_name_ar?: string | null;
  user_role?: string | null; user_department?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtEventDate(s: string, e?: string | null, locale: "en" | "ar" = "en"): string {
  const sd = formatDateAST(s, locale);
  if (!e) return sd;
  const ed = formatDateAST(e, locale);
  return sd === ed ? sd : `${sd} – ${ed}`;
}
function fmtEventTime(s: string, e?: string | null, locale: "en" | "ar" = "en"): string {
  const st = formatTimeAST(s, locale);
  return e ? `${st} – ${formatTimeAST(e, locale)}` : st;
}
function calcDuration(s: string, e?: string | null): string {
  if (!e) return "—";
  const ms = new Date(e).getTime() - new Date(s).getTime();
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return "< 1m";
}
function fmtCountdown(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const s = Math.floor(ms / 1_000);
  const h = Math.floor(s / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
type GateState = "unavailable" | "pending" | "open" | "closed" | "submitted";

function getGate(f: MeetingForm | MeetingFormDetail, now: number): GateState {
  if (f.my_submission) return "submitted";
  if (!f.is_active) return "unavailable";
  const ws = f.window_start ? new Date(f.window_start).getTime() : null;
  const we = f.window_end   ? new Date(f.window_end).getTime()   : null;
  if (ws && now < ws) return "pending";
  if (we && now > we) return "closed";
  return "open";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MeetingAttendanceTab() {
  const { t } = useTranslation();
  const { session, user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const isAr    = i18n.language === "ar";
  const isAdmin = ["admin", "ceo", "director"].includes(user?.role ?? "");

  const auth = () => ({ Authorization: `Bearer ${session?.access_token}` });
  const json = () => ({ ...auth(), "Content-Type": "application/json" });

  // ── Live clock for countdown ───────────────────────────────────────────────
  const [liveNow, setLiveNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setLiveNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  // ── Admin state ────────────────────────────────────────────────────────────
  const [showCreate,     setShowCreate]     = useState(false);
  const [createEventId,  setCreateEventId]  = useState("");
  const [createWinStart, setCreateWinStart] = useState("");
  const [createWinEnd,   setCreateWinEnd]   = useState("");
  const [expandedId,     setExpandedId]     = useState<string | null>(null);
  const [editWinId,      setEditWinId]      = useState<string | null>(null);
  const [winStart,       setWinStart]       = useState("");
  const [winEnd,         setWinEnd]         = useState("");
  const [editRemarks,    setEditRemarks]    = useState<{ subId: string; text: string } | null>(null);
  const [deleteTarget,   setDeleteTarget]   = useState<string | null>(null);

  // ── Staff state ────────────────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: forms = [], isLoading: loadingForms } = useQuery<MeetingForm[]>({
    queryKey: ["meeting-forms"],
    queryFn: async () => {
      const r = await fetch("/api/meeting-forms", { headers: auth() });
      if (!r.ok) return [];
      return r.json();
    },
  });

  // Auto-select first active form for staff
  useEffect(() => {
    if (!isAdmin && !selectedId && forms.length > 0) setSelectedId(forms[0].id);
  }, [isAdmin, forms, selectedId]);

  const { data: formDetail, isLoading: loadingDetail } = useQuery<MeetingFormDetail>({
    queryKey: ["meeting-forms", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const r = await fetch(`/api/meeting-forms/${selectedId}`, { headers: auth() });
      if (!r.ok) throw new Error("Not found");
      return r.json();
    },
    refetchInterval: 30_000,
  });

  const { data: submissions = [], isLoading: loadingSubs } = useQuery<Submission[]>({
    queryKey: ["meeting-forms", expandedId, "submissions"],
    enabled: !!expandedId && isAdmin,
    queryFn: async () => {
      const r = await fetch(`/api/meeting-forms/${expandedId}/submissions`, { headers: auth() });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: calEvents = [] } = useQuery<CalEvent[]>({
    queryKey: ["cal-events-for-forms"],
    enabled: showCreate,
    queryFn: async () => {
      const r = await fetch("/api/calendar/events", { headers: auth() });
      if (!r.ok) return [];
      return r.json();
    },
  });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const invalidateForms = () => qc.invalidateQueries({ queryKey: ["meeting-forms"] });

  const createMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/meeting-forms", {
        method: "POST", headers: json(),
        body: JSON.stringify({
          event_id:     createEventId  || null,
          window_start: createWinStart ? fromInputDateTimeAST(createWinStart) : null,
          window_end:   createWinEnd   ? fromInputDateTimeAST(createWinEnd)   : null,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
      return r.json();
    },
    onSuccess: () => {
      invalidateForms();
      setShowCreate(false); setCreateEventId(""); setCreateWinStart(""); setCreateWinEnd("");
      toast({ title: t("meetingForm.createForm") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      await fetch(`/api/meeting-forms/${id}`, {
        method: "PATCH", headers: json(), body: JSON.stringify({ is_active }),
      });
    },
    onSuccess: invalidateForms,
  });

  const saveWindowMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/meeting-forms/${id}`, {
        method: "PATCH", headers: json(),
        body: JSON.stringify({
          window_start: winStart ? fromInputDateTimeAST(winStart) : null,
          window_end:   winEnd   ? fromInputDateTimeAST(winEnd)   : null,
        }),
      });
    },
    onSuccess: () => { invalidateForms(); setEditWinId(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/meeting-forms/${id}`, { method: "DELETE", headers: auth() });
    },
    onSuccess: () => { invalidateForms(); setDeleteTarget(null); },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/meeting-forms/${selectedId}/submit`, {
        method: "POST", headers: json(), body: JSON.stringify({}),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meeting-forms", selectedId] });
      toast({ title: t("meetingForm.submittedTitle") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const remarksMutation = useMutation({
    mutationFn: async ({ subId, text }: { subId: string; text: string }) => {
      await fetch(`/api/meeting-forms/${expandedId}/submissions/${subId}/remarks`, {
        method: "PATCH", headers: json(), body: JSON.stringify({ remarks: text }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meeting-forms", expandedId, "submissions"] });
      setEditRemarks(null);
      toast({ title: t("meetingForm.saveRemarks") });
    },
  });

  // ── Derived (staff) ───────────────────────────────────────────────────────
  const gate     = formDetail ? getGate(formDetail, liveNow) : null;
  const wsMs     = formDetail?.window_start ? new Date(formDetail.window_start).getTime() : null;
  const weMs     = formDetail?.window_end   ? new Date(formDetail.window_end).getTime()   : null;
  const msToOpen = wsMs ? wsMs - liveNow : null;
  const msToClose = weMs ? weMs - liveNow : null;

  const locale: "en" | "ar" = isAr ? "ar" : "en";
  const evt = formDetail?.calendar_events;
  const prof = formDetail?.my_profile;
  const displayName = isAr && prof?.full_name_ar ? prof.full_name_ar : (prof?.full_name ?? "—");
  const displayPos  = prof?.department || prof?.role || "—";

  // ─── Admin view ────────────────────────────────────────────────────────────
  if (isAdmin) {
    return (
      <div className="space-y-4">
        {/* Admin header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h2 className="text-lg font-semibold text-foreground">{t("meetingForm.adminTitle")}</h2>
          <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" /> {t("meetingForm.newForm")}
          </Button>
        </div>

        {/* Forms list */}
        {loadingForms ? (
          <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
        ) : forms.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <FileText className="w-10 h-10 opacity-25 mb-3" />
              <p className="text-sm font-medium">{t("meetingForm.noForms")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {forms.map(form => {
              const eventTitle = isAr && form.calendar_events?.title_ar
                ? form.calendar_events.title_ar
                : (form.calendar_events?.title ?? t("meetingForm.noEvent"));
              const isExpanded   = expandedId === form.id;
              const isEditingWin = editWinId  === form.id;

              return (
                <Card key={form.id} className="shadow-sm">
                  <CardContent className="p-4 space-y-3">
                    {/* Row 1: info + actions */}
                    <div className="flex items-start gap-4 flex-wrap">
                      {/* Meeting No. badge */}
                      <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
                        <span className="text-base font-black text-primary tabular-nums">
                          {String(form.meeting_no).padStart(3, "0")}
                        </span>
                      </div>

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground text-sm leading-snug">{eventTitle}</p>
                        {form.calendar_events && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {fmtEventDate(form.calendar_events.start_time, form.calendar_events.end_time, locale)}
                          </p>
                        )}
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground flex-wrap">
                          <Clock className="w-3 h-3 flex-shrink-0" />
                          {form.window_start
                            ? formatDateTimeAST(form.window_start, locale)
                            : "—"}
                          <span>→</span>
                          {form.window_end
                            ? formatDateTimeAST(form.window_end, locale)
                            : (form.window_start ? "∞" : t("meetingForm.noWindow"))}
                        </div>
                      </div>

                      {/* Status + actions */}
                      <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                        <Badge className={cn(
                          "text-[10px] px-2",
                          form.is_active
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300"
                            : "bg-muted text-muted-foreground"
                        )}>
                          {form.is_active ? t("meetingForm.formActive") : t("meetingForm.formInactive")}
                        </Badge>

                        <Button variant="ghost" size="icon" className="w-8 h-8"
                          title={form.is_active ? t("meetingForm.deactivate") : t("meetingForm.activate")}
                          onClick={() => toggleMutation.mutate({ id: form.id, is_active: !form.is_active })}>
                          {form.is_active
                            ? <PowerOff className="w-3.5 h-3.5 text-amber-600" />
                            : <Power    className="w-3.5 h-3.5 text-emerald-600" />}
                        </Button>

                        <Button variant="ghost" size="icon" className="w-8 h-8"
                          title={t("meetingForm.editWindow")}
                          onClick={() => {
                            if (isEditingWin) { setEditWinId(null); return; }
                            setEditWinId(form.id);
                            setWinStart(form.window_start ? toInputDateTimeAST(form.window_start) : "");
                            setWinEnd(form.window_end   ? toInputDateTimeAST(form.window_end)   : "");
                          }}>
                          <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                        </Button>

                        <Button variant="ghost" size="icon" className="w-8 h-8"
                          title={t("meetingForm.viewSubmissions")}
                          onClick={() => setExpandedId(isExpanded ? null : form.id)}>
                          <Users className={cn("w-3.5 h-3.5", isExpanded ? "text-primary" : "text-muted-foreground")} />
                        </Button>

                        <Button variant="ghost" size="icon" className="w-8 h-8 text-destructive/60 hover:text-destructive hover:bg-destructive/10"
                          title={t("meetingForm.deleteForm")}
                          onClick={() => setDeleteTarget(form.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Inline window editor */}
                    {isEditingWin && (
                      <div className="pt-3 border-t border-border">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                          {t("meetingForm.editWindow")}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">{t("meetingForm.windowStart")}</span>
                            <input type="datetime-local" value={winStart} onChange={e => setWinStart(e.target.value)}
                              className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring [color-scheme:light] dark:[color-scheme:dark]" />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">{t("meetingForm.windowEnd")}</span>
                            <input type="datetime-local" value={winEnd} onChange={e => setWinEnd(e.target.value)}
                              className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring [color-scheme:light] dark:[color-scheme:dark]" />
                          </div>
                          <Button size="sm" className="h-8 gap-1.5" onClick={() => saveWindowMutation.mutate(form.id)}
                            disabled={saveWindowMutation.isPending}>
                            <Save className="w-3.5 h-3.5" /> {t("meetingForm.saveWindow")}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditWinId(null)}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Submissions panel */}
                    {isExpanded && (
                      <div className="pt-3 border-t border-border space-y-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {t("meetingForm.submissions")}
                        </p>
                        {loadingSubs ? (
                          <div className="space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
                        ) : submissions.length === 0 ? (
                          <p className="text-sm text-muted-foreground italic">{t("meetingForm.noSubmissions")}</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-muted/40 text-muted-foreground">
                                  <th className="text-start px-3 py-2 font-semibold uppercase tracking-wider w-10">{t("meetingForm.submissionNo")}</th>
                                  <th className="text-start px-3 py-2 font-semibold uppercase tracking-wider">{t("meetingForm.submissionName")}</th>
                                  <th className="text-start px-3 py-2 font-semibold uppercase tracking-wider">{t("meetingForm.submissionRole")}</th>
                                  <th className="text-start px-3 py-2 font-semibold uppercase tracking-wider">{t("meetingForm.submissionTime")}</th>
                                  <th className="text-start px-3 py-2 font-semibold uppercase tracking-wider w-10">Sig.</th>
                                  <th className="text-start px-3 py-2 font-semibold uppercase tracking-wider">{t("meetingForm.submissionRemarks")}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {submissions.map(sub => (
                                  <tr key={sub.id} className="hover:bg-muted/20">
                                    <td className="px-3 py-2.5 font-black text-primary">#{sub.submission_no}</td>
                                    <td className="px-3 py-2.5 font-medium text-foreground">
                                      {isAr && sub.user_name_ar ? sub.user_name_ar : (sub.user_name ?? "—")}
                                    </td>
                                    <td className="px-3 py-2.5 text-muted-foreground">
                                      {sub.user_department || sub.user_role || "—"}
                                    </td>
                                    <td className="px-3 py-2.5 font-mono text-muted-foreground">
                                      {formatDateTimeAST(sub.submitted_at, locale)}
                                    </td>
                                    <td className="px-3 py-2.5">
                                      {sub.signature_url
                                        ? <img src={sub.signature_url} alt="sig" className="h-8 max-w-[80px] object-contain border rounded" />
                                        : <span className="text-muted-foreground/50">—</span>}
                                    </td>
                                    <td className="px-3 py-2.5 min-w-[180px]">
                                      {editRemarks?.subId === sub.id ? (
                                        <div className="flex gap-1.5">
                                          <Textarea value={editRemarks.text} rows={2}
                                            onChange={e => setEditRemarks({ subId: sub.id, text: e.target.value })}
                                            className="text-xs min-h-0 h-14 resize-none" />
                                          <div className="flex flex-col gap-1">
                                            <Button size="icon" className="w-7 h-7"
                                              onClick={() => remarksMutation.mutate({ subId: sub.id, text: editRemarks.text })}
                                              disabled={remarksMutation.isPending}>
                                              <Save className="w-3 h-3" />
                                            </Button>
                                            <Button size="icon" variant="ghost" className="w-7 h-7"
                                              onClick={() => setEditRemarks(null)}>
                                              <X className="w-3 h-3" />
                                            </Button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="flex items-start gap-2">
                                          <span className="text-muted-foreground flex-1">
                                            {sub.remarks || <span className="italic opacity-50">—</span>}
                                          </span>
                                          <Button variant="ghost" size="icon" className="w-6 h-6 flex-shrink-0"
                                            onClick={() => setEditRemarks({ subId: sub.id, text: sub.remarks ?? "" })}>
                                            <Edit2 className="w-3 h-3" />
                                          </Button>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Create Form Dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("meetingForm.newForm")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {/* Event selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {t("meetingForm.selectEvent")}
                </label>
                <Select
                  value={createEventId}
                  onValueChange={v => {
                    setCreateEventId(v);
                    const ev = calEvents.find(e => e.id === v);
                    if (ev?.start_time) setCreateWinStart(toInputDateTimeAST(ev.start_time));
                    if (ev?.end_time)   setCreateWinEnd(toInputDateTimeAST(ev.end_time));
                  }}
                >
                  <SelectTrigger><SelectValue placeholder={t("meetingForm.selectEvent")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("meetingForm.noEvent")}</SelectItem>
                    {calEvents.map(e => (
                      <SelectItem key={e.id} value={e.id}>
                        {isAr && e.title_ar ? e.title_ar : e.title}
                        {e.start_time && ` · ${formatDateAST(e.start_time, locale)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {createEventId && createEventId !== "__none__" && (() => {
                  const ev = calEvents.find(e => e.id === createEventId);
                  if (!ev) return null;
                  return (
                    <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1 text-xs text-muted-foreground">
                      {ev.start_time && (
                        <div className="flex items-center gap-2">
                          <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>{fmtEventDate(ev.start_time, ev.end_time, locale)} · {fmtEventTime(ev.start_time, ev.end_time, locale)}</span>
                        </div>
                      )}
                      {(ev.venue || ev.location) && (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>{ev.venue || ev.location}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Window start */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {t("meetingForm.windowStart")} (AST)
                </label>
                <input type="datetime-local" value={createWinStart} onChange={e => setCreateWinStart(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring [color-scheme:light] dark:[color-scheme:dark]" />
              </div>

              {/* Window end */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {t("meetingForm.windowEnd")} (AST)
                </label>
                <input type="datetime-local" value={createWinEnd} onChange={e => setCreateWinEnd(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring [color-scheme:light] dark:[color-scheme:dark]" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>{t("common.cancel")}</Button>
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                {createMutation.isPending ? t("meetingForm.creating") : t("meetingForm.createForm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirm */}
        <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("common.deleteConfirm")}</AlertDialogTitle>
              <AlertDialogDescription>{t("meetingForm.deleteConfirm")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}>
                {t("common.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ─── Staff view ─────────────────────────────────────────────────────────────

  // List view — no form selected yet
  if (!selectedId) {
    return (
      <div className="space-y-4 max-w-2xl">
        {loadingForms ? (
          <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}</div>
        ) : forms.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <FileText className="w-10 h-10 opacity-25 mb-3" />
              <p className="text-sm font-medium">{t("meetingForm.noActiveForms")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {forms.map(f => {
              const title = isAr && f.calendar_events?.title_ar
                ? f.calendar_events.title_ar
                : (f.calendar_events?.title ?? t("meetingForm.noEvent"));
              const ev = f.calendar_events;
              const cardGate = getGate(f, liveNow);

              const gateBadge: Record<GateState, { label: string; cls: string }> = {
                open:        { label: t("meetingForm.gateOpen"),        cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300" },
                pending:     { label: t("meetingForm.gatePendingShort"), cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300" },
                closed:      { label: t("meetingForm.gateClosed"),       cls: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300" },
                submitted:   { label: t("meetingForm.gateSubmitted"),    cls: "bg-primary/10 text-primary" },
                unavailable: { label: t("meetingForm.gateUnavailableShort"), cls: "bg-muted text-muted-foreground" },
              };
              const badge = gateBadge[cardGate];

              return (
                <button
                  key={f.id}
                  className="w-full text-start"
                  onClick={() => setSelectedId(f.id)}
                  disabled={cardGate === "unavailable"}
                >
                  <Card className={cn(
                    "shadow-sm transition-shadow hover:shadow-md cursor-pointer",
                    cardGate === "open"        && "border-emerald-400/50",
                    cardGate === "submitted"   && "border-primary/30 bg-primary/5",
                    cardGate === "unavailable" && "opacity-50 cursor-not-allowed",
                  )}>
                    <CardContent className="p-4 flex items-center gap-4">
                      {/* Meeting No */}
                      <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
                        <span className="text-base font-black text-primary tabular-nums">
                          {String(f.meeting_no).padStart(3, "0")}
                        </span>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-foreground text-sm leading-snug">{title}</p>
                          <Badge className={cn("text-[10px] px-2", badge.cls)}>{badge.label}</Badge>
                        </div>
                        {ev?.start_time && (
                          <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                            <CalendarDays className="w-3 h-3 flex-shrink-0" />
                            <span>{fmtEventDate(ev.start_time, ev.end_time, locale)}</span>
                            <span>·</span>
                            <span>{fmtEventTime(ev.start_time, ev.end_time, locale)}</span>
                          </div>
                        )}
                        {(ev?.venue || ev?.location) && (
                          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{ev.venue || ev.location}</span>
                          </div>
                        )}
                        {cardGate === "submitted" && f.my_submission && (
                          <p className="text-xs text-primary font-medium mt-1">
                            {t("meetingForm.attendeeNo")} #{f.my_submission.submission_no}
                          </p>
                        )}
                      </div>

                      {/* Arrow */}
                      <ChevronRight className={cn(
                        "w-4 h-4 flex-shrink-0",
                        cardGate === "unavailable" ? "text-muted-foreground/30" : "text-muted-foreground"
                      )} />
                    </CardContent>
                  </Card>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Back button */}
      <Button variant="ghost" size="sm" className="gap-1.5 -ms-1" onClick={() => setSelectedId(null)}>
        <ArrowLeft className="w-4 h-4" /> {t("meetingForm.backToList")}
      </Button>

      {/* Loading */}
      {loadingDetail && (
        <div className="space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      )}

      {/* Form display */}
      {formDetail && (
        <>
          {/* Gate state */}
          {gate === "unavailable" && (
            <Card className="border-2 border-muted shadow-sm">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-3">
                <XCircle className="w-10 h-10 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">{t("meetingForm.gateUnavailable")}</p>
              </CardContent>
            </Card>
          )}

          {gate === "closed" && (
            <Card className="border-2 border-muted shadow-sm">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-3">
                <XCircle className="w-10 h-10 text-red-400" />
                <p className="text-sm font-medium text-foreground">{t("meetingForm.gateClosed")}</p>
              </CardContent>
            </Card>
          )}

          {gate === "pending" && msToOpen !== null && (
            <Card className="border-2 border-amber-400/50 shadow-sm">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-3">
                <Clock className="w-10 h-10 text-amber-500 animate-pulse" />
                <p className="text-sm font-medium text-foreground">
                  {t("meetingForm.gatePending")}{" "}
                  <span className="font-bold text-amber-700 dark:text-amber-400">
                    {formDetail.window_start ? formatDateTimeAST(formDetail.window_start, locale) : "—"}
                  </span>
                </p>
                <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl px-6 py-3 font-mono text-2xl font-bold text-amber-700 dark:text-amber-300 tabular-nums">
                  {fmtCountdown(msToOpen)}
                </div>
                <p className="text-xs text-muted-foreground">{t("meetingForm.opensIn")}</p>
              </CardContent>
            </Card>
          )}

          {gate === "submitted" && formDetail.my_submission && (
            <Card className="border-2 border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-sm">
              <CardContent className="flex flex-col items-center justify-center py-10 text-center gap-3">
                <CheckCircle2 className="w-12 h-12 text-emerald-600" />
                <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{t("meetingForm.submittedTitle")}</p>
                <div className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg ring-4 ring-emerald-200 dark:ring-emerald-800">
                  <span className="text-3xl font-black text-white">
                    #{formDetail.my_submission.submission_no}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("meetingForm.submittedAs")} {formDetail.my_submission.submission_no}
                </p>
              </CardContent>
            </Card>
          )}

          {gate === "open" && (
            <div className="space-y-3">
              {/* Countdown banner */}
              {msToClose !== null && msToClose > 0 && (
                <div className="flex items-center justify-center gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
                  <Clock className="w-4 h-4 text-primary animate-pulse" />
                  <span className="text-sm text-muted-foreground">{t("meetingForm.closesIn")}</span>
                  <span className="font-mono text-base font-bold text-primary tabular-nums">
                    {fmtCountdown(msToClose)}
                  </span>
                </div>
              )}

              {/* Official attendance sheet */}
              <Card className="border-2 border-primary/25 shadow-md overflow-hidden">
                {/* Header banner */}
                <div className="bg-primary text-primary-foreground text-center py-4 px-5">
                  <p className="text-[11px] font-medium opacity-80 uppercase tracking-widest">
                    {t("common.appName")}
                  </p>
                  <p className="text-sm font-black uppercase tracking-widest mt-0.5">
                    {t("meetingForm.attendanceSheet")}
                  </p>
                  <p className="text-xs font-semibold opacity-90 mt-0.5">
                    {t("meetingForm.formNo")} {String(formDetail.meeting_no).padStart(3, "0")}
                  </p>
                </div>

                <CardContent className="p-5 space-y-5">
                  {/* Section 1: Event Details */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-3">
                      1. {t("meetingForm.eventDetails")}
                    </p>
                    <div className="space-y-2">
                      {[
                        { label: t("meetingForm.meetingNo"),
                          value: String(formDetail.meeting_no).padStart(3, "0") },
                        { label: t("meetingForm.meetingDate"),
                          value: evt ? fmtEventDate(evt.start_time, evt.end_time, locale) : "—" },
                        { label: t("meetingForm.meetingVenue"),
                          value: evt?.venue || evt?.location || "—" },
                        { label: t("meetingForm.meetingTime"),
                          value: evt ? fmtEventTime(evt.start_time, evt.end_time, locale) : "—" },
                        { label: t("meetingForm.meetingDuration"),
                          value: evt ? calcDuration(evt.start_time, evt.end_time) : "—" },
                      ].map(row => (
                        <div key={row.label} className="flex gap-3 text-sm">
                          <span className="w-36 flex-shrink-0 text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                            {row.label}
                          </span>
                          <span className="flex-1 text-foreground font-medium">{row.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  {/* Section 2: Attendee Details */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-3">
                      2. {t("meetingForm.attendeeDetails")}
                    </p>
                    <div className="space-y-2">
                      {[
                        { label: t("meetingForm.attendeeNo"),   value: "—" },
                        { label: t("meetingForm.attendeeName"), value: displayName },
                        { label: t("meetingForm.attendeePosition"), value: displayPos },
                      ].map(row => (
                        <div key={row.label} className="flex gap-3 text-sm">
                          <span className="w-36 flex-shrink-0 text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                            {row.label}
                          </span>
                          <span className="flex-1 text-foreground font-medium">{row.value}</span>
                        </div>
                      ))}

                      {/* Signature */}
                      <div className="flex gap-3 text-sm">
                        <span className="w-36 flex-shrink-0 text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                          {t("meetingForm.attendeeSignature")}
                        </span>
                        <div className="flex-1">
                          {prof?.signature_url ? (
                            <img src={prof.signature_url} alt="Signature"
                              className="max-h-16 max-w-[180px] object-contain border border-border rounded p-1 bg-white" />
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              {t("meetingForm.noSignature")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Submit */}
                  <Button className="w-full mt-2" size="lg"
                    disabled={submitMutation.isPending}
                    onClick={() => submitMutation.mutate()}>
                    {submitMutation.isPending ? t("meetingForm.submitting") : t("meetingForm.submitBtn")}
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
