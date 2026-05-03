import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  PenLine, ImageIcon, Star, Upload, Trash2, AlertCircle, CheckCircle2,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─── Compression helper (same MAX_KB as DualSignaturePanel) ───────────────
const MAX_KB = 450;

async function compressFile(file: File): Promise<{ base64: string; mimeType: string; sizeKB: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.naturalWidth, h = img.naturalHeight;
        const maxDim = 1400;
        if (w > maxDim || h > maxDim) { const r = Math.min(maxDim / w, maxDim / h); w = Math.round(w * r); h = Math.round(h * r); }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        let q = 0.92, result = canvas.toDataURL("image/jpeg", q);
        let sizeKB = Math.round(result.length * 0.75 / 1024);
        while (sizeKB > MAX_KB && q > 0.2) { q -= 0.08; result = canvas.toDataURL("image/jpeg", q); sizeKB = Math.round(result.length * 0.75 / 1024); }
        resolve({ base64: result.split(",")[1], mimeType: "image/jpeg", sizeKB });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

// ─── Types ────────────────────────────────────────────────────────────────

interface TargetUser {
  id:    string;
  name:  string;
  email: string;
  signature_url?:         string | null;
  signature_drawn_url?:   string | null;
  signature_active_type?: string | null;
}

interface Props {
  open:         boolean;
  onClose:      () => void;
  user:         TargetUser | null;
  sessionToken: string;
  onUpdated?:   () => void;
}

// ─── Single sig card inside the admin dialog ──────────────────────────────

function AdminSigCard({
  label, icon: Icon, sigUrl, isActive, sigType, userId, sessionToken, onUpdated,
}: {
  label: string; icon: React.ElementType; sigUrl: string | null | undefined;
  isActive: boolean; sigType: "uploaded" | "drawn";
  userId: string; sessionToken: string;
  onUpdated: (data: { url?: string | null; active?: string }) => void;
}) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing,  setRemoving]  = useState(false);
  const [settingActive, setSettingActive] = useState(false);
  const [compressing, setCompressing]     = useState(false);
  const [preview, setPreview]             = useState<{ base64: string; mimeType: string; sizeKB: number } | null>(null);
  const [msg, setMsg]                     = useState<{ ok: boolean; text: string } | null>(null);

  const patchUrl  = `/api/admin/users/${userId}/signatures`;
  const uploadUrl = `/api/admin/users/${userId}/upload-signature`;

  const handleFile = async (file: File) => {
    setCompressing(true); setMsg(null);
    try { setPreview(await compressFile(file)); } catch { setMsg({ ok: false, text: t("adminSig.failed") }); }
    finally { setCompressing(false); }
  };

  const handleUploadConfirm = async () => {
    if (!preview) return;
    setUploading(true); setMsg(null);
    try {
      const r = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${sessionToken}` },
        body: JSON.stringify({ file_base64: preview.base64, file_name: `signature.${preview.mimeType.split("/")[1] || "jpg"}`, mime_type: preview.mimeType, sig_type: sigType }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Upload failed");
      const { url } = await r.json();
      onUpdated({ url, active: sigType });
      setMsg({ ok: true, text: t("adminSig.saved") });
      setPreview(null);
    } catch (e) { setMsg({ ok: false, text: String(e) }); }
    finally { setUploading(false); }
  };

  const handleRemove = async () => {
    setRemoving(true); setMsg(null);
    try {
      const body = sigType === "uploaded" ? { remove_uploaded: true } : { remove_drawn: true };
      const r = await fetch(patchUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${sessionToken}` },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Remove failed");
      onUpdated({ url: null });
      setMsg({ ok: true, text: t("adminSig.saved") });
    } catch { setMsg({ ok: false, text: t("adminSig.failed") }); }
    finally { setRemoving(false); }
  };

  const handleSetActive = async () => {
    setSettingActive(true); setMsg(null);
    try {
      const r = await fetch(patchUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${sessionToken}` },
        body: JSON.stringify({ signature_active_type: sigType }),
      });
      if (!r.ok) throw new Error("Failed");
      onUpdated({ active: sigType });
      setMsg({ ok: true, text: t("adminSig.saved") });
    } catch { setMsg({ ok: false, text: t("adminSig.failed") }); }
    finally { setSettingActive(false); }
  };

  return (
    <div className={cn("rounded-2xl border-2 p-4 space-y-3 flex-1",
      isActive ? "border-teal-400 dark:border-teal-600 bg-teal-50/30 dark:bg-teal-950/20" : "border-border bg-card"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center",
            isActive ? "bg-teal-100 dark:bg-teal-900" : "bg-muted"
          )}>
            <Icon className={cn("w-3.5 h-3.5", isActive ? "text-teal-600 dark:text-teal-400" : "text-muted-foreground")} />
          </div>
          <span className="text-sm font-semibold">{label}</span>
        </div>
        {isActive && (
          <Badge className="text-xs px-2 py-0 bg-teal-500 text-white gap-1">
            <Star className="w-2.5 h-2.5" />{t("adminSig.active")}
          </Badge>
        )}
      </div>

      {/* Preview */}
      <div className={cn("min-h-[70px] rounded-xl border border-border flex items-center justify-center",
        sigUrl ? "bg-white dark:bg-slate-950 p-2" : "bg-muted/30"
      )}>
        {sigUrl
          ? <img src={`${sigUrl}?t=${Date.now()}`} alt="" className="max-h-16 max-w-full object-contain" />
          : <p className="text-xs text-muted-foreground italic">{t("adminSig.noSig")}</p>
        }
      </div>

      {/* Pending upload preview */}
      {preview && (
        <div className="space-y-2">
          <div className="rounded-xl bg-white dark:bg-slate-950 border border-border p-2 flex items-center justify-center">
            <img src={`data:${preview.mimeType};base64,${preview.base64}`} className="max-h-14 max-w-full object-contain" alt="Preview" />
          </div>
          <div className="flex items-center justify-between">
            <span className={cn("text-xs font-medium", preview.sizeKB > MAX_KB ? "text-red-500" : "text-emerald-600")}>
              {preview.sizeKB} KB
            </span>
            <div className="flex gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => setPreview(null)} className="h-7 text-xs">{t("common.cancel")}</Button>
              <Button size="sm" onClick={handleUploadConfirm} disabled={uploading || preview.sizeKB > MAX_KB} className="h-7 text-xs gap-1">
                {uploading && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {t("common.save")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {compressing && <p className="text-xs text-muted-foreground">{t("profile.signatureCompressing")}</p>}

      {/* Status */}
      {msg && (
        <div className={cn("flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium",
          msg.ok ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                 : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
        )}>
          {msg.ok ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
          {msg.text}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-1.5">
        {!isActive && sigUrl && (
          <Button size="sm" variant="outline" onClick={handleSetActive} disabled={settingActive} className="h-7 text-xs gap-1">
            <Star className="w-3 h-3" />{t("adminSig.setActive")}
          </Button>
        )}
        <Button
          size="sm" variant="outline"
          onClick={() => { setMsg(null); setPreview(null); fileRef.current?.click(); }}
          disabled={compressing || uploading}
          className="h-7 text-xs gap-1"
        >
          <Upload className="w-3 h-3" />{sigUrl ? t("adminSig.replace") : t("profile.signatureUpload")}
        </Button>
        {sigUrl && (
          <Button size="sm" variant="ghost" onClick={handleRemove} disabled={removing}
            className="h-7 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            {removing
              ? <div className="w-3 h-3 border-2 border-destructive border-t-transparent rounded-full animate-spin" />
              : <Trash2 className="w-3 h-3" />
            }
            {t("adminSig.remove")}
          </Button>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />
    </div>
  );
}

// ─── Main Dialog ──────────────────────────────────────────────────────────

export default function AdminSignatureDialog({ open, onClose, user, sessionToken, onUpdated }: Props) {
  const { t } = useTranslation();
  const [sigData, setSigData] = useState({
    signature_url:         user?.signature_url         ?? null,
    signature_drawn_url:   user?.signature_drawn_url   ?? null,
    signature_active_type: user?.signature_active_type ?? "uploaded",
  });

  // Sync when user prop changes
  const prevUserId = useRef<string | null>(null);
  if (user && user.id !== prevUserId.current) {
    prevUserId.current = user.id;
    setSigData({
      signature_url:         user.signature_url         ?? null,
      signature_drawn_url:   user.signature_drawn_url   ?? null,
      signature_active_type: user.signature_active_type ?? "uploaded",
    });
  }

  const handleUpdateUploaded = (data: { url?: string | null; active?: string }) => {
    setSigData(prev => ({
      ...prev,
      signature_url:         data.url !== undefined ? data.url : prev.signature_url,
      signature_active_type: data.active || prev.signature_active_type,
    }));
    onUpdated?.();
  };

  const handleUpdateDrawn = (data: { url?: string | null; active?: string }) => {
    setSigData(prev => ({
      ...prev,
      signature_drawn_url:   data.url !== undefined ? data.url : prev.signature_drawn_url,
      signature_active_type: data.active || prev.signature_active_type,
    }));
    onUpdated?.();
  };

  if (!user) return null;
  const initials = user.name.slice(0, 2).toUpperCase();
  const activeType = sigData.signature_active_type || "uploaded";

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center flex-shrink-0">
              <PenLine className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            </div>
            {t("adminSig.title")}
          </DialogTitle>
          <DialogDescription>{t("adminSig.desc")}</DialogDescription>
        </DialogHeader>

        {/* User pill */}
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-muted/60 border border-border">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold text-primary">{initials}</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
        </div>

        {/* Two sig cards */}
        <div className="flex flex-col sm:flex-row gap-4">
          <AdminSigCard
            label={t("adminSig.uploadedSig")}
            icon={ImageIcon}
            sigUrl={sigData.signature_url}
            isActive={activeType === "uploaded"}
            sigType="uploaded"
            userId={user.id}
            sessionToken={sessionToken}
            onUpdated={handleUpdateUploaded}
          />
          <AdminSigCard
            label={t("adminSig.drawnSig")}
            icon={PenLine}
            sigUrl={sigData.signature_drawn_url}
            isActive={activeType === "drawn"}
            sigType="drawn"
            userId={user.id}
            sessionToken={sessionToken}
            onUpdated={handleUpdateDrawn}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
