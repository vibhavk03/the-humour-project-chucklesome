import { supabase } from "@/utils/supabase/client";
import { Session } from "@supabase/supabase-js";

// Store the current session in memory for quick access
let cachedSession: Session | null = null;

// Listen for auth state changes and update cache
if (typeof window !== 'undefined' && supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    console.log("Auth state changed:", event, "Has session:", !!session);
    cachedSession = session;
    
    // If user just signed in, refresh the page to ensure clean state
    const publicRoutes = ['/', '/sign-in', '/forgot-password', '/reset-password'];
    if (event === 'SIGNED_IN' && !publicRoutes.includes(window.location.pathname)) {
      console.log("User signed in, refreshing page...");
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }
  });
}

/**
 * Safely get authentication token without throwing AuthSessionMissingError
 * Returns null if not authenticated instead of throwing
 */
export async function getClientAuthTokenSafe(): Promise<string | null> {
  console.log("Safely checking for auth token...");
  
  // Check if we have a supabase client
  if (!supabase) {
    console.error("No Supabase client available");
    return null;
  }

  try {
    // First check cached session
    if (cachedSession?.access_token && cachedSession.expires_at) {
      const now = Math.floor(Date.now() / 1000);
      if (cachedSession.expires_at > now) {
        console.log("Using cached session token");
        return cachedSession.access_token;
      }
    }

    // Get current session from Supabase
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.error("Session error:", sessionError);
      // Try to refresh if we have an error
      const { data: { session: refreshedSession } } = await supabase.auth.refreshSession();
      if (refreshedSession?.access_token) {
        console.log("Session refreshed after error");
        cachedSession = refreshedSession;
        return refreshedSession.access_token;
      }
      return null;
    }
    
    if (session?.access_token) {
      console.log("Found existing session with token");
      cachedSession = session;
      return session.access_token;
    }

    console.log("No session found, attempting to refresh...");
    
    // Try to refresh the session
    const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
    
    if (refreshedSession?.access_token) {
      console.log("Session refreshed successfully");
      cachedSession = refreshedSession;
      return refreshedSession.access_token;
    }
    
    if (refreshError) {
      console.log("Refresh failed:", refreshError.message);
    }
    
    console.log("No valid session available");
    return null;
    
  } catch (error) {
    // Catch any unexpected errors and return null instead of throwing
    console.error("Unexpected auth error:", error);
    return null;
  }
}

/**
 * Get auth token - throws error if not authenticated
 * Use this when authentication is required
 */
export async function getClientAuthToken(): Promise<string> {
  const token = await getClientAuthTokenSafe();
  
  if (!token) {
    throw new Error("Not authenticated. Please log in and try again.");
  }
  
  return token;
}

/**
 * Check if user is authenticated without throwing errors
 */
export async function ensureAuthenticated(): Promise<boolean> {
  const token = await getClientAuthTokenSafe();
  return !!token;
}

/**
 * Get current session info safely
 */
export async function getSessionInfo() {
  if (!supabase) return null;
  
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  } catch (error) {
    console.error("Error getting session info:", error);
    return null;
  }
}

/**
 * Clear cached session (useful for logout)
 */
export function clearCachedSession() {
  cachedSession = null;
}

/**
 * Force refresh the session
 */
export async function forceRefreshSession(): Promise<string | null> {
  if (!supabase) return null;
  
  try {
    const { data: { session }, error } = await supabase.auth.refreshSession();
    if (session?.access_token) {
      cachedSession = session;
      return session.access_token;
    }
    return null;
  } catch (error) {
    console.error("Force refresh failed:", error);
    return null;
  }
}
