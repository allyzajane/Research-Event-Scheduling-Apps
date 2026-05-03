import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { supabaseAdmin } from "../lib/supabase";
import { notifyAllUsers } from "../lib/notifyAll";

const router = Router();

// Columns that may exist in newer schema but not older deployments
const OPTIONAL_FIELDS = new Set([
  "title_ar", "description", "description_ar",
  "event_type", "organizer", "venue", "location",
  "participants", "event_status", "all_day", "color",
]);

// Core fields that must exist in every schema version
const CORE_FIELDS = new Set(["title", "start_time", "end_time", "created_by", "updated_at"]);

function shapeEvent(e: Record<string, unknown>) {
  return {
    ...e,
    creator_name: (e.profiles as { full_name?: string } | null)?.full_name || null,
    participants: Array.isArray(e.participants) ? e.participants : [],
    profiles: undefined,
  };
}

// ── Extract missing column name from PGRST204 error ────────────────────────────
function missingColumn(errMsg: string): string | null {
  const m = errMsg.match(/Could not find the '(\w+)' column/);
  return m ? m[1] : null;
}

// ── Insert with auto-retry on missing-column errors ────────────────────────────
async function insertEvent(payload: Record<string, unknown>) {
  const data = { ...payload };
  for (let attempt = 0; attempt < 15; attempt++) {
    const result = await supabaseAdmin
      .from("calendar_events")
      .insert(data)
      .select("*, profiles!calendar_events_created_by_fkey(full_name)")
      .single();

    if (!result.error) return result;

    const col = missingColumn(result.error.message);
    if (result.error.code === "PGRST204" && col && OPTIONAL_FIELDS.has(col)) {
      delete data[col];
      continue;
    }
    return result; // non-retryable error
  }
  return { data: null, error: new Error("Too many retries") };
}

// ── Update with auto-retry on missing-column errors ────────────────────────────
async function updateEvent(id: string, payload: Record<string, unknown>) {
  const data = { ...payload };
  for (let attempt = 0; attempt < 15; attempt++) {
    const result = await supabaseAdmin
      .from("calendar_events")
      .update(data)
      .eq("id", id)
      .select("*, profiles!calendar_events_created_by_fkey(full_name)")
      .single();

    if (!result.error) return result;

    const col = missingColumn(result.error.message);
    if (result.error.code === "PGRST204" && col && OPTIONAL_FIELDS.has(col)) {
      delete data[col];
      continue;
    }
    return result; // non-retryable error
  }
  return { data: null, error: new Error("Too many retries") };
}

// ── GET /calendar/events ───────────────────────────────────────────────────────
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

    res.json((data || []).map(e => shapeEvent(e as Record<string, unknown>)));
  } catch (err) {
    req.log.error({ err }, "Failed to list events");
    res.json([]);
  }
});

// ── POST /calendar/events ─────────────────────────────────────────────────────
router.post("/calendar/events", requireAuth, async (req, res) => {
  try {
    const {
      title, title_ar,
      event_type, organizer, venue,
      participants, event_status, start_time, end_time, all_day, color,
    } = req.body;

    const payload: Record<string, unknown> = {
      title,
      title_ar:     title_ar     || null,
      event_type:   event_type   || "event",
      organizer:    organizer    || null,
      venue:        venue        || null,
      participants: Array.isArray(participants) ? participants : [],
      event_status: event_status || "active",
      start_time,
      end_time:     end_time     || null,
      all_day:      all_day      || false,
      color:        color        || null,
      created_by:   req.user!.id,
    };

    const { data, error } = await insertEvent(payload);
    if (error || !data) throw error ?? new Error("No data returned");

    notifyAllUsers({
      type: "event",
      title: "New Event Added",
      title_ar: "تمت إضافة حدث جديد",
      body: `"${data.title}" has been scheduled.`,
      body_ar: `تمت جدولة "${(data as Record<string, unknown>).title_ar || data.title}".`,
      link: "/calendar",
      exclude_user_id: req.user!.id,
    }).catch(() => {});

    res.status(201).json(shapeEvent(data as unknown as Record<string, unknown>));
  } catch (err) {
    req.log.error({ err }, "Failed to create event");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /calendar/upcoming ────────────────────────────────────────────────────
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

    res.json((data || []).map(e => shapeEvent(e as Record<string, unknown>)));
  } catch (err) {
    req.log.error({ err }, "Failed to get upcoming events");
    res.json([]);
  }
});

// ── PATCH /calendar/events/:id ────────────────────────────────────────────────
router.patch("/calendar/events/:id", requireAuth, async (req, res) => {
  try {
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };

    const allowed = [...CORE_FIELDS, ...OPTIONAL_FIELDS];
    for (const f of allowed) {
      if (f === "updated_at" || f === "created_by") continue;
      if (req.body[f] !== undefined) {
        payload[f] = f === "participants"
          ? (Array.isArray(req.body[f]) ? req.body[f] : [])
          : req.body[f];
      }
    }

    const { data, error } = await updateEvent(req.params.id, payload);

    if (error || !data) {
      res.status(404).json({ error: "Event not found or update failed" });
      return;
    }

    res.json(shapeEvent(data as unknown as Record<string, unknown>));
  } catch (err) {
    req.log.error({ err }, "Failed to update event");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /calendar/events/:id ───────────────────────────────────────────────
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
