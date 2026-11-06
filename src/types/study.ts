import type { Database } from "@/types/supabase";

type StudyRow = Database["public"]["Tables"]["studies"]["Row"];
type StudyCaptionMappingRow =
  Database["public"]["Tables"]["study_caption_mappings"]["Row"];
type CaptionRow = Database["public"]["Tables"]["captions"]["Row"];
type HumorFlavorRow = Database["public"]["Tables"]["humor_flavors"]["Row"];
type LlmResponseRow = Database["public"]["Tables"]["llm_model_responses"]["Row"];

export type Study = StudyRow;
export type StudyInsert = Database["public"]["Tables"]["studies"]["Insert"];
export type StudyUpdate = Database["public"]["Tables"]["studies"]["Update"];

export type StudyCaptionMapping = StudyCaptionMappingRow;
export type StudyCaptionMappingInsert =
  Database["public"]["Tables"]["study_caption_mappings"]["Insert"];
export type StudyCaptionMappingUpdate =
  Database["public"]["Tables"]["study_caption_mappings"]["Update"];

export type StudyCaptionMappingWithDetails = StudyCaptionMappingRow & {
  studies?: Pick<StudyRow, "id" | "slug"> | null;
  captions?: Pick<CaptionRow, "id" | "content"> | null;
};

export type StudyCaptionMappingWithCaptionDetails = StudyCaptionMappingRow & {
  captions?: (Pick<
    CaptionRow,
    | "id"
    | "content"
    | "image_id"
    | "created_datetime_utc"
    | "like_count"
    | "humor_flavor_id"
  > & {
    images?: Pick<ImageRow, "url" | "image_description"> | null;
    humor_flavors?: Pick<HumorFlavorRow, "id" | "slug"> | null;
    caption_requests?: Array<{
      llm_model_responses?: Array<
        Pick<LlmResponseRow, "id" | "created_datetime_utc" | "humor_flavor_id"> & {
          humor_flavors?: Pick<HumorFlavorRow, "id" | "slug"> | null;
        }
      > | null;
    }> | null;
  }) | null;
};

type StudyImageSetRow = Database["public"]["Tables"]["study_image_sets"]["Row"];
type StudyImageSetImageMappingRow =
  Database["public"]["Tables"]["study_image_set_image_mappings"]["Row"];
type ImageRow = Database["public"]["Tables"]["images"]["Row"];

export type StudyImageSet = StudyImageSetRow;
export type StudyImageSetWithCount = StudyImageSet & { imageCount: number };
export type StudyImageSetInsert =
  Database["public"]["Tables"]["study_image_sets"]["Insert"];
export type StudyImageSetUpdate =
  Database["public"]["Tables"]["study_image_sets"]["Update"];

export type StudyImageSetImageMapping = StudyImageSetImageMappingRow;
export type StudyImageSetImageMappingInsert =
  Database["public"]["Tables"]["study_image_set_image_mappings"]["Insert"];
export type StudyImageSetImageMappingUpdate =
  Database["public"]["Tables"]["study_image_set_image_mappings"]["Update"];

export type StudyImageSetImageMappingWithDetails =
  StudyImageSetImageMappingRow & {
    images?: Pick<
      ImageRow,
      "id" | "url" | "image_description" | "additional_context" | "celebrity_recognition"
    > | null;
  };
