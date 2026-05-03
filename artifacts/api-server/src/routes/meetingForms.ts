import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { supabaseAdmin } from "../lib/supabase";

const router = Router();

const ADMIN_ROLES = ["admin", "ceo", "director"];

const EVENT_SELECT =
  "id, title, title_ar, venue, location, start_time, end_time, event_type, organizer";

const FORM_SELECT = `*, calendar_events (${EVENT_SELECT})`;

// ── Active signature URL from profiles ────────────────────────────────────────
async function getActiveSignatureUrl(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("signature_url, signature_drawn_url, signature_active_type")
    .eq("id", userId)
    .single();

  if (!data) return null;
  const p = data as Record<string, unknown>;
  if (p.signature_active_type === "drawn") return (p.signature_drawn_url as string) ?? null;
  return (p.signature_url as string) ?? null;
}

// ── GET /meeting-forms ────────────────────────────────────────────────────────
router.get("/meeting-forms", requireAuth, async (req, res) => {
  try {
    const { active } = req.query as Record<string, string>;
    const reqUser = (req as any).user;
    const isAdmin = ADMIN_ROLES.includes(reqUser?.role);

    let q = supabaseAdmin.from("meeting_attendance_forms").select(FORM_SELECT);

    if (!isAdmin || active === "true") q = q.eq("is_active", true);

    const { data, error } = await q.order("created_at", { ascending: false });

    if (error) {
      req.log.warn({ err: error }, "meeting_attendance_forms table may not exist");
      res.json([]); return;
    }
    res.json(data ?? []);
  } catch (err) {
    req.log.error({ err }, "Failed to list meeting forms");
    res.json([]);
  }
});

