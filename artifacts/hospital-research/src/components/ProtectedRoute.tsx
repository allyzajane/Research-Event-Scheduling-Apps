import { ReactNode } from "react";
import { Redirect } from "wouter";
import { useAuth } from "@/contexts/AuthContext";

interface ProtectedRouteProps {
  children: ReactNode;
  /** Redirect non-authenticated users to /login. Always active. */
  adminOnly?: boolean;
  /** If provided, only these roles may access the route (others → /dashboard). */
  allowedRoles?: string[];
}

export function ProtectedRoute({ children, adminOnly = false, allowedRoles }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Redirect to="/login" />;

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Redirect to="/dashboard" />;
  }

  if (adminOnly && user.role !== "admin") return <Redirect to="/dashboard" />;

  return <>{children}</>;
}
