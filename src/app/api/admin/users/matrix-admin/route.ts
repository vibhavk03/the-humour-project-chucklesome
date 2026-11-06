import { NextResponse } from "next/server";

import { createClient } from "@/utils/supabase/server";
import { applyUpdateAuditFields } from "@/utils/supabase/audit";
import type { ProfileAdminFlag } from "@/types/profile";

type MatrixAdminUpdatePayload = {
  userId?: unknown;
  isMatrixAdmin?: unknown;
};

export async function POST(request: Request) {
  let payload: MatrixAdminUpdatePayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const userId = typeof payload.userId === "string" ? payload.userId : null;
  const isMatrixAdmin =
    typeof payload.isMatrixAdmin === "boolean" ? payload.isMatrixAdmin : null;

  if (!userId || isMatrixAdmin === null) {
    return NextResponse.json(
      { error: "userId and isMatrixAdmin are required" },
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

  const { data, error } = await supabase
    .from("profiles")
    .update(
      applyUpdateAuditFields(
        {
          is_matrix_admin: isMatrixAdmin,
        },
        user.id
      )
    )
    .eq("id", userId)
    .select("id, is_matrix_admin")
    .single();

  if (error) {
    return NextResponse.json(
      {
        error: "Failed to update matrix admin",
        details: error.message,
        code: error.code,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    userId: data.id,
    isMatrixAdmin: data.is_matrix_admin,
  });
}
