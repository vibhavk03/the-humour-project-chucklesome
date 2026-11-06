import type { Database } from "@/types/supabase";

export type CaptionVoteRow =
  Database["public"]["Tables"]["caption_votes"]["Row"];
export type CaptionVote = Pick<
  CaptionVoteRow,
  "id" | "caption_id" | "vote_value" | "profile_id"
>;
