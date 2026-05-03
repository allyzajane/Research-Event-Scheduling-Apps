import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";
import { supabaseAdmin } from "../lib/supabase";
import { cache } from "../lib/cache";

const router = Router();

const ALL_WIDGETS = [
  "stat_users",
  "stat_documents",
  "stat_articles",
  "stat_events",
  "recent_documents",
  "recent_articles",
  "upcoming_events",
  "quick_actions",
];

const DEFAULT_WIDGETS: Record<string, string[]> = {
  admin: [...ALL_WIDGETS],
  ceo: ["stat_users", "stat_documents", "stat_articles", "stat_events", "recent_articles", "upcoming_events"],
  director: ["stat_documents", "stat_articles", "stat_events", "recent_documents", "recent_articles", "upcoming_events"],
  doctor: ["stat_articles", "stat_events", "recent_articles", "upcoming_events", "quick_actions"],
  nurse: ["stat_events", "upcoming_events", "recent_documents", "quick_actions"],
  staff: ["stat_events", "upcoming_events", "recent_documents", "quick_actions"],
};

function configCacheKey(role: string) {
  return `role-dashboard:config:${role}`;
}

async function getConfigForRole(role: string): Promise<{ role: string; widgets: string[]; updated_at: string | null }> {
  const cached = cache.get<{ role: string; widgets: string[]; updated_at: string | null }>(configCacheKey(role));
  if (cached) return cached;

  try {
    const { data, error } = await supabaseAdmin
      .from("role_dashboard_configs")
      .select("role, widgets, updated_at")
      .eq("role", role)
      .single();

    if (error || !data) {
      return { role, widgets: DEFAULT_WIDGETS[role] ?? ALL_WIDGETS, updated_at: null };
    }

    const result = { role: data.role as string, widgets: (data.widgets as string[]) ?? DEFAULT_WIDGETS[role] ?? ALL_WIDGETS, updated_at: data.updated_at as string | null };
    cache.set(configCacheKey(role), result, 120);
    return result;
  } catch {
    return { role, widgets: DEFAULT_WIDGETS[role] ?? ALL_WIDGETS, updated_at: null };
  }
}

router.get("/role-dashboard/config", requireAuth, async (req, res) => {
  const role = req.user!.role;
  const config = await getConfigForRole(role);
  res.json(config);
});

router.get("/role-dashboard/configs", requireAuth, requireRole("admin"), async (req, res) => {
  const roles = ["admin", "ceo", "director", "doctor", "nurse", "staff"];
  const configs = await Promise.all(roles.map(getConfigForRole));
  res.json({ configs });
});

router.patch("/role-dashboard/config/:role", requireAuth, requireRole("admin"), async (req, res) => {
  const role = String(req.params.role);
  const validRoles = ["admin", "ceo", "director", "doctor", "nurse", "staff"];
  if (!validRoles.includes(role)) {
    res.status(400).json({ error: "Invalid role" });
    return;
  }

  const { widgets } = req.body as { widgets: string[] };
  if (!Array.isArray(widgets)) {
    res.status(400).json({ error: "widgets must be an array" });
    return;
  }

  const validWidgets = widgets.filter(w => ALL_WIDGETS.includes(w));

  try {
    const { data, error } = await supabaseAdmin
      .from("role_dashboard_configs")
      .upsert({ role, widgets: validWidgets, updated_at: new Date().toISOString() }, { onConflict: "role" })
      .select("role, widgets, updated_at")
      .single();

    if (error) {
      req.log.error({ error }, "Failed to upsert role dashboard config");
      res.status(500).json({ error: "Failed to save config" });
      return;
    }

    cache.del(configCacheKey(role));
    res.json({ role: String(data.role), widgets: (data.widgets as string[]) ?? [], updated_at: data.updated_at });
  } catch (err) {
    req.log.error({ err }, "Failed to update role dashboard config");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
