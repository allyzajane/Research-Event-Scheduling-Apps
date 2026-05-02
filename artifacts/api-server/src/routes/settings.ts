import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";
import { supabaseAdmin } from "../lib/supabase";

const router = Router();

const DEFAULT_THEME = {
  id: "default",
  primary_color: "#2f9acb",
  theme_colors: ["#2f9acb", "#3ba5d2", "#54b3d9", "#6dc2e0", "#86d0e7", "#9fdded", "#b8e9f3", "#d1f3f8"],
  font_family: "Plus Jakarta Sans",
  style: "modern",
  logo_url: null,
  background_url: null,
  updated_at: new Date().toISOString(),
};

router.get("/settings/theme", async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("theme_settings")
      .select("*")
      .eq("id", "default")
      .single();

    if (error || !data) {
      res.json(DEFAULT_THEME);
      return;
    }

    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to get theme settings");
    res.json(DEFAULT_THEME);
  }
});

router.patch("/settings/theme", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const fields = ["primary_color", "theme_colors", "font_family", "style"];
    for (const f of fields) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }

    const { data, error } = await supabaseAdmin
      .from("theme_settings")
      .upsert({ id: "default", ...DEFAULT_THEME, ...updates })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to update theme");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/settings/upload-logo", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { file_base64, file_name, mime_type } = req.body;

    if (!file_base64 || !file_name) {
      res.status(400).json({ error: "file_base64 and file_name required" });
      return;
    }

    const buffer = Buffer.from(file_base64, "base64");
    const path = `branding/logo_${Date.now()}_${file_name}`;

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("hospital-files")
      .upload(path, buffer, { contentType: mime_type || "image/png", upsert: true });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabaseAdmin.storage
      .from("hospital-files")
      .getPublicUrl(uploadData.path);

    await supabaseAdmin
      .from("theme_settings")
      .upsert({ id: "default", ...DEFAULT_THEME, logo_url: urlData.publicUrl, updated_at: new Date().toISOString() });

    await supabaseAdmin
      .from("landing_page_config")
      .upsert({ id: "default", logo_url: urlData.publicUrl, updated_at: new Date().toISOString() });

    res.json({ url: urlData.publicUrl, path: uploadData.path });
  } catch (err) {
    req.log.error({ err }, "Failed to upload logo");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/settings/upload-background", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { file_base64, file_name, mime_type } = req.body;

    if (!file_base64 || !file_name) {
      res.status(400).json({ error: "file_base64 and file_name required" });
      return;
    }

    const buffer = Buffer.from(file_base64, "base64");
    const path = `branding/bg_${Date.now()}_${file_name}`;

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("hospital-files")
      .upload(path, buffer, { contentType: mime_type || "image/jpeg", upsert: true });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabaseAdmin.storage
      .from("hospital-files")
      .getPublicUrl(uploadData.path);

    await supabaseAdmin
      .from("theme_settings")
      .upsert({ id: "default", ...DEFAULT_THEME, background_url: urlData.publicUrl, updated_at: new Date().toISOString() });

    await supabaseAdmin
      .from("landing_page_config")
      .upsert({ id: "default", background_url: urlData.publicUrl, updated_at: new Date().toISOString() });

    res.json({ url: urlData.publicUrl, path: uploadData.path });
  } catch (err) {
    req.log.error({ err }, "Failed to upload background");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
