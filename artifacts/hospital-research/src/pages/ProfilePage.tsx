import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import i18n from "i18next";
import {
  User, Mail, Shield, Building, Camera, Save, Pencil, X, Check,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const roleColors: Record<string, string> = {
  admin:    "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  ceo:      "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  director: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  doctor:   "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  nurse:    "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  staff:    "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

interface ProfileForm {
  full_name: string;
  full_name_ar: string;
  department: string;
  avatar_url: string;
}

export default function ProfilePage() {
  const { t } = useTranslation();
  const { user, session, updateUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ProfileForm>({
    full_name: "", full_name_ar: "", department: "", avatar_url: "",
  });
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setForm({
        full_name:    user.full_name    || "",
        full_name_ar: user.full_name_ar || "",
        department:   user.department   || "",
        avatar_url:   user.avatar_url   || "",
      });
      setAvatarPreview(user.avatar_url || null);
    }
  }, [user]);

  if (!user) return null;

  const isAr = i18n.language === "ar";
  const displayName = isAr && user.full_name_ar ? user.full_name_ar : user.full_name || user.email;
  const initials = user.full_name
    ? user.full_name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
    : user.email.slice(0, 2).toUpperCase();

  const handleAvatarFile = async (file: File) => {
    if (!session) return;
    setUploadingAvatar(true);
    setMsg(null);
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res((reader.result as string).split(",")[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });

      const r = await fetch("/api/auth/upload-avatar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ file_base64: base64, file_name: file.name, mime_type: file.type }),
      });

      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Upload failed");
      }

      const { url } = await r.json();
      setForm(prev => ({ ...prev, avatar_url: url }));
      setAvatarPreview(url);
      updateUser({ avatar_url: url });
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    if (!session) return;
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          full_name:    form.full_name    || null,
          full_name_ar: form.full_name_ar || null,
          department:   form.department   || null,
          avatar_url:   form.avatar_url   || null,
        }),
      });

      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "Save failed" }));
        throw new Error(err.error || "Save failed");
      }

      const updated = await r.json();
      updateUser({
        full_name:    updated.full_name    ?? undefined,
        full_name_ar: updated.full_name_ar ?? undefined,
        department:   updated.department   ?? undefined,
        avatar_url:   updated.avatar_url   ?? undefined,
      });
      setMsg({ ok: true, text: t("profile.saved") });
      setEditing(false);
    } catch (e) {
      setMsg({ ok: false, text: t("profile.saveFailed") });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm({
      full_name:    user.full_name    || "",
      full_name_ar: user.full_name_ar || "",
      department:   user.department   || "",
      avatar_url:   user.avatar_url   || "",
    });
    setAvatarPreview(user.avatar_url || null);
    setMsg(null);
    setEditing(false);
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("profile.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("profile.subtitle")}</p>
        </div>
        {!editing ? (
          <Button onClick={() => { setMsg(null); setEditing(true); }} variant="outline" className="gap-2">
            <Pencil className="w-4 h-4" />
            {t("profile.editProfile")}
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={handleCancel} className="gap-2">
              <X className="w-4 h-4" />{t("common.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Save className="w-4 h-4" />
              }
              {saving ? t("profile.saving") : t("common.save")}
            </Button>
          </div>
        )}
      </div>

      {/* Avatar + name card */}
      <Card className="border-border">
        <CardContent className="p-8">
          <div className="flex flex-col items-center text-center">
            {/* Avatar */}
            <div className="relative mb-5 group">
              <div className="w-24 h-24 rounded-2xl bg-primary flex items-center justify-center shadow-md overflow-hidden">
                {uploadingAvatar ? (
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                    onError={() => setAvatarPreview(null)}
                  />
                ) : (
                  <span className="text-2xl font-bold text-white">{initials}</span>
                )}
              </div>

              {editing && (
                <>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 rounded-2xl bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <Camera className="w-5 h-5 text-white mb-1" />
                    <span className="text-white text-xs font-medium">{t("profile.changePhoto")}</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    className="hidden"
                    onChange={e => e.target.files?.[0] && handleAvatarFile(e.target.files[0])}
                  />
                </>
              )}
            </div>

            {editing && (
              <p className="text-xs text-muted-foreground mb-4">{t("profile.avatarHint")}</p>
            )}

            <h2 className="text-xl font-bold text-foreground">{displayName}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{user.email}</p>
            <Badge className={cn("mt-3 text-sm px-3 py-1", roleColors[user.role])}>
              {t(`users.roles.${user.role}`)}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Account details / edit form */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {editing ? t("profile.personalInfo") : t("profile.accountDetails")}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {editing ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{t("profile.fullName")}</Label>
                  <Input
                    value={form.full_name}
                    onChange={e => setForm(prev => ({ ...prev, full_name: e.target.value }))}
                    placeholder="Dr. Mohammed Al-Harbi"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("profile.fullNameAr")}</Label>
                  <Input
                    value={form.full_name_ar}
                    dir="rtl"
                    onChange={e => setForm(prev => ({ ...prev, full_name_ar: e.target.value }))}
                    placeholder="د. محمد الحربي"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>{t("profile.department")}</Label>
                <Input
                  value={form.department}
                  onChange={e => setForm(prev => ({ ...prev, department: e.target.value }))}
                  placeholder={isAr ? "مثال: طب الأطفال" : "e.g. Pediatrics"}
                />
              </div>

              {/* Read-only fields */}
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs">{t("common.email")}</Label>
                  <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">{user.email}</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs">{t("common.role")}</Label>
                  <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">{t(`users.roles.${user.role}`)}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-0">
              {[
                { icon: Mail,     label: t("common.email"),      value: user.email },
                { icon: Shield,   label: t("common.role"),       value: t(`users.roles.${user.role}`) },
                ...(user.department   ? [{ icon: Building, label: t("profile.department"),  value: user.department }]   : []),
                ...(user.full_name    ? [{ icon: User,     label: t("profile.fullName"),    value: user.full_name }]    : []),
                ...(user.full_name_ar ? [{ icon: User,     label: t("profile.fullNameAr"),  value: user.full_name_ar }] : []),
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 py-3 border-b border-border last:border-0">
                  <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    <item.icon className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="text-sm font-medium text-foreground">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status message */}
      {msg && (
        <div className={cn(
          "flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium",
          msg.ok
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
            : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
        )}>
          {msg.ok ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
          {msg.text}
        </div>
      )}
    </div>
  );
}
