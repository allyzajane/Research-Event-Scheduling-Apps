import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  useListEvents, getListEventsQueryKey,
  useCreateEvent, useUpdateEvent, useDeleteEvent
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import i18n from "i18next";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin, { DateClickArg } from "@fullcalendar/interaction";
import { EventClickArg } from "@fullcalendar/core";
import { PlusCircle, Trash2, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const EVENT_TYPES = ["event", "meeting", "announcement"];
const EVENT_COLORS = [
  { label: "Teal", value: "#2f9acb" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Green", value: "#10b981" },
  { label: "Orange", value: "#f59e0b" },
  { label: "Red", value: "#ef4444" },
  { label: "Purple", value: "#8b5cf6" },
];

const typeColors: Record<string, string> = {
  event: "bg-teal-500",
  meeting: "bg-blue-500",
  announcement: "bg-amber-500",
};

interface EventForm {
  title: string; title_ar: string; event_type: string;
  start_time: string; end_time: string; all_day: boolean;
  location: string; color: string;
}

const emptyForm = (dateStr?: string): EventForm => ({
  title: "", title_ar: "", event_type: "event",
  start_time: dateStr ? `${dateStr}T09:00` : "",
  end_time: dateStr ? `${dateStr}T10:00` : "",
  all_day: false, location: "", color: "#2f9acb"
});

function toInputDate(iso: string) {
  if (!iso) return "";
  return iso.slice(0, 16);
}

export default function CalendarPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const calRef = useRef<FullCalendar>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<{ id: string; form: EventForm } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<EventForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);

  const params: Record<string, string> = {};
  if (dateRange) { params.start = dateRange.start; params.end = dateRange.end; }

  const { data: events } = useListEvents(params, {
    query: { queryKey: getListEventsQueryKey(params) }
  });

  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();
  const invalidate = () => qc.invalidateQueries({ queryKey: getListEventsQueryKey() });

  const fcEvents = (events || []).map(e => ({
    id: e.id, title: i18n.language === "ar" && e.title_ar ? e.title_ar : e.title,
    start: e.start_time, end: e.end_time ?? undefined, allDay: e.all_day, backgroundColor: e.color || "#2f9acb",
    borderColor: "transparent", extendedProps: { event_type: e.event_type, location: e.location, title_ar: e.title_ar }
  }));

  const handleDateClick = (info: DateClickArg) => {
    setForm(emptyForm(info.dateStr));
    setCreateOpen(true);
  };

  const handleEventClick = (info: EventClickArg) => {
    const ev = events?.find(e => e.id === info.event.id);
    if (!ev) return;
    setEditEvent({ id: ev.id, form: {
      title: ev.title, title_ar: ev.title_ar || "", event_type: ev.event_type,
      start_time: toInputDate(ev.start_time), end_time: toInputDate(ev.end_time || ev.start_time),
      all_day: ev.all_day, location: ev.location || "", color: ev.color || "#2f9acb"
    }});
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      await createEvent.mutateAsync({ data: {
        title: form.title, title_ar: form.title_ar || null, event_type: form.event_type,
        start_time: new Date(form.start_time).toISOString(),
        end_time: form.end_time ? new Date(form.end_time).toISOString() : null,
        all_day: form.all_day, location: form.location || null, color: form.color
      }});
      invalidate(); setCreateOpen(false); setForm(emptyForm());
    } finally { setSaving(false); }
  };

  const handleEdit = async () => {
    if (!editEvent) return;
    setSaving(true);
    try {
      await updateEvent.mutateAsync({ id: editEvent.id, data: {
        title: editEvent.form.title, title_ar: editEvent.form.title_ar || null,
        event_type: editEvent.form.event_type,
        start_time: new Date(editEvent.form.start_time).toISOString(),
        end_time: editEvent.form.end_time ? new Date(editEvent.form.end_time).toISOString() : null,
        all_day: editEvent.form.all_day, location: editEvent.form.location || null, color: editEvent.form.color
      }});
      invalidate(); setEditEvent(null);
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteEvent.mutateAsync({ id: deleteId });
    invalidate(); setDeleteId(null);
  };

  const upcomingEvents = (events || [])
    .filter(e => new Date(e.start_time) >= new Date())
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    .slice(0, 5);

  const EventFormFields = ({ val, onChange }: { val: EventForm; onChange: (v: EventForm) => void }) => (
    <div className="space-y-4 py-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{t("calendar.eventTitle")} *</Label>
          <Input value={val.title} onChange={e => onChange({...val, title: e.target.value})} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("calendar.eventTitleAr")}</Label>
          <Input value={val.title_ar} onChange={e => onChange({...val, title_ar: e.target.value})} dir="rtl" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{t("calendar.eventType")}</Label>
          <Select value={val.event_type} onValueChange={v => onChange({...val, event_type: v})}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{EVENT_TYPES.map(t2 => <SelectItem key={t2} value={t2}>{t(`calendar.types.${t2}`)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t("calendar.location")}</Label>
          <Input value={val.location} onChange={e => onChange({...val, location: e.target.value})} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Switch checked={val.all_day} onCheckedChange={v => onChange({...val, all_day: v})} />
        <Label>{t("calendar.allDay")}</Label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{t("calendar.startTime")}</Label>
          <Input type={val.all_day ? "date" : "datetime-local"} value={val.start_time} onChange={e => onChange({...val, start_time: e.target.value})} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("calendar.endTime")}</Label>
          <Input type={val.all_day ? "date" : "datetime-local"} value={val.end_time} onChange={e => onChange({...val, end_time: e.target.value})} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>{t("calendar.color")}</Label>
        <div className="flex gap-2 flex-wrap">
          {EVENT_COLORS.map(c => (
            <button key={c.value} onClick={() => onChange({...val, color: c.value})}
              className={cn("w-7 h-7 rounded-full border-2 transition-all", val.color === c.value ? "border-foreground scale-110" : "border-transparent")}
              style={{ backgroundColor: c.value }} title={c.label} />
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("calendar.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("calendar.subtitle")}</p>
        </div>
        <Button onClick={() => { setForm(emptyForm()); setCreateOpen(true); }} className="gap-2">
          <PlusCircle className="w-4 h-4" /> {t("calendar.createEvent")}
        </Button>
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
            direction={i18n.language === "ar" ? "rtl" : "ltr"}
          />
        </div>

        {/* Upcoming events sidebar */}
        <div className="lg:col-span-1 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">{t("calendar.upcoming")}</h3>
          {upcomingEvents.length ? (
            upcomingEvents.map(ev => (
              <div key={ev.id} className="p-3 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors cursor-pointer"
                onClick={() => setEditEvent({ id: ev.id, form: {
                  title: ev.title, title_ar: ev.title_ar || "", event_type: ev.event_type,
                  start_time: toInputDate(ev.start_time), end_time: toInputDate(ev.end_time || ev.start_time),
                  all_day: ev.all_day, location: ev.location || "", color: ev.color || "#2f9acb"
                }})}>
                <div className="flex items-start gap-2.5">
                  <span className={cn("w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0", typeColors[ev.event_type] || "bg-gray-400")} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {i18n.language === "ar" && ev.title_ar ? ev.title_ar : ev.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(ev.start_time).toLocaleDateString(i18n.language === "ar" ? "ar-SA" : "en-US", { month: "short", day: "numeric" })}
                      {!ev.all_day && ` · ${new Date(ev.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                    </p>
                    {ev.location && <p className="text-xs text-muted-foreground truncate">{ev.location}</p>}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-10 text-muted-foreground">
              <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{t("calendar.noEvents")}</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("calendar.createEvent")}</DialogTitle></DialogHeader>
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
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("calendar.editEvent")}</DialogTitle></DialogHeader>
          {editEvent && <EventFormFields val={editEvent.form} onChange={f => setEditEvent({ ...editEvent, form: f })} />}
          <DialogFooter>
            <Button variant="ghost" className="text-destructive me-auto" onClick={() => { setDeleteId(editEvent!.id); setEditEvent(null); }}>
              <Trash2 className="w-4 h-4 me-1.5" />{t("common.delete")}
            </Button>
            <Button variant="outline" onClick={() => setEditEvent(null)}>{t("common.cancel")}</Button>
            <Button onClick={handleEdit} disabled={saving}>{saving ? t("common.loading") : t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("calendar.deleteEvent")}</AlertDialogTitle>
            <AlertDialogDescription>{t("calendar.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
