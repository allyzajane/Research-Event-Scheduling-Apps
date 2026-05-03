import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import {
  useGetDocumentSignatures, getGetDocumentSignaturesQueryKey,
  useSignDocument,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  PenLine, Download, CheckCircle2, AlertCircle, UserCheck,
  Clock, ExternalLink, ShieldCheck,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { generateSigningCertificate } from "@/lib/generateSigningCertificate";
import type { CertSigner } from "@/lib/generateSigningCertificate";

interface Props {
  open: boolean;
  onClose: () => void;
  document: {
    id: string;
    title: string;
    file_url: string;
    file_type: string;
    description?: string | null;
    uploader_name?: string | null;
  } | null;
}

import { formatDateTimeAST } from "@/lib/ast";

function formatDate(d: string) {
  return formatDateTimeAST(d, "en");
}

export default function SignDocumentDialog({ open, onClose, document: doc }: Props) {
  const { t }    = useTranslation();
  const { user } = useAuth();
  const qc       = useQueryClient();

  const [notes, setNotes]       = useState("");
  const [signing, setSigning]   = useState(false);
  const [status, setStatus]     = useState<{ ok: boolean; msg: string } | null>(null);
  const [genPdf, setGenPdf]     = useState(false);

  const signaturesQuery = useGetDocumentSignatures(
    doc?.id ?? "",
    {
      query: {
        queryKey: getGetDocumentSignaturesQueryKey(doc?.id ?? ""),
        enabled: !!doc?.id && open,
      },
    },
  );
  const signMutation = useSignDocument();

  const sigs       = signaturesQuery.data?.signatures ?? [];
  const hasSigned  = sigs.some(s => s.user_id === user?.id);
  const mySig      = sigs.find(s => s.user_id === user?.id);
  const sigUrl     = user?.signature_url;

  const handleSign = async () => {
    if (!doc || !sigUrl || !user) return;
    setSigning(true);
    setStatus(null);
    try {
      await signMutation.mutateAsync({
        id: doc.id,
        data: { signature_url: sigUrl, notes: notes || null },
      });
      qc.invalidateQueries({ queryKey: getGetDocumentSignaturesQueryKey(doc.id) });
      setStatus({ ok: true, msg: t("documents.signedSuccess") });
    } catch {
      setStatus({ ok: false, msg: t("documents.signedFailed") });
    } finally {
      setSigning(false);
    }
  };

  const handleDownloadCert = async () => {
    if (!doc) return;
    setGenPdf(true);
    try {
      // Fetch fresh signatures
      const freshData = signaturesQuery.data;
      const certSigners: CertSigner[] = (freshData?.signatures ?? sigs).map(s => ({
        user_name:    s.user_name ?? null,
        user_role:    s.user_role,
        user_email:   s.user_email ?? null,
        signature_url: s.signature_url,
        notes:        s.notes ?? null,
        signed_at:    s.signed_at,
      }));
      await generateSigningCertificate({
        documentTitle:       doc.title,
        documentDescription: doc.description,
        documentUrl:         doc.file_url,
        signers:             certSigners,
      });
    } finally {
      setGenPdf(false);
    }
  };

  const handleClose = () => {
    setNotes("");
    setStatus(null);
    onClose();
  };

  if (!doc) return null;

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center flex-shrink-0">
              <PenLine className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            </div>
            {t("documents.signDocumentTitle")}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            {t("documents.signDocumentDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Document info pill */}
          <div className="flex items-start gap-3 px-3 py-3 rounded-xl bg-muted/60 border border-border">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{doc.title}</p>
              {doc.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{doc.description}</p>
              )}
              <a
                href={doc.file_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
              >
                <ExternalLink className="w-3 h-3" />
                {t("common.view")} {doc.file_type.toUpperCase()}
              </a>
            </div>
          </div>

          {/* Existing signers */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              {t("documents.signers")} ({sigs.length})
            </p>
            {signaturesQuery.isLoading ? (
              <div className="space-y-2">
                {[1, 2].map(i => <Skeleton key={i} className="h-12 rounded-xl" />)}
              </div>
            ) : sigs.length === 0 ? (
              <p className="text-sm text-muted-foreground italic px-1">{t("documents.noSigners")}</p>
            ) : (
              <div className="space-y-2">
                {sigs.map(s => (
                  <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border bg-card">
                    {/* Signature image thumbnail */}
                    <div className="w-16 h-8 rounded bg-white border border-border overflow-hidden flex-shrink-0 flex items-center justify-center">
                      <img
                        src={s.signature_url}
                        alt=""
                        className="max-w-full max-h-full object-contain"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {s.user_name || t("common.name")}
                        {s.user_id === user?.id && (
                          <Badge className="ms-2 text-xs py-0 px-1.5 bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300">You</Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">{s.user_role}</p>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                      <Clock className="w-3 h-3" />
                      {formatDate(s.signed_at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Already signed state OR sign form */}
          {hasSigned ? (
            <div className="flex items-start gap-3 px-3 py-3 rounded-xl bg-emerald-50 border border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800">
              <UserCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                  {t("documents.alreadySigned")}
                </p>
                {mySig && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {t("documents.signedOn")} {formatDate(mySig.signed_at)}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* User signature preview */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("documents.yourSignature")}</Label>
                {sigUrl ? (
                  <div className="rounded-xl border-2 border-dashed border-teal-200 dark:border-teal-800 bg-white dark:bg-slate-950 p-3 flex items-center justify-center min-h-[80px]">
                    <img
                      src={sigUrl}
                      alt="Your signature"
                      className="max-h-16 max-w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="rounded-xl border-2 border-dashed border-border bg-muted/30 p-4 text-center">
                    <p className="text-sm text-muted-foreground mb-2">{t("documents.noSignatureOnFile")}</p>
                    <a
                      href="/profile"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      {t("documents.goToProfile")}
                    </a>
                  </div>
                )}
              </div>

              {/* Notes */}
              {sigUrl && (
                <div className="space-y-1.5">
                  <Label>{t("documents.notes")}</Label>
                  <Textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder={t("documents.notesPlaceholder")}
                    rows={2}
                    className="resize-none"
                  />
                </div>
              )}
            </>
          )}

          {/* Status message */}
          {status && (
            <div className={cn(
              "flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium",
              status.ok
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
            )}>
              {status.ok
                ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                : <AlertCircle className="w-4 h-4 flex-shrink-0" />
              }
              {status.msg}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          {/* Download certificate — show when there are signers */}
          {sigs.length > 0 && (
            <Button
              variant="outline"
              onClick={handleDownloadCert}
              disabled={genPdf}
              className="gap-2"
            >
              {genPdf
                ? <div className="w-4 h-4 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
                : <Download className="w-4 h-4" />
              }
              {t("documents.downloadCertificate")}
            </Button>
          )}

          <Button variant="outline" onClick={handleClose}>{t("common.close")}</Button>

          {/* Sign button — only if user hasn't signed yet and has a signature on file */}
          {!hasSigned && sigUrl && (
            <Button
              onClick={handleSign}
              disabled={signing || !!status?.ok}
              className="gap-2"
            >
              {signing
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <PenLine className="w-4 h-4" />
              }
              {signing ? t("documents.signing") : t("documents.confirmSign")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
