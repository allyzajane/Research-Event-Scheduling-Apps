import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useDropzone } from "react-dropzone";
import {
  useListDocuments, getListDocumentsQueryKey,
  useDeleteDocument, useGetDocumentStats, getGetDocumentStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import i18n from "i18next";
import {
  Upload, Search, Trash2, FileText, File, Image, Sheet,
  MoreHorizontal, Download, PenLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import SignDocumentDialog from "@/components/SignDocumentDialog";

const fileTypeIcons: Record<string, React.ElementType> = {
  pdf: FileText, excel: Sheet, csv: Sheet, word: File, image: Image, other: File,
};
const fileTypeColors: Record<string, string> = {
  pdf:   "text-red-500 bg-red-50 dark:bg-red-950",
  excel: "text-green-600 bg-green-50 dark:bg-green-950",
  csv:   "text-green-500 bg-green-50 dark:bg-green-950",
  word:  "text-blue-600 bg-blue-50 dark:bg-blue-950",
  image: "text-purple-500 bg-purple-50 dark:bg-purple-950",
  other: "text-gray-500 bg-gray-50 dark:bg-gray-800",
};

function formatSize(bytes: number) {
  if (bytes < 1024)          return `${bytes} B`;
  if (bytes < 1024 * 1024)   return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString(
    i18n.language === "ar" ? "ar-SA" : "en-US",
    { month: "short", day: "numeric", year: "numeric" },
  );
}

interface DocItem {
  id: string;
  title: string;
  file_name: string;
  file_type: string;
  file_size: number;
  file_url: string;
  description?: string | null;
  uploader_name?: string | null;
  created_at: string;
}

export default function DocumentsPage() {
  const { t }       = useTranslation();
  const { session } = useAuth();
  const qc          = useQueryClient();

  const [search, setSearch]         = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteId, setDeleteId]     = useState<string | null>(null);
  const [uploading, setUploading]   = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDesc, setUploadDesc]   = useState("");
  const [uploadError, setUploadError] = useState("");

  // Signing dialog state
  const [signDoc, setSignDoc] = useState<DocItem | null>(null);

  const params: Record<string, string | number> = { page: 1, limit: 50 };
  if (typeFilter !== "all") params.type = typeFilter;
  if (search) params.search = search;

  const { data: docList, isLoading } = useListDocuments(params, {
    query: { queryKey: getListDocumentsQueryKey(params) },
  });
  const { data: stats } = useGetDocumentStats({ query: { queryKey: getGetDocumentStatsQueryKey() } });
  const deleteDoc = useDeleteDocument();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetDocumentStatsQueryKey() });
  };

  const onDrop = useCallback((files: File[]) => {
    if (files[0]) {
      setPendingFile(files[0]);
      setUploadTitle(files[0].name.replace(/\.[^.]+$/, ""));
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, multiple: false,
    accept: {
      "application/pdf": [],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [],
      "application/vnd.ms-excel": [],
      "text/csv": [],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [],
      "application/msword": [],
      "image/*": [],
    },
  });

  const handleUpload = async () => {
    if (!pendingFile || !session) return;
    setUploading(true);
    setUploadError("");
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(pendingFile);
      });
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          file_base64: base64,
          file_name:   pendingFile.name,
          mime_type:   pendingFile.type,
          title:       uploadTitle || pendingFile.name,
          description: uploadDesc || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      invalidate();
      setUploadOpen(false);
      setPendingFile(null);
      setUploadTitle("");
      setUploadDesc("");
    } catch (err) {
      setUploadError(String(err));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteDoc.mutateAsync({ id: deleteId });
    invalidate();
    setDeleteId(null);
  };

  const docs: DocItem[] = (docList?.items ?? []) as DocItem[];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("documents.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("documents.subtitle")}</p>
        </div>
        <Button onClick={() => setUploadOpen(true)} className="gap-2">
          <Upload className="w-4 h-4" /> {t("documents.uploadDocument")}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="border-border"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("documents.stats.total")}</p>
          <p className="text-2xl font-bold mt-1">{stats?.total ?? 0}</p>
        </CardContent></Card>
        <Card className="border-border"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("documents.stats.totalSize")}</p>
          <p className="text-2xl font-bold mt-1">{stats ? formatSize(stats.total_size_bytes) : "—"}</p>
        </CardContent></Card>
        <Card className="border-border col-span-2 md:col-span-1"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">{t("common.type")}</p>
          <div className="flex flex-wrap gap-1.5">
            {stats?.by_type?.map(item => (
              <Badge key={item.type} variant="secondary" className="text-xs">
                {item.type}: {item.count}
              </Badge>
            ))}
          </div>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t("documents.searchPlaceholder")}
            className="ps-10"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("documents.types.all")}</SelectItem>
            {["pdf", "excel", "csv", "word", "image", "other"].map(t2 => (
              <SelectItem key={t2} value={t2}>{t(`documents.types.${t2}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Document grid */}
      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : docs.length ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {docs.map(doc => {
            const Icon       = fileTypeIcons[doc.file_type] || File;
            const colorClass = fileTypeColors[doc.file_type] || fileTypeColors.other;
            return (
              <div
                key={doc.id}
                className="group rounded-xl border border-border p-4 hover:border-primary/30 hover:shadow-sm transition-all bg-card"
              >
                <div className="flex items-start gap-3">
                  {/* File type icon */}
                  <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0", colorClass)}>
                    <Icon className="w-5 h-5" />
                  </div>

                  {/* Document info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{doc.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{doc.file_name}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge variant="secondary" className="text-xs px-1.5 h-4">
                        {doc.file_type.toUpperCase()}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{formatSize(doc.file_size)}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{formatDate(doc.created_at)}</span>
                    </div>
                  </div>

                  {/* Actions menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <a href={doc.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-2">
                          <Download className="w-3.5 h-3.5" />{t("common.download")}
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setSignDoc(doc)} className="gap-2">
                        <PenLine className="w-3.5 h-3.5" />{t("documents.signDocument")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setDeleteId(doc.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5 me-2" />{t("common.delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Sign button — always visible at card bottom */}
                <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1.5 text-xs h-7"
                    onClick={() => setSignDoc(doc)}
                  >
                    <PenLine className="w-3 h-3" />
                    {t("documents.signDocument")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    asChild
                  >
                    <a href={doc.file_url} target="_blank" rel="noreferrer" title={t("common.download")}>
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-20 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-base font-medium mb-1">{t("documents.noDocuments")}</p>
          <Button variant="outline" onClick={() => setUploadOpen(true)} className="mt-3">
            {t("documents.uploadDocument")}
          </Button>
        </div>
      )}

      {/* ── Sign Document Dialog ─────────────────────────────── */}
      <SignDocumentDialog
        open={!!signDoc}
        onClose={() => setSignDoc(null)}
        document={signDoc}
      />

      {/* ── Upload Dialog ────────────────────────────────────── */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("documents.uploadDocument")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div
              {...getRootProps()}
              className={cn(
                "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
                isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
              )}
            >
              <input {...getInputProps()} />
              <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
              {pendingFile ? (
                <p className="text-sm font-medium text-foreground">{pendingFile.name}</p>
              ) : (
                <>
                  <p className="text-sm font-medium text-foreground">{t("documents.dropzone")}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t("documents.dropzoneHint")}</p>
                </>
              )}
            </div>
            {pendingFile && (
              <>
                <div className="space-y-1.5">
                  <Label>{t("common.title")}</Label>
                  <Input value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("common.description")}</Label>
                  <Input value={uploadDesc} onChange={e => setUploadDesc(e.target.value)} />
                </div>
              </>
            )}
            {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setUploadOpen(false); setPendingFile(null); }}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleUpload} disabled={!pendingFile || uploading}>
              {uploading ? t("common.loading") : t("common.upload")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ───────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("documents.deleteDocument")}</AlertDialogTitle>
            <AlertDialogDescription>{t("documents.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
