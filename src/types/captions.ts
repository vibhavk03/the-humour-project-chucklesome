import type { Database } from "@/types/supabase";
import type { LlmResponseRow } from "./llm-response";

type CaptionRow = Database["public"]["Tables"]["captions"]["Row"];
type ImageRow = Database["public"]["Tables"]["images"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type HumorFlavorRow = Database["public"]["Tables"]["humor_flavors"]["Row"];
type ReportedCaptionRow = Database["public"]["Tables"]["reported_captions"]["Row"];
type CaptionBase = Pick<CaptionRow, "id" | "content" | "image_id" | "profile_id"> &
  Partial<
    Pick<
      CaptionRow,
      | "created_datetime_utc"
      | "modified_datetime_utc"
      | "is_public"
      | "is_featured"
      | "like_count"
      | "caption_request_id"
      | "llm_prompt_chain_id"
      | "humor_flavor_id"
    >
  >;
type ReportedCaptionBase = Pick<
  ReportedCaptionRow,
  "id" | "reason" | "caption_id" | "profile_id" | "created_datetime_utc"
>;

export type CaptionInsert = Database["public"]["Tables"]["captions"]["Insert"];
export type CaptionUpdate = Database["public"]["Tables"]["captions"]["Update"];

export type LLMResponse = Pick<
  LlmResponseRow,
  "id" | "llm_model_response" | "created_datetime_utc" | "humor_flavor_id"
> & {
  llm_model_name: string;
  humor_flavor_slug: string | null;
  humor_flavor_step_id?: number | null;
  humor_flavor_step_order_by?: number | null;
  llm_system_prompt?: string | null;
  llm_user_prompt?: string | null;
  llm_temperature?: number | null;
  processing_time_seconds?: number | null;
};

export type Captions = CaptionBase & {
  llm_responses?: LLMResponse[];
  images?: Pick<ImageRow, "url"> | null;
  profiles?: Pick<ProfileRow, "first_name" | "last_name"> | null;
  share_count?: number;
  dislike_count?: number;
};

export type CaptionDetails = Captions & {
  humor_flavors?: Pick<HumorFlavorRow, "id" | "slug"> | null;
};

export type CaptionSearchResult = Pick<
  CaptionRow,
  "id" | "content" | "image_id" | "profile_id"
> &
  Partial<
    Pick<CaptionRow, "created_datetime_utc" | "is_public" | "like_count" | "humor_flavor_id">
  > & {
    profiles?:
      | (Pick<ProfileRow, "first_name" | "last_name"> &
          Partial<Pick<ProfileRow, "email">>)
      | null;
    images?: Pick<ImageRow, "url"> | null;
    humor_flavors?: Pick<HumorFlavorRow, "id" | "slug"> | null;
    share_count?: number;
  };

export type ReportedCaptions = ReportedCaptionBase & {
  captions?: (Pick<CaptionRow, "id" | "content" | "image_id"> & {
    images?: Pick<ImageRow, "url"> | null;
  }) | null;
  profiles?: Pick<ProfileRow, "first_name" | "last_name"> | null;
};
