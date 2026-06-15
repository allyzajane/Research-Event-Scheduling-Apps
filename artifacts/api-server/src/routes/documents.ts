import { Router } from "express";
import { requireAuth, requireRole, isAdminRole } from "../middlewares/auth";
import { supabaseAdmin } from "../lib/supabase";
import { notifyAllUsers } from "../lib/notifyAll";

const router = Router();

// Free-tier safety: 10 MB per document upload
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp",
]);

router.get("/documents", requireAuth, async (req, res) => {
  try {
    const { type, search, page = "1", limit = "20" } = req.query as Record<string, string>;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = Math.min(parseInt(limit, 10) || 20, 50);
    const offset = (pageNum - 1) * limitNum;

    let query = supabaseAdmin
      .from("documents")
      .select("*, profiles!documents_uploaded_by_fkey(full_name)", { count: "exact" });

    if (type) query = query.eq("file_type", type);
    if (search) query = query.ilike("title", `%${search}%`);

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (error) {
      req.log.warn({ err: error }, "documents table may not exist yet");
      res.json({ items: [], total: 0, page: pageNum, limit: limitNum });
      return;
    }

    const userId    = req.user!.id;
    const userIsAdmin = isAdminRole(req.user!.role);

    // For non-admins, look up which documents they have explicit download permission for.
    let permittedDocIds = new Set<string>();
    if (!userIsAdmin && (data || []).length > 0) {
      const { data: perms } = await supabaseAdmin
        .from("document_download_permissions")
        .select("document_id")
        .eq("user_id", userId);
      permittedDocIds = new Set((perms || []).map((p: { document_id: string }) => p.document_id));
    }

    const items = (data || []).map((d: Record<string, unknown>) => {
      const canDownload = userIsAdmin || permittedDocIds.has(d.id as string);
      return {
        ...d,
        uploader_name: (d.profiles as { full_name?: string } | null)?.full_name || null,
        profiles: undefined,
        can_download: canDownload,
        // Redact the file URL for users who have no download permission
        file_url: canDownload ? d.file_url : null,
      };
    });

    res.json({ items, total: count || 0, page: pageNum, limit: limitNum });
  } catch (err) {
    req.log.error({ err }, "Failed to list documents");
    res.json({ items: [], total: 0, page: 1, limit: 20 });
  }
});

router.get("/documents/stats", requireAuth, async (req, res) => {
  try {
    // Only select what we need (avoid transferring file content)
    const { data, error } = await supabaseAdmin
      .from("documents")
      .select("file_type, file_size");

    if (error) {
      req.log.warn({ err: error }, "documents table may not exist yet");
      res.json({ total: 0, by_type: [], total_size_bytes: 0 });
      return;
    }

    const docs = data || [];
    const byType: Record<string, number> = {};
    let totalSize = 0;

    for (const d of docs) {
      byType[d.file_type] = (byType[d.file_type] || 0) + 1;
      totalSize += d.file_size || 0;
    }

    res.json({
      total: docs.length,
      by_type: Object.entries(byType).map(([type, count]) => ({ type, count })),
      total_size_bytes: totalSize,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get document stats");
    res.json({ total: 0, by_type: [], total_size_bytes: 0 });
  }
});

// ── GET /documents/my-permissions ──────────────────────────────────────────────
// Returns the list of document IDs the current user has explicit download access to.
// Admins always have full access so this endpoint is most useful for non-admin users.
router.get("/documents/my-permissions", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("document_download_permissions")
      .select("document_id")
      .eq("user_id", req.user!.id);

    if (error) {
      if (error.code === "42P01") { res.json([]); return; }
      throw error;
    }

    res.json(data || []);
  } catch (err) {
    req.log.error({ err }, "Failed to get download permissions");
    res.json([]);
  }
});

