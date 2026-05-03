import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";
import { supabaseAdmin } from "../lib/supabase";
import { notifyAllUsers } from "../lib/notifyAll";

const router = Router();

router.get("/articles", requireAuth, async (req, res) => {
  try {
    const { search, page = "1", limit = "20" } = req.query as Record<string, string>;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
    const offset = (pageNum - 1) * limitNum;

    let query = supabaseAdmin
      .from("articles")
      .select("*, profiles!articles_author_id_fkey(full_name)", { count: "exact" });

    if (search) query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (error) {
      req.log.warn({ err: error }, "articles table may not exist yet");
      res.json({ items: [], total: 0, page: pageNum, limit: limitNum });
      return;
    }

    const items = (data || []).map((a: Record<string, unknown>) => ({
      ...a,
      author_name: (a.profiles as { full_name?: string } | null)?.full_name || null,
      profiles: undefined,
    }));

    res.json({ items, total: count || 0, page: pageNum, limit: limitNum });
  } catch (err) {
    req.log.error({ err }, "Failed to list articles");
    res.json({ items: [], total: 0, page: 1, limit: 20 });
  }
});

router.post("/articles", requireAuth, requireRole("admin", "ceo", "director"), async (req, res) => {
  try {
    const { title, title_ar, content, content_ar, excerpt, excerpt_ar, cover_image_url, is_published } = req.body;

    const { data, error } = await supabaseAdmin
      .from("articles")
      .insert({
        title, title_ar, content, content_ar, excerpt, excerpt_ar,
        cover_image_url: cover_image_url || null,
        author_id: req.user!.id,
        is_published: is_published || false,
        published_at: is_published ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (error) throw error;

    if (data.is_published) {
      notifyAllUsers({
        type: "article",
        title: "New Article Published",
        title_ar: "تم نشر مقال جديد",
        body: `"${data.title}" has been published.`,
        body_ar: `تم نشر "${data.title_ar || data.title}".`,
        link: "/articles",
        exclude_user_id: req.user!.id,
      }).catch(() => {});
    }

    res.status(201).json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to create article");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/articles/:id", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("articles")
      .select("*, profiles!articles_author_id_fkey(full_name)")
      .eq("id", req.params.id)
      .single();

    if (error || !data) {
      res.status(404).json({ error: "Article not found" });
      return;
    }

    const article = {
      ...data,
      author_name: (data.profiles as { full_name?: string } | null)?.full_name || null,
      profiles: undefined,
    };

    res.json(article);
  } catch (err) {
    req.log.error({ err }, "Failed to get article");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/articles/:id", requireAuth, requireRole("admin", "ceo", "director"), async (req, res) => {
  try {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const fields = ["title", "title_ar", "content", "content_ar", "excerpt", "excerpt_ar", "cover_image_url", "is_published"];
    for (const f of fields) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }
    if (req.body.is_published === true && !req.body.published_at) {
      updates.published_at = new Date().toISOString();
    }

    const { data, error } = await supabaseAdmin
      .from("articles")
      .update(updates)
      .eq("id", req.params.id)
      .select()
      .single();

    if (error || !data) {
      res.status(404).json({ error: "Article not found" });
      return;
    }

    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to update article");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/articles/:id", requireAuth, requireRole("admin", "ceo", "director"), async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from("articles")
      .delete()
      .eq("id", req.params.id);

    if (error) throw error;
    res.json({ success: true, message: "Article deleted" });
  } catch (err) {
    req.log.error({ err }, "Failed to delete article");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
