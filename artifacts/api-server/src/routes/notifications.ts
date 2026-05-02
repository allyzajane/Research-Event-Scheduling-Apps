import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { supabaseAdmin } from "../lib/supabase";

const router = Router();

router.get("/notifications", requireAuth, async (req, res) => {
  try {
    const { unread_only, limit = "20" } = req.query as Record<string, string>;
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);

    let query = supabaseAdmin
      .from("notifications")
      .select("*")
      .eq("user_id", req.user!.id)
      .order("created_at", { ascending: false })
      .limit(limitNum);

    if (unread_only === "true") query = query.eq("is_read", false);

    const { data, error } = await query;

    if (error) {
      req.log.warn({ err: error }, "notifications table may not exist yet");
      res.json({ items: [], unread_count: 0 });
      return;
    }

    const unreadCount = (data || []).filter(n => !n.is_read).length;
    res.json({ items: data || [], unread_count: unreadCount });
  } catch (err) {
    req.log.error({ err }, "Failed to list notifications");
    res.json({ items: [], unread_count: 0 });
  }
});

router.get("/notifications/unread-count", requireAuth, async (req, res) => {
  try {
    const { count, error } = await supabaseAdmin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", req.user!.id)
      .eq("is_read", false);

    if (error) {
      res.json({ count: 0 });
      return;
    }

    res.json({ count: count || 0 });
  } catch (err) {
    req.log.error({ err }, "Failed to get unread count");
    res.json({ count: 0 });
  }
});

router.patch("/notifications/:id/read", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("notifications")
      .update({ is_read: true })
      .eq("id", req.params.id)
      .eq("user_id", req.user!.id)
      .select()
      .single();

    if (error || !data) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }

    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to mark notification as read");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/notifications/read-all", requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", req.user!.id)
      .eq("is_read", false);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to mark all notifications as read");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/notifications/:id", requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from("notifications")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", req.user!.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete notification");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/notifications", requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from("notifications")
      .delete()
      .eq("user_id", req.user!.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to clear notifications");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
