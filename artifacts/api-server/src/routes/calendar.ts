import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { supabaseAdmin } from "../lib/supabase";

const router = Router();

router.get("/calendar/events", requireAuth, async (req, res) => {
  try {
    const { start, end, type } = req.query as Record<string, string>;

    let query = supabaseAdmin
      .from("calendar_events")
      .select("*, profiles!calendar_events_created_by_fkey(full_name)");

    if (start) query = query.gte("start_time", start);
    if (end) query = query.lte("start_time", end);
    if (type) query = query.eq("event_type", type);

    const { data, error } = await query.order("start_time");

    if (error) {
      req.log.warn({ err: error }, "calendar_events table may not exist yet");
      res.json([]);
      return;
    }

    const events = (data || []).map((e: Record<string, unknown>) => ({
      ...e,
      creator_name: (e.profiles as { full_name?: string } | null)?.full_name || null,
      profiles: undefined,
    }));

    res.json(events);
  } catch (err) {
    req.log.error({ err }, "Failed to list events");
    res.json([]);
  }
});

router.post("/calendar/events", requireAuth, async (req, res) => {
  try {
    const { title, title_ar, description, description_ar, event_type, start_time, end_time, all_day, location, color } = req.body;

    const { data, error } = await supabaseAdmin
      .from("calendar_events")
      .insert({
        title, title_ar, description, description_ar,
        event_type: event_type || "event",
        start_time, end_time: end_time || null,
        all_day: all_day || false,
        location: location || null,
        color: color || null,
        created_by: req.user!.id,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
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
      .order("start_time")
      .limit(10);

    if (error) {
      req.log.warn({ err: error }, "calendar_events table may not exist yet");
      res.json([]);
      return;
    }

    const events = (data || []).map((e: Record<string, unknown>) => ({
      ...e,
      creator_name: (e.profiles as { full_name?: string } | null)?.full_name || null,
      profiles: undefined,
    }));

    res.json(events);
  } catch (err) {
    req.log.error({ err }, "Failed to get upcoming events");
    res.json([]);
  }
});

router.patch("/calendar/events/:id", requireAuth, async (req, res) => {
  try {
    const updates: Record<string, unknown> = {};
    const fields = ["title", "title_ar", "description", "description_ar", "event_type", "start_time", "end_time", "all_day", "location", "color"];
    for (const f of fields) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }

    const { data, error } = await supabaseAdmin
      .from("calendar_events")
      .update(updates)
      .eq("id", req.params.id)
      .select()
      .single();

    if (error || !data) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    res.json(data);
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
