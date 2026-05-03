import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { supabaseAdmin } from "../lib/supabase";

const router = Router();

const ADMIN_ROLES = ["admin", "ceo", "director"];

function getASTDateStr(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function deriveClockInStatus(clockInIso: string): "present" | "late" {
  const h = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Riyadh", hour: "numeric", hour12: false,
    }).format(new Date(clockInIso)),
    10
  );
  return h >= 9 ? "late" : "present";
}

function shapeRecord(r: Record<string, unknown>) {
  const p = r.profiles as { full_name?: string; full_name_ar?: string; avatar_url?: string } | null;
  return {
    ...r,
    user_name:    p?.full_name    ?? null,
    user_name_ar: p?.full_name_ar ?? null,
    user_avatar:  p?.avatar_url   ?? null,
    profiles: undefined,
  };
}

// ── GET /attendance ───────────────────────────────────────────────────────────
router.get("/attendance", requireAuth, async (req, res) => {
  try {
    const { user_id, date_from, date_to } = req.query as Record<string, string>;
    const reqUser = (req as any).user;
    const isAdmin = ADMIN_ROLES.includes(reqUser?.role);

    let q = supabaseAdmin
      .from("attendance")
      .select("*, profiles!attendance_user_id_fkey(full_name, full_name_ar, avatar_url)");

    if (!isAdmin)      q = q.eq("user_id", reqUser.id);
    else if (user_id)  q = q.eq("user_id", user_id);

    if (date_from) q = q.gte("date", date_from);
    if (date_to)   q = q.lte("date", date_to);

    const { data, error } = await q.order("date", { ascending: false });

    if (error) {
      req.log.warn({ err: error }, "attendance table may not exist");
      res.json([]); return;
    }
    res.json((data ?? []).map(r => shapeRecord(r as Record<string, unknown>)));
  } catch (err) {
    req.log.error({ err }, "Failed to list attendance");
    res.json([]);
  }
});

// ── GET /attendance/today ────────────────────────────────────────────────────
router.get("/attendance/today", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { data, error } = await supabaseAdmin
      .from("attendance").select("*")
      .eq("user_id", userId).eq("date", getASTDateStr()).single();

    if (error && error.code !== "PGRST116") { res.json(null); return; }
    res.json(data ?? null);
  } catch (err) {
    req.log.error({ err }, "Failed to get today attendance");
    res.json(null);
  }
});

// ── GET /attendance/stats ────────────────────────────────────────────────────
router.get("/attendance/stats", requireAuth, async (req, res) => {
  try {
    const { user_id, date_from, date_to } = req.query as Record<string, string>;
    const reqUser = (req as any).user;
    const isAdmin = ADMIN_ROLES.includes(reqUser?.role);
    const targetId = isAdmin && user_id ? user_id : reqUser.id;

    const today = getASTDateStr();
    const [year, month] = today.split("-").map(Number);
    const defaultStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const defaultEnd   = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;

    let q = supabaseAdmin
      .from("attendance").select("clock_in, clock_out, status")
      .eq("user_id", targetId);

    if (date_from || date_to) {
      if (date_from) q = q.gte("date", date_from);
      if (date_to)   q = q.lte("date", date_to);
    } else {
      q = q.gte("date", defaultStart).lt("date", defaultEnd);
    }

    const { data: list } = await q;

    const records = list ?? [];
    const presentDays = records.filter(r =>
      ["present", "late", "half_day"].includes(r.status)
    ).length;
    let totalMinutes = 0;
    records.forEach(r => {
      if (r.clock_in && r.clock_out) {
        totalMinutes += (new Date(r.clock_out).getTime() - new Date(r.clock_in).getTime()) / 60_000;
      }
    });

    res.json({
      present_days:  presentDays,
      total_records: records.length,
      total_hours:   Math.round(totalMinutes / 6) / 10,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get attendance stats");
    res.json({ present_days: 0, total_records: 0, total_hours: 0 });
  }
});

// ── POST /attendance/clock-in ─────────────────────────────────────────────────
router.post("/attendance/clock-in", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const today  = getASTDateStr();
    const now    = new Date().toISOString();

    const { data: existing } = await supabaseAdmin
      .from("attendance").select("id").eq("user_id", userId).eq("date", today).single();

    if (existing) { res.status(409).json({ error: "Already clocked in today" }); return; }

    const notes  = ((req.body as Record<string, unknown>).notes as string) || null;
    const status = deriveClockInStatus(now);

    const { data, error } = await supabaseAdmin
      .from("attendance")
      .insert({ user_id: userId, date: today, clock_in: now, status, notes })
      .select("*").single();

    if (error) { res.status(500).json({ error: error.message }); return; }
    res.status(201).json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to clock in");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /attendance/clock-out ────────────────────────────────────────────────
router.post("/attendance/clock-out", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const today  = getASTDateStr();
    const now    = new Date().toISOString();

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("attendance").select("id, clock_in, clock_out, status")
      .eq("user_id", userId).eq("date", today).single();

    if (fetchErr || !existing) { res.status(404).json({ error: "No clock-in found for today" }); return; }
    if (existing.clock_out)    { res.status(409).json({ error: "Already clocked out today" }); return; }

    const minutes = (new Date(now).getTime() - new Date(existing.clock_in).getTime()) / 60_000;
    const status  = minutes < 240 ? "half_day" : (existing.status as string);
    const notes   = ((req.body as Record<string, unknown>).notes as string) || undefined;

    const { data, error } = await supabaseAdmin
      .from("attendance")
      .update({ clock_out: now, status, ...(notes ? { notes } : {}) })
      .eq("id", existing.id).select("*").single();

    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to clock out");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /attendance/:id  (admin) ──────────────────────────────────────────
router.delete("/attendance/:id", requireAuth, async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes((req as any).user?.role)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    await supabaseAdmin.from("attendance").delete().eq("id", req.params.id);
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete attendance");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
