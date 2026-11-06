import type { Database } from "@/types/supabase";

export type CommunityContextRow =
  Database["public"]["Tables"]["community_contexts"]["Row"];
export type CommunityContextInsert =
  Database["public"]["Tables"]["community_contexts"]["Insert"];
export type CommunityContextUpdate =
  Database["public"]["Tables"]["community_contexts"]["Update"];
export type Context = CommunityContextRow;

export default Context;
