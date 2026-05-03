import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { applyPrimaryColor } from "@/lib/theme";
import {
  useGetLandingPage, useUpdateLandingPage, getGetLandingPageQueryKey,
  useListSections, getListSectionsQueryKey,
  useCreateSection, useUpdateSection, useDeleteSection,
  useGetThemeSettings, useUpdateThemeSettings, getGetThemeSettingsQueryKey,
  useGetAllDashboardConfigs, getGetAllDashboardConfigsQueryKey,
  useUpdateRoleDashboardConfig,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import i18n from "i18next";
import {
  Settings, Palette, Layout, Image, Plus, Pencil, Trash2,
  GripVertical, Save, Upload, LayoutDashboard, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const THEME_STYLES = ["minimalist", "modern", "animated"];
// Hospital brand palette — 8 shades from primary to lightest tint
const BRAND_PALETTE = [
  "#2f9acb", "#3ba5d2", "#54b3d9", "#6dc2e0",
  "#86d0e7", "#9fdded", "#b8e9f3", "#d1f3f8",
];

const ALL_ROLES = ["admin", "ceo", "director", "doctor", "nurse", "staff"] as const;
type Role = typeof ALL_ROLES[number];

const ALL_WIDGETS = [
  "stat_users",
  "stat_documents",
  "stat_articles",
  "stat_events",
  "recent_documents",
  "recent_articles",
  "upcoming_events",
  "quick_actions",
] as const;

const ROLE_COLORS: Record<Role, string> = {
  admin:    "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  ceo:      "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  director: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  doctor:   "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
  nurse:    "bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300",
  staff:    "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

interface SectionForm {
  title: string; title_ar: string; description: string; description_ar: string;
  order_index: number; is_visible: boolean;
}
const emptySection = (): SectionForm => ({
  title: "", title_ar: "", description: "", description_ar: "", order_index: 1, is_visible: true
});

export default function SettingsPage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const qc = useQueryClient();

  const { data: landing, isLoading: landingLoading } = useGetLandingPage({ query: { queryKey: getGetLandingPageQueryKey() } });
  const { data: theme, isLoading: themeLoading } = useGetThemeSettings({ query: { queryKey: getGetThemeSettingsQueryKey() } });
  const { data: sections, isLoading: sectionsLoading } = useListSections({ query: { queryKey: getListSectionsQueryKey() } });
  const { data: allConfigs, isLoading: configsLoading } = useGetAllDashboardConfigs({ query: { queryKey: getGetAllDashboardConfigsQueryKey() } });

  const updateLanding = useUpdateLandingPage();
  const updateTheme = useUpdateThemeSettings();
  const createSection = useCreateSection();
  const updateSection = useUpdateSection();
  const deleteSection = useDeleteSection();
  const updateRoleConfig = useUpdateRoleDashboardConfig();

  // Landing form
  const [landingForm, setLandingForm] = useState({ hospital_name: "", hospital_name_ar: "", logo_url: "", background_url: "" });
  const [themeForm, setThemeForm] = useState({ primary_color: "#2f9acb", style: "modern", font_family: "Plus Jakarta Sans" });
  const [savingLanding, setSavingLanding] = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);
  const [sectionForm, setSectionForm] = useState<SectionForm>(emptySection());
  const [editSection, setEditSection] = useState<{ id: string; form: SectionForm } | null>(null);
  const [createSectionOpen, setCreateSectionOpen] = useState(false);
  const [deleteSectionId, setDeleteSectionId] = useState<string | null>(null);
  const [savingSection, setSavingSection] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");

  // Dashboard widget state per role
  const [widgetDraft, setWidgetDraft] = useState<Record<Role, string[]>>({
    admin: [], ceo: [], director: [], doctor: [], nurse: [], staff: [],
  });
  const [savingRole, setSavingRole] = useState<Role | null>(null);
  const [widgetMsg, setWidgetMsg] = useState<{ role: Role; ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (landing) {
      setLandingForm({
        hospital_name: landing.hospital_name || "",
        hospital_name_ar: landing.hospital_name_ar || "",
        logo_url: landing.logo_url || "",
        background_url: landing.background_url || "",
      });
    }
  }, [landing]);

  useEffect(() => {
    if (theme) {
      setThemeForm({
        primary_color: theme.primary_color || "#2f9acb",
        style: theme.style || "modern",
        font_family: theme.font_family || "Plus Jakarta Sans",
      });
    }
  }, [theme]);

  useEffect(() => {
    if (allConfigs?.configs) {
      const draft: Record<Role, string[]> = { admin: [], ceo: [], director: [], doctor: [], nurse: [], staff: [] };
      for (const cfg of allConfigs.configs) {
        if (ALL_ROLES.includes(cfg.role as Role)) {
          draft[cfg.role as Role] = cfg.widgets.filter(widget => ALL_WIDGETS.includes(widget as (typeof ALL_WIDGETS)[number]));
        }
      }
      setWidgetDraft(draft);
    }
  }, [allConfigs]);

  const invalidateLanding = () => {
    qc.invalidateQueries({ queryKey: getGetLandingPageQueryKey() });
    qc.invalidateQueries({ queryKey: getListSectionsQueryKey() });
  };

  const handleSaveLanding = async () => {
    setSavingLanding(true);
    try {
      await updateLanding.mutateAsync({ data: landingForm });
      invalidateLanding();
    } finally { setSavingLanding(false); }
  };

  const handleSaveTheme = async () => {
    setSavingTheme(true);
    try {
      await updateTheme.mutateAsync({ data: themeForm });
      qc.invalidateQueries({ queryKey: getGetThemeSettingsQueryKey() });
    } finally { setSavingTheme(false); }
  };

  const handleUpload = async (field: "logo_url" | "background_url", file: File) => {
    if (!session) return;
    field === "logo_url" ? setUploadingLogo(true) : setUploadingBg(true);
    setUploadMsg("");
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res((reader.result as string).split(",")[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const endpoint = field === "logo_url" ? "/api/settings/upload-logo" : "/api/settings/upload-background";
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
        body: JSON.stringify({ file_base64: base64, file_name: file.name, mime_type: file.type })
      });
      if (!r.ok) throw new Error(await r.text());
      const { url } = await r.json();
      setLandingForm(prev => ({ ...prev, [field]: url }));
      setUploadMsg(t("settings.uploadSuccess"));
    } catch (e) {
      setUploadMsg(String(e));
    } finally { setUploadingLogo(false); setUploadingBg(false); }
  };

  const handleCreateSection = async () => {
    setSavingSection(true);
    try {
      await createSection.mutateAsync({ data: sectionForm });
      invalidateLanding(); setCreateSectionOpen(false); setSectionForm(emptySection());
    } finally { setSavingSection(false); }
  };

  const handleEditSection = async () => {
    if (!editSection) return;
    setSavingSection(true);
    try {
      await updateSection.mutateAsync({ id: editSection.id, data: editSection.form });
      invalidateLanding(); setEditSection(null);
    } finally { setSavingSection(false); }
  };

  const handleDeleteSection = async () => {
    if (!deleteSectionId) return;
    await deleteSection.mutateAsync({ id: deleteSectionId });
    invalidateLanding(); setDeleteSectionId(null);
  };

  const handleSaveWidgets = async (role: Role) => {
    setSavingRole(role);
    setWidgetMsg(null);
    try {
      const widgets = widgetDraft[role].filter(widget => ALL_WIDGETS.includes(widget as (typeof ALL_WIDGETS)[number]));
      await updateRoleConfig.mutateAsync({ role, data: { widgets } });
      qc.invalidateQueries({ queryKey: getGetAllDashboardConfigsQueryKey() });
      setWidgetMsg({ role, ok: true, text: t("settings.widgetsSaved") });
    } catch (err) {
      setWidgetMsg({
        role,
        ok: false,
        text: `${t("settings.widgetsSaveFailed")}${err instanceof Error && err.message ? `: ${err.message}` : ""}`,
      });
    } finally {
      setSavingRole(null);
    }
  };

  const toggleWidget = (role: Role, widget: string) => {
    setWidgetDraft(prev => {
      const current = prev[role];
      const next = current.includes(widget) ? current.filter(w => w !== widget) : [...current, widget];
      return { ...prev, [role]: next };
    });
    setWidgetMsg(null);
  };

  const SectionFormFields = ({ val, onChange }: { val: SectionForm; onChange: (v: SectionForm) => void }) => (
    <div className="space-y-4 py-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{t("settings.sectionTitle")} *</Label>
          <Input value={val.title} onChange={e => onChange({ ...val, title: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("settings.sectionTitleAr")}</Label>
          <Input value={val.title_ar} onChange={e => onChange({ ...val, title_ar: e.target.value })} dir="rtl" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{t("settings.sectionDesc")}</Label>
          <Textarea rows={3} value={val.description} onChange={e => onChange({ ...val, description: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("settings.sectionDescAr")}</Label>
          <Textarea rows={3} value={val.description_ar} onChange={e => onChange({ ...val, description_ar: e.target.value })} dir="rtl" />
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="space-y-1.5 flex-1">
          <Label>{t("settings.sectionOrder")}</Label>
          <Input type="number" min={1} value={val.order_index} onChange={e => onChange({ ...val, order_index: Number(e.target.value) })} />
        </div>
        <div className="flex items-center gap-2 pt-5">
          <Switch checked={val.is_visible} onCheckedChange={v => onChange({ ...val, is_visible: v })} />
          <Label>{t("settings.sectionVisible")}</Label>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("settings.title")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t("settings.subtitle")}</p>
      </div>

      <Tabs defaultValue="branding">
        <TabsList className="mb-6 flex-wrap h-auto gap-1">
          <TabsTrigger value="branding" className="gap-2"><Image className="w-3.5 h-3.5" />{t("settings.branding")}</TabsTrigger>
          <TabsTrigger value="theme" className="gap-2"><Palette className="w-3.5 h-3.5" />{t("settings.theme")}</TabsTrigger>
          <TabsTrigger value="sections" className="gap-2"><Layout className="w-3.5 h-3.5" />{t("settings.sections")}</TabsTrigger>
          <TabsTrigger value="dashboard" className="gap-2"><LayoutDashboard className="w-3.5 h-3.5" />{t("settings.dashboardLayout")}</TabsTrigger>
        </TabsList>

        {/* BRANDING TAB */}
        <TabsContent value="branding">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-base">{t("settings.branding")}</CardTitle>
              <CardDescription>{i18n.language === "ar" ? "تخصيص هوية المستشفى البصرية" : "Customize hospital branding and identity"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {landingLoading ? <Skeleton className="h-40 w-full" /> : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>{t("settings.hospitalName")}</Label>
                      <Input value={landingForm.hospital_name} onChange={e => setLandingForm({ ...landingForm, hospital_name: e.target.value })} placeholder="Taif Children's Hospital" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t("settings.hospitalNameAr")}</Label>
                      <Input value={landingForm.hospital_name_ar} onChange={e => setLandingForm({ ...landingForm, hospital_name_ar: e.target.value })} dir="rtl" placeholder="مستشفى الطائف للأطفال" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("settings.logoUpload")}</Label>
                    <div className="flex items-center gap-3">
                      {landingForm.logo_url ? (
                        <img src={landingForm.logo_url} alt="Logo" className="h-12 w-auto object-contain border border-border rounded-lg p-1 bg-white" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg border-2 border-dashed border-border flex items-center justify-center">
                          <Image className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1">
                        <Input type="file" accept="image/*" className="text-sm"
                          onChange={e => e.target.files?.[0] && handleUpload("logo_url", e.target.files[0])} />
                        <p className="text-xs text-muted-foreground mt-1">{t("settings.logoHint")}</p>
                      </div>
                      {uploadingLogo && <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{i18n.language === "ar" ? "أو أدخل رابط مباشر" : "Or enter URL directly"}</Label>
                      <Input value={landingForm.logo_url} onChange={e => setLandingForm({ ...landingForm, logo_url: e.target.value })} placeholder="https://..." />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("settings.backgroundUpload")}</Label>
                    <div className="flex items-center gap-3">
                      {landingForm.background_url && (
                        <img src={landingForm.background_url} alt="Bg" className="h-12 w-20 object-cover border border-border rounded-lg" />
                      )}
                      <div className="flex-1">
                        <Input type="file" accept="image/*" className="text-sm"
                          onChange={e => e.target.files?.[0] && handleUpload("background_url", e.target.files[0])} />
                        <p className="text-xs text-muted-foreground mt-1">{t("settings.backgroundHint")}</p>
                      </div>
                      {uploadingBg && <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{i18n.language === "ar" ? "أو أدخل رابط مباشر" : "Or enter URL directly"}</Label>
                      <Input value={landingForm.background_url} onChange={e => setLandingForm({ ...landingForm, background_url: e.target.value })} placeholder="https://..." />
                    </div>
                  </div>

                  {uploadMsg && <p className="text-sm text-primary">{uploadMsg}</p>}

                  <Button onClick={handleSaveLanding} disabled={savingLanding} className="gap-2">
                    <Save className="w-4 h-4" />{savingLanding ? t("common.loading") : t("common.save")}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* THEME TAB */}
        <TabsContent value="theme">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-base">{t("settings.themeColors")}</CardTitle>
              <CardDescription>{i18n.language === "ar" ? "تخصيص ألوان وأسلوب المنصة" : "Customize platform colors and style"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {themeLoading ? <Skeleton className="h-32 w-full" /> : (
                <>
                  <div className="space-y-3">
                    <Label>{t("settings.primaryColor")}</Label>

                    {/* Brand palette strip */}
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">
                        {i18n.language === "ar" ? "لوحة ألوان المستشفى — انقر لاختيار اللون الأساسي" : "Hospital brand palette — click any shade to set as primary"}
                      </p>
                      <div className="flex h-11 rounded-xl overflow-hidden border border-border shadow-sm">
                        {BRAND_PALETTE.map((color) => (
                          <button
                            key={color}
                            title={color}
                            onClick={() => {
                              setThemeForm(prev => ({ ...prev, primary_color: color }));
                              applyPrimaryColor(color);
                            }}
                            className="flex-1 relative transition-all focus:outline-none focus:z-10"
                            style={{ backgroundColor: color }}
                          >
                            {themeForm.primary_color.toLowerCase() === color.toLowerCase() && (
                              <span className="absolute inset-0 flex items-center justify-center">
                                <Check className="w-3.5 h-3.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" style={{ color: color < "#80" ? "#fff" : "#1a3a4a" }} />
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                      {/* Hex labels */}
                      <div className="flex">
                        {BRAND_PALETTE.map((color) => (
                          <span key={color} className="flex-1 text-center text-[9px] text-muted-foreground font-mono leading-none pt-1 truncate">{color}</span>
                        ))}
                      </div>
                    </div>

                    {/* Custom color picker */}
                    <div className="flex items-center gap-3">
                      <input type="color" value={themeForm.primary_color}
                        onChange={e => {
                          setThemeForm({ ...themeForm, primary_color: e.target.value });
                          applyPrimaryColor(e.target.value);
                        }}
                        className="w-10 h-10 rounded-lg border border-border cursor-pointer flex-shrink-0" />
                      <Input value={themeForm.primary_color}
                        onChange={e => {
                          setThemeForm({ ...themeForm, primary_color: e.target.value });
                          if (/^#[0-9a-f]{6}$/i.test(e.target.value)) applyPrimaryColor(e.target.value);
                        }}
                        className="w-36 font-mono" />
                      <div className="w-10 h-10 rounded-lg shadow-inner border border-border flex-shrink-0" style={{ backgroundColor: themeForm.primary_color }} />
                      <p className="text-xs text-muted-foreground">{i18n.language === "ar" ? "أو أدخل لونًا مخصصًا" : "Or pick a custom color"}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>{t("settings.style")}</Label>
                      <Select value={themeForm.style} onValueChange={v => setThemeForm({ ...themeForm, style: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {THEME_STYLES.map(s => <SelectItem key={s} value={s}>{t(`settings.styles.${s}`)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t("settings.fontFamily")}</Label>
                      <Select value={themeForm.font_family} onValueChange={v => setThemeForm({ ...themeForm, font_family: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Plus Jakarta Sans">Plus Jakarta Sans</SelectItem>
                          <SelectItem value="Inter">Inter</SelectItem>
                          <SelectItem value="Tajawal">Tajawal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Button onClick={handleSaveTheme} disabled={savingTheme} className="gap-2">
                    <Save className="w-4 h-4" />{savingTheme ? t("common.loading") : t("common.save")}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SECTIONS TAB */}
        <TabsContent value="sections">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-foreground">{t("settings.sections")}</h3>
                <p className="text-sm text-muted-foreground">{i18n.language === "ar" ? "أقسام الصفحة الرئيسية العامة" : "Landing page public sections"}</p>
              </div>
              <Button onClick={() => { setSectionForm(emptySection()); setCreateSectionOpen(true); }} className="gap-2">
                <Plus className="w-4 h-4" />{t("settings.addSection")}
              </Button>
            </div>

            {sectionsLoading ? (
              <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
            ) : sections?.length ? (
              <div className="space-y-2">
                {[...sections].sort((a, b) => a.order_index - b.order_index).map(section => (
                  <div key={section.id} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors">
                    <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">{section.title}</p>
                        {section.title_ar && <p className="text-xs text-muted-foreground truncate">({section.title_ar})</p>}
                        {!section.is_visible && <span className="text-xs text-muted-foreground italic">{t("common.inactive")}</span>}
                      </div>
                      {section.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{section.description}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditSection({ id: section.id, form: {
                        title: section.title, title_ar: section.title_ar || "", description: section.description || "",
                        description_ar: section.description_ar || "", order_index: section.order_index, is_visible: section.is_visible
                      }})}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteSectionId(section.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 border-2 border-dashed border-border rounded-xl text-muted-foreground">
                <Layout className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">{i18n.language === "ar" ? "لا توجد أقسام بعد" : "No sections yet"}</p>
                <Button variant="outline" onClick={() => setCreateSectionOpen(true)} className="mt-3">{t("settings.addSection")}</Button>
              </div>
            )}
          </div>
        </TabsContent>

        {/* DASHBOARD LAYOUT TAB */}
        <TabsContent value="dashboard">
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">{t("settings.dashboardLayout")}</h3>
              <p className="text-sm text-muted-foreground mt-0.5">{t("settings.dashboardSubtitle")}</p>
            </div>

            {configsLoading ? (
              <div className="space-y-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
            ) : (
              <div className="space-y-4">
                {ALL_ROLES.map(role => {
                  const currentWidgets = widgetDraft[role];
                  const saving = savingRole === role;
                  const msg = widgetMsg?.role === role ? widgetMsg : null;

                  return (
                    <Card key={role} className="border-border">
                      <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
                        <div className="flex items-center gap-3">
                          <Badge className={cn("text-xs px-2.5 py-0.5 font-semibold rounded-full border-0", ROLE_COLORS[role])}>
                            {t(`users.roles.${role}`)}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {currentWidgets.length}/{ALL_WIDGETS.length} {i18n.language === "ar" ? "عناصر" : "widgets"}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleSaveWidgets(role)}
                          disabled={saving}
                          className="gap-1.5 h-8 text-xs"
                        >
                          {saving ? (
                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Save className="w-3.5 h-3.5" />
                          )}
                          {saving ? t("common.loading") : t("common.save")}
                        </Button>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {ALL_WIDGETS.map(widget => {
                            const active = currentWidgets.includes(widget);
                            return (
                              <button
                                key={widget}
                                onClick={() => toggleWidget(role, widget)}
                                className={cn(
                                  "flex items-center gap-2 p-2.5 rounded-lg border text-xs font-medium transition-all text-start",
                                  active
                                    ? "border-primary bg-primary/5 text-primary"
                                    : "border-border text-muted-foreground hover:border-muted-foreground"
                                )}
                              >
                                <div className={cn(
                                  "w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border",
                                  active ? "bg-primary border-primary" : "border-border"
                                )}>
                                  {active && <Check className="w-2.5 h-2.5 text-white" />}
                                </div>
                                <span className="truncate">{t(`settings.widgets.${widget}`)}</span>
                              </button>
                            );
                          })}
                        </div>
                        {msg && (
                          <p className={cn("text-xs mt-3", msg.ok ? "text-emerald-600" : "text-destructive")}>
                            {msg.text}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Create section dialog */}
      <Dialog open={createSectionOpen} onOpenChange={setCreateSectionOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("settings.addSection")}</DialogTitle></DialogHeader>
          <SectionFormFields val={sectionForm} onChange={setSectionForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateSectionOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleCreateSection} disabled={savingSection || !sectionForm.title}>
              {savingSection ? t("common.loading") : t("settings.addSection")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit section dialog */}
      <Dialog open={!!editSection} onOpenChange={v => !v && setEditSection(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("settings.editSection")}</DialogTitle></DialogHeader>
          {editSection && <SectionFormFields val={editSection.form} onChange={f => setEditSection({ ...editSection, form: f })} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSection(null)}>{t("common.cancel")}</Button>
            <Button onClick={handleEditSection} disabled={savingSection}>{savingSection ? t("common.loading") : t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteSectionId} onOpenChange={v => !v && setDeleteSectionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.deleteSection")}</AlertDialogTitle>
            <AlertDialogDescription>{i18n.language === "ar" ? "هل أنت متأكد من حذف هذا القسم؟" : "Are you sure you want to delete this section?"}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSection} className="bg-destructive hover:bg-destructive/90">{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
