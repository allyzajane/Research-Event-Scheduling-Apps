import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";
import { supabaseAdmin } from "../lib/supabase";

const router = Router();

const VALID_COLORS = ["teal","purple","indigo","blue","pink","gray","orange","red","emerald","amber","cyan","violet"];

// ─── GET /roles — list all roles with user counts ─────────────────────────
router.get("/roles", requireAuth, async (req, res) => {
  try {
    const { data: roles, error } = await supabaseAdmin
      .from("roles")
      .select("*")
      .order("is_system", { ascending: false })
      .order("created_at", { ascending: true });

    if (error) {
      req.log.error({ error }, "Failed to fetch roles");
      res.status(500).json({ error: "Failed to load roles" });
      return;
    }

    // Count users per role
    const { data: profiles } = await supabaseAdmin.from("profiles").select("role");
    const counts: Record<string, number> = {};
    for (const p of (profiles || [])) {
      if (p.role) counts[p.role] = (counts[p.role] || 0) + 1;
    }

    res.json((roles || []).map(r => ({ ...r, user_count: counts[r.name] || 0 })));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch roles");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /roles — create new role (admin only) ───────────────────────────
router.post("/roles", requireAuth, requireRole("admin"), async (req, res) => {
  const { name, label, label_ar, color = "gray" } = req.body as {
    name: string; label: string; label_ar?: string; color?: string;
  };

  if (!name || !label) {
    res.status(400).json({ error: "name and label are required" });
    return;
  }
  if (!/^[a-z][a-z0-9_]*$/.test(name) || name.length < 2) {
    res.status(400).json({ error: "name must start with a lowercase letter, followed by lowercase letters, digits, or underscores (min 2 chars)" });
    return;
  }
  if (!VALID_COLORS.includes(color)) {
    res.status(400).json({ error: "Invalid color" });
    return;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("roles")
      .insert({ name, label, label_ar: label_ar || null, color, is_system: false })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        res.status(409).json({ error: "A role with this name already exists" });
        return;
      }
      req.log.error({ error }, "Failed to create role");
      res.status(500).json({ error: "Failed to create role" });
      return;
    }

    res.status(201).json({ ...data, user_count: 0 });
  } catch (err) {
    req.log.error({ err }, "Failed to create role");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PATCH /roles/:id — update label/label_ar/color (admin, non-system) ──
router.patch("/roles/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const id = String(req.params.id);
  const { label, label_ar, color } = req.body as {
    label?: string; label_ar?: string | null; color?: string;
  };

  try {
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("roles").select("name, is_system").eq("id", id).single();

    if (fetchErr || !existing) { res.status(404).json({ error: "Role not found" }); return; }
    if (existing.is_system) { res.status(403).json({ error: "System roles cannot be modified" }); return; }

    const updates: Record<string, unknown> = {};
    if (label !== undefined)    updates.label    = label;
    if (label_ar !== undefined) updates.label_ar = label_ar || null;
    if (color !== undefined) {
      if (!VALID_COLORS.includes(color)) { res.status(400).json({ error: "Invalid color" }); return; }
      updates.color = color;
    }

    const { data, error } = await supabaseAdmin
      .from("roles").update(updates).eq("id", id).select().single();

    if (error) { req.log.error({ error }, "Failed to update role"); res.status(500).json({ error: "Failed to update role" }); return; }

    const { count } = await supabaseAdmin
      .from("profiles").select("*", { count: "exact", head: true }).eq("role", existing.name);

    res.json({ ...data, user_count: count || 0 });
  } catch (err) {
    req.log.error({ err }, "Failed to update role");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── DELETE /roles/:id — delete (admin, non-system, no users) ────────────
router.delete("/roles/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const id = String(req.params.id);

  try {
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("roles").select("name, is_system").eq("id", id).single();

    if (fetchErr || !existing) { res.status(404).json({ error: "Role not found" }); return; }
    if (existing.is_system) { res.status(403).json({ error: "System roles cannot be deleted" }); return; }

    const { count } = await supabaseAdmin
      .from("profiles").select("*", { count: "exact", head: true }).eq("role", existing.name);

    if ((count || 0) > 0) {
      res.status(409).json({ error: `Cannot delete: ${count} user(s) have this role. Reassign them first.` });
      return;
    }

    const { error } = await supabaseAdmin.from("roles").delete().eq("id", id);
    if (error) { req.log.error({ error }, "Failed to delete role"); res.status(500).json({ error: "Failed to delete role" }); return; }

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete role");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
