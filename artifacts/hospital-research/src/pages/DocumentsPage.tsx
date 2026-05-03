import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useDropzone } from "react-dropzone";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useListDocuments, getListDocumentsQueryKey,
  useDeleteDocument, useGetDocumentStats, getGetDocumentStatsQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import i18n from "i18next";
import {
  Upload, Search, Trash2, FileText, File, Image, Sheet,
  MoreHorizontal, Download, PenLine, ShieldCheck, Lock, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import SignDocumentDialog from "@/components/SignDocumentDialog";
import { formatDateAST } from "@/lib/ast";

const ADMIN_ROLES = ["admin", "ceo", "director"];
const ROLE_BG: Record<string, string> = {
  admin: "bg-teal-500", ceo: "bg-purple-500", director: "bg-indigo-500",
  doctor: "bg-blue-500", nurse: "bg-pink-500", staff: "bg-gray-400",
};

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
  return formatDateAST(d, i18n.language === "ar" ? "ar" : "en");
}

interface DocItem {
  id: string;
  title: string;
  file_name: string;
  file_type: string;
  file_size: number;
  file_url: string | null;   // null = user has no download permission
  can_download: boolean;
  description?: string | null;
  uploader_name?: string | null;
  created_at: string;
}

interface PermUser {
  user_id: string;
  full_name: string | null;
  email: string;
  role: string;
  can_download: boolean;
}

