import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";
import { supabaseAdmin } from "../lib/supabase";

const router = Router();

const DEFAULT_CONFIG = {
  id: "default",
  hospital_name: "Taif Children's Hospital",
  hospital_name_ar: "مستشفى الطائف للأطفال",
  logo_url: null,
  background_url: null,
  theme_colors: ["#2f9acb", "#3ba5d2", "#54b3d9", "#6dc2e0", "#86d0e7", "#9fdded", "#b8e9f3", "#d1f3f8"],
  nav_items: [
    { label: "Home", label_ar: "الرئيسية", href: "#home" },
    { label: "About", label_ar: "عن المستشفى", href: "#about" },
    { label: "Research", label_ar: "الأبحاث", href: "#research" },
    { label: "Contact", label_ar: "تواصل معنا", href: "#contact" },
  ],
  updated_at: new Date().toISOString(),
};

router.get("/landing-page", async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("landing_page_config")
      .select("*")
      .eq("id", "default")
      .single();

    if (error || !data) {
      res.json(DEFAULT_CONFIG);
      return;
    }

    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to get landing page");
    res.json(DEFAULT_CONFIG);
  }
});

router.patch("/landing-page", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const fields = ["hospital_name", "hospital_name_ar", "theme_colors", "nav_items"];
    for (const f of fields) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }

    const { data, error } = await supabaseAdmin
      .from("landing_page_config")
      .upsert({ id: "default", ...updates })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to update landing page");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/landing-page/sections", async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("landing_page_sections")
      .select("*")
      .order("order_index");

    if (error) {
      req.log.warn({ err: error }, "landing_page_sections table may not exist yet");
      res.json([]);
      return;
    }
    res.json(data || []);
  } catch (err) {
    req.log.error({ err }, "Failed to list sections");
    res.json([]);
  }
});

router.post("/landing-page/sections", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { title, title_ar, description, description_ar, order_index } = req.body;

    const { data, error } = await supabaseAdmin
      .from("landing_page_sections")
      .insert({ title, title_ar, description, description_ar, order_index, is_visible: true })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to create section");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/landing-page/sections/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const updates: Record<string, unknown> = {};
    const fields = ["title", "title_ar", "description", "description_ar", "order_index", "is_visible"];
    for (const f of fields) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }

    const { data, error } = await supabaseAdmin
      .from("landing_page_sections")
      .update(updates)
      .eq("id", req.params.id)
      .select()
      .single();

    if (error || !data) {
      res.status(404).json({ error: "Section not found" });
      return;
    }

    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to update section");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/landing-page/sections/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from("landing_page_sections")
      .delete()
      .eq("id", req.params.id);

    if (error) throw error;
    res.json({ success: true, message: "Section deleted" });
  } catch (err) {
    req.log.error({ err }, "Failed to delete section");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
