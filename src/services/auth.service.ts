import { NextResponse } from "next/server";

import { createClient } from "@/utils/supabase/server";

export const GET = async (request: Request) => {
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
	}

	if (redirectTo) {
		return NextResponse.redirect(`${origin}${redirectTo}`);
	}

	return NextResponse.redirect(`${origin}/overview`);
};
