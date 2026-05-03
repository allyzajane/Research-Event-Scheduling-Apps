import { useRef, useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import SignaturePad from "signature_pad";
import { PenLine, Upload, Trash2, Save, RotateCcw, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

interface Props {
  currentUrl: string | null | undefined;
  sessionToken: string;
  onSaved: (url: string | null) => void;
}

type Tab = "draw" | "upload";

export default function SignaturePanel({ currentUrl, sessionToken, onSaved }: Props) {
  const { t } = useTranslation();
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const padRef        = useRef<SignaturePad | null>(null);
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const [tab, setTab]           = useState<Tab>("draw");
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState<{ ok: boolean; text: string } | null>(null);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadFile, setUploadFile]       = useState<File | null>(null);

  // Init/resize the signature pad whenever the draw tab is active
  const initPad = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width  = canvas.offsetWidth  * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(ratio, ratio);

    if (padRef.current) padRef.current.off();
    padRef.current = new SignaturePad(canvas, {
      backgroundColor: "rgba(0,0,0,0)",
      penColor: "#0f172a",
      minWidth: 1,
      maxWidth: 3,
    });
    padRef.current.addEventListener("endStroke", () => {
      setHasDrawing(!padRef.current!.isEmpty());
    });
  }, []);

  useEffect(() => {
    if (tab !== "draw") return;
    const t = setTimeout(initPad, 60);
    return () => clearTimeout(t);
  }, [tab, initPad]);

  // Destroy pad on unmount
  useEffect(() => () => { padRef.current?.off(); }, []);

  const handleClear = () => {
    padRef.current?.clear();
    setHasDrawing(false);
    setMsg(null);
  };

  const handleFileSelect = (file: File) => {
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml"];
    if (!allowed.includes(file.type)) {
      setMsg({ ok: false, text: t("profile.signatureUnsupported") });
      return;
    }
    setMsg(null);
    setUploadFile(file);
    const reader = new FileReader();
    reader.onload = e => setUploadPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const uploadToServer = useCallback(async (base64: string, fileName: string, mimeType: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || sessionToken;
    const r = await fetch("/api/auth/upload-signature", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ file_base64: base64, file_name: fileName, mime_type: mimeType }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: "Upload failed" }));
      throw new Error(err.error || "Upload failed");
    }
    return (await r.json()) as { url: string };
  }, [sessionToken]);

  const handleSaveDraw = async () => {
    if (!padRef.current || padRef.current.isEmpty()) return;
    setSaving(true);
    setMsg(null);
    try {
      const dataUrl = padRef.current.toDataURL("image/png");
      const base64  = dataUrl.split(",")[1];
      const { url } = await uploadToServer(base64, "signature.png", "image/png");
      onSaved(url);
      setMsg({ ok: true, text: t("profile.signatureSaved") });
    } catch {
      setMsg({ ok: false, text: t("profile.signatureFailed") });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveUpload = async () => {
    if (!uploadFile) return;
    setSaving(true);
    setMsg(null);
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res((reader.result as string).split(",")[1]);
        reader.onerror = rej;
        reader.readAsDataURL(uploadFile);
      });
      const { url } = await uploadToServer(base64, uploadFile.name, uploadFile.type);
      onSaved(url);
      setMsg({ ok: true, text: t("profile.signatureSaved") });
      setUploadPreview(null);
      setUploadFile(null);
    } catch {
      setMsg({ ok: false, text: t("profile.signatureFailed") });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || sessionToken;
      const r = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ signature_url: null }),
      });
      if (!r.ok) throw new Error("Failed");
      onSaved(null);
      setMsg({ ok: true, text: t("profile.signatureSaved") });
    } catch {
      setMsg({ ok: false, text: t("profile.signatureFailed") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Current signature preview */}
      <div className="flex items-start gap-4">
        <div className={cn(
          "flex-1 min-h-[80px] rounded-xl border-2 border-dashed flex items-center justify-center",
          currentUrl ? "border-border bg-muted/20 p-3" : "border-muted"
        )}>
          {currentUrl ? (
            <img
              src={`${currentUrl}?t=${Date.now()}`}
              alt="Current signature"
              className="max-h-20 max-w-full object-contain"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <p className="text-sm text-muted-foreground italic">{t("profile.signatureNone")}</p>
          )}
        </div>
        {currentUrl && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            disabled={saving}
            className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5 flex-shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t("profile.signatureRemove")}
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl bg-muted/60 p-1 gap-1">
        {(["draw", "upload"] as Tab[]).map(t2 => (
          <button
            key={t2}
            onClick={() => { setTab(t2); setMsg(null); }}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all",
              tab === t2
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t2 === "draw"
              ? <><PenLine className="w-3.5 h-3.5" />{t("profile.signatureDraw")}</>
              : <><Upload className="w-3.5 h-3.5" />{t("profile.signatureUpload")}</>
            }
          </button>
        ))}
      </div>

      {/* Draw tab */}
      {tab === "draw" && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{t("profile.signatureDrawHint")}</p>
          <div className="relative rounded-xl border-2 border-dashed border-border bg-white dark:bg-slate-950 overflow-hidden"
               style={{ height: 160 }}>
            <canvas
              ref={canvasRef}
              className="w-full h-full touch-none cursor-crosshair"
              style={{ width: "100%", height: "100%" }}
            />
            {/* Baseline visual hint */}
            <div className="absolute bottom-10 inset-x-6 border-b border-dashed border-muted-foreground/20 pointer-events-none" />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              disabled={!hasDrawing || saving}
              className="gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {t("profile.signatureClear")}
            </Button>
            <Button
              size="sm"
              onClick={handleSaveDraw}
              disabled={!hasDrawing || saving}
              className="gap-1.5 ms-auto"
            >
              {saving
                ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Save className="w-3.5 h-3.5" />
              }
              {saving ? t("profile.signatureSaving") : t("profile.signatureSave")}
            </Button>
          </div>
        </div>
      )}

      {/* Upload tab */}
      {tab === "upload" && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{t("profile.signatureUploadHint")}</p>
          <div
            className="relative rounded-xl border-2 border-dashed border-border bg-muted/30 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-all"
            style={{ minHeight: 120 }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) handleFileSelect(f);
            }}
          >
            {uploadPreview ? (
              <img
                src={uploadPreview}
                alt="Preview"
                className="max-h-24 max-w-full object-contain p-2"
              />
            ) : (
              <>
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Upload className="w-5 h-5 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground font-medium">Click or drag to upload</p>
                <p className="text-xs text-muted-foreground">PNG, JPG, SVG</p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/svg+xml"
              className="hidden"
              onChange={e => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
            />
          </div>
          {uploadPreview && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setUploadPreview(null); setUploadFile(null); }}
                disabled={saving}
                className="gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {t("profile.signatureClear")}
              </Button>
              <Button
                size="sm"
                onClick={handleSaveUpload}
                disabled={saving}
                className="gap-1.5 ms-auto"
              >
                {saving
                  ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Save className="w-3.5 h-3.5" />
                }
                {saving ? t("profile.signatureSaving") : t("profile.signatureSave")}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Status message */}
      {msg && (
        <div className={cn(
          "flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium",
          msg.ok
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
            : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
        )}>
          {msg.ok
            ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            : <AlertCircle className="w-4 h-4 flex-shrink-0" />
          }
          {msg.text}
        </div>
      )}
    </div>
  );
}
