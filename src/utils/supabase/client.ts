import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAuthCookieOptions } from "@/utils/supabase/authCookies";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { getSupabaseConfig } from "@/utils/supabase/config";

const { supabaseUrl, supabaseKey } = getSupabaseConfig();

// Create client only if both URL and key are available
let supabaseClient: SupabaseClient<Database> | null = null;

if (supabaseUrl && supabaseKey && typeof window !== "undefined") {
  supabaseClient = createBrowserClient<Database>(
    supabaseUrl,
    supabaseKey,
    { cookieOptions: getSupabaseAuthCookieOptions(supabaseUrl) },
  ) as unknown as SupabaseClient<Database>;
}

// Export the client with proper type, but allow it to be null
export const supabase = supabaseClient;
