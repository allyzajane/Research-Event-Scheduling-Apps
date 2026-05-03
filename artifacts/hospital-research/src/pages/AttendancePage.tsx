import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CalendarDays, ClipboardList, Clock3, Users2, ChevronRight,
  MapPin, Clock, Loader2, AlertCircle, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import AttendanceForm from "@/components/AttendanceForm";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string;
  title: string;
  title_ar?: string;
  venue?: string;
  location?: string;
  start_time: string;
  end_time?: string;
  event_type?: string;
}

interface MeetingFormItem {
  id: string;
  meeting_no: number;
  is_active: boolean;
  window_start?: string;
  window_end?: string;
  calendar_events: CalendarEvent | null;
  my_submission?: { id: string; submission_no: number; submitted_at: string } | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat(i18n.language === "ar" ? "ar-SA" : "en-US", {
    timeZone: "Asia/Riyadh", month: "short", day: "numeric", year: "numeric",
  }).format(new Date(iso));
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat(i18n.language === "ar" ? "ar-SA" : "en-US", {
    timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", hour12: true,
  }).format(new Date(iso));
}

function getGateStatus(form: MeetingFormItem) {
  if (form.my_submission) return "submitted";
  const now = new Date();
  if (!form.is_active)                          return "unavailable";
  if (form.window_start && now < new Date(form.window_start)) return "pending";
  if (form.window_end   && now > new Date(form.window_end))   return "closed";
  return "open";
}

// ─── Form card ───────────────────────────────────────────────────────────────

function FormCard({ form, onClick }: { form: MeetingFormItem; onClick: () => void }) {
  const { t }   = useTranslation();
  const isAr    = i18n.language === "ar";
  const ev      = form.calendar_events;
  const status  = getGateStatus(form);

  const statusConfig = {
    open:        { label: t("meetingForm.formOpen"),        cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" },
    pending:     { label: t("meetingForm.formPending"),     cls: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
    closed:      { label: t("meetingForm.formExpired"),     cls: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
    submitted:   { label: t("meetingForm.gateSubmittedShort"), cls: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
    unavailable: { label: t("meetingForm.gateUnavailableShort"), cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  }[status];

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-2xl border border-border bg-card hover:bg-accent/30 hover:border-primary/30",
        "transition-all duration-200 p-5 flex items-start gap-4 group shadow-sm hover:shadow-md",
      )}
    >
      {/* Icon */}
      <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        <FileText className="w-5 h-5 text-primary" />
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <span className="font-semibold text-foreground text-base leading-snug truncate">
            {isAr && ev?.title_ar ? ev.title_ar : ev?.title || t("meetingForm.noEvent")}
          </span>
          <Badge className={cn("text-xs shrink-0", statusConfig.cls)}>
            {statusConfig.label}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {form.meeting_no && (
            <span className="flex items-center gap-1">
              <ClipboardList className="w-3 h-3" />
              {t("meetingForm.meetingNo")} #{form.meeting_no}
            </span>
          )}
          {ev?.start_time && (
            <span className="flex items-center gap-1">
              <CalendarDays className="w-3 h-3" />
              {formatDate(ev.start_time)}
            </span>
          )}
          {ev?.start_time && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTime(ev.start_time)}
              {ev.end_time ? ` – ${formatTime(ev.end_time)}` : ""}
            </span>
          )}
          {(ev?.venue || ev?.location) && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {ev.venue || ev.location}
            </span>
          )}
        </div>

        {status === "submitted" && form.my_submission && (
          <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
            {t("meetingForm.submittedAs")} #{form.my_submission.submission_no}
          </p>
        )}
      </div>

      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0 mt-3" />
    </button>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const { t }                   = useTranslation();
  const { user, isAdmin, role } = useAuth();
  const isAdminRole             = ["admin", "ceo", "director"].includes(role);

  const [forms,        setForms]        = useState<MeetingFormItem[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [selectedForm, setSelectedForm] = useState<string | null>(null);

  const fetchForms = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const param = isAdminRole ? "" : "?active=true";
      const r = await fetch(`/api/meeting-forms${param}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error();
      setForms(await r.json());
    } catch {
      setForms([]);
    } finally {
      setLoading(false);
    }
  }, [isAdminRole]);

  useEffect(() => { fetchForms(); }, [fetchForms]);

  // ── Stats derived from forms ─────────────────────────────────────────────

  const submitted  = forms.filter(f => f.my_submission).length;
  const open       = forms.filter(f => getGateStatus(f) === "open").length;
  const total      = forms.length;

  // Find next closing form
  const openForms = forms.filter(f => getGateStatus(f) === "open" && f.window_end);
  openForms.sort((a, b) => new Date(a.window_end!).getTime() - new Date(b.window_end!).getTime());
  const nextClose = openForms[0]?.window_end;
  let closesInLabel = "—";
  if (nextClose) {
    const diffMin = Math.round((new Date(nextClose).getTime() - Date.now()) / 60000);
    if (diffMin > 0) {
      const h = Math.floor(diffMin / 60), m = diffMin % 60;
      closesInLabel = h > 0 ? `${h}h ${m}m` : `${m}m`;
    }
  }

  const stats = [
    { label: t("attendance.myAttendance"), value: String(submitted),  icon: Users2 },
    { label: t("meetingForm.tabLabel"),    value: String(total),       icon: ClipboardList },
    { label: t("meetingForm.formOpen"),    value: String(open),        icon: CalendarDays },
    { label: t("attendance.closesIn"),     value: closesInLabel,       icon: Clock3 },
  ];

  // ── Form detail view ─────────────────────────────────────────────────────

  if (selectedForm) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <AttendanceForm
          formId={selectedForm}
          onBack={() => { setSelectedForm(null); fetchForms(); }}
        />
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("attendance.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("attendance.subtitle")}</p>
        </div>
        <Button variant="outline" onClick={fetchForms} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarDays className="w-4 h-4" />}
          {t("common.refresh") || "Refresh"}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map(stat => (
          <Card key={stat.label} className="border-border">
            <CardContent className="p-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1.5 leading-tight">
                  {stat.label}
                </p>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <stat.icon className="w-5 h-5 text-primary" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Form list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">{t("meetingForm.tabLabel")}</h2>
          {isAdminRole && (
            <Badge variant="outline" className="text-xs">
              {t("meetingForm.adminTitle")}
            </Badge>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">{t("common.loading") || "Loading…"}</span>
          </div>
        ) : forms.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center space-y-2">
            <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="text-sm font-medium text-muted-foreground">
              {isAdminRole ? t("meetingForm.noForms") : t("meetingForm.noActiveForms")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {forms.map(form => (
              <FormCard
                key={form.id}
                form={form}
                onClick={() => setSelectedForm(form.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
