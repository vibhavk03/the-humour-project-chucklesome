"use server"
import { createServerClient } from "@supabase/ssr";
import { getSupabaseAuthCookieOptions } from "@/utils/supabase/authCookies";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";
import {
	MISSING_SUPABASE_CONFIG_MESSAGE,
	getSupabaseConfig,
} from "@/utils/supabase/config";

export const createClient = async (): Promise<SupabaseClient<Database>> => {
	const cookieStore = await cookies();

	const { supabaseUrl, supabaseKey } = getSupabaseConfig();

	if (!supabaseUrl || !supabaseKey) {
		throw new Error(MISSING_SUPABASE_CONFIG_MESSAGE);
	}

	// Cast via unknown to align @supabase/ssr and @supabase/supabase-js generics.
	return createServerClient<Database>(
		supabaseUrl,
		supabaseKey,
		{
			cookieOptions: getSupabaseAuthCookieOptions(supabaseUrl),
			cookies: {
				getAll() {
					return cookieStore.getAll();
				},
				setAll(cookiesToSet) {
					try {
						for (const { name, value, options } of cookiesToSet) {
							cookieStore.set(name, value, options);
						}
					} catch (error) {
						console.error("Error setting cookies:", error);
					}
				},
			},
		},
	) as unknown as SupabaseClient<Database>;
};
