import type { Database } from "@/types/supabase";

export type CommunityContextTagRow =
  Database["public"]["Tables"]["community_context_tags"]["Row"];
export type CommunityContextTagInsert =
  Database["public"]["Tables"]["community_context_tags"]["Insert"];
export type CommunityContextTagUpdate =
  Database["public"]["Tables"]["community_context_tags"]["Update"];
export type CommunityContextTag = CommunityContextTagRow;

export type CommunityContextTagMapping =
  Database["public"]["Tables"]["community_context_tag_mappings"]["Row"];
export type CommunityContextTagMappingInsert =
  Database["public"]["Tables"]["community_context_tag_mappings"]["Insert"];
export type CommunityContextTagMappingUpdate =
  Database["public"]["Tables"]["community_context_tag_mappings"]["Update"];

export default CommunityContextTag;
