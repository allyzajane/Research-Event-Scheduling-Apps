import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CalendarDays, ClipboardList, Clock3, Users2,
  MapPin, Clock, Loader2, AlertCircle,
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
  const selected = forms.find(f => f.id === selectedForm) ?? null;

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
          formOptions={forms}
          onSelectForm={setSelectedForm}
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

      <Card className="border-border">
        <CardContent className="p-5 space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">{t("meetingForm.selectEvent")}</h2>
            <p className="text-sm text-muted-foreground">
              {isAdminRole ? t("meetingForm.noForms") : t("meetingForm.noActiveForms")}
            </p>
          </div>
          <Select value={selectedForm ?? ""} onValueChange={setSelectedForm} disabled={forms.length === 0}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("meetingForm.selectFormPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {forms.map(form => {
                const ev = form.calendar_events;
                const label = ev
                  ? `${i18n.language === "ar" && ev.title_ar ? ev.title_ar : ev.title} · #${form.meeting_no}`
                  : `${t("meetingForm.noEvent")} · #${form.meeting_no}`;
                return (
                  <SelectItem key={form.id} value={form.id}>
                    {label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

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
            {selected && (
              <Card className="border-border">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("meetingForm.tabLabel")}</p>
                      <h3 className="text-lg font-semibold text-foreground">
                        {i18n.language === "ar" && selected.calendar_events?.title_ar
                          ? selected.calendar_events.title_ar
                          : selected.calendar_events?.title || t("meetingForm.noEvent")}
                      </h3>
                    </div>
                    <Badge variant="outline">{t("meetingForm.meetingNo")} #{selected.meeting_no}</Badge>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3 text-sm text-muted-foreground">
                    {selected.calendar_events?.start_time && (
                      <span className="flex items-center gap-2">
                        <CalendarDays className="w-4 h-4" />
                        {formatDate(selected.calendar_events.start_time)}
                      </span>
                    )}
                    {selected.calendar_events?.start_time && (
                      <span className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        {formatTime(selected.calendar_events.start_time)}
                      </span>
                    )}
                    {(selected.calendar_events?.venue || selected.calendar_events?.location) && (
                      <span className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        {selected.calendar_events.venue || selected.calendar_events.location}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
