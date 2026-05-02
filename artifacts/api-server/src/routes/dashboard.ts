import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { supabaseAdmin } from "../lib/supabase";
import { cache, TTL } from "../lib/cache";

const router = Router();

const DASHBOARD_KEY = "dashboard:summary";

router.get("/dashboard/summary", requireAuth, async (req, res) => {
  const cached = cache.get(DASHBOARD_KEY);
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
        .select("id, title, title_ar, event_type, start_time, color")
        .gte("start_time", now)
        .lte("start_time", oneWeekLater)
        .order("start_time")
        .limit(5),
    ]);

    const result = {
      total_users: usersRes.count || 0,
      total_documents: documentsRes.count || 0,
      total_articles: articlesRes.count || 0,
      upcoming_events: upcomingCountRes.count || 0,
      recent_documents: recentDocsRes.data || [],
      recent_articles: recentArticlesRes.data || [],
      upcoming_events_list: upcomingEventsRes.data || [],
    };

    cache.set(DASHBOARD_KEY, result, TTL.DASHBOARD);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to get dashboard summary");
    res.json({
      total_users: 0, total_documents: 0, total_articles: 0,
      upcoming_events: 0, recent_documents: [], recent_articles: [], upcoming_events_list: [],
    });
  }
});

export default router;
