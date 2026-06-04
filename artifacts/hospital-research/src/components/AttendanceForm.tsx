import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  CalendarDays, Clock, MapPin, Timer, User, PenLine,
  Briefcase, CheckCircle2, AlertCircle, Loader2, ShieldAlert,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string;
  title: string;
  title_ar?: string;
  meeting_no?: number;
  venue?: string;
  location?: string;
  start_time: string;
  end_time?: string;
  event_type?: string;
  organizer?: string;
  participants?: string[];
  creator_name?: string | null;
  my_profile?: UserProfile | null;
}

interface UserProfile {
  full_name?: string;
  full_name_ar?: string;
  role?: string;
  department?: string;
  signature_url?: string;
  signature_drawn_url?: string;
  signature_active_type?: string;
}

interface Submission {
  id: string;
  form_id: string;
  user_id: string;
  submission_no: number;
  signature_url?: string;
  submitted_at: string;
  remarks?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Intl.DateTimeFormat(i18n.language === "ar" ? "ar-SA" : "en-US", {
    timeZone: "Asia/Riyadh",
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  }).format(new Date(iso));
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat(i18n.language === "ar" ? "ar-SA" : "en-US", {
    timeZone: "Asia/Riyadh",
    hour: "2-digit", minute: "2-digit", hour12: true,
  }).format(new Date(iso));
}

function formatDateRange(start: string, end?: string) {
  const startDate = new Date(start);
  const endDate   = end ? new Date(end) : null;

  const isSameDay = endDate
    ? startDate.toDateString() === endDate.toDateString()
    : true;

  if (isSameDay) return formatDate(start);
  return `${formatDate(start)} – ${formatDate(end!)}`;
}

