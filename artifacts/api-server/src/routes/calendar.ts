import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { supabaseAdmin } from "../lib/supabase";
import { notifyAllUsers } from "../lib/notifyAll";

const router = Router();

const EVENT_FIELDS = [
  "title", "title_ar",
  "event_type", "organizer", "venue",
  "participants", "event_status", "start_time", "end_time",
  "all_day", "color",
];

function shapeEvent(e: Record<string, unknown>) {
  return {
    ...e,
    creator_name: (e.profiles as { full_name?: string } | null)?.full_name || null,
    participants: Array.isArray(e.participants) ? e.participants : [],
    profiles: undefined,
  };
}

router.get("/calendar/events", requireAuth, async (req, res) => {
  try {
    const { start, end, type, status } = req.query as Record<string, string>;

    let query = supabaseAdmin
      .from("calendar_events")
      .select("*, profiles!calendar_events_created_by_fkey(full_name)");

    if (start) query = query.gte("start_time", start);
    if (end) query = query.lte("start_time", end);
    if (type) query = query.eq("event_type", type);
    if (status) query = query.eq("event_status", status);

    const { data, error } = await query.order("start_time");

    if (error) {
      req.log.warn({ err: error }, "calendar_events table may not exist yet");
      res.json([]);
      return;
    }

    res.json((data || []).map(e => shapeEvent(e as Record<string, unknown>)));
  } catch (err) {
    req.log.error({ err }, "Failed to list events");
    res.json([]);
  }
});

router.post("/calendar/events", requireAuth, async (req, res) => {
  try {
    const {
      title, title_ar,
      event_type, organizer, venue, participants,
      event_status, start_time, end_time, all_day, color,
    } = req.body;

    const { data, error } = await supabaseAdmin
      .from("calendar_events")
      .insert({
        title,
        title_ar: title_ar || null,
        event_type: event_type || "event",
        organizer: organizer || null,
        venue: venue || null,
        participants: Array.isArray(participants) ? participants : [],
        event_status: event_status || "active",
        start_time,
        end_time: end_time || null,
        all_day: all_day || false,
        color: color || null,
        created_by: req.user!.id,
      })
      .select("*, profiles!calendar_events_created_by_fkey(full_name)")
      .single();

    if (error) throw error;

    notifyAllUsers({
      type: "event",
      title: "New Event Added",
      title_ar: "تمت إضافة حدث جديد",
      body: `"${data.title}" has been scheduled.`,
      body_ar: `تمت جدولة "${(data as Record<string,unknown>).title_ar || data.title}".`,
      link: "/calendar",
      exclude_user_id: req.user!.id,
    }).catch(() => {});

    res.status(201).json(shapeEvent(data as unknown as Record<string, unknown>));
  } catch (err) {
    req.log.error({ err }, "Failed to create event");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/calendar/upcoming", requireAuth, async (req, res) => {
  try {
    const now = new Date().toISOString();
    const oneWeekLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from("calendar_events")
      .select("*, profiles!calendar_events_created_by_fkey(full_name)")
      .gte("start_time", now)
      .lte("start_time", oneWeekLater)
      .neq("event_status", "canceled")
      .order("start_time")
      .limit(10);

    if (error) {
      req.log.warn({ err: error }, "calendar_events table may not exist yet");
      res.json([]);
      return;
    }

    res.json((data || []).map(e => shapeEvent(e as Record<string, unknown>)));
  } catch (err) {
    req.log.error({ err }, "Failed to get upcoming events");
    res.json([]);
  }
});

router.patch("/calendar/events/:id", requireAuth, async (req, res) => {
  try {
    const updates: Record<string, unknown> = {};
    for (const f of EVENT_FIELDS) {
      if (req.body[f] !== undefined) {
        updates[f] = f === "participants"
          ? (Array.isArray(req.body[f]) ? req.body[f] : [])
          : req.body[f];
      }
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("calendar_events")
      .update(updates)
      .eq("id", req.params.id)
      .select("*, profiles!calendar_events_created_by_fkey(full_name)")
      .single();

    if (error || !data) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    res.json(shapeEvent(data as unknown as Record<string, unknown>));
  } catch (err) {
    req.log.error({ err }, "Failed to update event");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/calendar/events/:id", requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from("calendar_events")
      .delete()
      .eq("id", req.params.id);

    if (error) throw error;
    res.json({ success: true, message: "Event deleted" });
  } catch (err) {
    req.log.error({ err }, "Failed to delete event");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
