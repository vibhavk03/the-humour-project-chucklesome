import { NextRequest, NextResponse } from "next/server";
import type { DedupeBucketNamesRequest } from "@/types/dedupe";

function getErrorMessage(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") return fallback;
  const record = body as Record<string, unknown>;
  return (
    (typeof record.error === "string" && record.error) ||
    (typeof record.message === "string" && record.message) ||
    (typeof record.statusMessage === "string" && record.statusMessage) ||
    fallback
  );
}

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let payload: DedupeBucketNamesRequest;
  try {
    payload = (await request.json()) as DedupeBucketNamesRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  if (!Array.isArray(payload.buckets)) {
    return NextResponse.json({ error: "Expected buckets array." }, { status: 400 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.almostcrackd.ai";
  const upstream = await fetch(`${baseUrl}/pipeline/name-dedupe-buckets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authorization,
    },
    body: JSON.stringify(payload),
  });
  const body = await upstream.json().catch(() => null);

  if (!upstream.ok) {
    return NextResponse.json(
      { error: getErrorMessage(body, "Failed to name dedupe buckets.") },
      { status: upstream.status }
    );
  }

  return NextResponse.json(body);
}
