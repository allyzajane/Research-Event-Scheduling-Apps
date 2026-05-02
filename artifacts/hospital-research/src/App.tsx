import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import NotFound from "@/pages/not-found";
import "@/i18n/index";

// Lazy-loaded pages — each page is a separate JS chunk loaded on demand,
// reducing initial bundle size and startup time.
const LandingPage   = lazy(() => import("@/pages/LandingPage"));
const LoginPage     = lazy(() => import("@/pages/LoginPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const UsersPage     = lazy(() => import("@/pages/UsersPage"));
const DocumentsPage = lazy(() => import("@/pages/DocumentsPage"));
const ArticlesPage  = lazy(() => import("@/pages/ArticlesPage"));
const CalendarPage  = lazy(() => import("@/pages/CalendarPage"));
const SettingsPage  = lazy(() => import("@/pages/SettingsPage"));
const ProfilePage   = lazy(() => import("@/pages/ProfilePage"));

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

        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
