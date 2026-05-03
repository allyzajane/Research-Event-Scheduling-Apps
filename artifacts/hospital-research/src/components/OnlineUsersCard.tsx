import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import i18n from "i18next";

// ── Role colours (matches UsersPage / AppLayout) ──────────────────────────────
const roleDot: Record<string, string> = {
  admin:    "bg-teal-500",
  ceo:      "bg-purple-500",
  director: "bg-indigo-500",
  doctor:   "bg-blue-500",
  nurse:    "bg-pink-500",
  staff:    "bg-gray-400",
};

interface OnlineUser {
  id: string;
  full_name: string | null;
  full_name_ar: string | null;
  role: string;
  avatar_url: string | null;
}

interface OnlineCountResponse {
  count: number;
  users: OnlineUser[];
  column_missing?: boolean;
}

const REFETCH_MS = 30_000; // refresh every 30 s
const MAX_AVATARS = 7;     // show up to 7 faces before "+N"

function useOnlineCount() {
  const { session } = useAuth();
  return useQuery<OnlineCountResponse>({
    queryKey: ["dashboard", "online-count"],
    queryFn: async () => {
      const r = await fetch("/api/dashboard/online-count", {
        headers: { Authorization: `Bearer ${session!.access_token}` },
      });
      if (!r.ok) throw new Error("Failed to fetch online count");
      return r.json();
    },
    enabled: !!session,
    refetchInterval: REFETCH_MS,
    staleTime: 20_000,
  });
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function initials(user: OnlineUser): string {
  const name = i18n.language === "ar" && user.full_name_ar ? user.full_name_ar : (user.full_name ?? "");
  return name
    ? name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
    : "?";
}

function displayName(user: OnlineUser): string {
  return (i18n.language === "ar" && user.full_name_ar ? user.full_name_ar : user.full_name) ?? "—";
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OnlineUsersCard() {
  const isAr = i18n.language === "ar";
  const { data, isLoading } = useOnlineCount();

  const count   = data?.count ?? 0;
  const users   = data?.users ?? [];
  const visible = users.slice(0, MAX_AVATARS);
  const extra   = Math.max(0, count - MAX_AVATARS);

  return (
    <Card className="border-border overflow-hidden">
      {/* Header band */}
      <div className="relative flex items-center justify-between px-4 py-3 border-b border-border">
        {/* Live pulse dot */}
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <span className="text-sm font-semibold text-foreground">
            {isAr ? "المستخدمون المتصلون الآن" : "Online Now"}
          </span>
        </div>

        {/* Live counter bubble */}
        <div className="flex items-center gap-1.5">
          {isLoading ? (
            <Skeleton className="h-7 w-10 rounded-full" />
          ) : (
            <span
              className={cn(
                "inline-flex items-center justify-center min-w-[2rem] h-7 px-2.5 rounded-full text-sm font-bold tabular-nums transition-all duration-500",
                count > 0
                  ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {count}
            </span>
          )}
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {isAr ? "في آخر ٥ دقائق" : "last 5 min"}
          </span>
        </div>
      </div>

      <CardContent className="p-4">
        {isLoading ? (
          /* Skeleton state */
          <div className="space-y-2.5">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="w-8 h-8 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-2.5 w-20" />
                </div>
                <Skeleton className="h-2 w-2 rounded-full" />
              </div>
            ))}
          </div>
        ) : count === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-5 text-center">
            <span className="text-3xl mb-1.5">😴</span>
            <p className="text-sm font-medium text-muted-foreground">
              {isAr ? "لا أحد متصل حالياً" : "No one active right now"}
            </p>
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              {isAr ? "تحدّث هذا تلقائياً كل ٣٠ ثانية" : "Updates every 30 seconds"}
            </p>
          </div>
        ) : (
          /* User list + avatar stack */
          <div className="space-y-1">
            {/* Avatar row — compact faces at a glance */}
            {count > 1 && (
              <div className={cn("flex items-center mb-3", isAr && "flex-row-reverse")}>
                <div className={cn("flex", isAr ? "flex-row-reverse" : "")}>
                  {visible.map((u, idx) => (
                    <div
                      key={u.id}
                      title={displayName(u)}
                      className={cn(
                        "relative",
                        idx !== 0 && (isAr ? "me-[-8px]" : "ms-[-8px]"),
                      )}
                      style={{ zIndex: visible.length - idx }}
                    >
                      <Avatar className="w-7 h-7 ring-2 ring-background">
                        <AvatarImage
                          src={u.avatar_url ?? undefined}
                          alt={displayName(u)}
                          className="object-cover"
                        />
                        <AvatarFallback
                          className={cn(
                            "text-[10px] font-bold text-white",
                            roleDot[u.role] ?? "bg-gray-400",
                          )}
                        >
                          {initials(u)}
                        </AvatarFallback>
                      </Avatar>
                      {/* Green presence dot */}
                      <span className="absolute bottom-0 end-0 w-2 h-2 rounded-full bg-emerald-500 ring-1 ring-background" />
                    </div>
                  ))}
                  {extra > 0 && (
                    <div
                      className={cn(
                        "w-7 h-7 rounded-full bg-muted ring-2 ring-background flex items-center justify-center text-[10px] font-bold text-muted-foreground",
                        isAr ? "me-[-8px]" : "ms-[-8px]",
                      )}
                      style={{ zIndex: 0 }}
                    >
                      +{extra}
                    </div>
                  )}
                </div>
                <span className={cn("text-xs text-muted-foreground", isAr ? "me-2" : "ms-2")}>
                  {isAr
                    ? `${count} متصلون الآن`
                    : `${count} active member${count !== 1 ? "s" : ""}`}
                </span>
              </div>
            )}

            {/* Individual rows — show first 5 */}
            {users.slice(0, 5).map(u => (
              <div
                key={u.id}
                className={cn(
                  "flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-muted/50 transition-colors",
                  isAr && "flex-row-reverse",
                )}
              >
                <div className="relative flex-shrink-0">
                  <Avatar className="w-8 h-8">
                    <AvatarImage
                      src={u.avatar_url ?? undefined}
                      alt={displayName(u)}
                      className="object-cover"
                    />
                    <AvatarFallback
                      className={cn("text-xs font-bold text-white", roleDot[u.role] ?? "bg-gray-400")}
                    >
                      {initials(u)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="absolute bottom-0 end-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-1.5 ring-background" />
                </div>
                <div className={cn("flex-1 min-w-0", isAr && "text-end")}>
                  <p className="text-sm font-medium text-foreground truncate">{displayName(u)}</p>
                  <p className="text-xs text-muted-foreground capitalize">{u.role}</p>
                </div>
                <span
                  className={cn(
                    "w-2 h-2 rounded-full flex-shrink-0",
                    roleDot[u.role] ?? "bg-gray-400",
                  )}
                />
              </div>
            ))}

            {count > 5 && (
              <p className={cn("text-xs text-muted-foreground pt-1 ps-2", isAr && "text-end pe-2 ps-0")}>
                {isAr ? `+${count - 5} آخرون متصلون` : `+${count - 5} more online`}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
