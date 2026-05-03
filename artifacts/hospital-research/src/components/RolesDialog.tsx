import { useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListRoles, getListRolesQueryKey,
  useCreateRole, useUpdateRole, useDeleteRole,
} from "@workspace/api-client-react";
import {
  Pencil, Trash2, Plus, X, Check, Shield, Users, AlertCircle, CheckCircle2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

// ─── Color palette ────────────────────────────────────────────────────────

export const ROLE_COLOR_MAP: Record<string, { badge: string; swatch: string }> = {
  teal:    { badge: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",           swatch: "bg-teal-500"    },
  purple:  { badge: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",   swatch: "bg-purple-500"  },
  indigo:  { badge: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",   swatch: "bg-indigo-500"  },
  blue:    { badge: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",           swatch: "bg-blue-500"    },
  pink:    { badge: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",           swatch: "bg-pink-500"    },
  gray:    { badge: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",           swatch: "bg-gray-500"    },
  orange:  { badge: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",   swatch: "bg-orange-500"  },
  red:     { badge: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",               swatch: "bg-red-500"     },
  emerald: { badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200", swatch: "bg-emerald-500" },
  amber:   { badge: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",       swatch: "bg-amber-500"   },
  cyan:    { badge: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",           swatch: "bg-cyan-500"    },
  violet:  { badge: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200",   swatch: "bg-violet-500"  },
};

const COLOR_KEYS = Object.keys(ROLE_COLOR_MAP);

// ─── Color Picker ─────────────────────────────────────────────────────────

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLOR_KEYS.map(c => (
        <button
          key={c}
          type="button"
          title={c}
          onClick={() => onChange(c)}
          className={cn(
            "w-6 h-6 rounded-full transition-all ring-2 ring-offset-2",
            ROLE_COLOR_MAP[c].swatch,
            value === c ? "ring-foreground scale-110" : "ring-transparent"
          )}
        />
      ))}
    </div>
  );
}

// ─── Status pill ──────────────────────────────────────────────────────────

function StatusPill({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className={cn(
      "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium",
      ok ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
         : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
    )}>
      {ok ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
      {text}
    </div>
  );
}

// ─── Main dialog ──────────────────────────────────────────────────────────

interface Props {
  open:    boolean;
  onClose: () => void;
}

type RoleItem = {
  id: string; name: string; label: string; label_ar?: string | null;
  color: string; is_system: boolean; user_count: number; created_at: string;
};

interface EditState { label: string; label_ar: string; color: string; }
interface AddState  { name: string; label: string; label_ar: string; color: string; }

export default function RolesDialog({ open, onClose }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const isAr = i18n.language === "ar";

  const { data: roles, isLoading } = useListRoles({
    query: { queryKey: getListRolesQueryKey(), enabled: open },
  });

  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();

  // UI state
  const [editId,   setEditId]   = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditState>({ label: "", label_ar: "", color: "gray" });
  const [addOpen,  setAddOpen]  = useState(false);
  const [addForm,  setAddForm]  = useState<AddState>({ name: "", label: "", label_ar: "", color: "gray" });
  const [deleteTarget, setDeleteTarget] = useState<RoleItem | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: getListRolesQueryKey() });

  const startEdit = (role: RoleItem) => {
    setEditId(role.id);
    setEditForm({ label: role.label, label_ar: role.label_ar || "", color: role.color });
    setAddOpen(false);
    setMsg(null);
  };

  const cancelEdit = () => { setEditId(null); setMsg(null); };

  const handleSaveEdit = async () => {
    if (!editId) return;
    setSaving(true); setMsg(null);
    try {
      await updateRole.mutateAsync({ id: editId, data: {
        label:    editForm.label    || null,
        label_ar: editForm.label_ar || null,
        color:    editForm.color    || null,
      }});
      invalidate();
      setEditId(null);
      setMsg({ ok: true, text: t("users.rolesManager.saved") });
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || t("users.rolesManager.failed");
      setMsg({ ok: false, text: msg });
    } finally { setSaving(false); }
  };

  const handleAdd = async () => {
    if (!addForm.name || !addForm.label) return;
    setSaving(true); setMsg(null);
    try {
      await createRole.mutateAsync({ data: {
        name:    addForm.name,
        label:   addForm.label,
        label_ar: addForm.label_ar || null,
        color:   addForm.color || null,
      }});
      invalidate();
      setAddOpen(false);
      setAddForm({ name: "", label: "", label_ar: "", color: "gray" });
      setMsg({ ok: true, text: t("users.rolesManager.created") });
    } catch (e) {
      const err = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || t("users.rolesManager.failed");
      const text = err.includes("already exists") ? t("users.rolesManager.nameConflict") : err;
      setMsg({ ok: false, text });
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true); setMsg(null);
    try {
      await deleteRole.mutateAsync({ id: deleteTarget.id });
      invalidate();
      setDeleteTarget(null);
      setMsg({ ok: true, text: t("users.rolesManager.deleted") });
    } catch (e) {
      const errMsg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || t("users.rolesManager.failed");
      setMsg({ ok: false, text: errMsg });
      setDeleteTarget(null);
    } finally { setDeleting(false); }
  };

  const roleList: RoleItem[] = (roles as RoleItem[] | undefined) || [];

  return (
    <>
      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Shield className="w-4 h-4 text-primary" />
              </div>
              {t("users.rolesManager.title")}
            </DialogTitle>
            <DialogDescription>{t("users.rolesManager.subtitle")}</DialogDescription>
          </DialogHeader>

          {/* Status */}
          {msg && <StatusPill ok={msg.ok} text={msg.text} />}

          {/* Add Role button */}
          {!addOpen && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => { setAddOpen(true); setEditId(null); setMsg(null); }} className="gap-1.5">
                <Plus className="w-3.5 h-3.5" />{t("users.rolesManager.addRole")}
              </Button>
            </div>
          )}

          {/* Add Role form */}
          {addOpen && (
            <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
              <p className="text-sm font-semibold text-foreground">{t("users.rolesManager.addRole")}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("users.rolesManager.roleName")} *</Label>
                  <Input
                    value={addForm.name}
                    onChange={e => setAddForm(f => ({ ...f, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }))}
                    placeholder="e.g. researcher"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">{t("users.rolesManager.roleNameHint")}</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("users.rolesManager.roleLabel")} *</Label>
                  <Input value={addForm.label} onChange={e => setAddForm(f => ({ ...f, label: e.target.value }))} placeholder="Researcher" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("users.rolesManager.roleColor")}</Label>
                <ColorPicker value={addForm.color} onChange={c => setAddForm(f => ({ ...f, color: c }))} />
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <Button size="sm" variant="ghost" onClick={() => { setAddOpen(false); setAddForm({ name: "", label: "", label_ar: "", color: "gray" }); }}>
                  <X className="w-3.5 h-3.5 me-1" />{t("common.cancel")}
                </Button>
                <Button size="sm" onClick={handleAdd} disabled={saving || !addForm.name || !addForm.label} className="gap-1.5">
                  {saving
                    ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Check className="w-3.5 h-3.5" />
                  }
                  {t("common.save")}
                </Button>
              </div>
            </div>
          )}

          {/* Role list */}
          <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin me-2" />
                {t("common.loading")}
              </div>
            ) : roleList.map(role => {
              const colors = ROLE_COLOR_MAP[role.color] || ROLE_COLOR_MAP.gray;
              const displayLabel = (isAr && role.label_ar) ? role.label_ar : role.label;
              const isEditing = editId === role.id;

              return (
                <div key={role.id} className={cn(
                  "rounded-xl border p-3 space-y-3 transition-colors",
                  isEditing ? "border-primary/40 bg-primary/5" : "border-border bg-card hover:bg-muted/30"
                )}>
                  {/* Role header row */}
                  <div className="flex items-center gap-3">
                    {/* Color swatch */}
                    <div className={cn("w-3 h-3 rounded-full flex-shrink-0", colors.swatch)} />

                    {/* Name slug */}
                    <code className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded flex-shrink-0">
                      {role.name}
                    </code>

                    {/* Labels */}
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <Badge className={cn("text-xs font-medium", colors.badge)}>{displayLabel}</Badge>
                    </div>

                    {/* User count */}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                      <Users className="w-3 h-3" />
                      <span>{role.user_count}</span>
                    </div>

                    {/* System badge */}
                    {role.is_system && (
                      <Badge variant="outline" className="text-xs flex-shrink-0">{t("users.rolesManager.systemBadge")}</Badge>
                    )}

                    {/* Actions */}
                    {!role.is_system && !isEditing && (
                      <div className="flex gap-1 flex-shrink-0">
                        <Button size="sm" variant="ghost" onClick={() => startEdit(role)} className="h-7 w-7 p-0">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          onClick={() => { setDeleteTarget(role); setMsg(null); }}
                          disabled={role.user_count > 0}
                          title={role.user_count > 0 ? t("users.rolesManager.cannotDeleteHasUsers", { count: role.user_count }) : undefined}
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 disabled:opacity-40"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}

                    {/* Cancel edit button */}
                    {isEditing && (
                      <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-7 w-7 p-0 flex-shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>

                  {/* Inline edit form */}
                  {isEditing && (
                    <div className="space-y-3 pt-1 border-t border-border">
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t("users.rolesManager.roleLabel")}</Label>
                        <Input value={editForm.label} onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t("users.rolesManager.roleColor")}</Label>
                        <ColorPicker value={editForm.color} onChange={c => setEditForm(f => ({ ...f, color: c }))} />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={cancelEdit}>{t("common.cancel")}</Button>
                        <Button size="sm" onClick={handleSaveEdit} disabled={saving || !editForm.label} className="gap-1.5">
                          {saving
                            ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            : <Check className="w-3.5 h-3.5" />
                          }
                          {t("common.save")}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>{t("common.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("users.rolesManager.deleteRole")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("users.rolesManager.deleteConfirm", { name: deleteTarget?.label })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleting
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin me-2" />
                : null
              }
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
