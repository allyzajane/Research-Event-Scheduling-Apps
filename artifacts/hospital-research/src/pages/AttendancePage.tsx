import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import i18n from "i18next";
import {
  LogIn, LogOut, Calendar, Clock8, UserCheck,
  Activity, CheckCircle2, Clock, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { formatDateAST, formatTimeAST, getASTDateStr } from "@/lib/ast";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AttendanceRecord {
  id: string;
  user_id: string;
  date: string;
  clock_in: string;
  clock_out: string | null;
  status: "present" | "late" | "half_day" | "absent";
  notes: string | null;
  user_name?: string | null;
  user_name_ar?: string | null;
  user_avatar?: string | null;
  created_at: string;
}

interface AttendanceStats {
  present_days: number;
  total_records: number;
  total_hours: number;
}

interface SimpleUser {
  id: string;
  email: string;
  full_name?: string;
  full_name_ar?: string;
  role?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { en: string; ar: string; cls: string }> = {
  present:  { en: "Present",  ar: "حاضر",    cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300" },
  late:     { en: "Late",     ar: "متأخر",   cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300" },
  half_day: { en: "Half Day", ar: "نصف يوم", cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300" },
  absent:   { en: "Absent",   ar: "غائب",    cls: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDurationMs(clockIn: string, clockOut?: string | null): number {
  return (clockOut ? new Date(clockOut) : new Date()).getTime() - new Date(clockIn).getTime();
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(sec).padStart(2, "0")}s`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const { t } = useTranslation();
  const { session, user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const isAr = i18n.language === "ar";
  const isAdmin = ["admin", "ceo", "director"].includes(user?.role ?? "");

  const [filterUser, setFilterUser] = useState<string>("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [liveMs, setLiveMs] = useState(0);

  const auth = () => ({ Authorization: `Bearer ${session?.access_token}` });

  // ── Users list (admin only) ────────────────────────────────────────────────
  const { data: users = [] } = useQuery<SimpleUser[]>({
    queryKey: ["users-simple"],
    enabled: isAdmin,
    queryFn: async () => {
      const r = await fetch("/api/users", { headers: auth() });
      if (!r.ok) return [];
      return r.json();
    },
  });

  // ── Today's record (always own) ───────────────────────────────────────────
  const { data: today, isLoading: loadingToday } = useQuery<AttendanceRecord | null>({
    queryKey: ["attendance/today"],
    queryFn: async () => {
      const r = await fetch("/api/attendance/today", { headers: auth() });
      if (!r.ok) return null;
      return r.json();
    },
    refetchInterval: 60_000,
  });

  // ── Stats (follows filter) ─────────────────────────────────────────────────
  const { data: stats, isLoading: loadingStats } = useQuery<AttendanceStats>({
    queryKey: ["attendance/stats", filterUser],
    queryFn: async () => {
      const qs = filterUser ? `?user_id=${filterUser}` : "";
      const r = await fetch(`/api/attendance/stats${qs}`, { headers: auth() });
      return r.json();
    },
  });

  // ── History (follows filter) ───────────────────────────────────────────────
  const { data: records = [], isLoading: loadingHistory } = useQuery<AttendanceRecord[]>({
    queryKey: ["attendance/list", filterUser],
    queryFn: async () => {
      const qs = filterUser ? `?user_id=${filterUser}` : "";
      const r = await fetch(`/api/attendance${qs}`, { headers: auth() });
      if (!r.ok) return [];
      return r.json();
    },
  });

  // ── Live elapsed timer ────────────────────────────────────────────────────
  useEffect(() => {
    if (!today?.clock_in || today.clock_out) return;
    setLiveMs(getDurationMs(today.clock_in));
    const id = setInterval(() => setLiveMs(getDurationMs(today.clock_in)), 1000);
    return () => clearInterval(id);
  }, [today?.clock_in, today?.clock_out]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["attendance/today"] });
    qc.invalidateQueries({ queryKey: ["attendance/list"] });
    qc.invalidateQueries({ queryKey: ["attendance/stats"] });
  };

  const clockInMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/attendance/clock-in", {
        method: "POST",
        headers: { ...auth(), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
      return r.json();
    },
    onSuccess: () => { invalidate(); toast({ title: t("attendance.clockedInSuccess") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const clockOutMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/attendance/clock-out", {
        method: "POST",
        headers: { ...auth(), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
      return r.json();
    },
    onSuccess: () => { invalidate(); toast({ title: t("attendance.clockedOutSuccess") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/attendance/${id}`, { method: "DELETE", headers: auth() });
    },
    onSuccess: () => { invalidate(); setDeleteTarget(null); },
  });

  // ── Derived ───────────────────────────────────────────────────────────────
  const isClockedIn  = !!today?.clock_in && !today.clock_out;
  const isClockedOut = !!today?.clock_out;
  const statusCfg    = today?.status ? STATUS_CONFIG[today.status] : null;
  const todayDateStr = getASTDateStr();

  const filteredUser = filterUser ? users.find(u => u.id === filterUser) : null;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("attendance.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {formatDateAST(new Date(), isAr ? "ar" : "en")} · KSA
          </p>
        </div>

        {isAdmin && (
          <Select value={filterUser} onValueChange={setFilterUser}>
            <SelectTrigger className="w-52 h-9">
              <SelectValue placeholder={t("attendance.allUsers")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t("attendance.allUsers")}</SelectItem>
              {users.map(u => (
                <SelectItem key={u.id} value={u.id}>
                  {(isAr && u.full_name_ar) ? u.full_name_ar : u.full_name ?? u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* ── Clock-in / Clock-out hero (own attendance only) ─────────────── */}
      <Card className="overflow-hidden border-0 shadow-md">
        <CardContent className="p-0">
          <div className={cn(
            "relative flex flex-col sm:flex-row items-center gap-6 p-7 transition-colors duration-300",
            isClockedIn  ? "bg-gradient-to-br from-emerald-50 to-emerald-100/60 dark:from-emerald-950/40 dark:to-emerald-900/20" :
            isClockedOut ? "bg-muted/50" :
            "bg-gradient-to-br from-primary/5 to-primary/10"
          )}>
            {/* Icon orb */}
            <div className={cn(
              "flex-shrink-0 w-20 h-20 rounded-full flex items-center justify-center shadow-lg ring-4 ring-white/40 dark:ring-black/20",
              isClockedIn  ? "bg-emerald-500" :
              isClockedOut ? "bg-slate-400" :
              "bg-primary"
            )}>
              {isClockedIn
                ? <Activity className="w-9 h-9 text-white animate-pulse" />
                : isClockedOut
                ? <CheckCircle2 className="w-9 h-9 text-white" />
                : <Clock className="w-9 h-9 text-white" />}
            </div>

            {/* Text area */}
            <div className="flex-1 text-center sm:text-start min-w-0">
              {loadingToday ? (
                <div className="space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-10 w-48" />
                  <Skeleton className="h-4 w-40" />
                </div>
              ) : isClockedIn ? (
                <>
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-widest mb-1">
                    {t("attendance.currentlyWorking")}
                  </p>
                  <p className="font-mono text-4xl font-bold text-emerald-700 dark:text-emerald-300 tracking-tight tabular-nums">
                    {formatDuration(liveMs || getDurationMs(today!.clock_in))}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5 justify-center sm:justify-start flex-wrap">
                    <p className="text-sm text-muted-foreground">
                      {t("attendance.since")} <span className="font-medium font-mono">{formatTimeAST(today!.clock_in, isAr ? "ar" : "en")}</span>
                    </p>
                    {statusCfg && (
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-semibold", statusCfg.cls)}>
                        {isAr ? statusCfg.ar : statusCfg.en}
                      </span>
                    )}
                  </div>
                </>
              ) : isClockedOut ? (
                <>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">
                    {t("attendance.shiftComplete")}
                  </p>
                  <p className="font-mono text-3xl font-bold text-foreground tracking-tight">
                    {formatDuration(getDurationMs(today!.clock_in, today!.clock_out))}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5 justify-center sm:justify-start flex-wrap">
                    <p className="text-sm text-muted-foreground font-mono">
                      {formatTimeAST(today!.clock_in, isAr ? "ar" : "en")}
                      {" → "}
                      {formatTimeAST(today!.clock_out!, isAr ? "ar" : "en")}
                    </p>
                    {statusCfg && (
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-semibold", statusCfg.cls)}>
                        {isAr ? statusCfg.ar : statusCfg.en}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">
                    {t("attendance.notClockedIn")}
                  </p>
                  <p className="text-2xl font-bold text-foreground">{t("attendance.readyToStart")}</p>
                  <p className="text-sm text-muted-foreground mt-1">{t("attendance.before9Hint")}</p>
                </>
              )}
            </div>

            {/* Action button */}
            <div className="flex-shrink-0">
              {isClockedOut ? (
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="text-sm font-semibold">{t("attendance.dayComplete")}</span>
                </div>
              ) : (
                <Button
                  size="lg"
                  variant={isClockedIn ? "outline" : "default"}
                  className={cn(
                    "gap-2.5 px-7 py-5 text-sm font-semibold rounded-xl shadow",
                    isClockedIn && "border-emerald-500 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                  )}
                  disabled={clockInMutation.isPending || clockOutMutation.isPending}
                  onClick={() => isClockedIn ? clockOutMutation.mutate() : clockInMutation.mutate()}
                >
                  {isClockedIn
                    ? <><LogOut className="w-4 h-4" /> {t("attendance.clockOut")}</>
                    : <><LogIn className="w-4 h-4" /> {t("attendance.clockIn")}</>}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Stats cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: t("attendance.presentDays"),
            value: loadingStats ? null : (stats?.present_days ?? 0),
            sub: t("attendance.thisMonth"),
            icon: UserCheck,
            color: "text-emerald-600",
            bg: "bg-emerald-50 dark:bg-emerald-950/30",
          },
          {
            label: t("attendance.totalHours"),
            value: loadingStats ? null : `${stats?.total_hours ?? 0}h`,
            sub: t("attendance.thisMonth"),
            icon: Clock8,
            color: "text-blue-600",
            bg: "bg-blue-50 dark:bg-blue-950/30",
          },
          {
            label: t("attendance.totalRecords"),
            value: loadingStats ? null : (stats?.total_records ?? 0),
            sub: t("attendance.thisMonth"),
            icon: Calendar,
            color: "text-violet-600",
            bg: "bg-violet-50 dark:bg-violet-950/30",
          },
        ].map(c => (
          <Card key={c.label} className="shadow-sm">
            <CardContent className="pt-5 pb-4 px-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{c.label}</p>
                {c.value === null
                  ? <Skeleton className="h-9 w-16 mt-1" />
                  : <p className="text-3xl font-bold text-foreground mt-1 tabular-nums">{c.value}</p>}
                <p className="text-xs text-muted-foreground mt-0.5">{c.sub}</p>
              </div>
              <div className={cn("p-2.5 rounded-xl flex-shrink-0", c.bg)}>
                <c.icon className={cn("w-6 h-6", c.color)} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── History table ─────────────────────────────────────────────────── */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3 border-b border-border">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {t("attendance.history")}
              {filteredUser && (
                <span className="ml-2 text-primary font-bold normal-case">
                  — {(isAr && filteredUser.full_name_ar) ? filteredUser.full_name_ar : filteredUser.full_name ?? filteredUser.email}
                </span>
              )}
            </CardTitle>
            <span className="text-xs text-muted-foreground">{records.length} {t("attendance.recordsCount")}</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loadingHistory ? (
            <div className="space-y-3 p-6">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Calendar className="w-10 h-10 opacity-25 mb-3" />
              <p className="text-sm font-medium">{t("attendance.noRecords")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40">
                    {isAdmin && (
                      <th className="text-start text-[11px] font-semibold text-muted-foreground px-5 py-3 uppercase tracking-wider">
                        {t("common.name")}
                      </th>
                    )}
                    <th className="text-start text-[11px] font-semibold text-muted-foreground px-5 py-3 uppercase tracking-wider">{t("attendance.date")}</th>
                    <th className="text-start text-[11px] font-semibold text-muted-foreground px-5 py-3 uppercase tracking-wider">{t("attendance.statusCol")}</th>
                    <th className="text-start text-[11px] font-semibold text-muted-foreground px-5 py-3 uppercase tracking-wider">{t("attendance.clockInTime")}</th>
                    <th className="text-start text-[11px] font-semibold text-muted-foreground px-5 py-3 uppercase tracking-wider">{t("attendance.clockOutTime")}</th>
                    <th className="text-start text-[11px] font-semibold text-muted-foreground px-5 py-3 uppercase tracking-wider">{t("attendance.duration")}</th>
                    {isAdmin && <th className="px-3 py-3 w-10" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {records.map(r => {
                    const sc = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.absent;
                    const isToday = r.date === todayDateStr;
                    const dur = r.clock_in && r.clock_out
                      ? formatDuration(getDurationMs(r.clock_in, r.clock_out))
                      : r.clock_in
                      ? t("attendance.active")
                      : "—";
                    return (
                      <tr key={r.id} className={cn(
                        "hover:bg-muted/30 transition-colors",
                        isToday && "bg-primary/3"
                      )}>
                        {isAdmin && (
                          <td className="px-5 py-3.5 font-medium text-foreground text-sm">
                            {(isAr && r.user_name_ar) ? r.user_name_ar : r.user_name ?? "—"}
                          </td>
                        )}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">
                              {formatDateAST(r.date + "T12:00:00Z", isAr ? "ar" : "en")}
                            </span>
                            {isToday && (
                              <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full uppercase">
                                {t("attendance.today")}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={cn("text-xs px-2.5 py-1 rounded-full font-semibold", sc.cls)}>
                            {isAr ? sc.ar : sc.en}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-mono text-sm text-muted-foreground">
                          {r.clock_in ? formatTimeAST(r.clock_in, isAr ? "ar" : "en") : "—"}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-sm text-muted-foreground">
                          {r.clock_out
                            ? formatTimeAST(r.clock_out, isAr ? "ar" : "en")
                            : r.clock_in
                            ? <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-xs font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />{t("attendance.active")}</span>
                            : "—"}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-sm font-semibold text-foreground">{dur}</td>
                        {isAdmin && (
                          <td className="px-3 py-3.5">
                            <Button
                              variant="ghost" size="icon"
                              className="w-7 h-7 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleteTarget(r.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Delete confirm ───────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.deleteConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>{t("attendance.deleteDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
