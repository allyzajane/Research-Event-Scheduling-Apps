import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { isAdminRole } from "../middlewares/auth";
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
  const userId = req.user!.id;
  const cacheKey = admin ? DASHBOARD_KEY : `${DASHBOARD_KEY}:${userId}`;
  const cached = cache.get(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const now = new Date().toISOString();
    const oneWeekLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    if (admin) {
      // ── Admin: global counts + recent lists ───────────────────────────────
      const [usersRes, documentsRes, articlesRes, upcomingCountRes] = await Promise.all([
        supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("documents").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("articles").select("id", { count: "exact", head: true }).eq("is_published", true),
        supabaseAdmin.from("calendar_events").select("id", { count: "exact", head: true }).gte("start_time", now),
      ]);

      const [recentDocsRes, recentArticlesRes, upcomingEventsRes] = await Promise.all([
        supabaseAdmin
          .from("documents")
          .select("id, title, file_type, created_at, file_size")
          .order("created_at", { ascending: false })
          .limit(5),
        supabaseAdmin
          .from("articles")
          .select("id, title, title_ar, is_published, created_at, excerpt")
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

      const result = {
        total_users:          usersRes.count    || 0,
        total_documents:      documentsRes.count || 0,
        total_articles:       articlesRes.count  || 0,
        upcoming_events:      upcomingCountRes.count || 0,
        recent_documents:     recentDocsRes.data     || [],
        recent_articles:      recentArticlesRes.data  || [],
        upcoming_events_list: (upcomingEventsRes.data || []) as Record<string, unknown>[],
      };

      cache.set(cacheKey, result, TTL.DASHBOARD);
      res.json(result);
      return;
    }

    // ── Non-admin: personal data only ─────────────────────────────────────
    // Fetch the document IDs the user has explicit download permission for.
    const { data: perms } = await supabaseAdmin
      .from("document_download_permissions")
      .select("document_id")
      .eq("user_id", userId);

    const permittedDocIds: string[] = (perms || []).map(
      (p: { document_id: string }) => p.document_id,
    );

    const [articlesRes, upcomingEventsRes, recentArticlesRes] = await Promise.all([
      supabaseAdmin
        .from("articles")
        .select("id", { count: "exact", head: true })
        .eq("is_published", true),
      supabaseAdmin
        .from("calendar_events")
        .select("id, title, title_ar, event_type, start_time, color, participants")
        .gte("start_time", now)
        .lte("start_time", oneWeekLater)
        .order("start_time")
        .limit(50),
      supabaseAdmin
        .from("articles")
        .select("id, title, title_ar, is_published, created_at, excerpt")
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    const visibleUpcoming = ((upcomingEventsRes.data || []) as Record<string, unknown>[])
      .filter(ev => isVisibleToUser(ev, userId, false));

    // Recent docs — only documents the user has explicit download permission for.
    let recentDocs: unknown[] = [];
    if (permittedDocIds.length > 0) {
      const { data: rdData } = await supabaseAdmin
        .from("documents")
        .select("id, title, file_type, created_at, file_size")
        .in("id", permittedDocIds)
        .order("created_at", { ascending: false })
        .limit(5);
      recentDocs = rdData || [];
    }

    const result = {
      total_users:          0,                       // non-admins do not see user count
      total_documents:      permittedDocIds.length,  // only docs granted to this user
      total_articles:       articlesRes.count || 0,  // published articles (visible to all)
      upcoming_events:      visibleUpcoming.length,
      recent_documents:     recentDocs,
      recent_articles:      recentArticlesRes.data || [],
      upcoming_events_list: visibleUpcoming.slice(0, 5),
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
