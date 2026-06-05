import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ShieldCheck, Clock, UserCheck, UserX, RotateCcw, Loader2,
  CalendarDays, Timer, CheckCircle2, XCircle, AlertCircle, Users, Play,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string;
  title: string;
  title_ar?: string;
  start_time: string;
  participants?: string[];
  meeting_no?: number;
}

interface Profile {
  id: string;
  full_name?: string;
  full_name_ar?: string;
  role?: string;
  department?: string;
  avatar_url?: string;
}

interface Activation {
  id: string;
  event_id: string;
  user_id: string;
  activated_at: string;
  expires_at: string;
  duration_seconds: number;
  submitted_at?: string | null;
  status: "active" | "expired" | "submitted";
  seconds_left: number;
  user_name?: string;
  user_name_ar?: string;
  user_role?: string;
  user_dept?: string;
  user_avatar?: string;
}

// ─── Duration presets ─────────────────────────────────────────────────────────

const DURATION_PRESETS = [
  { label: "5 min",  value: 300 },
  { label: "10 min", value: 600 },
  { label: "15 min", value: 900 },
  { label: "20 min", value: 1200 },
  { label: "30 min", value: 1800 },
  { label: "45 min", value: 2700 },
  { label: "1 hr",   value: 3600 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat(i18n.language === "ar" ? "ar-SA" : "en-US", {
    timeZone: "Asia/Riyadh", month: "short", day: "numeric", year: "numeric",
  }).format(new Date(iso));
}

function fmtCountdown(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function statusColor(status: string) {
  if (status === "active")    return "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400";
  if (status === "submitted") return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400";
  if (status === "expired")   return "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400";
  return "bg-muted text-muted-foreground border-border";
}

function statusIcon(status: string) {
  if (status === "active")    return <Play className="w-3 h-3" />;
  if (status === "submitted") return <CheckCircle2 className="w-3 h-3" />;
  if (status === "expired")   return <XCircle className="w-3 h-3" />;
  return <Clock className="w-3 h-3" />;
}

// ─── Live countdown cell ──────────────────────────────────────────────────────

function CountdownCell({ activation }: { activation: Activation }) {
  const [secs, setSecs] = useState(activation.seconds_left);

  useEffect(() => {
    setSecs(activation.seconds_left);
    if (activation.status !== "active" || activation.seconds_left <= 0) return;
    const id = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [activation.seconds_left, activation.status]);

  if (activation.status !== "active") return null;

  const color = secs > 120 ? "text-emerald-600" : secs > 30 ? "text-amber-600" : "text-red-600";
  return (
    <span className={cn("font-mono text-xs font-bold tabular-nums", color)}>
      {fmtCountdown(secs)}
    </span>
  );
}

// ─── Participant row ──────────────────────────────────────────────────────────

interface ParticipantRowProps {
  profile: Profile;
  activation: Activation | null;
  selected: boolean;
  onToggle: () => void;
  onRevoke: (id: string) => void;
  isAr: boolean;
}

function ParticipantRow({ profile, activation, selected, onToggle, onRevoke, isAr }: ParticipantRowProps) {
  const name = isAr && profile.full_name_ar ? profile.full_name_ar : profile.full_name || profile.id.slice(0, 8);
  const sub  = profile.department || profile.role || "—";
  const initials = name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  const status = activation?.status ?? "inactive";

  return (
    <div className={cn(
      "flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors",
      selected
        ? "bg-primary/5 border-primary/30"
        : "bg-card border-border hover:bg-muted/30",
    )}>
      <Checkbox
        checked={selected}
        onCheckedChange={onToggle}
        disabled={status === "submitted"}
        className="flex-shrink-0"
      />

      <Avatar className="w-9 h-9 flex-shrink-0">
        <AvatarImage src={profile.avatar_url} className="object-cover" />
        <AvatarFallback className="bg-primary text-white text-xs font-semibold">{initials}</AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{name}</p>
        <p className="text-xs text-muted-foreground truncate">{sub}</p>
      </div>

      {/* Status badge + countdown */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {activation && (
          <CountdownCell activation={activation} />
        )}
        <Badge className={cn("text-xs border flex items-center gap-1 capitalize", statusColor(status))}>
          {statusIcon(status)}
          {status === "inactive" ? "Not activated"
            : status === "active" ? "Active"
            : status === "submitted" ? "Submitted"
            : "Expired"}
        </Badge>
        {activation && status !== "submitted" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-7 h-7 text-muted-foreground hover:text-red-600"
                onClick={() => onRevoke(activation.id)}
              >
                <UserX className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Revoke activation</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AttendanceControlPage() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const isAdminRole = ["admin", "ceo", "director"].includes(role);
  const isAr = i18n.language === "ar";

  const [events,      setEvents]      = useState<CalendarEvent[]>([]);
  const [participants, setParticipants] = useState<Profile[]>([]);
  const [activations, setActivations] = useState<Activation[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [selectedUserIds,  setSelectedUserIds]  = useState<Set<string>>(new Set());
  const [duration,    setDuration]    = useState<number>(600);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingActs,   setLoadingActs]   = useState(false);
  const [activating,    setActivating]    = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load events ─────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoadingEvents(true);
      try {
        const token = await getToken();
        const r = await fetch("/api/calendar/events", { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) throw new Error();
        const data = (await r.json()) as CalendarEvent[];
        data.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
        setEvents(data.map((ev, i) => ({ ...ev, meeting_no: i + 1 })));
        if (data.length > 0) setSelectedEventId(data[0].id);
      } catch { setEvents([]); }
      finally { setLoadingEvents(false); }
    })();
  }, []);

  // ── Load participants + activations when event changes ───────────────────────
  const loadActivations = useCallback(async (eventId: string) => {
    if (!eventId) return;
    setLoadingActs(true);
    try {
      const token = await getToken();
      const [evRes, actRes] = await Promise.all([
        fetch(`/api/calendar/events`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/attendance/activations?event_id=${eventId}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const evData = evRes.ok ? (await evRes.json()) as CalendarEvent[] : [];
      const actData = actRes.ok ? (await actRes.json()) as Activation[] : [];

      const ev = evData.find(e => e.id === eventId);
      if (ev && Array.isArray(ev.participants) && ev.participants.length > 0) {
        const usersRes = await fetch("/api/users", { headers: { Authorization: `Bearer ${token}` } });
        const allUsers: Profile[] = usersRes.ok ? (await usersRes.json()) : [];
        setParticipants(allUsers.filter(u => ev.participants!.includes(u.id)));
      } else {
        setParticipants([]);
      }
      setActivations(actData);
    } catch { setActivations([]); }
    finally { setLoadingActs(false); }
  }, []);

  useEffect(() => {
    if (!selectedEventId) return;
    loadActivations(selectedEventId);
    // Auto-refresh activations every 10 seconds to update countdown from server
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => loadActivations(selectedEventId), 10_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [selectedEventId, loadActivations]);

  // ── Activate selected attendees ──────────────────────────────────────────────
  const handleActivate = async () => {
    if (selectedUserIds.size === 0 || !selectedEventId) return;
    setActivating(true);
    setMsg(null);
    try {
      const token = await getToken();
      const r = await fetch("/api/attendance/activations", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id:         selectedEventId,
          user_ids:         Array.from(selectedUserIds),
          duration_seconds: duration,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Failed");
      setMsg({ ok: true, text: `Activated ${selectedUserIds.size} attendee(s) for ${fmtCountdown(duration)}` });
      setSelectedUserIds(new Set());
      await loadActivations(selectedEventId);
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Activation failed" });
    } finally {
      setActivating(false);
    }
  };

  // ── Revoke one activation ────────────────────────────────────────────────────
  const handleRevoke = async (activationId: string) => {
    try {
      const token = await getToken();
      await fetch(`/api/attendance/activations/${activationId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      await loadActivations(selectedEventId);
    } catch { /* silent */ }
  };

  // ── Select all / deselect ────────────────────────────────────────────────────
  const toggleAll = () => {
    const eligible = participants
      .filter(p => activations.find(a => a.user_id === p.id)?.status !== "submitted")
      .map(p => p.id);
    if (selectedUserIds.size === eligible.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(eligible));
    }
  };

  if (!isAdminRole) {
    return (
      <div className="flex items-center justify-center py-32 text-muted-foreground">
        <AlertCircle className="w-5 h-5 me-2" />
        <span>Admin access required.</span>
      </div>
    );
  }

  const selectedEvent = events.find(e => e.id === selectedEventId) ?? null;

  // Stats
  const totalParticipants = participants.length;
  const activeCount    = activations.filter(a => a.status === "active").length;
  const submittedCount = activations.filter(a => a.status === "submitted").length;
  const expiredCount   = activations.filter(a => a.status === "expired").length;

  const eligibleIds = participants
    .filter(p => activations.find(a => a.user_id === p.id)?.status !== "submitted")
    .map(p => p.id);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">
              {isAr ? "التحكم في تسجيل الحضور" : "Attendance Control"}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {isAr
              ? "تفعيل نافذة تسجيل الحضور لكل حاضر بشكل فردي أو جماعي"
              : "Activate timed submission windows per attendee — individually or in bulk"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => loadActivations(selectedEventId)} disabled={loadingActs} className="gap-2">
          {loadingActs ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
          {isAr ? "تحديث" : "Refresh"}
        </Button>
      </div>

      {/* Event selector */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-primary" />
            {isAr ? "اختر الفعالية" : "Select Event"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingEvents ? (
            <div className="h-10 bg-muted animate-pulse rounded-lg" />
          ) : (
            <Select value={selectedEventId} onValueChange={v => { setSelectedEventId(v); setSelectedUserIds(new Set()); }}>
              <SelectTrigger>
                <SelectValue placeholder={isAr ? "اختر فعالية..." : "Select an event…"} />
              </SelectTrigger>
              <SelectContent>
                {events.map(ev => (
                  <SelectItem key={ev.id} value={ev.id}>
                    <span className="font-medium">
                      {isAr && ev.title_ar ? ev.title_ar : ev.title}
                    </span>
                    <span className="ms-2 text-xs text-muted-foreground">
                      · {fmtDate(ev.start_time)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {selectedEvent && (
            <div className="mt-3 flex gap-3 flex-wrap">
              <Badge variant="outline" className="text-xs gap-1">
                <Users className="w-3 h-3" />
                {totalParticipants} {isAr ? "مدعو" : "invited"}
              </Badge>
              {activeCount > 0 && (
                <Badge className="text-xs gap-1 bg-emerald-100 text-emerald-700 border-emerald-200">
                  <Play className="w-3 h-3" /> {activeCount} {isAr ? "نشط" : "active"}
                </Badge>
              )}
              {submittedCount > 0 && (
                <Badge className="text-xs gap-1 bg-blue-100 text-blue-700 border-blue-200">
                  <CheckCircle2 className="w-3 h-3" /> {submittedCount} {isAr ? "تم الإرسال" : "submitted"}
                </Badge>
              )}
              {expiredCount > 0 && (
                <Badge className="text-xs gap-1 bg-red-100 text-red-700 border-red-200">
                  <XCircle className="w-3 h-3" /> {expiredCount} {isAr ? "منتهي" : "expired"}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activation controls */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Timer className="w-4 h-4 text-primary" />
            {isAr ? "نافذة التفعيل" : "Activation Window"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {DURATION_PRESETS.map(p => (
              <button
                key={p.value}
                onClick={() => setDuration(p.value)}
                className={cn(
                  "px-3 py-1.5 rounded-lg border text-sm font-medium transition-all",
                  duration === p.value
                    ? "bg-primary text-white border-primary shadow-sm"
                    : "bg-background border-border text-foreground hover:border-primary/40 hover:bg-muted/50"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? `سيُغلق زر إرسال الحضور تلقائياً بعد ${fmtCountdown(duration)} من التفعيل`
              : `Submit button will auto-disable after ${fmtCountdown(duration)} from activation`}
          </p>
        </CardContent>
      </Card>

      {/* Attendee list */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-primary" />
              {isAr ? "قائمة المدعوين" : "Invited Attendees"}
              {selectedUserIds.size > 0 && (
                <Badge className="ms-1 text-xs bg-primary text-white">{selectedUserIds.size} selected</Badge>
              )}
            </CardTitle>
            {participants.length > 0 && (
              <button
                className="text-xs text-primary hover:underline font-medium"
                onClick={toggleAll}
              >
                {selectedUserIds.size === eligibleIds.length && eligibleIds.length > 0
                  ? (isAr ? "إلغاء تحديد الكل" : "Deselect All")
                  : (isAr ? "تحديد الكل" : "Select All")}
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {loadingActs ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />
              ))}
            </div>
          ) : participants.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">
                {selectedEventId
                  ? (isAr ? "لا يوجد مدعوون لهذه الفعالية" : "No participants added to this event yet")
                  : (isAr ? "اختر فعالية أولاً" : "Select an event to see participants")}
              </p>
            </div>
          ) : (
            participants.map(p => {
              const act = activations.find(a => a.user_id === p.id) ?? null;
              return (
                <ParticipantRow
                  key={p.id}
                  profile={p}
                  activation={act}
                  selected={selectedUserIds.has(p.id)}
                  onToggle={() => {
                    const next = new Set(selectedUserIds);
                    if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                    setSelectedUserIds(next);
                  }}
                  onRevoke={handleRevoke}
                  isAr={isAr}
                />
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Action bar */}
      {participants.length > 0 && (
        <div className="sticky bottom-4 z-10">
          <div className="bg-card border border-border rounded-2xl shadow-xl px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="text-sm text-muted-foreground">
              {selectedUserIds.size === 0
                ? (isAr ? "اختر المدعوين للتفعيل" : "Select attendees above to activate")
                : (isAr
                    ? `${selectedUserIds.size} محدد · مدة التفعيل: ${fmtCountdown(duration)}`
                    : `${selectedUserIds.size} selected · window: ${fmtCountdown(duration)}`)}
            </div>
            <div className="flex items-center gap-3">
              {msg && (
                <span className={cn("text-xs font-medium", msg.ok ? "text-emerald-600" : "text-red-600")}>
                  {msg.ok ? "✓" : "✗"} {msg.text}
                </span>
              )}
              <Button
                onClick={handleActivate}
                disabled={selectedUserIds.size === 0 || activating || !selectedEventId}
                className="gap-2"
              >
                {activating
                  ? <><Loader2 className="w-4 h-4 animate-spin" />{isAr ? "جارٍ التفعيل..." : "Activating…"}</>
                  : <><Play className="w-4 h-4" />{isAr ? "تفعيل الحضور" : "Activate Submission"}</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