// ── POST /meeting-forms ───────────────────────────────────────────────────────
router.post("/meeting-forms", requireAuth, async (req, res) => {
  try {
    const reqUser = (req as any).user;
    if (!ADMIN_ROLES.includes(reqUser?.role)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const body = req.body as { event_id?: string; window_start?: string; window_end?: string };

    const { count } = await supabaseAdmin
      .from("meeting_attendance_forms")
      .select("id", { count: "exact", head: true });

    const meetingNo = (count ?? 0) + 1;

    const { data, error } = await supabaseAdmin
      .from("meeting_attendance_forms")
      .insert({
        event_id:     body.event_id     || null,
        meeting_no:   meetingNo,
        is_active:    true,
        window_start: body.window_start || null,
        window_end:   body.window_end   || null,
        created_by:   reqUser.id,
      })
      .select(FORM_SELECT)
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to create meeting form");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /meeting-forms/:id ────────────────────────────────────────────────────
router.get("/meeting-forms/:id", requireAuth, async (req, res) => {
  try {
    const reqUser = (req as any).user;

    const { data: form, error } = await supabaseAdmin
      .from("meeting_attendance_forms")
      .select(FORM_SELECT)
      .eq("id", req.params.id)
      .single();

    if (error || !form) { res.status(404).json({ error: "Not found" }); return; }

    const [subRes, profileRes] = await Promise.all([
      supabaseAdmin
        .from("meeting_attendance_submissions")
        .select("*")
        .eq("form_id", req.params.id)
        .eq("user_id", reqUser.id)
        .maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .select("full_name, full_name_ar, role, department")
        .eq("id", reqUser.id)
        .single(),
    ]);

    const signatureUrl = await getActiveSignatureUrl(reqUser.id);

    res.json({
      ...form,
      my_submission: subRes.data ?? null,
      my_profile:    { ...(profileRes.data ?? {}), signature_url: signatureUrl },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get meeting form");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PATCH /meeting-forms/:id ──────────────────────────────────────────────────
router.patch("/meeting-forms/:id", requireAuth, async (req, res) => {
  try {
    const reqUser = (req as any).user;
    if (!ADMIN_ROLES.includes(reqUser?.role)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const body = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ("is_active"    in body) updates.is_active    = body.is_active;
    if ("window_start" in body) updates.window_start = body.window_start || null;
    if ("window_end"   in body) updates.window_end   = body.window_end   || null;

    const { data, error } = await supabaseAdmin
      .from("meeting_attendance_forms")
      .update(updates)
      .eq("id", req.params.id)
      .select(FORM_SELECT)
      .single();

    if (error || !data) { res.status(404).json({ error: "Not found" }); return; }
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to update meeting form");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /meeting-forms/:id ─────────────────────────────────────────────────
router.delete("/meeting-forms/:id", requireAuth, async (req, res) => {
  try {
    const reqUser = (req as any).user;
    if (!ADMIN_ROLES.includes(reqUser?.role)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    await supabaseAdmin.from("meeting_attendance_forms").delete().eq("id", req.params.id);
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete meeting form");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /meeting-forms/:id/submit ────────────────────────────────────────────
router.post("/meeting-forms/:id/submit", requireAuth, async (req, res) => {
  try {
    const reqUser = (req as any).user;

    const { data: form, error: formErr } = await supabaseAdmin
      .from("meeting_attendance_forms")
      .select("is_active, window_start, window_end")
      .eq("id", req.params.id)
      .single();

    if (formErr || !form) { res.status(404).json({ error: "Form not found" }); return; }

    const f = form as Record<string, unknown>;
    if (!f.is_active) { res.status(403).json({ error: "form_unavailable" }); return; }

    const now = new Date();
    if (f.window_start && now < new Date(f.window_start as string)) {
      res.status(403).json({ error: "form_not_started", opens_at: f.window_start }); return;
    }
    if (f.window_end && now > new Date(f.window_end as string)) {
      res.status(403).json({ error: "form_closed" }); return;
    }

    const { data: existing } = await supabaseAdmin
      .from("meeting_attendance_submissions")
      .select("id")
      .eq("form_id", req.params.id)
      .eq("user_id", reqUser.id)
      .maybeSingle();

    if (existing) { res.status(409).json({ error: "already_submitted" }); return; }

    const { count: existingCount } = await supabaseAdmin
      .from("meeting_attendance_submissions")
      .select("id", { count: "exact", head: true })
      .eq("form_id", req.params.id);

    const submissionNo  = (existingCount ?? 0) + 1;
    const signatureUrl  = await getActiveSignatureUrl(reqUser.id);

    const { data, error } = await supabaseAdmin
      .from("meeting_attendance_submissions")
      .insert({
        form_id:       req.params.id,
        user_id:       reqUser.id,
        submission_no: submissionNo,
        signature_url: signatureUrl,
      })
      .select("*")
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to submit meeting attendance");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /meeting-forms/:id/submissions ────────────────────────────────────────
router.get("/meeting-forms/:id/submissions", requireAuth, async (req, res) => {
  try {
    const reqUser = (req as any).user;
    const isAdmin = ADMIN_ROLES.includes(reqUser?.role);

    let q = supabaseAdmin
      .from("meeting_attendance_submissions")
      .select(`*, profiles!meeting_attendance_submissions_user_id_fkey (full_name, full_name_ar, role, department)`)
      .eq("form_id", req.params.id);

    if (!isAdmin) q = q.eq("user_id", reqUser.id);

    const { data, error } = await q.order("submission_no");

    if (error) {
      req.log.warn({ err: error }, "meeting_attendance_submissions table may not exist");
      res.json([]); return;
    }

    res.json((data ?? []).map(r => {
      const row = r as Record<string, unknown>;
      const p   = row.profiles as Record<string, unknown> | null;
      return {
        ...row,
        user_name:       p?.full_name    ?? null,
        user_name_ar:    p?.full_name_ar ?? null,
        user_role:       p?.role         ?? null,
        user_department: p?.department   ?? null,
        profiles:        undefined,
      };
    }));
  } catch (err) {
    req.log.error({ err }, "Failed to get submissions");
    res.json([]);
  }
});

// ── PATCH /meeting-forms/:id/submissions/:subId/remarks ───────────────────────
router.patch("/meeting-forms/:id/submissions/:subId/remarks", requireAuth, async (req, res) => {
  try {
    const reqUser = (req as any).user;
    if (!ADMIN_ROLES.includes(reqUser?.role)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const { remarks } = req.body as { remarks?: string };

    const { data, error } = await supabaseAdmin
      .from("meeting_attendance_submissions")
      .update({ remarks: remarks ?? null })
      .eq("id",      req.params.subId)
      .eq("form_id", req.params.id)
      .select("*")
      .single();

    if (error || !data) { res.status(404).json({ error: "Not found" }); return; }
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to update remarks");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
