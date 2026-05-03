import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { Calendar, X, ChevronRight, MapPin, Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useListNotifications,
  getListNotificationsQueryKey,
  getGetUnreadCountQueryKey,
  useMarkNotificationRead,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import i18n from "i18next";
import { formatDateAST, formatTimeAST } from "@/lib/ast";

const SESSION_KEY = "event_invite_toast_shown_v1";

export function EventInviteToast() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const shownRef = useRef(false);
  const qc = useQueryClient();
  const markRead = useMarkNotificationRead();

  const { data } = useListNotifications(
    { limit: "30" },
    {
      query: {
        queryKey: getListNotificationsQueryKey({ limit: "30" }),
        enabled: !!user && !loading,
      },
    },
  );

  const eventInvites = (data?.items ?? []).filter(
    n => n.type === "event" && !n.is_read,
  );

  useEffect(() => {
    if (loading || !user || shownRef.current || dismissed) return;
    if (eventInvites.length === 0) return;

    const sessionKey = `${SESSION_KEY}_${user.id}`;
    if (sessionStorage.getItem(sessionKey)) return;

    sessionStorage.setItem(sessionKey, "1");
    shownRef.current = true;
    setMounted(true);
    // Slight delay lets the page settle before entrance animation
    const t = setTimeout(() => setVisible(true), 250);
    return () => clearTimeout(t);
  }, [user, loading, eventInvites.length, dismissed]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetUnreadCountQueryKey() });
  };

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(() => { setMounted(false); setDismissed(true); }, 380);
  };

  const handleView = () => {
    // Mark all shown invite notifications as read
    eventInvites.forEach(n => {
      markRead.mutate({ id: n.id }, { onSuccess: invalidate });
    });
    handleDismiss();
    navigate("/calendar");
  };

  if (!mounted || eventInvites.length === 0) return null;

  const isAr = i18n.language === "ar";
  const count = eventInvites.length;
  const first = eventInvites[0];

  // Try to parse date/venue from the notification body
  // Body format: `"Event Title" — Mon, Jan 6 · Venue`
  const bodyText = (isAr && first.body_ar ? first.body_ar : first.body) ?? "";

  return (
    <div
      className={cn(
        "fixed bottom-6 end-6 z-[200] w-[380px] max-w-[calc(100vw-2rem)]",
        "transition-all duration-[380ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]",
        visible
          ? "opacity-100 translate-y-0 scale-100"
          : "opacity-0 translate-y-8 scale-95 pointer-events-none",
      )}
    >
      {/* Card */}
      <div className="relative bg-card border border-border rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.15)] overflow-hidden">

        {/* Top gradient accent bar */}
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-violet-500 via-purple-400 to-indigo-500" />

        {/* Subtle background glow */}
        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/[0.04] via-transparent to-transparent pointer-events-none" />

        <div className="relative p-4">
          {/* Header */}
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className="relative flex-shrink-0">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
                <Calendar className="w-5 h-5 text-white" />
              </div>
              {count > 1 && (
                <span className="absolute -top-1 -end-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
                  {count}
                </span>
              )}
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0 pt-0.5">
              <p className="text-sm font-semibold text-foreground leading-snug">
                {isAr
                  ? count === 1 ? "لديك دعوة لحضور فعالية" : `لديك ${count} دعوات لحضور فعاليات`
                  : count === 1 ? "You've been invited to an event" : `You have ${count} event invitations`}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isAr ? "مستشفى الطائف للأطفال" : "Taif Children's Hospital"}
              </p>
            </div>

            {/* Dismiss */}
            <button
              onClick={handleDismiss}
              className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Event preview card */}
          <div className="mt-3 rounded-xl bg-muted/60 border border-border/50 px-3 py-2.5">
            <p className={cn(
              "text-xs font-semibold text-foreground truncate",
              isAr && "text-end",
            )}>
              {isAr && first.title_ar ? first.title_ar : first.title}
            </p>
            {bodyText && (
              <p className={cn(
                "text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap",
                isAr && "flex-row-reverse",
              )}>
                <Clock className="w-3 h-3 flex-shrink-0 text-violet-500" />
                <span className="truncate">{bodyText.replace(/^".*?" — /, "")}</span>
              </p>
            )}
            {count > 1 && (
              <p className={cn(
                "text-[11px] text-violet-500 font-medium mt-1.5",
                isAr && "text-end",
              )}>
                {isAr ? `+${count - 1} فعاليات أخرى` : `+${count - 1} more invitation${count - 1 === 1 ? "" : "s"}`}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleView}
              className="h-9 text-xs gap-1.5 flex-1 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white border-0 shadow-md shadow-violet-500/20"
            >
              {isAr ? "عرض التقويم" : "Open Calendar"}
              <ChevronRight className={cn("w-3.5 h-3.5", isAr && "rotate-180")} />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDismiss}
              className="h-9 text-xs px-4"
            >
              {isAr ? "لاحقاً" : "Later"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
