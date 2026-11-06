import { NextResponse } from "next/server";

import { createClient } from "@/utils/supabase/server";
import { applyUpdateAuditFields } from "@/utils/supabase/audit";
import type { ProfileAdminFlag } from "@/types/profile";

type BulkPermissionsPayload = {
  emails?: unknown;
  updates?: unknown;
};

type BulkPermissionUpdates = {
  is_superadmin?: boolean;
  is_matrix_admin?: boolean;
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function POST(request: Request) {
  let payload: BulkPermissionsPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const emailEntries = Array.isArray(payload.emails)
    ? payload.emails.filter((item): item is string => typeof item === "string")
    : [];
  const emails = Array.from(
    new Set(emailEntries.map(normalizeEmail).filter(Boolean)),
  );

  const updatesPayload =
    payload.updates && typeof payload.updates === "object" ? payload.updates : null;
  const updates: BulkPermissionUpdates = {};

  if (updatesPayload && "is_superadmin" in updatesPayload) {
    if (
      typeof (updatesPayload as BulkPermissionUpdates).is_superadmin === "boolean"
    ) {
      updates.is_superadmin = (updatesPayload as BulkPermissionUpdates).is_superadmin;
    }
  }
  if (updatesPayload && "is_matrix_admin" in updatesPayload) {
    if (
      typeof (updatesPayload as BulkPermissionUpdates).is_matrix_admin === "boolean"
    ) {
      updates.is_matrix_admin = (updatesPayload as BulkPermissionUpdates).is_matrix_admin;
    }
  }

  if (emails.length === 0) {
    return NextResponse.json(
      { error: "At least one email is required." },
      { status: 400 },
    );
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "At least one permission update is required." },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user.id)
    .single<ProfileAdminFlag>();

  if (profileError) {
    return NextResponse.json(
      { error: "Failed to verify permissions", details: profileError.message },
      { status: 500 },
    );
  }

  if (!profile?.is_superadmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: matchedProfiles, error: matchError } = await supabase
    .from("profiles")
    .select("id, email")
    .in("email", emails);

  if (matchError) {
    return NextResponse.json(
      { error: "Failed to resolve emails", details: matchError.message },
      { status: 400 },
    );
  }

  if (!matchedProfiles || matchedProfiles.length === 0) {
    return NextResponse.json(
      { error: "No matching users found for the provided emails." },
      { status: 404 },
    );
  }

  const matchedIds = matchedProfiles.map((profile) => profile.id);
  const matchedEmailSet = new Set(
    matchedProfiles
      .map((profile) => profile.email?.toLowerCase())
      .filter((email): email is string => Boolean(email)),
  );
  const missingEmails = emails.filter((email) => !matchedEmailSet.has(email));

  const { data: updatedProfiles, error: updateError } = await supabase
    .from("profiles")
    .update(applyUpdateAuditFields(updates, user.id))
    .in("id", matchedIds)
    .select("id, email, is_superadmin, is_matrix_admin");

  if (updateError) {
    return NextResponse.json(
      {
        error: "Failed to update user permissions",
        details: updateError.message,
        code: updateError.code,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    updatedCount: updatedProfiles?.length ?? 0,
    missingEmails,
    updated: updatedProfiles ?? [],
  });
}
