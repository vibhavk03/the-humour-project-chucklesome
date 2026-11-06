import type { Database } from "@/types/supabase";

export type CommunityRow = Database["public"]["Tables"]["communities"]["Row"];
export type CommunityInsert =
  Database["public"]["Tables"]["communities"]["Insert"];
export type CommunityUpdate =
  Database["public"]["Tables"]["communities"]["Update"];
export type Community = CommunityRow;

export default Community;