export default function DocumentsPage() {
  const { t }                = useTranslation();
  const { session, isAdmin } = useAuth();
  const qc                   = useQueryClient();
  const isAr                 = i18n.language === "ar";

  const [search, setSearch]         = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteId, setDeleteId]     = useState<string | null>(null);
  const [uploading, setUploading]   = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDesc, setUploadDesc]   = useState("");
  const [uploadError, setUploadError] = useState("");

  const [signDoc, setSignDoc]             = useState<DocItem | null>(null);
  const [manageAccessDoc, setManageAccessDoc] = useState<DocItem | null>(null);
  const [docPerms, setDocPerms]           = useState<PermUser[]>([]);
  const [loadingPerms, setLoadingPerms]   = useState(false);
  const [togglingPerm, setTogglingPerm]   = useState<string | null>(null);

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
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
        body: JSON.stringify({
          file_base64: base64, file_name: pendingFile.name,
          mime_type: pendingFile.type, title: uploadTitle || pendingFile.name,
          description: uploadDesc || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      invalidate();
      setUploadOpen(false); setPendingFile(null); setUploadTitle(""); setUploadDesc("");
    } catch (err) { setUploadError(String(err)); }
    finally { setUploading(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteDoc.mutateAsync({ id: deleteId });
    invalidate(); setDeleteId(null);
  };

  async function openManageAccess(doc: DocItem) {
    if (!session) return;
    setManageAccessDoc(doc); setDocPerms([]); setLoadingPerms(true);
    try {
      const r = await fetch(`/api/documents/${doc.id}/download-permissions`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (r.ok) setDocPerms(await r.json() as PermUser[]);
    } finally { setLoadingPerms(false); }
  }

  async function togglePermission(userId: string, currentCanDownload: boolean) {
    if (!manageAccessDoc || !session) return;
    setTogglingPerm(userId);
    try {
      if (!currentCanDownload) {
        await fetch(`/api/documents/${manageAccessDoc.id}/grant-download`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ user_ids: [userId] }),
        });
      } else {
        await fetch(`/api/documents/${manageAccessDoc.id}/revoke-download/${userId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
      }
      setDocPerms(prev => prev.map(p => p.user_id === userId ? { ...p, can_download: !currentCanDownload } : p));
      qc.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
    } finally { setTogglingPerm(null); }
  }

  const docs: DocItem[] = (docList?.items ?? []) as unknown as DocItem[];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("documents.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("documents.subtitle")}</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setUploadOpen(true)} className="gap-2">
            <Upload className="w-4 h-4" /> {t("documents.uploadDocument")}
          </Button>
        )}
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
              <Badge key={item.type} variant="secondary" className="text-xs">{item.type}: {item.count}</Badge>
            ))}
          </div>
        </CardContent></Card>
      </div>

      {/* Read-only notice for non-admins */}
      {!isAdmin && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
          <Lock className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-400">
            {isAr
              ? "أنت في وضع القراءة فقط. يمكنك تنزيل الملفات الممنوحة لك فقط من قِبل المسؤول."
              : "Read-only access. You can only download files that an admin has explicitly granted you."}
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("documents.searchPlaceholder")} className="ps-10" />
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
            const canDl      = doc.can_download && !!doc.file_url;
            return (
              <div key={doc.id} className="group rounded-xl border border-border p-4 hover:border-primary/30 hover:shadow-sm transition-all bg-card">
                <div className="flex items-start gap-3">
                  <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0", colorClass)}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{doc.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{doc.file_name}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge variant="secondary" className="text-xs px-1.5 h-4">{doc.file_type.toUpperCase()}</Badge>
                      <span className="text-xs text-muted-foreground">{formatSize(doc.file_size)}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{formatDate(doc.created_at)}</span>
                    </div>
                  </div>

                  {/* Actions dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canDl ? (
                        <DropdownMenuItem asChild>
                          <a href={doc.file_url!} target="_blank" rel="noreferrer" className="flex items-center gap-2">
                            <Download className="w-3.5 h-3.5" />{t("common.download")}
                          </a>
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem disabled className="gap-2 text-muted-foreground">
                          <Lock className="w-3.5 h-3.5" />
                          {isAr ? "لا يوجد إذن تنزيل" : "No download access"}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => setSignDoc(doc)} className="gap-2">
                        <PenLine className="w-3.5 h-3.5" />{t("documents.signDocument")}
                      </DropdownMenuItem>
                      {isAdmin && (
                        <>
                          <DropdownMenuItem onClick={() => void openManageAccess(doc)} className="gap-2">
                            <ShieldCheck className="w-3.5 h-3.5" />{isAr ? "إدارة الوصول" : "Manage Access"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(doc.id)}>
                            <Trash2 className="w-3.5 h-3.5 me-2" />{t("common.delete")}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Card footer */}
                <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
                  <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs h-7" onClick={() => setSignDoc(doc)}>
                    <PenLine className="w-3 h-3" />{t("documents.signDocument")}
                  </Button>

                  {canDl ? (
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" asChild>
                      <a href={doc.file_url!} target="_blank" rel="noreferrer" title={t("common.download")}>
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-30 cursor-not-allowed" disabled title={isAr ? "لا يوجد إذن" : "No access"}>
                      <Lock className="w-3.5 h-3.5" />
                    </Button>
                  )}

                  {isAdmin && (
                    <Button
                      variant="ghost" size="sm"
                      className="h-7 w-7 p-0 text-primary hover:text-primary"
                      onClick={() => void openManageAccess(doc)}
                      title={isAr ? "إدارة الوصول" : "Manage Access"}
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-20 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-base font-medium mb-1">{t("documents.noDocuments")}</p>
          {isAdmin && (
            <Button variant="outline" onClick={() => setUploadOpen(true)} className="mt-3">
              {t("documents.uploadDocument")}
            </Button>
          )}
        </div>
      )}

      {/* ── Sign Document Dialog ─────────────────────────── */}
      <SignDocumentDialog open={!!signDoc} onClose={() => setSignDoc(null)} document={signDoc} />

      {/* ── Manage Access Dialog (admin only) ────────────── */}
      <Dialog open={!!manageAccessDoc} onOpenChange={v => !v && setManageAccessDoc(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              {isAr ? "إدارة صلاحيات التنزيل" : "Manage Download Access"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {isAr
                ? `تحكم في من يمكنه تنزيل "${manageAccessDoc?.title}". يمكن للمسؤولين دائماً التنزيل.`
                : `Control who can download "${manageAccessDoc?.title}". Admins always have full access.`}
            </DialogDescription>
          </DialogHeader>

          <div className="py-1">
            {loadingPerms ? (
              <div className="space-y-3 px-1">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="w-8 h-8 rounded-full" />
                    <div className="flex-1"><Skeleton className="h-3.5 w-32 mb-1.5" /><Skeleton className="h-3 w-24" /></div>
                    <Skeleton className="h-5 w-9 rounded-full" />
                  </div>
                ))}
              </div>
            ) : docPerms.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">{isAr ? "لا يوجد مستخدمون" : "No users found"}</p>
              </div>
            ) : (
              <ScrollArea className="max-h-[360px]">
                <div className="space-y-0.5 pe-2">
                  {docPerms.map(u => {
                    const isAdminUser = ADMIN_ROLES.includes(u.role);
                    return (
                      <div
                        key={u.user_id}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                          isAdminUser ? "opacity-60" : "hover:bg-muted/40",
                        )}
                      >
                        <Avatar className="w-8 h-8 flex-shrink-0">
                          <AvatarFallback className={cn("text-xs font-bold text-white", ROLE_BG[u.role] ?? "bg-gray-400")}>
                            {(u.full_name || u.email).slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {u.full_name || "—"}
                            {isAdminUser && (
                              <span className="ms-1.5 text-[10px] font-semibold text-primary uppercase tracking-wide">
                                {isAr ? "(مسؤول)" : "(admin)"}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                        {isAdminUser ? (
                          <Badge className="text-[10px] bg-primary/10 text-primary border-0 flex-shrink-0">
                            {isAr ? "وصول دائم" : "Always"}
                          </Badge>
                        ) : (
                          <Switch
                            checked={u.can_download}
                            disabled={togglingPerm === u.user_id}
                            onCheckedChange={() => void togglePermission(u.user_id, u.can_download)}
                            className="flex-shrink-0"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>

          <DialogFooter>
            <p className="text-xs text-muted-foreground me-auto flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              {(() => {
                const accessCount = docPerms.filter(p => p.can_download || ADMIN_ROLES.includes(p.role)).length;
                return isAr ? `${accessCount} من ${docPerms.length} لديهم وصول` : `${accessCount} of ${docPerms.length} have access`;
              })()}
            </p>
            <Button onClick={() => setManageAccessDoc(null)}>{isAr ? "إغلاق" : "Close"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Upload Dialog (admin only) ────────────────────── */}
      {isAdmin && (
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
              <Button variant="outline" onClick={() => { setUploadOpen(false); setPendingFile(null); }}>{t("common.cancel")}</Button>
              <Button onClick={handleUpload} disabled={!pendingFile || uploading}>
                {uploading ? t("common.loading") : t("common.upload")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Delete Confirm ────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("documents.deleteDocument")}</AlertDialogTitle>
            <AlertDialogDescription>{t("documents.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
