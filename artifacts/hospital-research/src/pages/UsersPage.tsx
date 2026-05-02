import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useListUsers, getListUsersQueryKey,
  useCreateUser, useUpdateUser, useDeleteUser,
  useGetUserStats, getGetUserStatsQueryKey,
  useResetUserPassword,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import i18n from "i18next";
import { UserPlus, Search, Pencil, Trash2, MoreHorizontal, Users, KeyRound, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const ROLES = ["admin", "ceo", "director", "doctor", "nurse", "staff"];

const roleColors: Record<string, string> = {
  admin: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  ceo: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  director: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  doctor: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  nurse: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  staff: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

interface UserForm {
  email: string; password: string; full_name: string;
  full_name_ar: string; role: string; department: string; is_active: boolean;
}

const emptyForm = (): UserForm => ({
  email: "", password: "", full_name: "", full_name_ar: "",
  role: "staff", department: "", is_active: true
});

export default function UsersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<{ id: string; form: UserForm } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<{ id: string; email: string } | null>(null);
  const [resetStatus, setResetStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  const params: Record<string, string> = {};
  if (roleFilter !== "all") params.role = roleFilter;
  if (search) params.search = search;

  const { data: users, isLoading } = useListUsers(params, {
    query: { queryKey: getListUsersQueryKey(params) }
  });
  const { data: stats } = useGetUserStats({ query: { queryKey: getGetUserStatsQueryKey() } });
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const resetPassword = useResetUserPassword();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
    qc.invalidateQueries({ queryKey: getGetUserStatsQueryKey() });
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      await createUser.mutateAsync({ data: {
        email: form.email, password: form.password, full_name: form.full_name,
        full_name_ar: form.full_name_ar || null, role: form.role,
        department: form.department || null
      }});
      invalidate(); setCreateOpen(false); setForm(emptyForm());
    } finally { setSaving(false); }
  };

  const handleEdit = async () => {
    if (!editUser) return;
    setSaving(true);
    try {
      await updateUser.mutateAsync({ id: editUser.id, data: {
        full_name: editUser.form.full_name, full_name_ar: editUser.form.full_name_ar || null,
        role: editUser.form.role, department: editUser.form.department || null,
        is_active: editUser.form.is_active
      }});
      invalidate(); setEditUser(null);
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteUser.mutateAsync({ id: deleteId });
    invalidate(); setDeleteId(null);
  };

  const handleResetPassword = async () => {
    if (!resetPasswordUser) return;
    try {
      await resetPassword.mutateAsync({ id: resetPasswordUser.id });
      setResetStatus({ ok: true, msg: isAr ? `تم إرسال رابط إعادة التعيين إلى ${resetPasswordUser.email}` : `Reset link sent to ${resetPasswordUser.email}` });
    } catch {
      setResetStatus({ ok: false, msg: isAr ? "فشل إرسال البريد الإلكتروني" : "Failed to send reset email" });
    }
    setResetPasswordUser(null);
  };

  const isAr = i18n.language === "ar";

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("users.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("users.subtitle")}</p>
        </div>
        <Button onClick={() => { setForm(emptyForm()); setCreateOpen(true); }} className="gap-2">
          <UserPlus className="w-4 h-4" /> {t("users.createUser")}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("users.stats.total")}</p>
          <p className="text-2xl font-bold mt-1">{stats?.total ?? 0}</p>
        </CardContent></Card>
        <Card className="border-border"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("users.stats.active")}</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{stats?.active ?? 0}</p>
        </CardContent></Card>
        <Card className="border-border"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("users.stats.inactive")}</p>
          <p className="text-2xl font-bold text-muted-foreground mt-1">{stats?.inactive ?? 0}</p>
        </CardContent></Card>
        <Card className="border-border"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">{t("users.stats.byRole")}</p>
          <div className="flex flex-wrap gap-1">
            {stats?.by_role?.slice(0, 3).map(r => (
              <Badge key={r.role} className={cn("text-xs px-1.5 py-0", roleColors[r.role])}>
                {r.role}: {r.count}
              </Badge>
            ))}
          </div>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("users.searchPlaceholder")} className="ps-10" />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all")}</SelectItem>
            {ROLES.map(r => <SelectItem key={r} value={r}>{t(`users.roles.${r}`)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                {[t("common.name"), t("common.email"), t("common.role"), t("common.department"), t("common.status"), t("common.actions")].map(h => (
                  <th key={h} className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3 text-start">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}><td colSpan={6} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td></tr>
                ))
              ) : users?.length ? (
                users.map(user => (
                  <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-semibold text-primary">
                            {(user.full_name || user.email).slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{user.full_name || "—"}</p>
                          {user.full_name_ar && <p className="text-xs text-muted-foreground">{user.full_name_ar}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{user.email}</td>
                    <td className="px-4 py-3">
                      <Badge className={cn("text-xs", roleColors[user.role])}>{t(`users.roles.${user.role}`)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{user.department || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={user.is_active ? "default" : "secondary"} className="text-xs">
                        {user.is_active ? t("common.active") : t("common.inactive")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="w-4 h-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditUser({ id: user.id, form: {
                            email: user.email, password: "", full_name: user.full_name || "",
                            full_name_ar: user.full_name_ar || "", role: user.role,
                            department: user.department || "", is_active: user.is_active
                          }})}>
                            <Pencil className="w-3.5 h-3.5 me-2" />{t("common.edit")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setResetPasswordUser({ id: user.id, email: user.email })}>
                            <KeyRound className="w-3.5 h-3.5 me-2" />{isAr ? "إعادة تعيين كلمة المرور" : "Reset Password"}
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(user.id)}>
                            <Trash2 className="w-3.5 h-3.5 me-2" />{t("common.delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={6} className="py-16 text-center text-muted-foreground">
                  <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>{t("users.noUsers")}</p>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("users.createUser")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("users.fullName")} *</Label>
                <Input value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("users.fullNameAr")}</Label>
                <Input value={form.full_name_ar} onChange={e => setForm({...form, full_name_ar: e.target.value})} dir="rtl" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.email")} *</Label>
              <Input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("users.password")} *</Label>
              <Input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} placeholder="Min 8 characters" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("common.role")}</Label>
                <Select value={form.role} onValueChange={v => setForm({...form, role: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{t(`users.roles.${r}`)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("common.department")}</Label>
                <Input value={form.department} onChange={e => setForm({...form, department: e.target.value})} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleCreate} disabled={saving || !form.email || !form.password || !form.full_name}>
              {saving ? t("common.loading") : t("users.createUser")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editUser} onOpenChange={v => !v && setEditUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("users.editUser")}</DialogTitle></DialogHeader>
          {editUser && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("users.fullName")}</Label>
                  <Input value={editUser.form.full_name} onChange={e => setEditUser({...editUser, form: {...editUser.form, full_name: e.target.value}})} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("users.fullNameAr")}</Label>
                  <Input value={editUser.form.full_name_ar} onChange={e => setEditUser({...editUser, form: {...editUser.form, full_name_ar: e.target.value}})} dir="rtl" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("common.role")}</Label>
                  <Select value={editUser.form.role} onValueChange={v => setEditUser({...editUser, form: {...editUser.form, role: v}})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{t(`users.roles.${r}`)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("common.department")}</Label>
                  <Input value={editUser.form.department} onChange={e => setEditUser({...editUser, form: {...editUser.form, department: e.target.value}})} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={editUser.form.is_active} onCheckedChange={v => setEditUser({...editUser, form: {...editUser.form, is_active: v}})} />
                <Label>{t("users.isActive")}</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>{t("common.cancel")}</Button>
            <Button onClick={handleEdit} disabled={saving}>{saving ? t("common.loading") : t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("users.deleteUser")}</AlertDialogTitle>
            <AlertDialogDescription>{t("users.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Password confirm */}
      <AlertDialog open={!!resetPasswordUser} onOpenChange={v => !v && setResetPasswordUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <KeyRound className="w-4 h-4" />
              {isAr ? "إعادة تعيين كلمة المرور" : "Reset Password"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isAr
                ? `سيتم إرسال رابط إعادة تعيين كلمة المرور إلى ${resetPasswordUser?.email}. هل تريد المتابعة؟`
                : `A password reset link will be sent to ${resetPasswordUser?.email}. Continue?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetPassword}
              disabled={resetPassword.isPending}
              className="gap-2"
            >
              <KeyRound className="w-3.5 h-3.5" />
              {resetPassword.isPending
                ? (isAr ? "جارٍ الإرسال..." : "Sending...")
                : (isAr ? "إرسال الرابط" : "Send Reset Link")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset status toast */}
      {resetStatus && (
        <div className={`fixed bottom-6 end-6 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
          resetStatus.ok ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-red-50 border border-red-200 text-red-800"
        }`}>
          {resetStatus.ok
            ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            : <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
          <span>{resetStatus.msg}</span>
          <button onClick={() => setResetStatus(null)} className="ms-2 text-current opacity-60 hover:opacity-100">✕</button>
        </div>
      )}
    </div>
  );
}
