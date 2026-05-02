import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { supabaseAdmin } from "../lib/supabase";

const router = Router();

router.get("/auth/me", requireAuth, async (req, res) => {
  try {
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", req.user!.id)
      .single();

    if (error || !profile) {
      res.status(200).json({
        id: req.user!.id,
        email: req.user!.email,
        role: req.user!.role,
        is_active: true,
        created_at: new Date().toISOString(),
      });
      return;
    }

    res.json(profile);
  } catch (err) {
    req.log.error({ err }, "Failed to get current user");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
