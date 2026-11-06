import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import type { ProfileAdminFlag } from "@/types/profile";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  
  // Get the host from headers and construct the origin
  const host = request.headers.get("host") || "";
  const protocol = host.includes("localhost") ? "http" : "https";
  const origin = `${protocol}://${host}`;
  
  const redirectTo = requestUrl.searchParams.get("redirect_to")?.toString();

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);

    try {
      // Get the current user after OAuth flow is complete
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        console.error("Error getting user:", userError);
        await supabase.auth.signOut({ scope: "local" });
        return NextResponse.redirect(`${origin}/?error=${encodeURIComponent("Failed to get user information")}`);
      }

      // Check if user exists in profiles table and is a superadmin
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("is_superadmin")
        .eq("id", user.id)
        .single<ProfileAdminFlag>();

      if (profileError) {
        console.error("Error checking profile:", profileError);
        await supabase.auth.signOut({ scope: "local" });
        return NextResponse.redirect(`${origin}/?error=${encodeURIComponent("Error checking user profile")}`);
      }

      if (!profile || !profile.is_superadmin) {
        console.error("User is not a superadmin:", user.id);
        await supabase.auth.signOut({ scope: "local" });
        return NextResponse.redirect(`${origin}/?error=${encodeURIComponent("Access denied. Superadmin privileges required.")}`);
      }

      console.log("Successfully authenticated superadmin:", user.id);
      return NextResponse.redirect(`${origin}/overview`);
    } catch (error) {
      console.error("Unexpected error in auth callback:", error);
      await supabase.auth.signOut({ scope: "local" });
      return NextResponse.redirect(`${origin}/?error=${encodeURIComponent("An unexpected error occurred during sign in")}`);
    }
  }

  return NextResponse.redirect(`${origin}/?error=${encodeURIComponent("No code provided")}`);
} 
