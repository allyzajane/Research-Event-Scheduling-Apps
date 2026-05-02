import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useListArticles, getListArticlesQueryKey,
  useCreateArticle, useUpdateArticle, useDeleteArticle
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import i18n from "i18next";
import { PlusCircle, Search, Pencil, Trash2, MoreHorizontal, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface ArticleForm {
  title: string; title_ar: string; content: string; content_ar: string;
  excerpt: string; excerpt_ar: string; cover_image_url: string; is_published: boolean;
}

const emptyForm = (): ArticleForm => ({
  title: "", title_ar: "", content: "", content_ar: "",
  excerpt: "", excerpt_ar: "", cover_image_url: "", is_published: false
});

function formatDate(d: string) {
  return new Date(d).toLocaleDateString(i18n.language === "ar" ? "ar-SA" : "en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ArticlesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editArticle, setEditArticle] = useState<{ id: string; form: ArticleForm } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<ArticleForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  const params: Record<string, string | number | boolean> = { page: 1, limit: 50 };
  if (statusFilter === "published") params.is_published = true;
  if (statusFilter === "draft") params.is_published = false;
  if (search) params.search = search;

  const { data: articleList, isLoading } = useListArticles(params, {
    query: { queryKey: getListArticlesQueryKey(params) }
  });
  const createArticle = useCreateArticle();
  const updateArticle = useUpdateArticle();
  const deleteArticle = useDeleteArticle();

  const invalidate = () => qc.invalidateQueries({ queryKey: getListArticlesQueryKey() });

  const handleCreate = async () => {
    setSaving(true);
    try {
      await createArticle.mutateAsync({ data: {
        title: form.title, title_ar: form.title_ar || null, content: form.content,
        content_ar: form.content_ar || null, excerpt: form.excerpt || null,
        excerpt_ar: form.excerpt_ar || null, cover_image_url: form.cover_image_url || null,
        is_published: form.is_published
      }});
      invalidate(); setCreateOpen(false); setForm(emptyForm());
    } finally { setSaving(false); }
  };

  const handleEdit = async () => {
    if (!editArticle) return;
    setSaving(true);
    try {
      await updateArticle.mutateAsync({ id: editArticle.id, data: {
        title: editArticle.form.title, title_ar: editArticle.form.title_ar || null,
        content: editArticle.form.content, content_ar: editArticle.form.content_ar || null,
        excerpt: editArticle.form.excerpt || null, excerpt_ar: editArticle.form.excerpt_ar || null,
        cover_image_url: editArticle.form.cover_image_url || null, is_published: editArticle.form.is_published
      }});
      invalidate(); setEditArticle(null);
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteArticle.mutateAsync({ id: deleteId });
    invalidate(); setDeleteId(null);
  };

  const articles = articleList?.items || [];

  const ArticleFormFields = ({ val, onChange }: { val: ArticleForm; onChange: (v: ArticleForm) => void }) => (
    <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pe-1">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{t("articles.titleLabel")} *</Label>
          <Input value={val.title} onChange={e => onChange({...val, title: e.target.value})} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("articles.titleArLabel")}</Label>
          <Input value={val.title_ar} onChange={e => onChange({...val, title_ar: e.target.value})} dir="rtl" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{t("articles.excerptLabel")}</Label>
          <Input value={val.excerpt} onChange={e => onChange({...val, excerpt: e.target.value})} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("articles.excerptArLabel")}</Label>
          <Input value={val.excerpt_ar} onChange={e => onChange({...val, excerpt_ar: e.target.value})} dir="rtl" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>{t("articles.contentLabel")} *</Label>
        <Textarea value={val.content} onChange={e => onChange({...val, content: e.target.value})} rows={4} />
      </div>
      <div className="space-y-1.5">
        <Label>{t("articles.contentArLabel")}</Label>
        <Textarea value={val.content_ar} onChange={e => onChange({...val, content_ar: e.target.value})} rows={4} dir="rtl" />
      </div>
      <div className="space-y-1.5">
        <Label>{t("articles.coverImage")}</Label>
        <Input value={val.cover_image_url} onChange={e => onChange({...val, cover_image_url: e.target.value})} placeholder="https://..." />
      </div>
      <div className="flex items-center gap-3">
        <Switch checked={val.is_published} onCheckedChange={v => onChange({...val, is_published: v})} />
        <Label>{t("articles.isPublished")}</Label>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("articles.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("articles.subtitle")}</p>
        </div>
        <Button onClick={() => { setForm(emptyForm()); setCreateOpen(true); }} className="gap-2">
          <PlusCircle className="w-4 h-4" /> {t("articles.createArticle")}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("articles.searchPlaceholder")} className="ps-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all")}</SelectItem>
            <SelectItem value="published">{t("common.published")}</SelectItem>
            <SelectItem value="draft">{t("common.draft")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Articles grid */}
      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      ) : articles.length ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {articles.map(article => (
            <Card key={article.id} className="group border-border hover:border-primary/30 hover:shadow-sm transition-all overflow-hidden">
              {article.cover_image_url && (
                <div className="h-36 overflow-hidden bg-muted">
                  <img src={article.cover_image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                </div>
              )}
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge variant={article.is_published ? "default" : "secondary"} className="text-xs px-1.5 h-4">
                        {article.is_published ? t("common.published") : t("common.draft")}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{formatDate(article.created_at)}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
                      {i18n.language === "ar" && article.title_ar ? article.title_ar : article.title}
                    </h3>
                    {(article.excerpt || article.excerpt_ar) && (
                      <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                        {i18n.language === "ar" && article.excerpt_ar ? article.excerpt_ar : article.excerpt}
                      </p>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditArticle({ id: article.id, form: {
                        title: article.title, title_ar: article.title_ar || "", content: article.content,
                        content_ar: article.content_ar || "", excerpt: article.excerpt || "",
                        excerpt_ar: article.excerpt_ar || "", cover_image_url: article.cover_image_url || "",
                        is_published: article.is_published
                      }})}>
                        <Pencil className="w-3.5 h-3.5 me-2" />{t("common.edit")}
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(article.id)}>
                        <Trash2 className="w-3.5 h-3.5 me-2" />{t("common.delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 text-muted-foreground">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-base font-medium mb-1">{t("articles.noArticles")}</p>
          <Button variant="outline" onClick={() => setCreateOpen(true)} className="mt-3">{t("articles.createArticle")}</Button>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{t("articles.createArticle")}</DialogTitle></DialogHeader>
          <ArticleFormFields val={form} onChange={setForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleCreate} disabled={saving || !form.title || !form.content}>
              {saving ? t("common.loading") : t("articles.createArticle")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editArticle} onOpenChange={v => !v && setEditArticle(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{t("articles.editArticle")}</DialogTitle></DialogHeader>
          {editArticle && <ArticleFormFields val={editArticle.form} onChange={f => setEditArticle({ ...editArticle, form: f })} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditArticle(null)}>{t("common.cancel")}</Button>
            <Button onClick={handleEdit} disabled={saving}>{saving ? t("common.loading") : t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("articles.deleteArticle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("articles.deleteConfirm")}</AlertDialogDescription>
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
