import { lazy, Suspense, useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import NotFound from "@/pages/not-found";
import "@/i18n/index";
import { useGetThemeSettings } from "@workspace/api-client-react";
import { applyPrimaryColor } from "@/lib/theme";

// Re-applies the saved primary color whenever the resolved theme (light/dark) changes,
// so the brand color always wins over the default dark-mode CSS values.
function ThemeApplier() {
  const { data: theme } = useGetThemeSettings();
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (theme?.primary_color) applyPrimaryColor(theme.primary_color);
  }, [theme?.primary_color, resolvedTheme]);
  return null;
}

// Lazy-loaded pages — each page is a separate JS chunk loaded on demand,
// reducing initial bundle size and startup time.
const LandingPage   = lazy(() => import("@/pages/LandingPage"));
const LoginPage     = lazy(() => import("@/pages/LoginPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const UsersPage     = lazy(() => import("@/pages/UsersPage"));
const DocumentsPage = lazy(() => import("@/pages/DocumentsPage"));
const ArticlesPage  = lazy(() => import("@/pages/ArticlesPage"));
const CalendarPage  = lazy(() => import("@/pages/CalendarPage"));
const AttendancePage = lazy(() => import("@/pages/AttendancePage"));
const SettingsPage  = lazy(() => import("@/pages/SettingsPage"));
const ProfilePage           = lazy(() => import("@/pages/ProfilePage"));
const NotificationBroadcastPage = lazy(() => import("@/pages/NotificationBroadcastPage"));
const AttendanceControlPage = lazy(() => import("@/pages/AttendanceControlPage"));

// PageLoader — lightweight spinner shown while a chunk loads
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // Conservative defaults — individual hooks can override
      staleTime: 30_000,
      // Avoid background refetches when the tab is not visible
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={LandingPage} />
        <Route path="/login" component={LoginPage} />

        <Route path="/dashboard">
          <ProtectedRoute>
            <AppLayout><DashboardPage /></AppLayout>
          </ProtectedRoute>
        </Route>

        <Route path="/users">
          <ProtectedRoute adminOnly>
            <AppLayout><UsersPage /></AppLayout>
          </ProtectedRoute>
        </Route>

        <Route path="/documents">
          <ProtectedRoute>
            <AppLayout><DocumentsPage /></AppLayout>
          </ProtectedRoute>
        </Route>

        <Route path="/articles">
          <ProtectedRoute>
            <AppLayout><ArticlesPage /></AppLayout>
          </ProtectedRoute>
        </Route>

        <Route path="/calendar">
          <ProtectedRoute>
            <AppLayout><CalendarPage /></AppLayout>
          </ProtectedRoute>
        </Route>

        <Route path="/attendance">
          <ProtectedRoute>
            <AppLayout><AttendancePage /></AppLayout>
          </ProtectedRoute>
        </Route>

        <Route path="/admin/settings">
          <ProtectedRoute adminOnly>
            <AppLayout><SettingsPage /></AppLayout>
          </ProtectedRoute>
        </Route>

        <Route path="/profile">
          <ProtectedRoute>
            <AppLayout><ProfilePage /></AppLayout>
          </ProtectedRoute>
        </Route>

        <Route path="/admin/broadcast">
          <ProtectedRoute adminOnly>
            <AppLayout><NotificationBroadcastPage /></AppLayout>
          </ProtectedRoute>
        </Route>

        <Route path="/admin/attendance-control">
          <ProtectedRoute adminOnly>
            <AppLayout><AttendanceControlPage /></AppLayout>
          </ProtectedRoute>
        </Route>

        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <TooltipProvider>
          <AuthProvider>
            <ThemeApplier />
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
