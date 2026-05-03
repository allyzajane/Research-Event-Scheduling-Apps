import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";
import { supabaseAdmin } from "../lib/supabase";
import { uploadSignatureForUser } from "./auth";

const router = Router();

// ─── GET /admin/users/:userId/signatures ──────────────────────────────────
router.get("/admin/users/:userId/signatures", requireAuth, requireRole("admin", "ceo"), async (req, res) => {
  const userId = String(req.params.userId);
  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, signature_url, signature_drawn_url, signature_active_type")
      .eq("id", userId)
      .single();

    if (error) { res.status(404).json({ error: "User not found" }); return; }
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to get user signatures");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PATCH /admin/users/:userId/signatures ────────────────────────────────
// Admin can set active type, remove either signature
router.patch("/admin/users/:userId/signatures", requireAuth, requireRole("admin", "ceo"), async (req, res) => {
  const userId = String(req.params.userId);
  const { signature_active_type, remove_uploaded, remove_drawn } = req.body as {
    signature_active_type?: string;
    remove_uploaded?: boolean;
    remove_drawn?: boolean;
  };

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (signature_active_type !== undefined) {
    if (!["uploaded", "drawn"].includes(signature_active_type)) {
      res.status(400).json({ error: "signature_active_type must be 'uploaded' or 'drawn'" });
      return;
    }
    updates.signature_active_type = signature_active_type;
  }
  if (remove_uploaded) updates.signature_url = null;
  if (remove_drawn)    updates.signature_drawn_url = null;

  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update(updates)
      .eq("id", userId)
      .select("id, full_name, email, signature_url, signature_drawn_url, signature_active_type")
      .single();

    if (error) { req.log.error({ error }, "Failed to update signatures"); res.status(500).json({ error: "Failed to update" }); return; }
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to update user signatures");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /admin/users/:userId/upload-signature ───────────────────────────
// Admin uploads/replaces a signature on behalf of any user
router.post("/admin/users/:userId/upload-signature", requireAuth, requireRole("admin", "ceo"), async (req, res) => {
  const userId = String(req.params.userId);
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
    req.log.error({ err }, "Failed to upload signature for user");
    res.status(e.status || 500).json({ error: e.message || "Internal server error" });
  }
});

export default router;
