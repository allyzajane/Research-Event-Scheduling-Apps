import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useTheme } from "next-themes";
import { useAuth } from "@/contexts/AuthContext";
import type { AuthUser } from "@/contexts/AuthContext";
import { applyDirection } from "@/i18n/index";
import i18n from "i18next";
import { useGetLandingPage, useGetThemeSettings } from "@workspace/api-client-react";
import {
  LayoutDashboard, Users, FileText, BookOpen, Calendar,
  Settings, User, LogOut, Menu, ChevronRight, Hospital,
  Megaphone, MoreVertical, Moon, Sun,
} from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { EventInviteToast } from "@/components/EventInviteToast";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ── Constants ─────────────────────────────────────────────────────────────────

const roleColors: Record<string, string> = {
  admin:    "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  ceo:      "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  director: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  doctor:   "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  nurse:    "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  staff:    "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

function getASTClock() {
  const now = new Date();
  return {
    time: new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).format(now),
    date: new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Riyadh", weekday: "short", day: "numeric", month: "short",
    }).format(now),
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
  roles: string[];
}

// ── SidebarProfile — extracted component so it is stable across renders ───────

interface SidebarProfileProps {
  user: AuthUser | null;
  initials: string;
  onNavigate: (href: string) => void;
  onSignOut: () => void;
}

function SidebarProfile({ user, initials, onNavigate, onSignOut }: SidebarProfileProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setOpen(false); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div ref={wrapperRef} className="border-t border-sidebar-border p-3 relative">

      {/* Popup panel — anchored above the trigger row */}
      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-2 right-2 mb-1.5 z-50 bg-card border border-border rounded-xl shadow-xl overflow-hidden"
          style={{ animation: "fadeSlideUp 120ms ease-out" }}
        >
          <button
            role="menuitem"
            onClick={() => { setOpen(false); onNavigate("/profile"); }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-muted focus:bg-muted outline-none transition-colors"
          >
            <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            {t("nav.profile")}
          </button>
          <div className="h-px bg-border mx-1" />
          <button
            role="menuitem"
            onClick={() => { setOpen(false); onSignOut(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10 focus:bg-destructive/10 outline-none transition-colors"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {t("nav.logout")}
          </button>
        </div>
      )}

      {/* Trigger row */}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(prev => !prev)}
        className={cn(
          "w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-colors text-start select-none",
          open ? "bg-sidebar-accent" : "hover:bg-sidebar-accent",
        )}
      >
        <Avatar className="w-8 h-8 flex-shrink-0">
          <AvatarImage
            src={user?.avatar_url || undefined}
            alt={user?.full_name || user?.email}
            className="object-cover"
          />
          <AvatarFallback className="bg-primary text-white text-xs font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-sidebar-foreground truncate">
            {user?.full_name || user?.email}
          </p>
          <Badge className={cn("text-xs px-1.5 py-0 h-4 font-normal", roleColors[user?.role || "staff"])}>
            {t(`users.roles.${user?.role || "staff"}`)}
          </Badge>
        </div>

        <MoreVertical
          className={cn(
            "w-4 h-4 flex-shrink-0 text-muted-foreground transition-transform duration-150",
            open && "rotate-90",
          )}
        />
      </button>
    </div>
  );
}

// ── SidebarContent — extracted component so it is stable across renders ───────

interface SidebarContentProps {
  visibleItems: NavItem[];
  location: string;
  user: AuthUser | null;
  initials: string;
  logoUrl?: string | null;
  onClose: () => void;
  onNavigate: (href: string) => void;
  onSignOut: () => void;
}

