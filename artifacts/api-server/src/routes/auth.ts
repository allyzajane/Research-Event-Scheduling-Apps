import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { supabaseAdmin } from "../lib/supabase";

const router = Router();

router.get("/auth/me", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const userEmail = req.user!.email;
    const userRole = req.user!.role;

    // Try to fetch existing profile
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    // If profile exists, return it
    if (!fetchErr && existing) {
      // Sync role from auth metadata if it differs
      if (existing.role !== userRole) {
        await supabaseAdmin
          .from("profiles")
          .update({ role: userRole })
          .eq("id", userId);
        res.json({ ...existing, role: userRole });
      } else {
        res.json(existing);
      }
      return;
    }

    // If table doesn't exist yet, return stub from JWT claims
    if (fetchErr?.code === "PGRST205") {
      res.json({
        id: userId,
        email: userEmail,
        role: userRole,
        full_name: req.user!.full_name || null,
        is_active: true,
        created_at: new Date().toISOString(),
      });
      return;
    }

    // Profile missing but table exists — auto-create it (user existed before trigger)
    const { data: created, error: insertErr } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: userId,
        email: userEmail,
        role: userRole,
        full_name: req.user!.full_name || null,
        is_active: true,
      }, { onConflict: "id" })
      .select()
      .single();

    if (insertErr) {
      req.log.warn({ err: insertErr }, "Could not auto-create profile");
      res.json({
        id: userId,
        email: userEmail,
        role: userRole,
        full_name: req.user!.full_name || null,
        is_active: true,
        created_at: new Date().toISOString(),
      });
      return;
    }

    res.json(created);
  } catch (err) {
    req.log.error({ err }, "Failed to get current user");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
