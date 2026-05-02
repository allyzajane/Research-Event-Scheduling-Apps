import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import { supabase } from "@/lib/supabase";

setBaseUrl(null);

// Cache the access token to avoid calling getSession() on every API request.
// Token is refreshed proactively: if it expires in < 60 s we force a refresh.
let _cachedToken: string | null = null;
let _tokenExpiresAt = 0; // unix ms

setAuthTokenGetter(async () => {
  const now = Date.now();

  // Return cached token if it's still valid with 60 s headroom
  if (_cachedToken && now < _tokenExpiresAt - 60_000) {
    return _cachedToken;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    _cachedToken = null;
    _tokenExpiresAt = 0;
    return null;
  }

  _cachedToken = session.access_token;
  // Supabase tokens expire in 1 hour; expires_at is a Unix timestamp in seconds
  _tokenExpiresAt = (session.expires_at ?? 0) * 1000;
  return _cachedToken;
});

// Clear token cache on auth state change (logout, refresh)
supabase.auth.onAuthStateChange((_event, session) => {
  _cachedToken = session?.access_token ?? null;
  _tokenExpiresAt = (session?.expires_at ?? 0) * 1000;
});

createRoot(document.getElementById("root")!).render(<App />);
