import { useState, useRef, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { formatDateAST, formatTimeAST, toInputDateTimeAST, fromInputDateTimeAST, getASTDateStr } from "@/lib/ast";
import {
  useListEvents, getListEventsQueryKey,
  useCreateEvent, useUpdateEvent, useDeleteEvent,
  useListUsers,
  type CalendarEvent,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import i18n from "i18next";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin, { DateClickArg } from "@fullcalendar/interaction";
import { EventClickArg } from "@fullcalendar/core";
import {
  MapPin, PlusCircle, Trash2, Calendar, Clock, Users,
  ChevronDown, Check, X, Search, UserCheck, FileDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// ─── Constants ───────────────────────────────────────────────────────────────

const EVENT_TYPES = [
  { value: "event", label: "Event", label_ar: "فعالية" },
  { value: "meeting", label: "Meeting", label_ar: "اجتماع" },
  { value: "conference", label: "Conference", label_ar: "مؤتمر" },
  { value: "announcement", label: "Announcement", label_ar: "إعلان" },
];

const ORGANIZERS = [
  { value: "Quality", label: "Quality", label_ar: "الجودة" },
  { value: "Team", label: "Team", label_ar: "الفريق" },
  { value: "Committee", label: "Committee", label_ar: "اللجنة" },
  { value: "Council", label: "Council", label_ar: "المجلس" },
  { value: "Board", label: "Board", label_ar: "مجلس الإدارة" },
];

const EVENT_STATUSES = [
  { value: "active", label: "Active" },
  { value: "canceled", label: "Canceled" },
  { value: "rescheduled", label: "Rescheduled" },
];

// ─── Pin color system ─────────────────────────────────────────────────────────
// Green  = present / upcoming (active)
// Red    = past
// Yellow = canceled
// Light blue = rescheduled

type PinStatus = "present" | "past" | "canceled" | "rescheduled";

const PIN_COLORS: Record<PinStatus, string> = {
  present: "#22c55e",
  past: "#ef4444",
  canceled: "#f59e0b",
  rescheduled: "#7dd3fc",
};

const PIN_LABELS: Record<PinStatus, string> = {
  present: "Present / Upcoming",
  past: "Past",
  canceled: "Canceled",
  rescheduled: "Rescheduled",
};

function getPinStatus(ev: CalendarEvent): PinStatus {
  const status = ev.event_status || "active";
  if (status === "canceled") return "canceled";
  if (status === "rescheduled") return "rescheduled";

  const now = new Date();
  const start = new Date(ev.start_time);
  const end = ev.end_time ? new Date(ev.end_time) : null;

  if (end && end < now) return "past";
  if (!end && getASTDateStr(start) < getASTDateStr(now)) return "past";
  return "present";
}

// ─── Duration helper ──────────────────────────────────────────────────────────

function calcDuration(start: string, end: string): string {
  if (!start || !end) return "—";
  const diffMs = new Date(end).getTime() - new Date(start).getTime();
  if (diffMs <= 0) return "—";
  const h = Math.floor(diffMs / 3_600_000);
  const m = Math.floor((diffMs % 3_600_000) / 60_000);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

// ─── Form shape ───────────────────────────────────────────────────────────────

interface EventForm {
  title: string;
  title_ar: string;
  description: string;
  description_ar: string;
  event_type: string;
  organizer: string;
  venue: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
  color: string;
  event_status: string;
  participants: string[];
}

const emptyForm = (dateStr?: string): EventForm => ({
  title: "",
  title_ar: "",
  description: "",
  description_ar: "",
  event_type: "event",
  organizer: "",
  venue: "",
  start_time: dateStr ? `${dateStr}T09:00` : "",
  end_time: dateStr ? `${dateStr}T10:00` : "",
  all_day: false,
  color: "#2f9acb",
  event_status: "active",
  participants: [],
});

function toInputDate(iso: string) {
  return toInputDateTimeAST(iso);
}

function eventToForm(ev: CalendarEvent): EventForm {
  return {
    title: ev.title,
    title_ar: ev.title_ar || "",
    description: ev.description || "",
    description_ar: ev.description_ar || "",
    event_type: ev.event_type,
    organizer: ev.organizer || "",
    venue: ev.venue || ev.location || "",
    start_time: toInputDate(ev.start_time),
    end_time: toInputDate(ev.end_time || ev.start_time),
    all_day: ev.all_day,
    color: ev.color || "#2f9acb",
    event_status: ev.event_status || "active",
    participants: Array.isArray(ev.participants) ? ev.participants : [],
  };
}

// ─── Participants multi-select ────────────────────────────────────────────────

interface ParticipantsSelectProps {
  selected: string[];
  onChange: (ids: string[]) => void;
}

function ParticipantsSelect({ selected, onChange }: ParticipantsSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: users = [] } = useListUsers({}, { query: { queryKey: ["users", "list"], staleTime: 60_000 } });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter(u =>
      !q || u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
    );
  }, [users, search]);

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);
  };

  const toggleAll = () => {
    onChange(selected.length === users.length ? [] : users.map(u => u.id));
  };

  const selectedNames = users
    .filter(u => selected.includes(u.id))
    .map(u => u.full_name || u.email)
    .join(", ");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between h-auto min-h-[2.5rem] py-2 px-3 font-normal text-left"
        >
          <span className="flex-1 truncate text-sm">
            {selected.length === 0
              ? <span className="text-muted-foreground">Select participants…</span>
              : selectedNames
            }
          </span>
          <span className="flex items-center gap-1 ms-2 flex-shrink-0">
            {selected.length > 0 && (
              <Badge variant="secondary" className="text-xs px-1.5">{selected.length}</Badge>
            )}
            <ChevronDown className="w-4 h-4 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-sm"
              placeholder="Search users…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="p-1 border-b">
          <button
            className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-accent text-left"
            onClick={toggleAll}
          >
            <Checkbox checked={selected.length === users.length && users.length > 0} />
            <span className="font-medium">
              {selected.length === users.length && users.length > 0 ? "Deselect All" : "Select All"}
            </span>
          </button>
        </div>
        <ScrollArea className="h-52">
          <div className="p-1">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No users found</p>
            ) : (
              filtered.map(u => (
                <button
                  key={u.id}
                  className="flex items-center gap-2.5 w-full px-2 py-2 text-sm rounded hover:bg-accent text-left"
                  onClick={() => toggle(u.id)}
                >
                  <Checkbox checked={selected.includes(u.id)} />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{u.full_name || "—"}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

// ─── Event form fields ────────────────────────────────────────────────────────

interface FormFieldsProps {
  val: EventForm;
  onChange: (v: EventForm) => void;
  isEdit?: boolean;
}

function EventFormFields({ val, onChange, isEdit }: FormFieldsProps) {
  const duration = calcDuration(val.start_time, val.end_time);
  const isAr = i18n.language === "ar";

  // Auto-update end_time when start_time changes (keep same duration)
  useEffect(() => {
    if (val.start_time && val.end_time) {
      const startMs = new Date(val.start_time).getTime();
      const endMs = new Date(val.end_time).getTime();
      if (endMs <= startMs) {
        const newEnd = new Date(startMs + 60 * 60 * 1000).toISOString().slice(0, 16);
        onChange({ ...val, end_time: newEnd });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [val.start_time]);

  return (
    <div className="space-y-4 py-2">
      {/* Title row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Title <span className="text-destructive">*</span></Label>
          <Input
            value={val.title}
            onChange={e => onChange({ ...val, title: e.target.value })}
            placeholder="Event title"
          />
        </div>
        <div className="space-y-1.5">
          <Label>العنوان بالعربي</Label>
          <Input
            value={val.title_ar}
            onChange={e => onChange({ ...val, title_ar: e.target.value })}
            dir="rtl"
            placeholder="عنوان الفعالية"
          />
        </div>
      </div>

      {/* Type + Organizer */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={val.event_type} onValueChange={v => onChange({ ...val, event_type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {EVENT_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>
                  {isAr ? t.label_ar : t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Organizer</Label>
          <Select value={val.organizer} onValueChange={v => onChange({ ...val, organizer: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Select organizer…" />
            </SelectTrigger>
            <SelectContent>
              {ORGANIZERS.map(o => (
                <SelectItem key={o.value} value={o.value}>
                  {isAr ? o.label_ar : o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Venue */}
      <div className="space-y-1.5">
        <Label>Venue</Label>
        <Input
          value={val.venue}
          onChange={e => onChange({ ...val, venue: e.target.value })}
          placeholder="Room, building, or Zoom link…"
        />
      </div>

      {/* All day toggle */}
      <div className="flex items-center gap-3">
        <Switch
          checked={val.all_day}
          onCheckedChange={v => onChange({ ...val, all_day: v })}
        />
        <Label className="cursor-pointer">All-day event</Label>
      </div>

      {/* Time row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Start Time <span className="text-destructive">*</span></Label>
          <Input
            type={val.all_day ? "date" : "datetime-local"}
            value={val.start_time}
            onChange={e => onChange({ ...val, start_time: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>End Time</Label>
          <Input
            type={val.all_day ? "date" : "datetime-local"}
            value={val.end_time}
            onChange={e => onChange({ ...val, end_time: e.target.value })}
          />
        </div>
      </div>

      {/* Duration (auto) */}
      {!val.all_day && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
          <Clock className="w-4 h-4 flex-shrink-0" />
          <span>Duration (auto):</span>
          <span className="font-semibold text-foreground">{duration}</span>
        </div>
      )}

      {/* Participants */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5">
          <Users className="w-4 h-4" /> Participants
        </Label>
        <ParticipantsSelect
          selected={val.participants}
          onChange={ids => onChange({ ...val, participants: ids })}
        />
        {val.participants.length > 0 && (
          <p className="text-xs text-muted-foreground">{val.participants.length} user(s) selected</p>
        )}
      </div>

      {/* Status (edit only) */}
      {isEdit && (
        <div className="space-y-1.5">
          <Label>Status</Label>
          <div className="flex gap-2">
            {EVENT_STATUSES.map(s => {
              const pinStatus: PinStatus =
                s.value === "canceled" ? "canceled"
                : s.value === "rescheduled" ? "rescheduled"
                : "present";
              return (
                <button
                  key={s.value}
                  onClick={() => onChange({ ...val, event_status: s.value })}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all",
                    val.event_status === s.value
                      ? "border-transparent text-white shadow-sm"
                      : "border-border bg-background text-muted-foreground hover:border-primary/30"
                  )}
                  style={val.event_status === s.value
                    ? { backgroundColor: PIN_COLORS[pinStatus] }
                    : {}
                  }
                >
                  <MapPin className="w-3 h-3" />
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Description — bilingual side by side */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea
            value={val.description}
            onChange={e => onChange({ ...val, description: e.target.value })}
            placeholder="Add notes, agenda, or any details…"
            className="min-h-[80px] resize-none"
          />
        </div>
        <div className="space-y-1.5">
          <Label>الوصف بالعربي</Label>
          <Textarea
            value={val.description_ar}
            onChange={e => onChange({ ...val, description_ar: e.target.value })}
            placeholder="أضف ملاحظات أو جدول أعمال…"
            dir="rtl"
            className="min-h-[80px] resize-none"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Custom FullCalendar event renderer ───────────────────────────────────────

function EventContent({ event, events }: { event: { id: string; title: string }; events: CalendarEvent[] }) {
  const ev = events.find(e => e.id === event.id);
  if (!ev) return <span className="text-xs px-1">{event.title}</span>;

  const pinStatus = getPinStatus(ev);
  const color = PIN_COLORS[pinStatus];
  const isPresent = pinStatus === "present";

  return (
    <div className="flex items-center gap-1 w-full overflow-hidden px-1 py-0.5 group">
      <span
        className={cn(
          "flex-shrink-0 transition-transform",
          isPresent && "animate-bounce"
        )}
        style={{ color }}
      >
        <MapPin className="w-3 h-3" style={{ fill: color, color }} />
      </span>
      <span className="text-xs font-medium truncate leading-tight">{event.title}</span>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const calRef = useRef<FullCalendar>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<{ id: string; form: EventForm } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<EventForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const params: Record<string, string> = {};
  if (dateRange) { params.start = dateRange.start; params.end = dateRange.end; }

  const { data: events = [] } = useListEvents(params, {
    query: { queryKey: getListEventsQueryKey(params) }
  });

  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();
  const invalidate = () => qc.invalidateQueries({ queryKey: getListEventsQueryKey() });

  const isAr = i18n.language === "ar";

  // Filtered events for sidebar
  const filteredEvents = useMemo(() => {
    return events.filter(ev => {
      if (filterStatus === "all") return true;
      return getPinStatus(ev) === filterStatus;
    });
  }, [events, filterStatus]);

  // FC events — use pin color for each event's dot
  const fcEvents = useMemo(() => events.map(e => {
    const pinStatus = getPinStatus(e);
    const color = PIN_COLORS[pinStatus];
    return {
      id: e.id,
      title: isAr && e.title_ar ? e.title_ar : e.title,
      start: e.start_time,
      end: e.end_time ?? undefined,
      allDay: e.all_day,
      backgroundColor: color,
      borderColor: color,
      textColor: "#fff",
      extendedProps: { event_type: e.event_type, pinStatus },
    };
  }), [events, isAr]);

  const handleDateClick = (info: DateClickArg) => {
    setForm(emptyForm(info.dateStr));
    setCreateOpen(true);
  };

  const handleEventClick = (info: EventClickArg) => {
    const ev = events.find(e => e.id === info.event.id);
    if (!ev) return;
    setEditEvent({ id: ev.id, form: eventToForm(ev) });
  };

  const handleCreate = async () => {
    if (!form.title || !form.start_time) return;
    setSaving(true);
    try {
      await createEvent.mutateAsync({
        data: {
          title: form.title,
          title_ar: form.title_ar || null,
          description: form.description || null,
          description_ar: form.description_ar || null,
          event_type: form.event_type,
          organizer: form.organizer || null,
          venue: form.venue || null,
          participants: form.participants,
          event_status: form.event_status,
          start_time: fromInputDateTimeAST(form.start_time),
          end_time: form.end_time ? fromInputDateTimeAST(form.end_time) : null,
          all_day: form.all_day,
          color: form.color,
        }
      });
      invalidate();
      setCreateOpen(false);
      setForm(emptyForm());
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!editEvent) return;
    setSaving(true);
    try {
      const f = editEvent.form;
      await updateEvent.mutateAsync({
        id: editEvent.id,
        data: {
          title: f.title,
          title_ar: f.title_ar || null,
          description: f.description || null,
          description_ar: f.description_ar || null,
          event_type: f.event_type,
          organizer: f.organizer || null,
          venue: f.venue || null,
          participants: f.participants,
          event_status: f.event_status,
          start_time: fromInputDateTimeAST(f.start_time),
          end_time: f.end_time ? fromInputDateTimeAST(f.end_time) : null,
          all_day: f.all_day,
          color: f.color,
        }
      });
      invalidate();
      setEditEvent(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteEvent.mutateAsync({ id: deleteId });
    invalidate();
    setDeleteId(null);
  };

  // Status counts for filter bar
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: events.length, present: 0, past: 0, canceled: 0, rescheduled: 0 };
    events.forEach(ev => { c[getPinStatus(ev)] = (c[getPinStatus(ev)] || 0) + 1; });
    return c;
  }, [events]);

  // ── PDF export ───────────────────────────────────────────────────────────────
  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.width;

      // Derive month label from current calendar view
      const monthLabel = dateRange
        ? new Date(dateRange.start).toLocaleString("en-US", { month: "long", year: "numeric" })
        : new Date().toLocaleString("en-US", { month: "long", year: "numeric" });

      // ── Header block ────────────────────────────────────────────────────────
      doc.setFillColor(47, 154, 203);
      doc.rect(0, 0, pageW, 22, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("Taif Children's Hospital", pageW / 2, 9, { align: "center" });

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Calendar Schedule — ${monthLabel}`, pageW / 2, 17, { align: "center" });

      doc.setTextColor(0, 0, 0);

      // ── Table ───────────────────────────────────────────────────────────────
      const sorted = [...events].sort(
        (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );

      const rows = sorted.map(ev => {
        const ps = getPinStatus(ev);
        const statusLabel =
          ps === "past" ? "Past"
          : ev.event_status === "canceled" ? "Canceled"
          : ev.event_status === "rescheduled" ? "Rescheduled"
          : "Active";

        const timeStr = ev.all_day
          ? "All Day"
          : formatTimeAST(ev.start_time, "en") +
            (ev.end_time ? ` – ${formatTimeAST(ev.end_time, "en")}` : "");

        const descStr = ev.description || "";

        return [
          formatDateAST(ev.start_time, "en"),
          timeStr,
          ev.title || "—",
          ev.event_type.charAt(0).toUpperCase() + ev.event_type.slice(1),
          ev.organizer || "—",
          ev.venue || "—",
          statusLabel,
          descStr,
        ];
      });

      // Column indices: 0=Date 1=Time 2=Title 3=Type 4=Organizer 5=Venue 6=Status 7=Desc
      autoTable(doc, {
        head: [["Date", "Time", "Event", "Type", "Organizer", "Venue", "Status", "Description"]],
        body: rows,
        startY: 26,
        styles: { fontSize: 8, cellPadding: 2.5, overflow: "linebreak" },
        headStyles: {
          fillColor: [47, 154, 203],
          textColor: 255,
          fontStyle: "bold",
          fontSize: 8.5,
        },
        alternateRowStyles: { fillColor: [242, 249, 253] },
        columnStyles: {
          0: { cellWidth: 26 },
          1: { cellWidth: 32 },
          2: { cellWidth: 55 },
          3: { cellWidth: 22 },
          4: { cellWidth: 26 },
          5: { cellWidth: 40 },
          6: { cellWidth: 20 },
          7: { cellWidth: 60 },
        },
        didDrawCell: (data) => {
          // Colour the Status column (index 6)
          if (data.section === "body" && data.column.index === 6) {
            const val = String(data.cell.raw);
            const colour: [number, number, number] =
              val === "Past"          ? [220, 38, 38]
              : val === "Canceled"    ? [217, 119, 6]
              : val === "Rescheduled" ? [14, 165, 233]
              : [34, 197, 94];
            doc.setTextColor(...colour);
            doc.setFontSize(8);
            doc.text(val, data.cell.x + 2, data.cell.y + data.cell.height / 2 + 1);
            doc.setTextColor(0, 0, 0);
          }
        },
      });

      // ── Footer on every page ────────────────────────────────────────────────
      const pageCount = doc.getNumberOfPages();
      const pageH = doc.internal.pageSize.height;
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7.5);
        doc.setTextColor(150);
        doc.text(
          `Generated on ${new Date().toLocaleDateString("en-US", { dateStyle: "full" })}  ·  Page ${i} of ${pageCount}`,
          pageW / 2, pageH - 5, { align: "center" }
        );
        doc.setTextColor(0, 0, 0);
      }

      const slug = monthLabel.toLowerCase().replace(/\s+/g, "-");
      doc.save(`taif-hospital-calendar-${slug}.pdf`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("calendar.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("calendar.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExportPDF}
            disabled={exporting || events.length === 0}
            className="gap-2"
          >
            <FileDown className="w-4 h-4" />
            {exporting ? "Exporting…" : "Export PDF"}
          </Button>
          <Button onClick={() => { setForm(emptyForm()); setCreateOpen(true); }} className="gap-2">
            <PlusCircle className="w-4 h-4" /> {t("calendar.createEvent")}
          </Button>
        </div>
      </div>

      {/* Legend + filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        {(["all", "present", "past", "canceled", "rescheduled"] as const).map(s => {
          const color = s === "all" ? undefined : PIN_COLORS[s as PinStatus];
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all",
                filterStatus === s
                  ? "border-transparent text-white shadow"
                  : "border-border bg-background text-muted-foreground hover:border-primary/20"
              )}
              style={filterStatus === s && color
                ? { backgroundColor: color }
                : filterStatus === s
                ? { backgroundColor: "hsl(var(--primary))" }
                : {}
              }
            >
              {s !== "all" && (
                <MapPin
                  className="w-3 h-3"
                  style={{ fill: filterStatus === s ? "#fff" : color, color: filterStatus === s ? "#fff" : color }}
                />
              )}
              {s === "all" ? "All" : PIN_LABELS[s as PinStatus]}
              <span className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                filterStatus === s ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
              )}>
                {counts[s] || 0}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-4 gap-6">

        {/* Calendar */}
        <div className="lg:col-span-3 bg-card border border-border rounded-xl p-4 overflow-hidden">
          <FullCalendar
            ref={calRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{ start: "prev,next today", center: "title", end: "dayGridMonth,timeGridWeek" }}
            events={fcEvents}
            dateClick={handleDateClick}
            eventClick={handleEventClick}
            datesSet={info => setDateRange({ start: info.startStr, end: info.endStr })}
            height="auto"
            direction={isAr ? "rtl" : "ltr"}
            eventContent={arg => (
              <EventContent event={{ id: arg.event.id, title: arg.event.title }} events={events} />
            )}
            eventClassNames="!bg-transparent !border-0 !shadow-none cursor-pointer"
          />
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              {filterStatus === "all" ? t("calendar.upcoming") : PIN_LABELS[filterStatus as PinStatus]}
            </h3>
            {filterStatus !== "all" && (
              <button onClick={() => setFilterStatus("all")}
                className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {filteredEvents.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{t("calendar.noEvents")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredEvents
                .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
                .slice(0, 8)
                .map(ev => {
                  const pinStatus = getPinStatus(ev);
                  const color = PIN_COLORS[pinStatus];
                  const isPresent = pinStatus === "present";
                  const tooltipDesc = isAr && ev.description_ar ? ev.description_ar : ev.description;

                  const cardInner = (
                    <div
                      className="p-3 rounded-xl border border-border bg-card hover:border-primary/30 transition-all cursor-pointer group"
                      onClick={() => setEditEvent({ id: ev.id, form: eventToForm(ev) })}
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          className={cn(
                            "mt-0.5 flex-shrink-0 transition-transform group-hover:scale-110",
                            isPresent && "animate-bounce"
                          )}
                          style={{ color }}
                        >
                          <MapPin className="w-3.5 h-3.5" style={{ fill: color }} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">
                            {isAr && ev.title_ar ? ev.title_ar : ev.title}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatDateAST(ev.start_time, isAr ? "ar" : "en")}
                            {!ev.all_day && ` · ${formatTimeAST(ev.start_time, isAr ? "ar" : "en")}`}
                          </p>
                          {ev.venue && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              📍 {ev.venue}
                            </p>
                          )}
                          {ev.organizer && (
                            <p className="text-xs text-muted-foreground truncate">
                              🏢 {ev.organizer}
                            </p>
                          )}
                          {tooltipDesc && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5 italic">
                              {tooltipDesc}
                            </p>
                          )}
                          {Array.isArray(ev.participants) && ev.participants.length > 0 && (
                            <div className="flex items-center gap-1 mt-1">
                              <UserCheck className="w-3 h-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">{ev.participants.length} participant(s)</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 mt-1.5">
                            {pinStatus === "past" ? (
                              <Badge
                                className="text-[10px] px-2 py-0.5 h-auto font-semibold bg-red-100 text-red-600 border-red-300"
                                variant="outline"
                              >
                                Past
                                {ev.organizer ? ` · ${ev.organizer}` : ""}
                                {ev.event_type ? ` · ${ev.event_type.charAt(0).toUpperCase() + ev.event_type.slice(1)}` : ""}
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 h-4"
                                style={{ borderColor: color, color }}
                              >
                                {ev.event_type}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );

                  return (
                    <div key={ev.id}>
                      {tooltipDesc ? (
                        <Tooltip>
                          <TooltipTrigger asChild>{cardInner}</TooltipTrigger>
                          <TooltipContent
                            side="left"
                            className="max-w-64 text-xs leading-relaxed whitespace-pre-wrap"
                            dir={isAr && ev.description_ar ? "rtl" : "ltr"}
                          >
                            {tooltipDesc}
                          </TooltipContent>
                        </Tooltip>
                      ) : cardInner}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" />
              {t("calendar.createEvent")}
            </DialogTitle>
          </DialogHeader>
          <EventFormFields val={form} onChange={setForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleCreate} disabled={saving || !form.title || !form.start_time}>
              {saving ? t("common.loading") : t("calendar.createEvent")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editEvent} onOpenChange={v => !v && setEditEvent(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" />
              {t("calendar.editEvent")}
            </DialogTitle>
          </DialogHeader>
          {editEvent && (
            <EventFormFields
              val={editEvent.form}
              onChange={f => setEditEvent({ ...editEvent, form: f })}
              isEdit
            />
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              className="text-destructive me-auto"
              onClick={() => { setDeleteId(editEvent!.id); setEditEvent(null); }}
            >
              <Trash2 className="w-4 h-4 me-1.5" />{t("common.delete")}
            </Button>
            <Button variant="outline" onClick={() => setEditEvent(null)}>{t("common.cancel")}</Button>
            <Button onClick={handleEdit} disabled={saving}>
              {saving ? t("common.loading") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("calendar.deleteEvent")}</AlertDialogTitle>
            <AlertDialogDescription>{t("calendar.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
