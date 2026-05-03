import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { formatDateTimeAST } from "@/lib/ast";
import i18n from "i18next";
import {
  Megaphone, Send, Clock, Users, Bell, ChevronDown,
  FileText, BookOpen, Calendar, User, Cpu, Check, X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ROLES = ["all", "admin", "ceo", "director", "doctor", "nurse", "staff"] as const;
const TYPES = ["system", "document", "article", "event", "user"] as const;

type Role = typeof ROLES[number];
type NotifType = typeof TYPES[number];

const typeIcons: Record<NotifType, React.ElementType> = {
  system:   Cpu,
  document: FileText,
  article:  BookOpen,
  event:    Calendar,
  user:     User,
};

const roleBadgeColors: Record<string, string> = {
  all:      "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  admin:    "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  ceo:      "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  director: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  doctor:   "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  nurse:    "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  staff:    "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

interface BroadcastItem {
  id: string;
  title: string;
  title_ar?: string | null;
  body: string;
  body_ar?: string | null;
  type: string;
  target_role: string;
  recipient_count: number;
  created_at: string;
  link?: string | null;
}

interface FormState {
  titleEn: string;
  titleAr: string;
  bodyEn: string;
  bodyAr: string;
  targetRole: Role;
  notifType: NotifType;
  link: string;
}

export default function NotificationBroadcastPage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const isAr = i18n.language === "ar";

  const [form, setForm] = useState<FormState>({
    titleEn: "", titleAr: "", bodyEn: "", bodyAr: "",
    targetRole: "all", notifType: "system", link: "",
  });
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [history, setHistory] = useState<BroadcastItem[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const update = (key: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm(prev => ({ ...prev, [key]: e.target.value }));

  const loadHistory = async () => {
    if (!session || loadingHistory) return;
    setLoadingHistory(true);
    try {
      const r = await fetch("/api/notifications/broadcast", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (r.ok) {
        const data = await r.json();
        setHistory(data.items || []);
        setHistoryLoaded(true);
      }
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSend = async () => {
    if (!session || !form.titleEn || !form.bodyEn) return;
    setSending(true);
    setMsg(null);
    try {
      const r = await fetch("/api/notifications/broadcast", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          title:       form.titleEn,
          title_ar:    form.titleAr || null,
          body:        form.bodyEn,
          body_ar:     form.bodyAr  || null,
          type:        form.notifType,
          target_role: form.targetRole,
          link:        form.link || null,
        }),
      });

      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "Send failed" }));
        throw new Error(err.error || "Send failed");
      }

      const { recipient_count } = await r.json();
      setMsg({ ok: true, text: t("broadcast.sent", { count: recipient_count }) });

      // Reset form
      setForm({ titleEn: "", titleAr: "", bodyEn: "", bodyAr: "", targetRole: "all", notifType: "system", link: "" });

      // Refresh history if it was already open
      if (historyLoaded) loadHistory();
    } catch (e) {
      setMsg({ ok: false, text: t("broadcast.sendFailed") });
    } finally {
      setSending(false);
    }
  };

  const previewTitle = isAr ? (form.titleAr || form.titleEn) : form.titleEn;
  const previewBody  = isAr ? (form.bodyAr  || form.bodyEn)  : form.bodyEn;
  const hasPreview   = previewTitle || previewBody;
  const TypeIcon     = typeIcons[form.notifType];

  const formatDate = (iso: string) => formatDateTimeAST(iso, isAr ? "ar" : "en");

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Megaphone className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t("broadcast.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("broadcast.subtitle")}</p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Compose form — 3 cols */}
        <Card className="lg:col-span-3 border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Send className="w-4 h-4" /> {t("broadcast.compose")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Audience + Type row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("broadcast.targetRole")}</Label>
                <Select
                  value={form.targetRole}
                  onValueChange={v => setForm(prev => ({ ...prev, targetRole: v as Role }))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map(r => (
                      <SelectItem key={r} value={r}>
                        {r === "all" ? t("broadcast.targetAll") : t(`users.roles.${r}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("broadcast.notifType")}</Label>
                <Select
                  value={form.notifType}
                  onValueChange={v => setForm(prev => ({ ...prev, notifType: v as NotifType }))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map(tp => (
                      <SelectItem key={tp} value={tp}>
                        {t(`broadcast.type${tp.charAt(0).toUpperCase() + tp.slice(1)}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Titles */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("broadcast.titleEn")}</Label>
                <Input value={form.titleEn} onChange={update("titleEn")} placeholder="Important update…" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("broadcast.titleAr")}</Label>
                <Input value={form.titleAr} onChange={update("titleAr")} dir="rtl" placeholder="تحديث مهم…" />
              </div>
            </div>

            {/* Bodies */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("broadcast.messageEn")}</Label>
                <Textarea
                  value={form.bodyEn}
                  onChange={update("bodyEn")}
                  placeholder="Message body in English…"
                  rows={4}
                  className="resize-none"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("broadcast.messageAr")}</Label>
                <Textarea
                  value={form.bodyAr}
                  onChange={update("bodyAr")}
                  dir="rtl"
                  placeholder="نص الرسالة بالعربية…"
                  rows={4}
                  className="resize-none"
                />
              </div>
            </div>

            {/* Optional link */}
            <div className="space-y-1.5">
              <Label className="text-xs">{t("broadcast.link")}</Label>
              <Input
                value={form.link}
                onChange={update("link")}
                placeholder={t("broadcast.linkPlaceholder")}
              />
            </div>

            {/* Status message */}
            {msg && (
              <div className={cn(
                "flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium",
                msg.ok
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                  : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
              )}>
                {msg.ok ? <Check className="w-4 h-4 flex-shrink-0" /> : <X className="w-4 h-4 flex-shrink-0" />}
                {msg.text}
              </div>
            )}

            {/* Send button */}
            <Button
              className="w-full gap-2"
              disabled={sending || !form.titleEn || !form.bodyEn}
              onClick={handleSend}
            >
              {sending
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Send className="w-4 h-4" />
              }
              {sending ? t("broadcast.sending") : t("broadcast.send")}
            </Button>
          </CardContent>
        </Card>

        {/* Preview — 2 cols */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground font-medium">
                <Bell className="w-3.5 h-3.5" />{t("broadcast.preview")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {hasPreview ? (
                <div className="rounded-xl border border-border bg-card p-4 space-y-2 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <TypeIcon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {previewTitle && (
                        <p className="text-sm font-semibold text-foreground leading-tight"
                           dir={isAr ? "rtl" : "ltr"}>
                          {previewTitle}
                        </p>
                      )}
                      {previewBody && (
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed"
                           dir={isAr ? "rtl" : "ltr"}>
                          {previewBody}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Badge className={cn("text-xs", roleBadgeColors[form.targetRole])}>
                      {form.targetRole === "all" ? t("broadcast.targetAll") : t(`users.roles.${form.targetRole}`)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {t(`broadcast.type${form.notifType.charAt(0).toUpperCase() + form.notifType.slice(1)}`)}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-6 italic">
                  {t("broadcast.previewEmpty")}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Broadcast History */}
      <Card className="border-border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4" />{t("broadcast.history")}
            </CardTitle>
            {!historyLoaded && (
              <Button variant="ghost" size="sm" onClick={loadHistory} disabled={loadingHistory}
                className="text-xs gap-1 text-muted-foreground">
                {loadingHistory
                  ? <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  : <ChevronDown className="w-3 h-3" />
                }
                {t("common.load")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {!historyLoaded ? (
            <p className="text-sm text-muted-foreground text-center py-8 italic">
              {t("common.clickToLoad")}
            </p>
          ) : history.length === 0 ? (
            <div className="text-center py-10">
              <Megaphone className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">{t("broadcast.noHistory")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map(item => {
                const TIcon = typeIcons[item.type as NotifType] || Cpu;
                const displayTitle = isAr ? (item.title_ar || item.title) : item.title;
                const displayBody  = isAr ? (item.body_ar  || item.body)  : item.body;
                return (
                  <div key={item.id}
                    className="flex items-start gap-3 p-3 rounded-xl border border-border hover:bg-muted/40 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <TIcon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-foreground truncate"
                           dir={isAr ? "rtl" : "ltr"}>{displayTitle}</p>
                        <Badge className={cn("text-xs flex-shrink-0", roleBadgeColors[item.target_role])}>
                          {item.target_role === "all"
                            ? t("broadcast.targetAll")
                            : t(`users.roles.${item.target_role}`)}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate"
                         dir={isAr ? "rtl" : "ltr"}>{displayBody}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="w-3 h-3" />
                          {t("broadcast.recipients", { count: item.recipient_count })}
                        </span>
                        <span className="text-xs text-muted-foreground">{formatDate(item.created_at)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
