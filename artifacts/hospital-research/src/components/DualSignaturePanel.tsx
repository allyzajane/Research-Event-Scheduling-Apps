import { useRef, useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import SignaturePad from "signature_pad";
import {
  Upload, RotateCcw, Save, Trash2, PenLine, CheckCircle2,
  AlertCircle, Star, FileImage, ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────

interface Props {
  uploadedUrl:  string | null | undefined;
  drawnUrl:     string | null | undefined;
  activeType:   string | null | undefined;
  sessionToken: string;
  onUpdated:    (data: {
    uploaded_url?: string | null;
    drawn_url?:    string | null;
    active_type?:  string;
  }) => void;
  // Optional: override user ID for admin mode
  targetUserId?: string;
}

type SlotMode = "idle" | "replace" | "draw";

// ─── Client-side image compression ───────────────────────────────────────

const MAX_KB = 450;

async function compressFile(file: File): Promise<{ base64: string; mimeType: string; sizeKB: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const dataUrl = reader.result as string;
      if (file.type === "image/svg+xml") {
        const b64 = dataUrl.split(",")[1];
        resolve({ base64: b64, mimeType: "image/svg+xml", sizeKB: Math.round(b64.length * 0.75 / 1024) });
        return;
      }
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.naturalWidth, h = img.naturalHeight;
        const maxDim = 1400;
        if (w > maxDim || h > maxDim) {
          const r = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * r); h = Math.round(h * r);
        }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        let q = 0.92;
        let result = canvas.toDataURL("image/jpeg", q);
        let sizeKB = Math.round(result.length * 0.75 / 1024);
        while (sizeKB > MAX_KB && q > 0.2) {
          q -= 0.08;
          result = canvas.toDataURL("image/jpeg", q);
          sizeKB = Math.round(result.length * 0.75 / 1024);
        }
        resolve({ base64: result.split(",")[1], mimeType: "image/jpeg", sizeKB });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

function compressDrawnPad(pad: SignaturePad): { base64: string; mimeType: string; sizeKB: number } {
  let dataUrl = pad.toDataURL("image/png");
  let sizeKB  = Math.round(dataUrl.length * 0.75 / 1024);
  if (sizeKB <= MAX_KB) {
    return { base64: dataUrl.split(",")[1], mimeType: "image/png", sizeKB };
  }
  // Too big → rasterise with white background as JPEG
  const tmp = document.createElement("canvas");
  const src = (pad as unknown as { _canvas: HTMLCanvasElement })._canvas;
  tmp.width = src.width; tmp.height = src.height;
  const ctx = tmp.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, tmp.width, tmp.height);
  ctx.drawImage(src, 0, 0);
  let q = 0.92;
  dataUrl = tmp.toDataURL("image/jpeg", q);
  sizeKB  = Math.round(dataUrl.length * 0.75 / 1024);
  while (sizeKB > MAX_KB && q > 0.2) {
    q -= 0.08; dataUrl = tmp.toDataURL("image/jpeg", q);
    sizeKB = Math.round(dataUrl.length * 0.75 / 1024);
  }
  return { base64: dataUrl.split(",")[1], mimeType: "image/jpeg", sizeKB };
}

// ─── Individual Slot ──────────────────────────────────────────────────────

interface SlotProps {
  label:       string;
  hint:        string;
  icon:        React.ElementType;
  sigUrl:      string | null | undefined;
  isActive:    boolean;
  sessionToken:string;
  sigType:     "uploaded" | "drawn";
  targetPath:  string; // /auth/upload-signature or /admin/users/:id/upload-signature
  patchPath:   string; // /auth/me or /admin/users/:id/signatures
  onSaved:     (url: string | null, wasDeleted?: boolean) => void;
  onSetActive: () => void;
}

function SignatureSlot({
  label, hint, icon: Icon, sigUrl, isActive,
  sessionToken, sigType, targetPath, patchPath,
  onSaved, onSetActive,
}: SlotProps) {
  const { t } = useTranslation();
  const [mode, setMode]               = useState<SlotMode>("idle");
  const [saving, setSaving]           = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [preview, setPreview]         = useState<{ base64: string; mimeType: string; sizeKB: number } | null>(null);
  const [hasDrawing, setHasDrawing]   = useState(false);
  const [msg, setMsg]                 = useState<{ ok: boolean; text: string } | null>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const padRef     = useRef<SignaturePad | null>(null);
  const fileRef    = useRef<HTMLInputElement>(null);

  const initPad = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    c.width  = c.offsetWidth  * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d");
    if (ctx) ctx.scale(ratio, ratio);
    if (padRef.current) padRef.current.off();
    padRef.current = new SignaturePad(c, {
      backgroundColor: "rgba(0,0,0,0)", penColor: "#0f172a", minWidth: 1.2, maxWidth: 3,
    });
    padRef.current.addEventListener("endStroke", () => setHasDrawing(!padRef.current!.isEmpty()));
  }, []);

  useEffect(() => {
    if (mode !== "draw") return;
    const id = setTimeout(initPad, 60);
    return () => clearTimeout(id);
  }, [mode, initPad]);
  useEffect(() => () => { padRef.current?.off(); }, []);

  const reset = () => { setMode("idle"); setPreview(null); setMsg(null); setHasDrawing(false); };

  const handleFile = async (file: File) => {
    setCompressing(true); setMsg(null);
    try {
      const compressed = await compressFile(file);
      setPreview(compressed);
    } catch {
      setMsg({ ok: false, text: t("profile.signatureFailed") });
    } finally { setCompressing(false); }
  };

  const uploadData = async (base64: string, mimeType: string) => {
    setSaving(true); setMsg(null);
    try {
      const r = await fetch(targetPath, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${sessionToken}` },
        body: JSON.stringify({ file_base64: base64, file_name: `signature.${mimeType.split("/")[1] || "png"}`, mime_type: mimeType, sig_type: sigType }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Upload failed");
      }
      const { url } = await r.json();
      onSaved(url);
      setMsg({ ok: true, text: t("profile.signatureSaved") });
      reset();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : t("profile.signatureFailed") });
    } finally { setSaving(false); }
  };

  const handleSaveUpload = () => { if (preview) uploadData(preview.base64, preview.mimeType); };

  const handleSaveDraw = () => {
    if (!padRef.current || padRef.current.isEmpty()) return;
    const { base64, mimeType } = compressDrawnPad(padRef.current);
    uploadData(base64, mimeType);
  };

  const handleDelete = async () => {
    setDeleting(true); setMsg(null);
    try {
      const body = sigType === "uploaded"
        ? (patchPath.includes("/admin/") ? { remove_uploaded: true } : { signature_url: null })
        : (patchPath.includes("/admin/") ? { remove_drawn: true } : { signature_drawn_url: null });
      const r = await fetch(patchPath, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${sessionToken}` },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Delete failed");
      onSaved(null, true);
      setMsg({ ok: true, text: t("profile.signatureDeleted") });
    } catch {
      setMsg({ ok: false, text: t("profile.signatureFailed") });
    } finally { setDeleting(false); }
  };

  const existingUrl = sigUrl;

  return (
    <div className={cn(
      "rounded-2xl border-2 p-4 flex flex-col gap-3 transition-all",
      isActive
        ? "border-teal-400 dark:border-teal-600 bg-teal-50/40 dark:bg-teal-950/20"
        : "border-border bg-card"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center",
            isActive ? "bg-teal-100 dark:bg-teal-900" : "bg-muted"
          )}>
            <Icon className={cn("w-3.5 h-3.5", isActive ? "text-teal-600 dark:text-teal-400" : "text-muted-foreground")} />
          </div>
          <span className="text-sm font-semibold text-foreground">{label}</span>
        </div>
        {isActive && (
          <Badge className="text-xs px-2 py-0 bg-teal-500 text-white gap-1">
            <Star className="w-2.5 h-2.5" />{t("profile.signatureActive")}
          </Badge>
        )}
      </div>

      {/* Preview */}
      <div className={cn(
        "min-h-[80px] rounded-xl flex items-center justify-center overflow-hidden border border-border",
        existingUrl ? "bg-white dark:bg-slate-950 p-2" : "bg-muted/30"
      )}>
        {existingUrl ? (
          <img
            src={`${existingUrl}?t=${Date.now()}`}
            alt={label}
            className="max-h-20 max-w-full object-contain"
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <p className="text-xs text-muted-foreground italic">{t("profile.signatureNone")}</p>
        )}
      </div>

      {/* Replace / Draw mode */}
      {mode === "replace" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{hint}</p>
          {preview ? (
            <div className="space-y-2">
              <div className="rounded-xl bg-white dark:bg-slate-950 border border-border p-2 flex items-center justify-center">
                <img src={`data:${preview.mimeType};base64,${preview.base64}`} className="max-h-16 max-w-full object-contain" alt="Preview" />
              </div>
              <div className="flex items-center justify-between">
                <span className={cn("text-xs font-medium", preview.sizeKB > MAX_KB ? "text-red-500" : "text-emerald-600")}>
                  {preview.sizeKB} KB {preview.sizeKB > MAX_KB && `(over ${MAX_KB} KB limit)`}
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>{t("common.cancel")}</Button>
                  <Button size="sm" onClick={handleSaveUpload} disabled={saving || preview.sizeKB > MAX_KB} className="gap-1.5">
                    {saving ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    {saving ? t("profile.signatureSaving") : t("common.save")}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div
              className="border-2 border-dashed border-border rounded-xl p-5 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            >
              {compressing ? (
                <p className="text-xs text-muted-foreground">{t("profile.signatureCompressing")}</p>
              ) : (
                <>
                  <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Click or drop PNG, JPG, WebP</p>
                  <p className="text-xs text-muted-foreground opacity-60 mt-0.5">{t("profile.signatureSizeLimit")}</p>
                </>
              )}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
              />
            </div>
          )}
          {!preview && <Button size="sm" variant="ghost" className="w-full text-xs" onClick={reset}>{t("common.cancel")}</Button>}
        </div>
      )}

      {mode === "draw" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t("profile.signatureDrawnHint")}</p>
          <div className="relative rounded-xl border-2 border-dashed border-border bg-white dark:bg-slate-950 overflow-hidden" style={{ height: 150 }}>
            <canvas ref={canvasRef} className="w-full h-full touch-none cursor-crosshair" style={{ width: "100%", height: "100%" }} />
            <div className="absolute bottom-8 inset-x-6 border-b border-dashed border-muted-foreground/20 pointer-events-none" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { padRef.current?.clear(); setHasDrawing(false); }} disabled={!hasDrawing || saving} className="gap-1">
              <RotateCcw className="w-3 h-3" />{t("profile.signatureClear")}
            </Button>
            <Button size="sm" variant="ghost" onClick={reset}>{t("common.cancel")}</Button>
            <Button size="sm" onClick={handleSaveDraw} disabled={!hasDrawing || saving} className="gap-1 ms-auto">
              {saving ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-3 h-3" />}
              {saving ? t("profile.signatureSaving") : t("profile.signatureSave")}
            </Button>
          </div>
        </div>
      )}

      {/* Status */}
      {msg && (
        <div className={cn("flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium",
          msg.ok ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                 : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
        )}>
          {msg.ok ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
          {msg.text}
        </div>
      )}

      {/* Actions */}
      {mode === "idle" && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {!isActive && (
            <Button size="sm" variant="outline" onClick={onSetActive} className="gap-1.5 text-xs h-7">
              <Star className="w-3 h-3" />{t("profile.signatureSetActive")}
            </Button>
          )}
          {sigType === "uploaded" ? (
            <Button size="sm" variant="outline" onClick={() => { setMsg(null); setMode("replace"); }} className="gap-1.5 text-xs h-7">
              <FileImage className="w-3 h-3" />{existingUrl ? t("profile.signatureReplace") : t("profile.signatureUpload")}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => { setMsg(null); setMode("draw"); }} className="gap-1.5 text-xs h-7">
              <PenLine className="w-3 h-3" />{existingUrl ? t("profile.signatureReplaceDraw") : t("profile.signatureDraw")}
            </Button>
          )}
          {existingUrl && (
            <Button size="sm" variant="ghost" onClick={handleDelete} disabled={deleting}
              className="gap-1.5 text-xs h-7 text-destructive hover:text-destructive hover:bg-destructive/10">
              {deleting ? <div className="w-3 h-3 border-2 border-destructive border-t-transparent rounded-full animate-spin" /> : <Trash2 className="w-3 h-3" />}
              {t("profile.signatureDelete")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main DualSignaturePanel ──────────────────────────────────────────────

export default function DualSignaturePanel({ uploadedUrl, drawnUrl, activeType, sessionToken, onUpdated, targetUserId }: Props) {
  const { t } = useTranslation();
  const [localActive, setLocalActive] = useState(activeType || "uploaded");
  const [settingActive, setSettingActive] = useState(false);
  const [activeMsg, setActiveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { if (activeType) setLocalActive(activeType); }, [activeType]);

  const basePath = targetUserId ? `/api/admin/users/${targetUserId}` : "/api/auth";

  const setActive = async (type: "uploaded" | "drawn") => {
    setSettingActive(true); setActiveMsg(null);
    try {
      const patchPath = targetUserId ? `/api/admin/users/${targetUserId}/signatures` : "/api/auth/me";
      const body      = targetUserId ? { signature_active_type: type } : { signature_active_type: type };
      const r = await fetch(patchPath, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${sessionToken}` },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Failed");
      setLocalActive(type);
      onUpdated({ active_type: type });
      setActiveMsg({ ok: true, text: t("profile.signatureActiveSet") });
    } catch {
      setActiveMsg({ ok: false, text: t("profile.signatureFailed") });
    } finally { setSettingActive(false); }
  };

  const uploadPath = `${basePath}/${targetUserId ? "upload-signature" : "upload-signature"}`;
  const patchPath  = targetUserId ? `/api/admin/users/${targetUserId}/signatures` : "/api/auth/me";

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800">
        <Star className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 dark:text-blue-300">{t("profile.signatureActiveInfo")}</p>
      </div>

      {settingActive && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          {t("profile.signatureActiveSet")}…
        </div>
      )}
      {activeMsg && (
        <div className={cn("flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium",
          activeMsg.ok ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                       : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
        )}>
          {activeMsg.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
          {activeMsg.text}
        </div>
      )}

      {/* Two slots */}
      <div className="grid md:grid-cols-2 gap-4">
        <SignatureSlot
          label={t("profile.signatureUploadedLabel")}
          hint={t("profile.signatureUploadedHint")}
          icon={ImageIcon}
          sigUrl={uploadedUrl}
          isActive={localActive === "uploaded"}
          sessionToken={sessionToken}
          sigType="uploaded"
          targetPath={uploadPath}
          patchPath={patchPath}
          onSaved={(url, wasDeleted) => {
            onUpdated({ uploaded_url: url });
            if (!wasDeleted && url) { setLocalActive("uploaded"); onUpdated({ active_type: "uploaded" }); }
          }}
          onSetActive={() => setActive("uploaded")}
        />
        <SignatureSlot
          label={t("profile.signatureDrawnLabel")}
          hint={t("profile.signatureDrawnHint")}
          icon={PenLine}
          sigUrl={drawnUrl}
          isActive={localActive === "drawn"}
          sessionToken={sessionToken}
          sigType="drawn"
          targetPath={uploadPath}
          patchPath={patchPath}
          onSaved={(url, wasDeleted) => {
            onUpdated({ drawn_url: url });
            if (!wasDeleted && url) { setLocalActive("drawn"); onUpdated({ active_type: "drawn" }); }
          }}
          onSetActive={() => setActive("drawn")}
        />
      </div>
    </div>
  );
}
