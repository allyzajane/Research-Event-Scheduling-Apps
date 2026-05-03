import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  full_name?: string;
  full_name_ar?: string;
  avatar_url?: string;
  signature_url?: string;
  signature_drawn_url?: string;
  signature_active_type?: string;
  department?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  sessionReady: boolean;
  isAdmin: boolean;
  role: string;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  updateUser: (partial: Partial<AuthUser>) => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

/** Minimal user built from JWT claims only (used as a fast initial state). */
function userFromJwt(supabaseUser: User): AuthUser {
  const meta = supabaseUser.user_metadata || {};
  return {
    id:         supabaseUser.id,
    email:      supabaseUser.email || "",
    role:       (meta.role as string) || "staff",
  };
}

/** Fetch the full profile row from the backend (reads `profiles` table). */
async function fetchProfile(session: Session): Promise<Partial<AuthUser> | null> {
  try {
    const res = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    const resolveStorageUrl = (value: unknown) => {
      const path = typeof value === "string" ? value : "";
      if (!path) return undefined;
      if (path.startsWith("http://") || path.startsWith("https://")) return path;
      const base = import.meta.env.VITE_SUPABASE_URL || "";
      return base ? `${base}/storage/v1/object/public/hospital-files/${path}` : path;
    };
    return {
      id:            data.id as string,
      email:         (data.email as string) || session.user.email || "",
      role:                 (data.role as string)   || "staff",
      full_name:            (data.full_name            as string | undefined) || undefined,
      full_name_ar:         (data.full_name_ar         as string | undefined) || undefined,
      avatar_url:           (data.avatar_url           as string | undefined) || undefined,
      signature_url:        resolveStorageUrl(data.signature_url),
      signature_drawn_url:  resolveStorageUrl(data.signature_drawn_url),
      signature_active_type:(data.signature_active_type as string | undefined) || undefined,
      department:           (data.department           as string | undefined) || undefined,
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user,    setUser]    = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);

  // Prevent duplicate profile fetches when the auth state fires multiple times.
  const fetchingRef = useRef(false);

  const applySession = useCallback(async (newSession: Session | null) => {
    setSession(newSession);

    if (!newSession) {
      setUser(null);
      setLoading(false);
      setSessionReady(true);
      return;
    }

    // Set a quick stub from JWT so the UI isn't blank during the fetch.
    setUser(userFromJwt(newSession.user));

    // Fetch the real profile from the DB (only one at a time).
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const profile = await fetchProfile(newSession);
      if (profile) {
        setUser(prev => prev ? { ...prev, ...profile } : profile as AuthUser);
      }
    } finally {
      fetchingRef.current = false;
      setLoading(false);
      setSessionReady(true);
    }
  }, []);

  useEffect(() => {
    // Initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      applySession(session);
    });

    // Auth state changes (sign-in, sign-out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    return () => subscription.unsubscribe();
  }, [applySession]);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  /** Merge a partial update into the in-memory user (already persisted by the caller). */
  const updateUser = useCallback((partial: Partial<AuthUser>) => {
    setUser(prev => prev ? { ...prev, ...partial } : prev);
  }, []);

  /** Re-fetch the full profile from the server (e.g. after saving). */
  const refreshProfile = useCallback(async () => {
    if (!sessionReady) return;
    const { data: { session: current } } = await supabase.auth.getSession();
    if (!current) return;
    const profile = await fetchProfile(current);
    if (profile) {
      setUser(prev => prev ? { ...prev, ...profile } : profile as AuthUser);
    }
  }, [sessionReady]);

  const role    = user?.role || "";
  const isAdmin = role === "admin";

  return (
    <AuthContext.Provider value={{ user, session, loading, sessionReady, isAdmin, role, signIn, signOut, updateUser, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
