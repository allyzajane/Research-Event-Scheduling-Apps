import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { applyDirection } from "@/i18n/index";
import i18n from "i18next";
import {
  LayoutDashboard, Users, FileText, BookOpen, Calendar,
  Settings, User, LogOut, Menu, X, ChevronRight, Hospital, Megaphone
} from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const roleColors: Record<string, string> = {
  admin: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  ceo: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  director: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  doctor: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  nurse: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  staff: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { user, isAdmin, signOut } = useAuth();
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = [
    { href: "/dashboard", icon: LayoutDashboard, label: t("nav.dashboard"), roles: ["admin","ceo","director","doctor","nurse","staff"] },
    { href: "/users", icon: Users, label: t("nav.users"), roles: ["admin"] },
    { href: "/documents", icon: FileText, label: t("nav.documents"), roles: ["admin","ceo","director","doctor","nurse","staff"] },
    { href: "/articles", icon: BookOpen, label: t("nav.articles"), roles: ["admin","ceo","director","doctor","nurse","staff"] },
    { href: "/calendar", icon: Calendar, label: t("nav.calendar"), roles: ["admin","ceo","director","doctor","nurse","staff"] },
    { href: "/admin/broadcast", icon: Megaphone, label: t("nav.broadcast"), roles: ["admin"] },
    { href: "/admin/settings", icon: Settings, label: t("nav.adminSettings"), roles: ["admin"] },
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

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border">
        <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
          <Hospital className="w-5 h-5 text-white" />
        </div>
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
              onClick={() => setSidebarOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-white shadow-sm"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="w-4.5 h-4.5 flex-shrink-0" />
              <span>{item.label}</span>
              {active && <ChevronRight className="w-3.5 h-3.5 ms-auto opacity-60" />}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="border-t border-sidebar-border p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-sidebar-accent transition-colors text-start">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-primary text-white text-xs font-semibold">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate">
                  {user?.full_name || user?.email}
                </p>
                <Badge className={cn("text-xs px-1.5 py-0 h-4 font-normal", roleColors[user?.role || "staff"])}>
                  {t(`users.roles.${user?.role || "staff"}`)}
                </Badge>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link href="/profile" className="flex items-center gap-2"><User className="w-4 h-4" />{t("nav.profile")}</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="text-destructive">
              <LogOut className="w-4 h-4 me-2" />{t("nav.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-60 bg-sidebar border-e border-sidebar-border flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-64 bg-sidebar border-e border-sidebar-border z-10">
            <SidebarContent />
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
          <div className="flex items-center gap-2">
            <NotificationBell />
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
    </div>
  );
}
