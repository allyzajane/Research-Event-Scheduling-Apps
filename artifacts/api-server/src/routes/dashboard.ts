import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { isAdminRole } from "../auth";
import { supabaseAdmin } from "../lib/supabase";
import { cache, TTL } from "../lib/cache";

const router = Router();

const DASHBOARD_KEY = "dashboard:summary";

function isVisibleToUser(e: Record<string, unknown>, userId: string, admin: boolean) {
  if (admin) return true;
  const participants = Array.isArray(e.participants) ? e.participants : [];
  return participants.includes(userId);
}

router.get("/dashboard/summary", requireAuth, async (req, res) => {
  const admin = isAdminRole(req.user!.role);
  const cacheKey = admin ? DASHBOARD_KEY : `${DASHBOARD_KEY}:${req.user!.id}`;
  const cached = cache.get(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    // Run count queries in parallel — each uses head:true to avoid transferring rows
    const [usersRes, documentsRes, articlesRes, upcomingCountRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("documents").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("articles").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("calendar_events")
        .select("id", { count: "exact", head: true })
        .gte("start_time", new Date().toISOString()),
    ]);

    // Fetch recent lists — capped to 5 rows each
    const now = new Date().toISOString();
    const oneWeekLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const [recentDocsRes, recentArticlesRes, upcomingEventsRes] = await Promise.all([
      supabaseAdmin
        .from("documents")
        .select("id, title, file_type, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
      supabaseAdmin
        .from("articles")
        .select("id, title, title_ar, is_published, created_at")
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(5),
      supabaseAdmin
        .from("calendar_events")
        .select("id, title, title_ar, event_type, start_time, color, participants")
        .gte("start_time", now)
        .lte("start_time", oneWeekLater)
        .order("start_time")
        .limit(5),
    ]);

    const upcomingEvents = (upcomingEventsRes.data || []).map(e => e as Record<string, unknown>);
    const visibleUpcoming = upcomingEvents.filter(ev => isVisibleToUser(ev, req.user!.id, admin));
    const visibleUpcomingCount = admin
      ? (upcomingCountRes.count || 0)
      : visibleUpcoming.length;

    const result = {
      total_users: usersRes.count || 0,
      total_documents: documentsRes.count || 0,
      total_articles: articlesRes.count || 0,
      upcoming_events: visibleUpcomingCount,
      recent_documents: recentDocsRes.data || [],
      recent_articles: recentArticlesRes.data || [],
      upcoming_events_list: visibleUpcoming,
    };

    cache.set(cacheKey, result, TTL.DASHBOARD);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to get dashboard summary");
    res.json({
      total_users: 0, total_documents: 0, total_articles: 0,
      upcoming_events: 0, recent_documents: [], recent_articles: [], upcoming_events_list: [],
    });
  }
});

// ── GET /dashboard/online-count ───────────────────────────────────────────────
// Returns staff active within the last 5 minutes via last_seen_at.
// Gracefully returns count=0 if the column hasn't been added yet.
router.get("/dashboard/online-count", requireAuth, async (req, res) => {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, full_name_ar, role, avatar_url")
      .gt("last_seen_at", fiveMinutesAgo)
      .eq("is_active", true)
      .order("last_seen_at" as never, { ascending: false })
      .limit(20);

    if (error) {
      // Column not yet migrated — return graceful zero
      if (error.message?.includes("last_seen_at") || error.code === "PGRST205") {
        res.json({ count: 0, users: [], column_missing: true });
        return;
      }
      throw error;
    }

    res.json({ count: data?.length ?? 0, users: data ?? [] });
  } catch (err) {
    req.log.error({ err }, "Failed to get online count");
    res.json({ count: 0, users: [] });
  }
});

export default router;
