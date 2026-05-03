import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { supabaseAdmin } from "../lib/supabase";

const router = Router();

const AVATAR_SIZE_LIMIT    = 2  * 1024 * 1024; // 2 MB
const SIGNATURE_SIZE_LIMIT = 500 * 1024;        // 500 KB (enforced server-side after client compression)

// ─── Helper: upload a signature for any userId ────────────────────────────
async function uploadSignatureForUser(opts: {
  userId: string;
  file_base64: string;
  file_name: string;
  mime_type: string;
  sig_type: "uploaded" | "drawn";
}): Promise<{ url: string; path: string }> {
  const { userId, file_base64, file_name, mime_type, sig_type } = opts;

  const ALLOWED_MIME = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
  if (!ALLOWED_MIME.includes(mime_type)) {
    throw Object.assign(new Error("Only PNG, JPG, WebP, and SVG files are allowed"), { status: 400 });
  }

  const buffer = Buffer.from(file_base64, "base64");
  if (buffer.byteLength > SIGNATURE_SIZE_LIMIT) {
    throw Object.assign(
      new Error(`Signature exceeds 500 KB. Current: ${Math.round(buffer.byteLength / 1024)} KB. Please compress it client-side.`),
      { status: 400 },
    );
  }

  const ext = mime_type === "image/svg+xml" ? "svg" : (file_name.split(".").pop() || "png");
  const folder = sig_type === "drawn" ? "signatures/drawn" : "signatures/uploaded";
  const storagePath = `${folder}/${userId}.${ext}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from("hospital-files")
    .upload(storagePath, buffer, { contentType: mime_type, upsert: true });

  if (uploadError) throw Object.assign(new Error("Upload failed: " + uploadError.message), { status: 500 });

  const profileField = sig_type === "drawn" ? "signature_drawn_url" : "signature_url";
  await supabaseAdmin
    .from("profiles")
    .update({
      [profileField]:         storagePath,
      signature_active_type:  sig_type,
      updated_at:             new Date().toISOString(),
    })
    .eq("id", userId);

  const { data: urlData } = supabaseAdmin.storage.from("hospital-files").getPublicUrl(storagePath);
  return { url: urlData.publicUrl, path: storagePath };
}

// ─── GET /auth/me ─────────────────────────────────────────────────────────
router.get("/auth/me", requireAuth, async (req, res) => {
  try {
    const userId    = req.user!.id;
    const userEmail = req.user!.email;
    const userRole  = req.user!.role;

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (!fetchErr && existing) {
      // Fire-and-forget: stamp last_seen_at (and sync role if it drifted)
      const touch: Record<string, unknown> = { last_seen_at: new Date().toISOString() };
      if (existing.role !== userRole) touch.role = userRole;
      void supabaseAdmin.from("profiles").update(touch).eq("id", userId);

      res.json({ ...existing, ...touch, role: userRole });
      return;
    }

    if (fetchErr?.code === "PGRST205") {
      res.json({ id: userId, email: userEmail, role: userRole, full_name: req.user!.full_name || null, is_active: true, created_at: new Date().toISOString() });
      return;
    }

    const { data: created, error: insertErr } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: userId, email: userEmail, role: userRole, full_name: req.user!.full_name || null, is_active: true }, { onConflict: "id" })
      .select()
      .single();

    if (insertErr) {
      req.log.warn({ err: insertErr }, "Could not auto-create profile");
      res.json({ id: userId, email: userEmail, role: userRole, full_name: req.user!.full_name || null, is_active: true, created_at: new Date().toISOString() });
      return;
    }

    res.json(created);
  } catch (err) {
    req.log.error({ err }, "Failed to get current user");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PATCH /auth/me ───────────────────────────────────────────────────────
router.patch("/auth/me", requireAuth, async (req, res) => {
  const userId  = req.user!.id;
  const allowed = ["full_name", "full_name_ar", "department", "avatar_url", "signature_url", "signature_drawn_url", "signature_active_type"];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  for (const field of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      updates[field] = req.body[field] ?? null;
    }
  }

  // Validate signature_active_type if provided
  if (updates.signature_active_type !== undefined && updates.signature_active_type !== null) {
    if (!["uploaded", "drawn"].includes(updates.signature_active_type as string)) {
      res.status(400).json({ error: "signature_active_type must be 'uploaded' or 'drawn'" });
      return;
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

// ─── POST /auth/upload-avatar ─────────────────────────────────────────────
router.post("/auth/upload-avatar", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { file_base64, file_name, mime_type } = req.body as { file_base64: string; file_name: string; mime_type: string };

  if (!file_base64 || !file_name || !mime_type) { res.status(400).json({ error: "Missing file data" }); return; }

  const ALLOWED_MIME = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
  if (!ALLOWED_MIME.includes(mime_type)) { res.status(400).json({ error: "Only PNG, JPG, and WebP images are allowed" }); return; }

  try {
    const buffer = Buffer.from(file_base64, "base64");
    if (buffer.byteLength > AVATAR_SIZE_LIMIT) { res.status(400).json({ error: "Image exceeds 2 MB limit" }); return; }

    const ext = file_name.split(".").pop() || "jpg";
    const storagePath = `avatars/${userId}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage.from("hospital-files").upload(storagePath, buffer, { contentType: mime_type, upsert: true });
    if (uploadError) { req.log.error({ error: uploadError }, "Failed to upload avatar"); res.status(500).json({ error: "Upload failed" }); return; }

    const { data: urlData } = supabaseAdmin.storage.from("hospital-files").getPublicUrl(storagePath);
    const avatarUrl = urlData.publicUrl;

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (profileError) {
      req.log.error({ error: profileError }, "Failed to persist avatar url");
      res.status(500).json({ error: profileError.message || "Failed to save avatar" });
      return;
    }
    res.json({ url: avatarUrl, path: storagePath });
  } catch (err) {
    req.log.error({ err }, "Failed to upload avatar");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /auth/upload-signature ──────────────────────────────────────────
// sig_type: "uploaded" (file import) | "drawn" (stylus/mouse) — defaults to "uploaded"
router.post("/auth/upload-signature", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { file_base64, file_name, mime_type, sig_type = "uploaded" } = req.body as {
    file_base64: string; file_name: string; mime_type: string; sig_type?: string;
  };

  if (!file_base64 || !file_name || !mime_type) { res.status(400).json({ error: "Missing file data" }); return; }
  if (!["uploaded", "drawn"].includes(sig_type)) { res.status(400).json({ error: "sig_type must be 'uploaded' or 'drawn'" }); return; }

  try {
    const result = await uploadSignatureForUser({
      userId, file_base64, file_name, mime_type, sig_type: sig_type as "uploaded" | "drawn",
    });
    res.json(result);
  } catch (err) {
    const e = err as { status?: number; message?: string };
    req.log.error({ err }, "Failed to upload signature");
    res.status(e.status || 500).json({ error: e.message || "Internal server error" });
  }
});

export { uploadSignatureForUser };
export default router;
