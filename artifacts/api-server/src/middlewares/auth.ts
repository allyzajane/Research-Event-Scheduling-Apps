import { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabase";

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  full_name: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice(7);
  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const role = (data.user.user_metadata?.role as string) || "staff";
  const full_name = (data.user.user_metadata?.full_name as string) || null;
  req.user = {
    id: data.user.id,
    email: data.user.email || "",
    role,
    full_name,
  };

  next();
}

export const ADMIN_ROLES = ["admin", "ceo", "director"] as const;
export type AdminRole = typeof ADMIN_ROLES[number];

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden: insufficient permissions" });
      return;
    }
    next();
  };
}

/** Returns true if the user's role is an admin-tier role. */
export function isAdminRole(role: string): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(role);
}
