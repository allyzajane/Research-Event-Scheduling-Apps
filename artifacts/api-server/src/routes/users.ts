import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";
import { supabaseAdmin } from "../lib/supabase";

const router = Router();

router.get("/users", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { role, search } = req.query as { role?: string; search?: string };

    // Fetch profiles table
    let query = supabaseAdmin.from("profiles").select("*");
    if (role) query = query.eq("role", role);
    if (search) {
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    }
    const { data: profiles, error: profilesError } = await query.order("created_at", { ascending: false });

    if (profilesError && profilesError.code !== "PGRST205") throw profilesError;

    // Also fetch all auth users so we never miss someone without a profile row
    const { data: authData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const authUsers = authData ? authData.users : [];

    const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));

    // Auto-upsert any auth user that has no profile row yet
    const missingProfiles = authUsers.filter(u => !profileMap.has(u.id));
    if (missingProfiles.length > 0) {
      const rows = missingProfiles.map(u => ({
        id: u.id,
        email: u.email ?? "",
        full_name: (u.user_metadata?.full_name as string) || null,
        role: (u.user_metadata?.role as string) || "staff",
        is_active: true,
      }));
      const { data: inserted } = await supabaseAdmin
        .from("profiles")
        .upsert(rows, { onConflict: "id" })
        .select();
      (inserted ?? []).forEach(p => profileMap.set(p.id, p));
    }

    let result = Array.from(profileMap.values());

    // Apply filters if passed (re-apply in memory since we merged in JS)
    if (role) result = result.filter(p => p.role === role);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        p.email?.toLowerCase().includes(q) ||
        p.full_name?.toLowerCase().includes(q)
      );
    }

    // Sort newest first
    result.sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());

    res.json(result);
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

router.post("/users/:id/set-password", requireAuth, requireRole("admin"), async (req, res) => {
  const targetId = String(req.params.id);
  const { password } = req.body as { password: string };

  if (!password || password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  try {
    // Directly set the password via Supabase Auth Admin API — no email sent
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      targetId,
      { password }
    );

    if (authError) {
      req.log.error({ err: authError }, "Failed to set user password");
      res.status(400).json({ error: authError.message });
      return;
    }

    // Fetch profile so we can send an in-app notification
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .eq("id", targetId)
      .single();

    // Insert in-app notification to the target user (fire-and-forget)
    if (profile) {
      await supabaseAdmin.from("notifications").insert({
        user_id: targetId,
        type: "system",
        title: "Password Updated",
        title_ar: "تم تحديث كلمة المرور",
        body: "Your password has been updated by an administrator. Please use your new password on your next login.",
        body_ar: "تم تحديث كلمة مرورك من قِبل المسؤول. يرجى استخدام كلمة المرور الجديدة في تسجيل دخولك التالي.",
        is_read: false,
      }).throwOnError();
    }

    res.json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    req.log.error({ err }, "Failed to set user password");
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
      await supabaseAdmin.auth.admin.updateUserById(String(req.params.id), {
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
  const targetId = String(req.params.id);

  if (req.user?.id === targetId) {
    res.status(403).json({ error: "You cannot delete your own account" });
    return;
  }

  try {
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("id", targetId);

    if (profileError) throw profileError;

    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(targetId);
    if (authError) req.log.warn({ err: authError }, "Failed to delete auth user");

    res.json({ success: true, message: "User deleted" });
  } catch (err) {
    req.log.error({ err }, "Failed to delete user");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
