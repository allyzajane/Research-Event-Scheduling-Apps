import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { supabaseAdmin } from "../lib/supabase";

const router = Router();

router.get("/dashboard/summary", requireAuth, async (req, res) => {
  try {
    const [usersRes, documentsRes, articlesRes, upcomingRes, recentDocsRes, recentArticlesRes] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("documents").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("articles").select("id", { count: "exact", head: true }),
        supabaseAdmin
          .from("calendar_events")
          .select("id", { count: "exact", head: true })
          .gte("start_time", new Date().toISOString()),
        supabaseAdmin
          .from("documents")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(5),
        supabaseAdmin
          .from("articles")
          .select("*")
          .eq("is_published", true)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

    const now = new Date().toISOString();
    const oneWeekLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: upcomingEvents } = await supabaseAdmin
      .from("calendar_events")
      .select("*")
      .gte("start_time", now)
      .lte("start_time", oneWeekLater)
      .order("start_time")
      .limit(5);

    res.json({
      total_users: usersRes.count || 0,
      total_documents: documentsRes.count || 0,
      total_articles: articlesRes.count || 0,
      upcoming_events: upcomingRes.count || 0,
      recent_documents: recentDocsRes.data || [],
      recent_articles: recentArticlesRes.data || [],
      upcoming_events_list: upcomingEvents || [],
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get dashboard summary");
    res.json({
      total_users: 0, total_documents: 0, total_articles: 0,
      upcoming_events: 0, recent_documents: [], recent_articles: [], upcoming_events_list: [],
    });
  }
});

export default router;
