import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { supabaseAdmin } from "../lib/supabase";

const router = Router();

const AVATAR_SIZE_LIMIT     = 2 * 1024 * 1024; // 2 MB
const SIGNATURE_SIZE_LIMIT  = 1 * 1024 * 1024; // 1 MB

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

router.patch("/auth/me", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const allowed = ["full_name", "full_name_ar", "department", "avatar_url", "signature_url"];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  for (const field of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      updates[field] = req.body[field] ?? null;
    }
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update(updates)
      .eq("id", userId)
      .select()
      .single();

    if (error) {
      req.log.error({ error }, "Failed to update profile");
      res.status(500).json({ error: "Failed to update profile" });
      return;
    }

    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to update profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/upload-avatar", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { file_base64, file_name, mime_type } = req.body as {
    file_base64: string; file_name: string; mime_type: string;
  };

  if (!file_base64 || !file_name || !mime_type) {
    res.status(400).json({ error: "Missing file data" });
    return;
  }

  const ALLOWED_MIME = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
  if (!ALLOWED_MIME.includes(mime_type)) {
    res.status(400).json({ error: "Only PNG, JPG, and WebP images are allowed" });
    return;
  }

  try {
    const buffer = Buffer.from(file_base64, "base64");
    if (buffer.byteLength > AVATAR_SIZE_LIMIT) {
      res.status(400).json({ error: "Image exceeds 2 MB limit" });
      return;
    }

    const ext = file_name.split(".").pop() || "jpg";
    const storagePath = `avatars/${userId}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("hospital-files")
      .upload(storagePath, buffer, { contentType: mime_type, upsert: true });

    if (uploadError) {
      req.log.error({ error: uploadError }, "Failed to upload avatar");
      res.status(500).json({ error: "Upload failed" });
      return;
    }

    const { data: urlData } = supabaseAdmin.storage
      .from("hospital-files")
      .getPublicUrl(storagePath);

    const avatarUrl = urlData.publicUrl;

    await supabaseAdmin
      .from("profiles")
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq("id", userId);

    res.json({ url: avatarUrl, path: storagePath });
  } catch (err) {
    req.log.error({ err }, "Failed to upload avatar");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/upload-signature", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { file_base64, file_name, mime_type } = req.body as {
    file_base64: string; file_name: string; mime_type: string;
  };

  if (!file_base64 || !file_name || !mime_type) {
    res.status(400).json({ error: "Missing file data" });
    return;
  }

  const ALLOWED_MIME = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml"];
  if (!ALLOWED_MIME.includes(mime_type)) {
    res.status(400).json({ error: "Only PNG, JPG, and SVG files are allowed" });
    return;
  }

  try {
    const buffer = Buffer.from(file_base64, "base64");
    if (buffer.byteLength > SIGNATURE_SIZE_LIMIT) {
      res.status(400).json({ error: "Signature file exceeds 1 MB limit" });
      return;
    }

    const ext = mime_type === "image/svg+xml" ? "svg" : (file_name.split(".").pop() || "png");
    const storagePath = `signatures/${userId}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("hospital-files")
      .upload(storagePath, buffer, { contentType: mime_type, upsert: true });

    if (uploadError) {
      req.log.error({ error: uploadError }, "Failed to upload signature");
      res.status(500).json({ error: "Upload failed" });
      return;
    }

    const { data: urlData } = supabaseAdmin.storage
      .from("hospital-files")
      .getPublicUrl(storagePath);

    const signatureUrl = urlData.publicUrl;

    await supabaseAdmin
      .from("profiles")
      .update({ signature_url: signatureUrl, updated_at: new Date().toISOString() })
      .eq("id", userId);

    res.json({ url: signatureUrl, path: storagePath });
  } catch (err) {
    req.log.error({ err }, "Failed to upload signature");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
