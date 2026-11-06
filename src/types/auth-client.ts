import type { Database } from "@/types/supabase";

export type AuthClientRow = Pick<
  Database["public"]["Tables"]["auth_clients"]["Row"],
  "id" | "client_id" | "created_by_user_id" | "modified_by_user_id"
> & {
  token_count: number;
};

export type ProfileNameRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "email" | "first_name" | "last_name"
>;

export type AuthClientSortColumn =
  | "id"
  | "client_id"
  | "token_count"
  | "created_by_user_id"
  | "modified_by_user_id";

export type AuthClientSortDirection = "asc" | "desc";

export interface AuthClientSort {
  column: AuthClientSortColumn;
  direction: AuthClientSortDirection;
}

export interface CreateAuthClientPayload {
  client_id: string;
  client_secret: string | null;
}

export interface UpdateAuthClientPayload {
  client_id?: string;
  client_secret?: string | null;
}
