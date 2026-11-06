import { createServerClient } from "@supabase/ssr";
import { getSupabaseAuthCookieOptions } from "@/utils/supabase/authCookies";
import { type NextRequest, NextResponse } from "next/server";
import type { Database } from "@/types/supabase";
import type { ProfileAdminFlag } from "@/types/profile";
import {
	MISSING_SUPABASE_CONFIG_MESSAGE,
	getSupabaseConfig,
} from "@/utils/supabase/config";

export const updateSession = async (request: NextRequest) => {
	try {
		let response = NextResponse.next({
			request: {
				headers: request.headers,
			},
		});

		const { supabaseUrl, supabaseKey } = getSupabaseConfig();

		if (!supabaseUrl || !supabaseKey) {
			throw new Error(MISSING_SUPABASE_CONFIG_MESSAGE);
		}

		const supabase = createServerClient<Database>(
			supabaseUrl,
			supabaseKey,
			{
				cookieOptions: getSupabaseAuthCookieOptions(supabaseUrl),
				cookies: {
					getAll() {
						return request.cookies.getAll();
					},
					setAll(cookiesToSet) {
						for (const { name, value } of cookiesToSet) {
							request.cookies.set(name, value);
						}
						response = NextResponse.next({
							request,
						});
						for (const { name, value, options } of cookiesToSet) {
							response.cookies.set(name, value, options);
						}
					},
				},
			},
		);

		// Get the user data from the session
		const { data: { user } } = await supabase.auth.getUser();
		
		const pathname = request.nextUrl.pathname;
		const publicRoutes = ["/", "/sign-in", "/forgot-password", "/reset-password"];
		const isAuthRoute = pathname.startsWith("/auth");
		const isPublicRoute = publicRoutes.includes(pathname);

		// Redirect authenticated users away from public auth screens
		if (isPublicRoute && user) {
			return NextResponse.redirect(new URL("/overview", request.url));
		}

		// Protect all non-auth routes
		if (!isPublicRoute && !isAuthRoute) {
			if (!user) {
				return NextResponse.redirect(new URL("/", request.url));
			}

			const { data: profile } = await supabase
				.from("profiles")
				.select("is_superadmin")
				.eq("id", user.id)
				.single<ProfileAdminFlag>();

			if (!profile?.is_superadmin) {
				await supabase.auth.signOut({ scope: "local" });
				return NextResponse.redirect(
					new URL(
						"/?error=Access%20denied.%20Superadmin%20privileges%20required.",
						request.url,
					),
				);
			}
		}

		return response;
	} catch (error) {
		console.error("Middleware error:", error);
		return NextResponse.next({
			request: {
				headers: request.headers,
			},
		});
	}
};
