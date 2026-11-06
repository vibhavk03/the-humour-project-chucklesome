import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

type AuditInsertShape = Record<string, unknown> & {
  created_by_user_id?: string | null;
  modified_by_user_id?: string | null;
};

type AuditUpdateShape = Record<string, unknown> & {
  modified_by_user_id?: string | null;
};

type CurrentProfileIdOptions = {
  allowMissingUser?: boolean;
};

export async function getCurrentProfileId(
  client: SupabaseClient<Database>,
  options: CurrentProfileIdOptions = {}
): Promise<string | null> {
  const { data, error } = await client.auth.getUser();

  if (error) {
    if (options.allowMissingUser) return null;
    throw new Error(error.message);
  }

  const profileId = data.user?.id ?? null;
  if (!profileId && !options.allowMissingUser) {
    throw new Error("Authenticated user not found.");
  }

  return profileId;
}

export function applyInsertAuditFields<T extends AuditInsertShape>(
  payload: T,
  profileId: string | null
): T;
export function applyInsertAuditFields<T extends AuditInsertShape>(
  payload: T[],
  profileId: string | null
): T[];
export function applyInsertAuditFields<T extends AuditInsertShape>(
  payload: T | T[],
  profileId: string | null
): T | T[] {
  const applyAudit = (row: T): T =>
    profileId
      ? {
          ...row,
          created_by_user_id: row.created_by_user_id ?? profileId,
          modified_by_user_id: row.modified_by_user_id ?? profileId,
        }
      : row;

  return Array.isArray(payload) ? payload.map(applyAudit) : applyAudit(payload);
}

export function applyUpdateAuditFields<T extends AuditUpdateShape>(
  payload: T,
  profileId: string | null
): T {
  if (!profileId) return payload;

  return {
    ...payload,
    modified_by_user_id: payload.modified_by_user_id ?? profileId,
  };
}
