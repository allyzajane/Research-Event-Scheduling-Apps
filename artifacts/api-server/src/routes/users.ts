import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";
import { supabaseAdmin } from "../lib/supabase";

const router = Router();

router.get("/users", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { role, search } = req.query as { role?: string; search?: string };

    let query = supabaseAdmin.from("profiles").select("*");
    if (role) query = query.eq("role", role);
    if (search) {
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw error;

    res.json(data || []);
  } catch (err) {
    req.log.error({ err }, "Failed to list users");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/users", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { email, password, full_name, full_name_ar, role, department } = req.body;

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      user_metadata: { role: role || "staff", full_name },
      email_confirm: true,
    });

    if (authError) {
      res.status(400).json({ error: authError.message });
      return;
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: authData.user.id,
        email,
        full_name,
        full_name_ar: full_name_ar || null,
        role: role || "staff",
        department: department || null,
        is_active: true,
      })
      .select()
      .single();

    if (profileError) throw profileError;

    res.status(201).json(profile);
  } catch (err) {
    req.log.error({ err }, "Failed to create user");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/users/stats", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from("profiles").select("role, is_active");
    if (error) throw error;

    const users = data || [];
    const byRole: Record<string, number> = {};
    let active = 0;
    let inactive = 0;

    for (const u of users) {
      byRole[u.role] = (byRole[u.role] || 0) + 1;
      if (u.is_active) active++;
      else inactive++;
    }

    res.json({
      total: users.length,
      by_role: Object.entries(byRole).map(([role, count]) => ({ role, count })),
      active,
      inactive,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get user stats");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (error || !data) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to get user");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { full_name, full_name_ar, role, department, is_active } = req.body;

    const updates: Record<string, unknown> = {};
    if (full_name !== undefined) updates.full_name = full_name;
    if (full_name_ar !== undefined) updates.full_name_ar = full_name_ar;
    if (role !== undefined) updates.role = role;
    if (department !== undefined) updates.department = department;
    if (is_active !== undefined) updates.is_active = is_active;

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update(updates)
      .eq("id", req.params.id)
      .select()
      .single();

    if (error || !data) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (role !== undefined) {
      await supabaseAdmin.auth.admin.updateUserById(req.params.id, {
        user_metadata: { role },
      });
    }

    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to update user");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("id", req.params.id);

    if (profileError) throw profileError;

    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(req.params.id);
    if (authError) req.log.warn({ err: authError }, "Failed to delete auth user");

    res.json({ success: true, message: "User deleted" });
  } catch (err) {
    req.log.error({ err }, "Failed to delete user");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