router.post("/documents/upload", requireAuth, requireRole("admin", "ceo", "director"), async (req, res) => {
  try {
    const { file_base64, file_name, mime_type, title, description } = req.body;

    if (!file_base64 || !file_name || !mime_type) {
      res.status(400).json({ error: "file_base64, file_name, mime_type are required" });
      return;
    }

    // MIME type validation
    if (!ALLOWED_MIME_TYPES.has(mime_type)) {
      res.status(400).json({ error: "File type not allowed. Supported: PDF, Excel, CSV, Word, and common images." });
      return;
    }

    const buffer = Buffer.from(file_base64, "base64");

    // File size guard — 10 MB max
    if (buffer.length > MAX_FILE_BYTES) {
      res.status(400).json({
        error: `File exceeds the 10 MB limit. Uploaded file is ${(buffer.length / 1024 / 1024).toFixed(1)} MB.`,
      });
      return;
    }

    const path = `documents/${Date.now()}_${file_name}`;

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("hospital-files")
      .upload(path, buffer, { contentType: mime_type, upsert: false });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabaseAdmin.storage
      .from("hospital-files")
      .getPublicUrl(uploadData.path);

    const ext = file_name.split(".").pop()?.toLowerCase() || "other";
    const fileTypeMap: Record<string, string> = {
      pdf: "pdf", xlsx: "excel", xls: "excel", csv: "csv",
      doc: "word", docx: "word", png: "image", jpg: "image",
      jpeg: "image", gif: "image", webp: "image",
    };
    const file_type = fileTypeMap[ext] || "other";

    const { data: doc, error: docError } = await supabaseAdmin
      .from("documents")
      .insert({
        title: title || file_name,
        file_name,
        file_type,
        file_size: buffer.length,
        file_url: urlData.publicUrl,
        storage_path: uploadData.path,
        uploaded_by: req.user!.id,
        description: description || null,
      })
      .select()
      .single();

    if (docError) throw docError;

    notifyAllUsers({
      type: "document",
      title: "New Document Uploaded",
      title_ar: "تم رفع وثيقة جديدة",
      body: `"${doc.title}" has been added to the documents library.`,
      body_ar: `تمت إضافة "${doc.title}" إلى مكتبة الوثائق.`,
      link: "/documents",
      exclude_user_id: req.user!.id,
    }).catch(() => {});

    res.status(201).json(doc);
  } catch (err) {
    req.log.error({ err }, "Failed to upload document");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/documents/:id", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("documents")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (error || !data) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    const userIsAdmin = isAdminRole(req.user!.role);
    if (userIsAdmin) {
      res.json({ ...data, can_download: true });
      return;
    }

    // Non-admin: check explicit download permission before revealing file_url.
    const { data: perm } = await supabaseAdmin
      .from("document_download_permissions")
      .select("document_id")
      .eq("document_id", req.params.id)
      .eq("user_id", req.user!.id)
      .maybeSingle();

    const canDownload = !!perm;
    res.json({
      ...data,
      can_download: canDownload,
      file_url: canDownload ? data.file_url : null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get document");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /documents/:id/download-permissions ────────────────────────────────────
// Admin-only: returns all active users with their download permission status for a document.
router.get("/documents/:id/download-permissions", requireAuth, requireRole("admin", "ceo", "director"), async (req, res) => {
  try {
    const docId = req.params.id as string;

    const [usersResult, permsResult] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, full_name, email, role")
        .eq("is_active", true)
        .order("full_name"),
      supabaseAdmin
        .from("document_download_permissions")
        .select("user_id")
        .eq("document_id", docId),
    ]);

    if (permsResult.error && permsResult.error.code === "42P01") {
      // Table not yet created — return users all with can_download: false
      const users = usersResult.data || [];
      res.json(users.map(u => ({ user_id: u.id, full_name: u.full_name, email: u.email, role: u.role, can_download: false })));
      return;
    }

    const permittedIds = new Set((permsResult.data || []).map((p: { user_id: string }) => p.user_id));

    res.json((usersResult.data || []).map(u => ({
      user_id:      u.id,
      full_name:    u.full_name,
      email:        u.email,
      role:         u.role,
      can_download: permittedIds.has(u.id),
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to get document download permissions");
    res.json([]);
  }
});

// ── POST /documents/:id/grant-download ─────────────────────────────────────────
// Admin-only: grant download access to one or more users.
router.post("/documents/:id/grant-download", requireAuth, requireRole("admin", "ceo", "director"), async (req, res) => {
  try {
    const docId = req.params.id as string;
    const { user_ids } = req.body as { user_ids: string[] };

    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      res.status(400).json({ error: "user_ids array is required" });
      return;
    }

    const rows = user_ids.map(uid => ({
      document_id: docId,
      user_id:     uid,
      granted_by:  req.user!.id,
      granted_at:  new Date().toISOString(),
    }));

    const { error } = await supabaseAdmin
      .from("document_download_permissions")
      .upsert(rows, { onConflict: "document_id,user_id" });

    if (error) {
      if (error.code === "42P01") {
        res.status(503).json({ error: "Run Section 20 of supabase-migration.sql first." });
        return;
      }
      throw error;
    }

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to grant download permission");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /documents/:id/revoke-download/:userId ──────────────────────────────
// Admin-only: revoke a specific user's download access.
router.delete("/documents/:id/revoke-download/:userId", requireAuth, requireRole("admin", "ceo", "director"), async (req, res) => {
  try {
    const { id: docId, userId } = req.params as { id: string; userId: string };

    const { error } = await supabaseAdmin
      .from("document_download_permissions")
      .delete()
      .eq("document_id", docId)
      .eq("user_id", userId);

    if (error && error.code !== "42P01") throw error;

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to revoke download permission");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/documents/:id", requireAuth, requireRole("admin", "ceo", "director"), async (req, res) => {
  try {
    const { data: doc } = await supabaseAdmin
      .from("documents")
      .select("storage_path")
      .eq("id", req.params.id)
      .single();

    if (doc?.storage_path) {
      await supabaseAdmin.storage.from("hospital-files").remove([doc.storage_path]);
    }

    const { error } = await supabaseAdmin.from("documents").delete().eq("id", req.params.id);
    if (error) throw error;

    res.json({ success: true, message: "Document deleted" });
  } catch (err) {
    req.log.error({ err }, "Failed to delete document");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/documents/:id/signatures", requireAuth, async (req, res) => {
  const docId = String(req.params.id);
  try {
    const { data, error } = await supabaseAdmin
      .from("document_signatures")
      .select("*, profiles!document_signatures_user_id_fkey(full_name, role, email)")
      .eq("document_id", docId)
      .order("signed_at", { ascending: true });

    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") {
        res.json({ signatures: [], count: 0 });
        return;
      }
      throw error;
    }

    const signatures = (data || []).map((s: Record<string, unknown>) => ({
      ...s,
      user_name:  (s.profiles as { full_name?: string } | null)?.full_name || null,
      user_role:  (s.profiles as { role?: string } | null)?.role || "staff",
      user_email: (s.profiles as { email?: string } | null)?.email || null,
      profiles: undefined,
    }));

    res.json({ signatures, count: signatures.length });
  } catch (err) {
    req.log.error({ err }, "Failed to get document signatures");
    res.json({ signatures: [], count: 0 });
  }
});

router.post("/documents/:id/sign", requireAuth, async (req, res) => {
  const docId   = String(req.params.id);
  const userId  = req.user!.id;
  const { signature_url, notes } = req.body as { signature_url: string; notes?: string };

  if (!signature_url) {
    res.status(400).json({ error: "signature_url is required" });
    return;
  }

  try {
    const { data: doc } = await supabaseAdmin
      .from("documents")
      .select("id, title, uploaded_by")
      .eq("id", docId)
      .single();

    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, role, email")
      .eq("id", userId)
      .single();

    const { error: sigError } = await supabaseAdmin
      .from("document_signatures")
      .upsert({
        document_id: docId,
        user_id:     userId,
        signature_url,
        notes: notes || null,
        signed_at: new Date().toISOString(),
      }, { onConflict: "document_id,user_id" });

    if (sigError) {
      if (sigError.code === "42P01") {
        res.status(503).json({ error: "Signatures table not yet created. Run Section 12 of supabase-migration.sql in the Supabase SQL editor." });
        return;
      }
      throw sigError;
    }

    // Notify document owner if different
    if (doc.uploaded_by && doc.uploaded_by !== userId) {
      await supabaseAdmin.from("notifications").insert({
        user_id:  doc.uploaded_by,
        type:     "document",
        title:    "Document Signed",
        title_ar: "تم توقيع الوثيقة",
        body:    `"${doc.title}" was signed by ${profile?.full_name || "a user"}.`,
        body_ar: `تم توقيع "${doc.title}" من قِبل ${profile?.full_name || "مستخدم"}.`,
        is_read: false,
        link: "/documents",
      }).throwOnError();
    }

    res.status(201).json({ success: true, message: "Document signed successfully" });
  } catch (err) {
    req.log.error({ err }, "Failed to sign document");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/documents/:id/request-signatures", requireAuth, requireRole("admin", "ceo", "director"), async (req, res) => {
  const docId = String(req.params.id);
  const { user_ids, message } = req.body as { user_ids: string[]; message?: string };

  if (!Array.isArray(user_ids) || user_ids.length === 0) {
    res.status(400).json({ error: "user_ids array is required" });
    return;
  }

  try {
    const { data: doc } = await supabaseAdmin
      .from("documents")
      .select("title")
      .eq("id", docId)
      .single();

    const docTitle = doc?.title || "Document";

    const requests = user_ids.map(uid => ({
      document_id:       docId,
      requested_user_id: uid,
      requested_by:      req.user!.id,
      status:            "pending",
      message:           message || null,
    }));

    const { error } = await supabaseAdmin
      .from("document_signature_requests")
      .upsert(requests, { onConflict: "document_id,requested_user_id" });

    if (error) {
      if (error.code === "42P01") {
        res.status(503).json({ error: "Signature requests table not yet created." });
        return;
      }
      throw error;
    }

    const notifs = user_ids.map(uid => ({
      user_id:  uid,
      type:     "document",
      title:    "Signature Required",
      title_ar: "مطلوب توقيع",
      body:     `Your signature is required on "${docTitle}"${message ? `: ${message}` : "."}`,
      body_ar:  `مطلوب توقيعك على "${docTitle}"${message ? `: ${message}` : "."}`,
      is_read:  false,
      link:     "/documents",
    }));

    await supabaseAdmin.from("notifications").insert(notifs).throwOnError();

    res.json({ success: true, message: `Signature requested from ${user_ids.length} user(s)` });
  } catch (err) {
    req.log.error({ err }, "Failed to request signatures");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
