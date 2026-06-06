import { useState, useEffect, useCallback, useRef } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  ShieldCheck, Clock, UserCheck, UserX, RotateCcw, Loader2,
  CalendarDays, Timer, CheckCircle2, XCircle, AlertCircle, Users, Play,
  ClipboardList, Save, PenLine, Search, Printer,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string;
  title: string;
  title_ar?: string;
  start_time: string;
  participants?: string[];
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
}

interface SheetRow {
  user_id: string;
  full_name: string | null;
  full_name_ar: string | null;
  position: string | null;
  avatar_url: string | null;
  status: "submitted" | "active" | "expired" | "inactive";
  activation_id: string | null;
  submitted_at: string | null;
  signature_url: string | null;
  admin_remarks: string;
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

function fmtDateTime(iso: string) {
  return new Intl.DateTimeFormat(i18n.language === "ar" ? "ar-SA" : "en-US", {
    timeZone: "Asia/Riyadh",
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  }).format(new Date(iso));
}

function fmtCountdown(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function resolveUrl(value?: string | null) {
  if (!value) return undefined;
  // Backend now returns full public URLs; fall back to path-based resolution for legacy data
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  const base = import.meta.env.VITE_SUPABASE_URL || "";
  return base ? `${base}/storage/v1/object/public/hospital-files/${value}` : value;
}

function statusColor(s: string) {
  if (s === "active")    return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (s === "submitted") return "bg-blue-100 text-blue-700 border-blue-200";
  if (s === "expired")   return "bg-red-100 text-red-700 border-red-200";
  return "bg-muted text-muted-foreground border-border";
}
function statusIcon(s: string) {
  if (s === "active")    return <Play className="w-3 h-3" />;
  if (s === "submitted") return <CheckCircle2 className="w-3 h-3" />;
  if (s === "expired")   return <XCircle className="w-3 h-3" />;
  return <Clock className="w-3 h-3" />;
}
function statusLabel(s: string, isAr: boolean) {
  if (s === "active")    return isAr ? "نشط" : "Active";
  if (s === "submitted") return isAr ? "تم الإرسال" : "Submitted";
  if (s === "expired")   return isAr ? "منتهي" : "Expired";
  return isAr ? "غير مفعل" : "Not activated";
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
  return <span className={cn("font-mono text-xs font-bold tabular-nums", color)}>{fmtCountdown(secs)}</span>;
}

// ─── Participant control row ──────────────────────────────────────────────────

function ParticipantRow({ profile, activation, selected, onToggle, onRevoke, isAr }: {
  profile: Profile; activation: Activation | null;
  selected: boolean; onToggle: () => void; onRevoke: (id: string) => void; isAr: boolean;
}) {
  const name = isAr && profile.full_name_ar ? profile.full_name_ar : profile.full_name || profile.id.slice(0, 8);
  const initials = name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
  const status = activation?.status ?? "inactive";

  return (
    <div className={cn(
      "flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors",
      selected ? "bg-primary/5 border-primary/30" : "bg-card border-border hover:bg-muted/30",
    )}>
      <Checkbox
        checked={selected} onCheckedChange={onToggle}
        disabled={status === "submitted"} className="flex-shrink-0"
      />
      <Avatar className="w-9 h-9 flex-shrink-0">
        <AvatarImage src={profile.avatar_url} className="object-cover" />
        <AvatarFallback className="bg-primary text-white text-xs font-semibold">{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{name}</p>
        <p className="text-xs text-muted-foreground truncate">{profile.department || profile.role || "—"}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {activation && <CountdownCell activation={activation} />}
        <Badge className={cn("text-xs border flex items-center gap-1", statusColor(status))}>
          {statusIcon(status)} {statusLabel(status, isAr)}
        </Badge>
        {activation && status !== "submitted" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-red-600"
                onClick={() => onRevoke(activation.id)}>
                <UserX className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isAr ? "إلغاء التفعيل" : "Revoke activation"}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

// ─── Inline editable remarks cell ────────────────────────────────────────────

function RemarksCell({ activationId, initial, isAr }: {
  activationId: string; initial: string; isAr: boolean;
}) {
  const [value,   setValue]   = useState(initial);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const dirty = value !== initial;

  const save = async () => {
    setSaving(true);
    try {
      const token = await getToken();
      await fetch(`/api/attendance/activations/${activationId}/remarks`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ remarks: value }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  };

  return (
    <div className="flex flex-col gap-1 min-w-[160px]">
      <Textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder={isAr ? "ملاحظات..." : "Add remarks…"}
        rows={2}
        className="text-xs resize-none rounded-lg min-h-[52px] bg-muted/40 border-dashed focus:border-solid"
        onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save(); }}
      />
      <div className="flex items-center gap-1.5">
        <button
          onClick={save}
          disabled={saving || !dirty}
          className={cn(
            "flex items-center gap-1 text-xs px-2 py-0.5 rounded-md transition-all",
            dirty ? "text-primary hover:bg-primary/10" : "text-muted-foreground opacity-50 cursor-default"
          )}
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          {isAr ? "حفظ" : "Save"}
        </button>
        {saved && <span className="text-xs text-emerald-600 font-medium">✓ {isAr ? "تم" : "Saved"}</span>}
        {!saving && !saved && dirty && (
          <span className="text-xs text-amber-600">{isAr ? "غير محفوظ" : "Unsaved"}</span>
        )}
      </div>
    </div>
  );
}

// ─── Attendance Sheet Table ───────────────────────────────────────────────────

function AttendanceSheet({
  eventId, isAr, eventTitle, eventDate,
}: {
  eventId: string; isAr: boolean; eventTitle: string; eventDate: string;
}) {
  const [rows,    setRows]    = useState<SheetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search,  setSearch]  = useState("");

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const token = await getToken();
      const r = await fetch(`/api/attendance/sheet?event_id=${eventId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRows(r.ok ? await r.json() : []);
    } catch { setRows([]); }
    finally { setLoading(false); }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  const handlePrint = () => {
    const submittedRows = rows.filter(r => r.status === "submitted");
    const dir = isAr ? "rtl" : "ltr";
    const lang = isAr ? "ar" : "en";

    const fmt = (iso: string) =>
      new Intl.DateTimeFormat(isAr ? "ar-SA" : "en-GB", {
        timeZone: "Asia/Riyadh", day: "numeric", month: "long", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: true,
      }).format(new Date(iso));

    const fmtDay = (iso: string) =>
      new Intl.DateTimeFormat(isAr ? "ar-SA" : "en-GB", {
        timeZone: "Asia/Riyadh", day: "numeric", month: "long", year: "numeric",
      }).format(new Date(iso));

    const tableRows = submittedRows.map((row, idx) => {
      const name = (isAr && row.full_name_ar ? row.full_name_ar : row.full_name) || "—";
      const sigHtml = row.signature_url
        ? `<img src="${row.signature_url}" style="max-height:56px;max-width:110px;object-fit:contain;display:block;margin:auto" />`
        : `<span style="color:#aaa;font-size:11px">${isAr ? "لا يوجد" : "None"}</span>`;
      return `
        <tr>
          <td style="text-align:center;font-weight:bold;color:#1e3a5f">${idx + 1}</td>
          <td>${name}</td>
          <td>${row.position || "—"}</td>
          <td style="text-align:center">${sigHtml}</td>
          <td>${row.submitted_at ? fmt(row.submitted_at) : "—"}</td>
          <td>${row.admin_remarks || "—"}</td>
        </tr>`;
    }).join("");

    const printedOn = new Intl.DateTimeFormat(isAr ? "ar-SA" : "en-GB", {
      day: "numeric", month: "long", year: "numeric",
    }).format(new Date());

    const html = `<!DOCTYPE html>
<html dir="${dir}" lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <title>${isAr ? "كشف الحضور" : "Attendance Sheet"}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: ${isAr ? "'Segoe UI', Arial, Tahoma, sans-serif" : "Arial, sans-serif"};
      font-size: 12px; color: #111; padding: 28px 36px; direction: ${dir};
    }
    .header { text-align: center; margin-bottom: 20px; padding-bottom: 14px; border-bottom: 3px solid #1e3a5f; }
    .header h1 { font-size: 20px; font-weight: bold; color: #1e3a5f; margin-bottom: 4px; }
    .header h2 { font-size: 14px; color: #444; font-weight: 500; }
    .meta { display: flex; justify-content: space-between; margin-bottom: 16px; font-size: 11px; color: #555; background: #f5f7fa; padding: 8px 12px; border-radius: 6px; }
    .summary { font-size: 12px; margin-bottom: 10px; color: #333; }
    table { width: 100%; border-collapse: collapse; }
    thead th {
      background: #1e3a5f; color: #fff; padding: 9px 10px;
      text-align: ${isAr ? "right" : "left"}; font-size: 11px; font-weight: 600;
    }
    tbody td { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; vertical-align: middle; font-size: 11.5px; }
    tbody tr:nth-child(even) td { background: #f8fafc; }
    .footer { margin-top: 28px; display: flex; justify-content: space-between; font-size: 10px; color: #888; border-top: 1px solid #ddd; padding-top: 10px; }
    @media print { @page { margin: 14mm 12mm; size: A4; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>${isAr ? "مستشفى الطائف للأطفال" : "Taif Children's Hospital"}</h1>
    <h2>${isAr ? "كشف الحضور الرسمي" : "Official Attendance Sheet"} — ${eventTitle}</h2>
  </div>
  <div class="meta">
    <span>${isAr ? "تاريخ الفعالية:" : "Event Date:"} ${eventDate ? fmtDay(eventDate) : "—"}</span>
    <span>${isAr ? "عدد الحاضرين:" : "Attendees Submitted:"} ${submittedRows.length}</span>
    <span>${isAr ? "تاريخ الطباعة:" : "Printed:"} ${printedOn}</span>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:36px;text-align:center">#</th>
        <th>${isAr ? "الاسم" : "Name"}</th>
        <th>${isAr ? "المنصب / الجهة" : "Position / Dept."}</th>
        <th style="width:130px;text-align:center">${isAr ? "التوقيع" : "Signature"}</th>
        <th style="min-width:130px">${isAr ? "وقت التسجيل" : "Submitted At"}</th>
        <th>${isAr ? "ملاحظات" : "Remarks"}</th>
      </tr>
    </thead>
    <tbody>${tableRows || `<tr><td colspan="6" style="text-align:center;color:#aaa;padding:20px">${isAr ? "لا توجد بيانات" : "No submitted entries"}</td></tr>`}</tbody>
  </table>
  <div class="footer">
    <span>${isAr ? "نظام إدارة البحوث — مستشفى الطائف للأطفال" : "Research Management System — Taif Children's Hospital"}</span>
    <span>${isAr ? "وثيقة رسمية" : "Official Document"}</span>
  </div>
  <script>
    window.onload = function() {
      // Wait for images to load before printing
      var imgs = document.querySelectorAll('img');
      var total = imgs.length;
      if (total === 0) { window.print(); return; }
      var loaded = 0;
      function tryPrint() { loaded++; if (loaded >= total) window.print(); }
      imgs.forEach(function(img) {
        if (img.complete) { tryPrint(); }
        else { img.onload = tryPrint; img.onerror = tryPrint; }
      });
    };
  </script>
</body>
</html>`;

    const win = window.open("", "_blank", "width=960,height=720,scrollbars=yes");
    if (!win) { alert(isAr ? "السماح بالنوافذ المنبثقة لاستخدام الطباعة" : "Allow pop-ups to use the print feature"); return; }
    win.document.write(html);
    win.document.close();
  };

  const filtered = rows.filter(row => {
    if (!search) return true;
    const name = (isAr && row.full_name_ar ? row.full_name_ar : row.full_name) ?? "";
    return name.toLowerCase().includes(search.toLowerCase())
      || (row.position ?? "").toLowerCase().includes(search.toLowerCase());
  });

  const submitted = filtered.filter(r => r.status === "submitted");
  const pending   = filtered.filter(r => r.status !== "submitted");

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-20" />
        <p className="text-sm font-medium">{isAr ? "لا يوجد مدعوون لهذه الفعالية" : "No participants for this event yet"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={isAr ? "بحث بالاسم أو الجهة..." : "Search by name or department…"}
          className="w-full ps-8 pe-3 py-2 text-sm rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Stats strip */}
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground items-center">
        <span className="flex items-center gap-1">
          <Users className="w-3.5 h-3.5" />
          {rows.length} {isAr ? "مدعو" : "invited"}
        </span>
        <span>·</span>
        <span className="text-blue-600 font-medium flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {submitted.length} {isAr ? "أرسل" : "submitted"}
        </span>
        <span>·</span>
        <span className="text-muted-foreground flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          {pending.length} {isAr ? "في الانتظار" : "pending"}
        </span>
        <div className="ms-auto flex items-center gap-2">
          <button
            onClick={load}
            className="flex items-center gap-1 text-primary hover:underline"
          >
            <RotateCcw className="w-3 h-3" /> {isAr ? "تحديث" : "Refresh"}
          </button>
          {rows.length > 0 && (
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors shadow-sm"
            >
              <Printer className="w-3.5 h-3.5" />
              {isAr ? "طباعة / PDF" : "Print / PDF"}
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/60 border-b border-border">
              <th className="px-4 py-3 text-start font-semibold text-muted-foreground w-10">#</th>
              <th className="px-4 py-3 text-start font-semibold text-muted-foreground min-w-[180px]">
                {isAr ? "الاسم" : "Name"}
              </th>
              <th className="px-4 py-3 text-start font-semibold text-muted-foreground w-32">
                {isAr ? "التوقيع" : "Signature"}
              </th>
              <th className="px-4 py-3 text-start font-semibold text-muted-foreground min-w-[130px]">
                {isAr ? "المنصب" : "Position"}
              </th>
              <th className="px-4 py-3 text-start font-semibold text-muted-foreground min-w-[140px]">
                {isAr ? "وقت الإرسال" : "Submitted At"}
              </th>
              <th className="px-4 py-3 text-start font-semibold text-muted-foreground min-w-[200px]">
                {isAr ? "ملاحظات المسؤول" : "Admin Remarks"}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {/* ── Submitted rows ── */}
            {submitted.map((row, idx) => {
              const name = (isAr && row.full_name_ar ? row.full_name_ar : row.full_name) || "—";
              const initials = name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
              const sigUrl = resolveUrl(row.signature_url);

              return (
                <tr key={row.user_id} className="bg-card hover:bg-muted/20 transition-colors group">
                  {/* No. */}
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-xs tabular-nums">
                      {idx + 1}
                    </span>
                  </td>
                  {/* Name */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar className="w-8 h-8 flex-shrink-0">
                        <AvatarImage src={resolveUrl(row.avatar_url)} className="object-cover" />
                        <AvatarFallback className="bg-primary text-white text-xs font-semibold">{initials}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-foreground">{name}</span>
                    </div>
                  </td>
                  {/* Signature */}
                  <td className="px-4 py-3">
                    {sigUrl ? (
                      <div className="w-28 h-14 rounded-lg border border-border bg-white overflow-hidden flex items-center justify-center p-1">
                        <img src={sigUrl} alt="signature" className="max-h-full max-w-full object-contain" />
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground italic flex items-center gap-1">
                        <PenLine className="w-3 h-3" /> {isAr ? "لا يوجد" : "None"}
                      </span>
                    )}
                  </td>
                  {/* Position */}
                  <td className="px-4 py-3 text-muted-foreground">{row.position || "—"}</td>
                  {/* Submitted At */}
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-foreground text-xs">
                        {row.submitted_at ? fmtDateTime(row.submitted_at) : "—"}
                      </span>
                    </div>
                  </td>
                  {/* Remarks */}
                  <td className="px-4 py-3">
                    {row.activation_id ? (
                      <RemarksCell activationId={row.activation_id} initial={row.admin_remarks || ""} isAr={isAr} />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}

            {/* ── Pending / not-submitted rows ── */}
            {pending.length > 0 && (
              <>
                {submitted.length > 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-2 bg-muted/30">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {isAr ? "لم يُرسَل بعد" : "Not yet submitted"}
                      </span>
                    </td>
                  </tr>
                )}
                {pending.map(row => {
                  const name = (isAr && row.full_name_ar ? row.full_name_ar : row.full_name) || "—";
                  const initials = name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

                  return (
                    <tr key={row.user_id} className="bg-muted/10 opacity-70 hover:opacity-100 transition-all">
                      {/* No. */}
                      <td className="px-4 py-3">
                        <span className="text-muted-foreground text-xs">—</span>
                      </td>
                      {/* Name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar className="w-8 h-8 flex-shrink-0">
                            <AvatarImage src={resolveUrl(row.avatar_url)} className="object-cover" />
                            <AvatarFallback className="bg-muted text-muted-foreground text-xs font-semibold">{initials}</AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">{name}</span>
                            <Badge className={cn("text-[10px] border flex items-center gap-1 w-fit mt-0.5", statusColor(row.status))}>
                              {statusIcon(row.status)} {statusLabel(row.status, isAr)}
                            </Badge>
                          </div>
                        </div>
                      </td>
                      {/* Signature */}
                      <td className="px-4 py-3">
                        <span className="text-xs text-muted-foreground">—</span>
                      </td>
                      {/* Position */}
                      <td className="px-4 py-3 text-muted-foreground text-xs">{row.position || "—"}</td>
                      {/* Submitted At */}
                      <td className="px-4 py-3 text-muted-foreground text-xs">{isAr ? "في الانتظار" : "Pending"}</td>
                      {/* Remarks */}
                      <td className="px-4 py-3">
                        {row.activation_id ? (
                          <RemarksCell activationId={row.activation_id} initial={row.admin_remarks || ""} isAr={isAr} />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AttendanceControlPage() {
  const { role } = useAuth();
  const isAdminRole = ["admin", "ceo", "director"].includes(role);
  const isAr = i18n.language === "ar";

  const [activeTab, setActiveTab] = useState<"control" | "sheet">("control");

  const [events,       setEvents]       = useState<CalendarEvent[]>([]);
  const [participants, setParticipants] = useState<Profile[]>([]);
  const [activations,  setActivations]  = useState<Activation[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [selectedUserIds,  setSelectedUserIds]  = useState<Set<string>>(new Set());
  const [duration,     setDuration]     = useState<number>(600);
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
        const data = r.ok ? (await r.json()) as CalendarEvent[] : [];
        data.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
        setEvents(data);
        if (data.length > 0) setSelectedEventId(data[0].id);
      } catch { setEvents([]); }
      finally { setLoadingEvents(false); }
    })();
  }, []);

  // ── Load activations + participants when event changes ──────────────────────
  const loadActivations = useCallback(async (eventId: string) => {
    if (!eventId) return;
    setLoadingActs(true);
    try {
      const token = await getToken();
      const [evRes, actRes] = await Promise.all([
        fetch("/api/calendar/events", { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/attendance/activations?event_id=${eventId}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const evData  = evRes.ok  ? (await evRes.json())  as CalendarEvent[] : [];
      const actData = actRes.ok ? (await actRes.json()) as Activation[]    : [];

      const ev = evData.find(e => e.id === eventId);
      if (ev && Array.isArray(ev.participants) && ev.participants.length > 0) {
        const usersRes = await fetch("/api/users", { headers: { Authorization: `Bearer ${token}` } });
        const allUsers: Profile[] = usersRes.ok ? await usersRes.json() : [];
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
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => loadActivations(selectedEventId), 10_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [selectedEventId, loadActivations]);

  // ── Activate selected attendees ──────────────────────────────────────────────
  const handleActivate = async () => {
    if (selectedUserIds.size === 0 || !selectedEventId) return;
    setActivating(true); setMsg(null);
    try {
      const token = await getToken();
      const r = await fetch("/api/attendance/activations", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: selectedEventId, user_ids: Array.from(selectedUserIds), duration_seconds: duration }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Failed");
      setMsg({ ok: true, text: `Activated ${selectedUserIds.size} attendee(s) for ${fmtCountdown(duration)}` });
      setSelectedUserIds(new Set());
      await loadActivations(selectedEventId);
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Activation failed" });
    } finally { setActivating(false); }
  };

  // ── Revoke ─────────────────────────────────────────────────────────────────
  const handleRevoke = async (activationId: string) => {
    const token = await getToken();
    await fetch(`/api/attendance/activations/${activationId}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    await loadActivations(selectedEventId);
  };

  // ── Select all ─────────────────────────────────────────────────────────────
  const eligibleIds = participants
    .filter(p => activations.find(a => a.user_id === p.id)?.status !== "submitted")
    .map(p => p.id);
  const toggleAll = () => {
    if (selectedUserIds.size === eligibleIds.length) setSelectedUserIds(new Set());
    else setSelectedUserIds(new Set(eligibleIds));
  };

  if (!isAdminRole) {
    return (
      <div className="flex items-center justify-center py-32 text-muted-foreground">
        <AlertCircle className="w-5 h-5 me-2" />
        <span>Admin access required.</span>
      </div>
    );
  }

  const activeCount    = activations.filter(a => a.status === "active").length;
  const submittedCount = activations.filter(a => a.status === "submitted").length;
  const expiredCount   = activations.filter(a => a.status === "expired").length;

  // ── Tab button component ────────────────────────────────────────────────────
  const Tab = ({ id, label, icon: Icon }: { id: "control" | "sheet"; label: string; icon: React.ElementType }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={cn(
        "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
        activeTab === id
          ? "bg-primary text-white shadow-sm"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-5xl mx-auto">

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
              ? "تفعيل نوافذ الإرسال ومراجعة كشف الحضور"
              : "Activate submission windows and review the attendance sheet"}
          </p>
        </div>
      </div>

      {/* Event selector — always visible */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-primary" />
            {isAr ? "الفعالية" : "Event"}
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
                    <span className="font-medium">{isAr && ev.title_ar ? ev.title_ar : ev.title}</span>
                    <span className="ms-2 text-xs text-muted-foreground">· {fmtDate(ev.start_time)}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {selectedEventId && (
            <div className="mt-3 flex gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs gap-1">
                <Users className="w-3 h-3" /> {participants.length} {isAr ? "مدعو" : "invited"}
              </Badge>
              {activeCount > 0 && (
                <Badge className="text-xs gap-1 bg-emerald-100 text-emerald-700 border-emerald-200">
                  <Play className="w-3 h-3" /> {activeCount} {isAr ? "نشط" : "active"}
                </Badge>
              )}
              {submittedCount > 0 && (
                <Badge className="text-xs gap-1 bg-blue-100 text-blue-700 border-blue-200">
                  <CheckCircle2 className="w-3 h-3" /> {submittedCount} {isAr ? "أرسل" : "submitted"}
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

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-muted/40 rounded-2xl border border-border w-fit">
        <Tab id="control" label={isAr ? "لوحة التفعيل" : "Activation Panel"} icon={ShieldCheck} />
        <Tab id="sheet"   label={isAr ? "كشف الحضور" : "Attendance Sheet"} icon={ClipboardList} />
      </div>

      {/* ── Tab: Control panel ─────────────────────────────────────────────── */}
      {activeTab === "control" && (
        <div className="space-y-5">
          {/* Duration picker */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Timer className="w-4 h-4 text-primary" />
                {isAr ? "مدة نافذة الإرسال" : "Submission Window Duration"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
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
                  ? `سيُغلق زر الإرسال تلقائياً بعد ${fmtCountdown(duration)} من التفعيل`
                  : `Submit button auto-disables after ${fmtCountdown(duration)} from activation`}
              </p>
            </CardContent>
          </Card>

          {/* Participant list */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-primary" />
                  {isAr ? "قائمة المدعوين" : "Invited Attendees"}
                  {selectedUserIds.size > 0 && (
                    <Badge className="ms-1 text-xs bg-primary text-white">{selectedUserIds.size}</Badge>
                  )}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {participants.length > 0 && (
                    <button className="text-xs text-primary hover:underline font-medium" onClick={toggleAll}>
                      {selectedUserIds.size === eligibleIds.length && eligibleIds.length > 0
                        ? (isAr ? "إلغاء الكل" : "Deselect All")
                        : (isAr ? "تحديد الكل" : "Select All")}
                    </button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => loadActivations(selectedEventId)} disabled={loadingActs} className="gap-1.5 h-8 text-xs">
                    {loadingActs ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                    {isAr ? "تحديث" : "Refresh"}
                  </Button>
                </div>
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

          {/* Sticky action bar */}
          {participants.length > 0 && (
            <div className="sticky bottom-4 z-10">
              <div className="bg-card border border-border rounded-2xl shadow-xl px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="text-sm text-muted-foreground">
                  {selectedUserIds.size === 0
                    ? (isAr ? "اختر المدعوين للتفعيل" : "Select attendees above to activate")
                    : (isAr
                        ? `${selectedUserIds.size} محدد · المدة: ${fmtCountdown(duration)}`
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
      )}

      {/* ── Tab: Attendance Sheet ──────────────────────────────────────────── */}
      {activeTab === "sheet" && (
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-primary" />
              {isAr ? "كشف الحضور" : "Attendance Sheet"}
              {selectedEventId && (
                <span className="text-xs text-muted-foreground font-normal ms-1">
                  — {events.find(e => e.id === selectedEventId)
                      ? (isAr && events.find(e => e.id === selectedEventId)?.title_ar
                          ? events.find(e => e.id === selectedEventId)?.title_ar
                          : events.find(e => e.id === selectedEventId)?.title)
                      : ""}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedEventId
              ? <AttendanceSheet
                  eventId={selectedEventId}
                  isAr={isAr}
                  eventTitle={(() => {
                    const ev = events.find(e => e.id === selectedEventId);
                    return ev ? (isAr && ev.title_ar ? ev.title_ar : ev.title) : "";
                  })()}
                  eventDate={events.find(e => e.id === selectedEventId)?.start_time ?? ""}
                />
              : (
                <div className="py-12 text-center text-muted-foreground">
                  <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">{isAr ? "اختر فعالية لعرض الكشف" : "Select an event to view the sheet"}</p>
                </div>
              )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
