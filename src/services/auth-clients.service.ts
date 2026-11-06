import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AuthClientRow,
  AuthClientSort,
  CreateAuthClientPayload,
  ProfileNameRow,
  UpdateAuthClientPayload,
} from "@/types/auth-client";
import type { Database } from "@/types/supabase";
import { clientSecretHashFromSecret } from "@/utils/auth/client-secret";
import { supabase } from "@/utils/supabase/client";
import { getCurrentProfileId } from "@/utils/supabase/audit";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/utils/supabase/config";

type TypedClient = SupabaseClient<Database>;
type AuthClientBaseRow = Omit<AuthClientRow, "token_count">;

export interface FetchAuthClientsParams {
  sort?: AuthClientSort;
}

const defaultSort: AuthClientSort = {
  column: "client_id",
  direction: "asc",
};

function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return new Error(message);
    }
  }

  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error(String(error));
  }
}

function getClient(): TypedClient {
  if (!supabase) {
    throw new Error(MISSING_SUPABASE_CONFIG_MESSAGE);
  }

  return supabase;
}

async function fetchAuthTokenCountsByClientIds(
  client: TypedClient,
  clientIds: number[],
): Promise<Map<number, number>> {
  const uniqueIds = [...new Set(clientIds)];
  const countsByClientId = new Map(uniqueIds.map((id) => [id, 0]));
  if (uniqueIds.length === 0) return countsByClientId;

  const counts = await Promise.all(
    uniqueIds.map(async (clientId) => {
      const { count, error } = await client
        .from("auth_tokens")
        .select("id", { count: "exact", head: true })
        .eq("auth_client_id", clientId);

      if (error) throw error;
      return [clientId, count ?? 0] as const;
    }),
  );

  for (const [clientId, count] of counts) {
    countsByClientId.set(clientId, count);
  }

  return countsByClientId;
}

export class AuthClientsService {
  static async list({
    sort = defaultSort,
  }: FetchAuthClientsParams = {}): Promise<{
    data: AuthClientRow[];
    error: Error | null;
  }> {
    try {
      const client = getClient();
      const dbSortColumn = sort.column === "token_count" ? "client_id" : sort.column;
      const { data, error } = await client
        .from("auth_clients")
        .select("id,client_id,created_by_user_id,modified_by_user_id")
        .order(dbSortColumn, {
          ascending: sort.direction === "asc",
          nullsFirst: false,
        })
        .order("id", { ascending: true });

      if (error) throw error;

      const clientRows = (data ?? []) as AuthClientBaseRow[];
      const countsByClientId = await fetchAuthTokenCountsByClientIds(
        client,
        clientRows.map((row) => row.id),
      );
      const rowsWithCounts = clientRows.map((row) => ({
        ...row,
        token_count: countsByClientId.get(row.id) ?? 0,
      }));

      if (sort.column === "token_count") {
        const directionFactor = sort.direction === "asc" ? 1 : -1;
        rowsWithCounts.sort((a, b) => {
          const byTokenCount = (a.token_count - b.token_count) * directionFactor;
          return byTokenCount || a.client_id.localeCompare(b.client_id) || a.id - b.id;
        });
      }

      return { data: rowsWithCounts, error: null };
    } catch (error) {
      return { data: [], error: toError(error) };
    }
  }

  static async listProfileNamesByIds(
    ids: string[],
  ): Promise<{ data: ProfileNameRow[]; error: Error | null }> {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (uniqueIds.length === 0) return { data: [], error: null };

    try {
      const client = getClient();
      const { data, error } = await client
        .from("profiles")
        .select("id,email,first_name,last_name")
        .in("id", uniqueIds);

      if (error) throw error;
      return { data: (data ?? []) as ProfileNameRow[], error: null };
    } catch (error) {
      return { data: [], error: toError(error) };
    }
  }

  static async create(
    payload: CreateAuthClientPayload,
  ): Promise<{ data: AuthClientRow | null; error: Error | null }> {
    try {
      const client = getClient();
      const profileId = await getCurrentProfileId(client);
      if (!profileId) throw new Error("Authenticated user not found.");

      const clientId = payload.client_id.trim();
      if (!clientId) throw new Error("Client ID is required.");

      const { data, error } = await client
        .from("auth_clients")
        .insert({
          client_id: clientId,
          client_secret_hash: await clientSecretHashFromSecret(payload.client_secret),
          created_by_user_id: profileId,
          modified_by_user_id: profileId,
        })
        .select("id,client_id,created_by_user_id,modified_by_user_id")
        .maybeSingle();

      if (error) throw error;
      return {
        data: data ? ({ ...data, token_count: 0 } as AuthClientRow) : null,
        error: null,
      };
    } catch (error) {
      return { data: null, error: toError(error) };
    }
  }

  static async update(
    clientRowId: number,
    patch: UpdateAuthClientPayload,
  ): Promise<{ data: AuthClientRow | null; error: Error | null }> {
    try {
      const client = getClient();
      const profileId = await getCurrentProfileId(client);
      if (!profileId) throw new Error("Authenticated user not found.");

      const update: Database["public"]["Tables"]["auth_clients"]["Update"] = {
        modified_by_user_id: profileId,
      };

      if ("client_id" in patch) {
        const clientId = patch.client_id?.trim() ?? "";
        if (!clientId) throw new Error("Client ID is required.");
        update.client_id = clientId;
      }

      if ("client_secret" in patch) {
        update.client_secret_hash = await clientSecretHashFromSecret(
          patch.client_secret ?? null,
        );
      }

      if (Object.keys(update).length === 1) {
        throw new Error("No client changes to save.");
      }

      const { data, error } = await client
        .from("auth_clients")
        .update(update)
        .eq("id", clientRowId)
        .select("id,client_id,created_by_user_id,modified_by_user_id")
        .maybeSingle();

      if (error) throw error;
      return {
        data: data ? ({ ...data, token_count: 0 } as AuthClientRow) : null,
        error: null,
      };
    } catch (error) {
      return { data: null, error: toError(error) };
    }
  }

  static async remove(clientRowId: number): Promise<{ error: Error | null }> {
    try {
      const client = getClient();
      const { error } = await client.from("auth_clients").delete().eq("id", clientRowId);

      if (error) throw error;
      return { error: null };
    } catch (error) {
      return { error: toError(error) };
    }
  }
}
