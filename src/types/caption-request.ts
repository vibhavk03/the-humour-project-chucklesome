import type { Database } from "@/types/supabase";
import type { LlmResponseRow } from "@/types/llm-response";

type CaptionRequestRow = Database["public"]["Tables"]["caption_requests"]["Row"];
type ImageRow = Database["public"]["Tables"]["images"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type CaptionRequestSummary = Pick<
  CaptionRequestRow,
  "id" | "created_datetime_utc" | "image_id" | "profile_id"
>;

export type CaptionRequest = CaptionRequestRow;

export type CaptionRequestListItem = CaptionRequestSummary & {
  profiles?: Pick<ProfileRow, "first_name" | "last_name"> | null;
  images?: Pick<ImageRow, "url"> | null;
};

export type CaptionRequestResponse = Pick<
  LlmResponseRow,
  | "id"
  | "created_datetime_utc"
  | "llm_model_id"
  | "humor_flavor_id"
  | "processing_time_seconds"
  | "llm_model_response"
  | "llm_system_prompt"
  | "llm_user_prompt"
  | "llm_temperature"
  | "profile_id"
  | "caption_request_id"
> & {
  llm_model_name?: string | null;
  humor_flavor_slug?: string | null;
};

export type CaptionRequestDetails = CaptionRequestSummary & {
  profiles?: Pick<ProfileRow, "first_name" | "last_name" | "email"> | null;
  images?: Pick<ImageRow, "url" | "image_description"> | null;
  llm_model_responses?: CaptionRequestResponse[];
};
