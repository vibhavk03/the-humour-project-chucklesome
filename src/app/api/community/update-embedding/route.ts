import { NextResponse } from "next/server";

const INTERNAL_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export async function POST(request: Request) {
  if (!INTERNAL_API_BASE_URL) {
    return NextResponse.json(
      { error: "API configuration not set" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

  if (!token) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization header" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const communityContextId = Number(
    (body as { communityContextId?: unknown })?.communityContextId,
  );

  if (!Number.isFinite(communityContextId)) {
    return NextResponse.json(
      { error: "communityContextId is required and must be a number" },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(
      `${INTERNAL_API_BASE_URL}/community/update-embedding`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ communityContextId }),
      },
    );

    if (!response.ok) {
      const message = await response.text();
      return NextResponse.json(
        { error: `Embedding update failed (${response.status})`, details: message },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to call embedding update endpoint:", error);
    return NextResponse.json(
      { error: "Failed to update embedding" },
      { status: 500 },
    );
  }
}
