import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { Calendar, X, ChevronRight, Clock, Bell } from "lucide-react";
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
    const t = setTimeout(() => setVisible(true), 200);
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
  const bodyText = (isAr && first.body_ar ? first.body_ar : first.body) ?? "";
  const eventTitle = (isAr && first.title_ar ? first.title_ar : first.title) ?? "";

  return (
    <>
      {/* CSS keyframes injected once */}
      <style>{`
        @keyframes toastRingPulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.35); opacity: 0; }
        }
        @keyframes toastIconBounce {
          0%, 100% { transform: translateY(0); }
          30%  { transform: translateY(-4px); }
          60%  { transform: translateY(-2px); }
        }
        @keyframes toastShimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .toast-ring-pulse {
          animation: toastRingPulse 2s ease-out infinite;
        }
        .toast-icon-bounce {
          animation: toastIconBounce 1.2s ease-in-out 0.6s 2;
        }
        .toast-shimmer-btn {
          background-size: 200% auto;
          animation: toastShimmer 2.5s linear infinite;
        }
      `}</style>

      <div
        className={cn(
          "fixed bottom-6 end-6 z-[200] w-[400px] max-w-[calc(100vw-1.5rem)]",
          "transition-all duration-[400ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]",
          visible
            ? "opacity-100 translate-y-0 scale-100"
            : "opacity-0 translate-y-10 scale-95 pointer-events-none",
        )}
      >
        <div className="relative rounded-2xl overflow-hidden shadow-[0_12px_48px_rgba(0,0,0,0.18),0_4px_16px_rgba(47,154,203,0.15)]">

          {/* ── Primary-coloured header band ── */}
          <div className="bg-primary px-4 pt-4 pb-3">
            <div className="flex items-center gap-3">

              {/* Animated icon with ring pulse */}
              <div className="relative flex-shrink-0">
                {/* Outer pulse ring */}
                <span className="toast-ring-pulse absolute inset-0 rounded-xl bg-white/30 block" />
                <div className="toast-icon-bounce relative w-11 h-11 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/30">
                  <Bell className="w-5 h-5 text-white" fill="white" />
                </div>
                {/* Count badge */}
                {count > 1 && (
                  <span className="absolute -top-1.5 -end-1.5 min-w-[20px] h-5 px-1 rounded-full bg-amber-400 text-[#1a1a1a] text-[10px] font-bold flex items-center justify-center shadow-sm">
                    {count}
                  </span>
                )}
              </div>

              {/* Headline */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-400 text-[#1a1a1a] text-[10px] font-bold uppercase tracking-wide leading-none">
                    {isAr ? "جديد" : "NEW"}
                  </span>
                </div>
                <p className="text-sm font-bold text-white leading-snug">
                  {isAr
                    ? count === 1 ? "لديك دعوة لحضور فعالية" : `لديك ${count} دعوات`
                    : count === 1 ? "You've been invited to an event" : `You have ${count} event invitations`}
                </p>
                <p className="text-xs text-white/70 mt-0.5">
                  {isAr ? "مستشفى الطائف للأطفال" : "Taif Children's Hospital"}
                </p>
              </div>

              {/* Dismiss */}
              <button
                onClick={handleDismiss}
                className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/15 transition-colors"
                aria-label="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* ── White body ── */}
          <div className="bg-card px-4 pt-3 pb-4">

            {/* Event preview */}
            <div className="rounded-xl bg-primary/[0.06] border border-primary/20 px-3 py-2.5 mb-3">
              <div className="flex items-start gap-2">
                <Calendar className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-xs font-semibold text-foreground leading-snug",
                    isAr && "text-end",
                  )}>
                    {eventTitle || (isAr ? "فعالية جديدة" : "New Event")}
                  </p>
                  {bodyText && (
                    <p className={cn(
                      "text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1 flex-wrap",
                      isAr && "flex-row-reverse justify-end",
                    )}>
                      <Clock className="w-3 h-3 flex-shrink-0 text-primary/60" />
                      <span>{bodyText.replace(/^".*?" — /, "")}</span>
                    </p>
                  )}
                </div>
              </div>
              {count > 1 && (
                <p className={cn(
                  "text-[11px] text-primary font-semibold mt-1.5 ps-5",
                  isAr && "text-end pe-5 ps-0",
                )}>
                  {isAr ? `+${count - 1} فعاليات أخرى` : `+${count - 1} more invitation${count - 1 === 1 ? "" : "s"}`}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleView}
                className={cn(
                  "toast-shimmer-btn flex-1 h-9 px-4 rounded-lg text-xs font-semibold text-white flex items-center justify-center gap-1.5",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-opacity hover:opacity-90",
                )}
                style={{
                  background: "linear-gradient(90deg, hsl(200,73%,42%), hsl(200,73%,52%), hsl(195,80%,48%), hsl(200,73%,42%))",
                  backgroundSize: "200% auto",
                }}
              >
                <span>{isAr ? "عرض التقويم" : "Open Calendar"}</span>
                <ChevronRight className={cn("w-3.5 h-3.5", isAr && "rotate-180")} />
              </button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDismiss}
                className="h-9 text-xs px-4 border-border text-muted-foreground hover:text-foreground"
              >
                {isAr ? "لاحقاً" : "Later"}
              </Button>
            </div>
          </div>

          {/* Bottom primary accent strip */}
          <div className="h-0.5 bg-gradient-to-r from-primary/60 via-primary to-primary/60" />
        </div>
      </div>
    </>
  );
}