function SidebarContent({
  visibleItems, location, user, initials, logoUrl, onClose, onNavigate, onSignOut,
}: SidebarContentProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt="Hospital Logo"
            className="w-9 h-9 rounded-xl object-contain bg-white p-0.5 flex-shrink-0"
          />
        ) : (
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
            <Hospital className="w-5 h-5 text-white" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-sidebar-foreground leading-tight truncate">
            {i18n.language === "ar" ? "مستشفى الطائف" : "Taif Hospital"}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {i18n.language === "ar" ? "منصة الأبحاث" : "Research Platform"}
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visibleItems.map(item => {
          const active = location === item.href || location.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-white shadow-sm"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <item.icon className="w-4.5 h-4.5 flex-shrink-0" />
              <span>{item.label}</span>
              {active && <ChevronRight className="w-3.5 h-3.5 ms-auto opacity-60" />}
            </Link>
          );
        })}
      </nav>

      {/* Profile / sign-out */}
      <SidebarProfile
        user={user}
        initials={initials}
        onNavigate={onNavigate}
        onSignOut={onSignOut}
      />
    </div>
  );
}

// ── AppLayout ─────────────────────────────────────────────────────────────────

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const [location, navigate] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [astClock, setAstClock] = useState(getASTClock);

  const { data: landingData } = useGetLandingPage();
  const { data: themeData } = useGetThemeSettings();
  const logoUrl = landingData?.logo_url || themeData?.logo_url || null;

  useEffect(() => {
    const id = setInterval(() => setAstClock(getASTClock()), 1000);
    return () => clearInterval(id);
  }, []);

  const navItems: NavItem[] = [
    { href: "/dashboard",      icon: LayoutDashboard, label: t("nav.dashboard"),     roles: ["admin","ceo","director","doctor","nurse","staff"] },
    { href: "/users",          icon: Users,            label: t("nav.users"),         roles: ["admin"] },
    { href: "/documents",      icon: FileText,         label: t("nav.documents"),     roles: ["admin","ceo","director","doctor","nurse","staff"] },
    { href: "/articles",       icon: BookOpen,         label: t("nav.articles"),      roles: ["admin","ceo","director","doctor","nurse","staff"] },
    { href: "/calendar",       icon: Calendar,         label: t("nav.calendar"),      roles: ["admin","ceo","director","doctor","nurse","staff"] },
    { href: "/admin/broadcast",icon: Megaphone,        label: t("nav.broadcast"),     roles: ["admin"] },
    { href: "/admin/settings", icon: Settings,         label: t("nav.adminSettings"), roles: ["admin"] },
  ];

  const visibleItems = navItems.filter(item => user && item.roles.includes(user.role));

  const toggleLang = () => {
    const next = i18n.language === "ar" ? "en" : "ar";
    i18n.changeLanguage(next);
    applyDirection(next);
  };

  const initials = user?.full_name
    ? user.full_name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() || "U";

  const handleNavigate = (href: string) => {
    setSidebarOpen(false);
    navigate(href);
  };

  const sharedSidebarProps: SidebarContentProps = {
    visibleItems,
    location,
    user,
    initials,
    logoUrl,
    onClose:    () => setSidebarOpen(false),
    onNavigate: handleNavigate,
    onSignOut:  signOut,
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-60 bg-sidebar border-e border-sidebar-border flex-shrink-0">
        <SidebarContent {...sharedSidebarProps} />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-64 bg-sidebar border-e border-sidebar-border z-10 flex flex-col">
            <SidebarContent {...sharedSidebarProps} />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-5 h-5" />
            </Button>
            <div className="hidden sm:block">
              <h1 className="text-sm font-semibold text-foreground">
                {visibleItems.find(i => location.startsWith(i.href))?.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Saudi Local Time — 24h military clock */}
            <div className="hidden sm:flex flex-col items-end leading-none select-none border-r border-border pr-3 mr-1">
              <span className="font-mono text-sm font-bold tabular-nums text-foreground tracking-tight">
                {astClock.time}
              </span>
              <span className="text-[10px] text-muted-foreground mt-0.5 tracking-wide">
                {astClock.date} · KSA
              </span>
            </div>
            <NotificationBell />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              aria-label="Toggle dark mode"
            >
              {resolvedTheme === "dark"
                ? <Sun className="w-4 h-4" />
                : <Moon className="w-4 h-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={toggleLang} className="text-xs font-semibold px-3 h-8">
              {i18n.language === "ar" ? "EN" : "عر"}
            </Button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Event invitation toast — shown once per login session */}
      <EventInviteToast />

      {/* Keyframe for profile menu entrance */}
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
