"use client";

import { supabase } from "@/utils/supabase/client";
import type { ProfileAdminFlag } from "@/types/profile";

/**
 * Check if the user is authenticated
 * @returns Promise<{user: User | null, session: Session | null}>
 */
export async function checkAuth() {
  // If supabase is null (during build/SSG), return empty user and session
  if (!supabase) {
    return { user: null, session: null };
  }

  const { data: { session } } = await supabase.auth.getSession();
  const { data: { user } } = await supabase.auth.getUser();

  return { user, session };
}

/**
 * Redirect to overview if user is authenticated and is a superadmin
 * Use this in login/signup pages client-side
 */
export async function redirectIfAuthenticated() {
  // Skip redirect during build/SSG
  if (!supabase) {
    return false;
  }

  const { user } = await checkAuth();
  
  if (user) {
    // Check if user exists in profiles table and is a superadmin
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("is_superadmin")
      .eq("id", user.id)
      .single<ProfileAdminFlag>();

    if (profileError || !profile?.is_superadmin) {
      // If not a superadmin, sign out and redirect to sign-in with error message
      await supabase.auth.signOut({ scope: "local" });
      window.location.href = "/?error=Access denied. Superadmin privileges required.";
      return true;
    }

    const publicRoutes = ['/', '/sign-in', '/forgot-password', '/reset-password'];
    const currentPath = window.location.pathname;

    // Only redirect to overview if we're on a public route
    if (publicRoutes.includes(currentPath)) {
      window.location.href = "/overview";
      return true;
    }
  }
  return false;
}

/**
 * Redirect to login if user is not authenticated
 * Use this in protected pages client-side
 */
export async function redirectIfNotAuthenticated() {
  // Skip redirect during build/SSG
  if (!supabase) {
    return false;
  }

  const { user } = await checkAuth();
  const currentPath = window.location.pathname;

  // Only redirect if user is not authenticated and we're not already on the landing page
  if (!user) {
    if (currentPath !== "/") {
      window.location.href = "/";
      return true;
    }
    return false;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user.id)
    .single<ProfileAdminFlag>();

  if (profileError || !profile?.is_superadmin) {
    await supabase.auth.signOut({ scope: "local" });
    window.location.href = "/?error=Access denied. Superadmin privileges required.";
    return true;
  }

  return false;
} 
