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
  meeting_no?: number;
  title: string;
  title_ar?: string;
  venue?: string;
  location?: string;
  start_time: string;
  end_time?: string;
  event_type?: string;
  organizer?: string;
  participants?: string[];
  creator_name?: string | null;
}

type AttendanceEvent = CalendarEvent;

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

function getGateStatus() {
  return "open";
}

function isAdminRoleValue(role?: string | null) {
  return ["admin", "ceo", "director"].includes(role ?? "");
}

function getEventLabel(ev: Pick<AttendanceEvent, "title" | "title_ar" | "event_type" | "venue" | "location">) {
  const primary = i18n.language === "ar" && ev.title_ar ? ev.title_ar : ev.title;
  const place = ev.venue || ev.location;
  const parts = [primary, ev.event_type, place].filter(Boolean);
  return parts.join(" · ");
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const { t }                   = useTranslation();
  const { user, isAdmin, role } = useAuth();
  const isAdminRole             = isAdminRoleValue(role);

  const [forms,        setForms]        = useState<AttendanceEvent[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [selectedForm, setSelectedForm] = useState<string>("");
  const [loadErr,      setLoadErr]      = useState<string | null>(null);

  useEffect(() => {
    setForms([]);
    setSelectedForm("");
    setLoadErr(null);
  }, []);

  const fetchForms = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const token = await getToken();
      const r = await fetch(`/api/calendar/events`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error();
      const events = (await r.json()) as AttendanceEvent[];
      const visible = isAdminRole ? events : events.filter(ev => (ev.participants ?? []).includes(user?.id ?? ""));
      visible.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
      setForms(visible.map((ev, index) => ({ ...ev, meeting_no: index + 1 })));
      setSelectedForm(prev => {
        if (prev && visible.some(f => f.id === prev)) return prev;
        return visible[0]?.id ?? "";
      });
    } catch {
      setForms([]);
      setLoadErr(t("common.error") || "Failed to load events");
    } finally {
      setLoading(false);
    }
  }, [isAdminRole, t, user?.id]);

  useEffect(() => { fetchForms(); }, [fetchForms]);

  // ── Stats derived from forms ─────────────────────────────────────────────

  const submitted  = 0;
  const open       = forms.length;
  const total      = forms.length;
  const selected = forms.find(f => f.id === selectedForm) ?? null;

  const stats = [
    { label: t("attendance.myAttendance"), value: String(submitted),  icon: Users2 },
    { label: t("meetingForm.tabLabel"),    value: String(total),       icon: ClipboardList },
    { label: t("meetingForm.formOpen"),    value: String(open),        icon: CalendarDays },
    { label: t("attendance.closesIn"),     value: "—",                 icon: Clock3 },
  ];

  // ── Form detail view ─────────────────────────────────────────────────────

  if (selectedForm) {
    return (
      <div className="p-4 sm:p-6 w-full max-w-5xl mx-auto">
        <AttendanceForm
          formId={selectedForm}
          formOptions={forms}
          onSelectForm={setSelectedForm}
        />
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 space-y-6 w-full max-w-6xl mx-auto">

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
          <Select value={selectedForm} onValueChange={setSelectedForm} disabled={forms.length === 0}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("meetingForm.selectFormPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {forms.map(form => {
                const label = getEventLabel(form);
                return (
                  <SelectItem key={form.id} value={form.id}>
                    <div className="flex flex-col">
                      <span>{label}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(form.start_time)}{form.end_time ? ` · ${formatTime(form.start_time)} - ${formatTime(form.end_time)}` : ` · ${formatTime(form.start_time)}`}
                      </span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {loadErr && (
            <p className="text-sm text-red-600">{loadErr}</p>
          )}
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
                        {i18n.language === "ar" && selected.title_ar ? selected.title_ar : selected.title || t("meetingForm.noEvent")}
                      </h3>
                    </div>
                    <Badge variant="outline">{t("meetingForm.meetingNo")}</Badge>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3 text-sm text-muted-foreground">
                    {selected.start_time && (
                      <span className="flex items-center gap-2">
                        <CalendarDays className="w-4 h-4" />
                        {formatDate(selected.start_time)}
                      </span>
                    )}
                    {selected.start_time && (
                      <span className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        {formatTime(selected.start_time)}
                      </span>
                    )}
                    {(selected.venue || selected.location) && (
                      <span className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        {selected.venue || selected.location}
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
