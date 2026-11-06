import type { Database } from "@/types/supabase";

export type ShareRow = Database["public"]["Tables"]["shares"]["Row"];
export type ShareInsert = Database["public"]["Tables"]["shares"]["Insert"];
export type ShareUpdate = Database["public"]["Tables"]["shares"]["Update"];
export type Share = ShareRow;

export default Share;