function formatDuration(start: string, end?: string) {
  if (!end) return "—";
  const diffMs  = new Date(end).getTime() - new Date(start).getTime();
  if (diffMs <= 0) return "—";
  const totalMin = Math.round(diffMs / 60000);
  const h        = Math.floor(totalMin / 60);
  const m        = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function resolveStorageUrl(value?: string | null) {
  if (!value) return undefined;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
  return supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/hospital-files/${value}` : value;
}

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

// ─── Read-only field ────────────────────────────────────────────────────────

function ReadField({ label, value, icon: Icon }: {
  label: string; value: string; icon: React.ElementType;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </span>
      <span className="text-sm font-medium text-foreground bg-muted/50 rounded-xl px-3 py-2.5 border border-border">
        {value || "—"}
      </span>
    </div>
  );
}

// ─── Section header ─────────────────────────────────────────────────────────

function SectionHeader({ step, label, color }: {
  step: string; label: string; color: string;
}) {
  return (
    <div className={cn("flex items-center gap-3 pb-3 border-b", color)}>
      <span className={cn(
        "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white",
        color.includes("blue") ? "bg-blue-500" :
        color.includes("emerald") ? "bg-emerald-500" : "bg-amber-500"
      )}>
        {step}
      </span>
      <h3 className="font-semibold text-base text-foreground">{label}</h3>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

interface Props {
  formId: string;
  formOptions: CalendarEvent[];
  onSelectForm: (formId: string) => void;
}

export default function AttendanceForm({ formId, formOptions, onSelectForm }: Props) {
  const { t }                   = useTranslation();
  const { user, isAdmin, role } = useAuth();
  const isAdminRole             = ["admin", "ceo", "director"].includes(role);
  const isAr                    = i18n.language === "ar";

  const [form,        setForm]        = useState<CalendarEvent | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [loadErr,     setLoadErr]     = useState<string | null>(null);
  const [submitting,  setSubmitting]  = useState(false);
  const [submitMsg,   setSubmitMsg]   = useState<{ ok: boolean; text: string } | null>(null);
  const [submitted,   setSubmitted]   = useState<Submission | null>(null);
  const [remarks,     setRemarks]     = useState("");
  const [savingRemark, setSavingRemark] = useState(false);
  const [remarkMsg,   setRemarkMsg]   = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setLoading(true);
    setLoadErr(null);
    const next = formOptions.find(option => option.id === formId) ?? null;
    setForm(next);
    setLoading(false);
  }, [formId, formOptions]);

  const handleSubmit = async () => {
    if (!form) return;
    setSubmitting(true);
    setSubmitMsg({ ok: true, text: t("meetingForm.gateSubmittedShort") });
    setSubmitting(false);
  };

  const handleSaveRemarks = async () => {
    if (!submitted) return;
    setSavingRemark(true);
    setRemarkMsg({ ok: true, text: t("meetingForm.saveRemarks") });
    setSavingRemark(false);
  };

  // ── Loading / error states ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{t("common.loading") || "Loading…"}</p>
      </div>
    );
  }

  if (loadErr || !form) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <AlertCircle className="w-10 h-10 text-red-500" />
        <p className="text-sm text-red-600">{loadErr || "Form not found"}</p>
      </div>
    );
  }

  const ev       = form;
  const profile  = form?.my_profile ?? null;

  // Prefer the profile embedded in the event; fall back to the auth user context
  // so the signature is always shown even if my_profile is missing or stale.
  const activeType = profile?.signature_active_type || user?.signature_active_type;
  const rawUploadedUrl = profile?.signature_url || user?.signature_url;
  const rawDrawnUrl    = profile?.signature_drawn_url || user?.signature_drawn_url;

  const sigUrl = activeType === "drawn"
    ? (resolveStorageUrl(rawDrawnUrl) || resolveStorageUrl(rawUploadedUrl))
    : (resolveStorageUrl(rawUploadedUrl) || resolveStorageUrl(rawDrawnUrl));

  const userName = isAr && profile?.full_name_ar ? profile.full_name_ar : profile?.full_name ?? user?.full_name;
  const position = profile?.department || profile?.role || user?.department || user?.role || "—";
  const venue    = ev?.venue || ev?.location || "—";
  const isSelectable = formOptions.length > 0;

  // Gate status
  const gateStatus: "open" | "submitted" = submitted ? "submitted" : "open";

  const gateColor = {
    open:        "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400",
    submitted:   "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400",
  }[gateStatus];

  const gateLabel = {
    open:        t("meetingForm.gateOpen"),
    submitted:   t("meetingForm.gateSubmittedShort"),
  }[gateStatus];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="min-w-0 text-lg font-semibold text-foreground break-words">
          {isAr && ev?.title_ar ? ev.title_ar : ev?.title || t("meetingForm.tabLabel")}
        </h2>
        <Badge className={cn("text-xs font-semibold border", gateColor)}>
          {gateLabel}
        </Badge>
      </div>

      <Card className="border-border w-full">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">{t("meetingForm.selectEvent")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={formId} onValueChange={onSelectForm} disabled={!isSelectable}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("meetingForm.selectFormPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {formOptions.map(option => (
                <SelectItem key={option.id} value={option.id}>
                  {isAr && option.title_ar ? option.title_ar : option.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Submission success banner */}
      {submitted && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 dark:bg-blue-950/40 dark:border-blue-800">
          <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">{t("meetingForm.submittedTitle")}</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              {t("meetingForm.submittedAs")} <strong>#{submitted.submission_no}</strong>
            </p>
          </div>
        </div>
      )}

      {/* ─── Section 1: Event Details ───────────────────────────────────────── */}
      <Card className="border-border w-full">
        <CardHeader className="pb-4">
          <SectionHeader step="1" label={t("meetingForm.eventDetails")} color="text-blue-600 border-blue-100 dark:border-blue-900" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ReadField
              label={t("meetingForm.meetingNo")}
              value={form?.meeting_no ? `#${form.meeting_no}` : "—"}
              icon={CalendarDays}
            />
            <ReadField
              label={t("meetingForm.meetingDate")}
              value={ev?.start_time ? formatDateRange(ev.start_time, ev.end_time) : "—"}
              icon={CalendarDays}
            />
            <ReadField
              label={t("meetingForm.meetingVenue")}
              value={venue}
              icon={MapPin}
            />
            <ReadField
              label={t("meetingForm.meetingTime")}
              value={ev?.start_time
                ? `${formatTime(ev.start_time)}${ev.end_time ? ` – ${formatTime(ev.end_time)}` : ""}`
                : "—"}
              icon={Clock}
            />
            <ReadField
              label={t("meetingForm.meetingDuration")}
              value={ev?.start_time ? formatDuration(ev.start_time, ev.end_time) : "—"}
              icon={Timer}
            />
          </div>
        </CardContent>
      </Card>

      {/* ─── Section 2: Attendee Details ────────────────────────────────────── */}
      <Card className="border-border">
        <CardHeader className="pb-4">
          <SectionHeader step="2" label={t("meetingForm.attendeeDetails")} color="text-emerald-600 border-emerald-100 dark:border-emerald-900" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* No. */}
            <ReadField
              label={t("meetingForm.attendeeNo")}
              value={submitted ? `#${submitted.submission_no}` : "—"}
              icon={CalendarDays}
            />

            {/* Name */}
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />
                {t("meetingForm.attendeeName")}
              </span>
              <span className="text-sm font-medium text-foreground bg-muted/50 rounded-xl px-3 py-2.5 border border-border">
                {userName || "—"}
              </span>
            </div>

            {/* Position */}
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5" />
                {t("meetingForm.attendeePosition")}
              </span>
              <span className="text-sm font-medium text-foreground bg-muted/50 rounded-xl px-3 py-2.5 border border-border">
                {position}
              </span>
            </div>

            {/* Signature */}
            <div className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <PenLine className="w-3.5 h-3.5" />
                {t("meetingForm.attendeeSignature")}
              </span>
              <div className="rounded-xl border border-border bg-muted/50 p-3 min-h-[80px] flex items-center justify-center">
                {sigUrl ? (
                  <img
                    src={`${sigUrl}?t=${Date.now()}`}
                    alt="Signature"
                    className="max-h-20 max-w-[240px] object-contain"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm italic">
                    <PenLine className="w-4 h-4" />
                    {t("meetingForm.noSignature")}
                  </div>
                )}
              </div>
              {!sigUrl && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  {isAr
                    ? "لا يوجد توقيع محفوظ. يرجى إضافة توقيعك من صفحة الملف الشخصي أولاً."
                    : "No signature on file. Please add a signature in your Profile page first."}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Section 3: Admin Remarks ────────────────────────────────────────── */}
      <Card className="border-border">
        <CardHeader className="pb-4">
          <SectionHeader step="3" label={t("meetingForm.adminSection")} color="text-amber-600 border-amber-100 dark:border-amber-900" />
        </CardHeader>
        <CardContent>
          {isAdminRole ? (
            <div className="space-y-3">
              <Textarea
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                placeholder={t("meetingForm.remarks")}
                rows={3}
                className="rounded-xl resize-none"
                disabled={!submitted}
              />
              {!submitted && (
                <p className="text-xs text-muted-foreground italic">
                  {isAr ? "المتاح بعد تسجيل الحضور فقط." : "Available only after attendance is submitted."}
                </p>
              )}
              {submitted && (
                <div className="flex items-center gap-3">
                  <Button size="sm" onClick={handleSaveRemarks} disabled={savingRemark} className="gap-2">
                    {savingRemark
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />{t("meetingForm.savingRemarks")}</>
                      : t("meetingForm.saveRemarks")}
                  </Button>
                  {remarkMsg && (
                    <span className={cn("text-xs font-medium", remarkMsg.ok ? "text-emerald-600" : "text-red-600")}>
                      {remarkMsg.ok ? "✓ Saved" : remarkMsg.text}
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-muted/50 border border-dashed border-border">
              <ShieldAlert className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm text-muted-foreground italic">
                {isAr ? "هذا القسم مخصص للمسؤولين فقط." : "This section is restricted to administrators."}
              </span>
              {submitted?.remarks && (
                <span className="ms-auto text-sm text-foreground font-medium">{submitted.remarks}</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Submit / status ─────────────────────────────────────────────────── */}
      {gateStatus !== "submitted" && (
        <div className="space-y-3">
          {submitMsg && (
            <div className={cn(
              "flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border",
              submitMsg.ok
                ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                : "bg-red-50 border-red-200 text-red-700 dark:bg-red-950 dark:text-red-300"
            )}>
              {submitMsg.ok
                ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                : <AlertCircle  className="w-4 h-4 flex-shrink-0" />}
              {submitMsg.text}
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={submitting || gateStatus !== "open"}
            className="w-full gap-2 h-11 text-base"
          >
            {submitting
              ? <><Loader2 className="w-4 h-4 animate-spin" />{t("meetingForm.submitting")}</>
              : t("meetingForm.submitBtn")}
          </Button>

        </div>
      )}
    </div>
  );
}
