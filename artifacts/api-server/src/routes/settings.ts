import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";
import { supabaseAdmin } from "../lib/supabase";
import { cache, TTL } from "../lib/cache";

const router = Router();

const THEME_KEY = "settings:theme";

// Max sizes: 2 MB for branding images
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_MIME = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];

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
  const cached = cache.get(THEME_KEY);
  if (cached) { res.json(cached); return; }

  try {
    const { data, error } = await supabaseAdmin
      .from("theme_settings")
      .select("*")
      .eq("id", "default")
      .single();

    const result = (error || !data) ? DEFAULT_THEME : data;
    cache.set(THEME_KEY, result, TTL.STATIC);
    res.json(result);
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
      .upsert({ ...DEFAULT_THEME, ...updates })
      .select()
      .single();

    if (error) throw error;
    cache.del(THEME_KEY);
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

    // Validate MIME type
    if (mime_type && !ALLOWED_IMAGE_MIME.includes(mime_type)) {
      res.status(400).json({ error: "Invalid file type. Only PNG, JPEG, WebP, and SVG are allowed." });
      return;
    }

    const buffer = Buffer.from(file_base64, "base64");

    // Enforce 2 MB limit for branding images
    if (buffer.length > MAX_IMAGE_BYTES) {
      res.status(400).json({ error: `Logo must be smaller than 2 MB. Uploaded file is ${(buffer.length / 1024 / 1024).toFixed(1)} MB.` });
      return;
    }

    // Delete old logo files to keep storage lean
    const { data: existingFiles } = await supabaseAdmin.storage
      .from("hospital-files")
      .list("branding", { search: "logo_" });
    if (existingFiles && existingFiles.length > 0) {
      const oldPaths = existingFiles.map(f => `branding/${f.name}`);
      await supabaseAdmin.storage.from("hospital-files").remove(oldPaths);
    }

    const path = `branding/logo_${Date.now()}_${file_name}`;
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("hospital-files")
      .upload(path, buffer, { contentType: mime_type || "image/png", upsert: true });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabaseAdmin.storage
      .from("hospital-files")
      .getPublicUrl(uploadData.path);

    await Promise.all([
      supabaseAdmin.from("theme_settings")
        .upsert({ ...DEFAULT_THEME, logo_url: urlData.publicUrl, updated_at: new Date().toISOString() }),
      supabaseAdmin.from("landing_page_config")
        .upsert({ id: "default", logo_url: urlData.publicUrl, updated_at: new Date().toISOString() }),
    ]);

    cache.del(THEME_KEY);
    cache.del("landing:config");
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

    if (mime_type && !ALLOWED_IMAGE_MIME.includes(mime_type)) {
      res.status(400).json({ error: "Invalid file type. Only PNG, JPEG, WebP, and SVG are allowed." });
      return;
    }

    const buffer = Buffer.from(file_base64, "base64");

    if (buffer.length > MAX_IMAGE_BYTES) {
      res.status(400).json({ error: `Background must be smaller than 2 MB. Uploaded file is ${(buffer.length / 1024 / 1024).toFixed(1)} MB.` });
      return;
    }

    // Delete old background files to keep storage lean
    const { data: existingFiles } = await supabaseAdmin.storage
      .from("hospital-files")
      .list("branding", { search: "bg_" });
    if (existingFiles && existingFiles.length > 0) {
      const oldPaths = existingFiles.map(f => `branding/${f.name}`);
      await supabaseAdmin.storage.from("hospital-files").remove(oldPaths);
    }

    const path = `branding/bg_${Date.now()}_${file_name}`;
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("hospital-files")
      .upload(path, buffer, { contentType: mime_type || "image/jpeg", upsert: true });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabaseAdmin.storage
      .from("hospital-files")
      .getPublicUrl(uploadData.path);

    await Promise.all([
      supabaseAdmin.from("theme_settings")
        .upsert({ ...DEFAULT_THEME, background_url: urlData.publicUrl, updated_at: new Date().toISOString() }),
      supabaseAdmin.from("landing_page_config")
        .upsert({ id: "default", background_url: urlData.publicUrl, updated_at: new Date().toISOString() }),
    ]);

    cache.del(THEME_KEY);
    cache.del("landing:config");
    res.json({ url: urlData.publicUrl, path: uploadData.path });
  } catch (err) {
    req.log.error({ err }, "Failed to upload background");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
