import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { timeAgoAST } from "@/lib/ast";
import { useLocation } from "wouter";
import { Bell, BellOff, Check, CheckCheck, FileText, BookOpen, Calendar, User, Settings, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListNotifications, getListNotificationsQueryKey,
  useGetUnreadCount, getGetUnreadCountQueryKey,
  useMarkNotificationRead, useMarkAllNotificationsRead,
  useClearAllNotifications,
} from "@workspace/api-client-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import i18n from "i18next";

const typeIcon: Record<string, React.ElementType> = {
  document: FileText,
  article: BookOpen,
  event: Calendar,
  user: User,
  system: Settings,
};

const typeColor: Record<string, string> = {
  document: "text-blue-500",
  article: "text-emerald-500",
  event: "text-violet-500",
  user: "text-amber-500",
  system: "text-gray-500",
};

function timeAgo(dateStr: string): string {
  return timeAgoAST(dateStr, i18n.language === "ar");
}

export function NotificationBell() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { user, session } = useAuth();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetUnreadCountQueryKey() });
  }, [qc]);

  // Realtime subscription — fires when a new notification row is inserted for this user
  useEffect(() => {
    if (!user?.id || !session) return;

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // Invalidate queries so the bell badge and panel refresh instantly
          invalidate();
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [user?.id, session, invalidate]);

  const { data: countData } = useGetUnreadCount({
    query: {
      queryKey: getGetUnreadCountQueryKey(),
      refetchInterval: 60000, // fallback poll every 60s (realtime handles instant updates)
    },
  });
  const unreadCount = countData?.count ?? 0;

  const { data: notifData, isLoading } = useListNotifications(
    { limit: "30" },
    {
      query: {
        queryKey: getListNotificationsQueryKey({ limit: "30" }),
        enabled: open,
      },
    }
  );
  const notifications = notifData?.items ?? [];

  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const clearAll = useClearAllNotifications();

  const handleMarkRead = (id: string) => {
    markRead.mutate({ id }, { onSuccess: invalidate });
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate(undefined, { onSuccess: invalidate });
  };

  const handleClearAll = () => {
    clearAll.mutate(undefined, { onSuccess: invalidate });
  };

  const handleClick = (notif: { id: string; is_read: boolean; link?: string | null }) => {
    if (!notif.is_read) handleMarkRead(notif.id);
    if (notif.link) {
      setOpen(false);
      navigate(notif.link);
    }
  };

  const isAr = i18n.language === "ar";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Bell className="w-4.5 h-4.5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -end-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none shadow-sm">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-[360px] p-0 shadow-xl border-border"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{t("notifications.title")}</h3>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5">
                {unreadCount} {t("notifications.unread")}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                onClick={handleMarkAllRead}
                disabled={markAllRead.isPending}
              >
                <CheckCheck className="w-3.5 h-3.5" />
                {t("notifications.markAllRead")}
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={handleClearAll}
                disabled={clearAll.isPending}
                title={t("notifications.clearAll")}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* List */}
        <ScrollArea className="max-h-[400px]">
          {isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {t("common.loading")}
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-12 flex flex-col items-center gap-2 text-center px-6">
              <BellOff className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-sm font-medium">{t("notifications.noNotifications")}</p>
              <p className="text-xs text-muted-foreground">{t("notifications.noNotificationsDesc")}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map(n => {
                const Icon = typeIcon[n.type] ?? Bell;
                const title = isAr && n.title_ar ? n.title_ar : n.title;
                const body = isAr && n.body_ar ? n.body_ar : n.body;
                return (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={cn(
                      "w-full text-start flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50",
                      !n.is_read && "bg-primary/5"
                    )}
                  >
                    <div className={cn(
                      "mt-0.5 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-muted",
                      typeColor[n.type]
                    )}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn(
                          "text-xs font-semibold truncate",
                          !n.is_read ? "text-foreground" : "text-muted-foreground"
                        )}>
                          {title}
                        </p>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">
                          {timeAgo(n.created_at)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{body}</p>
                    </div>
                    {!n.is_read && (
                      <div
                        role="button"
                        onClick={e => { e.stopPropagation(); handleMarkRead(n.id); }}
                        className="mt-1 flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
                        title="Mark as read"
                      >
                        <Check className="w-3 h-3" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-border">
          <p className="text-[10px] text-muted-foreground text-center">
            {isAr ? "الإشعارات تصل فورياً" : "Notifications arrive in real-time"}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
