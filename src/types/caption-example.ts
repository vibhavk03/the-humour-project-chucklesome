import type { Database } from "@/types/supabase";

export type CaptionExampleRow =
  Database["public"]["Tables"]["caption_examples"]["Row"];
export type CaptionExampleInsert =
  Database["public"]["Tables"]["caption_examples"]["Insert"];
export type CaptionExampleUpdate =
  Database["public"]["Tables"]["caption_examples"]["Update"];
export type CaptionExample = CaptionExampleRow;

export type CaptionExampleCategoryRow =
  Database["public"]["Tables"]["caption_example_categories"]["Row"];
export type CaptionExampleCategory = CaptionExampleCategoryRow;

/** A caption example with its category name resolved from the embedded join. */
export type CaptionExampleWithCategory = CaptionExampleRow & {
  caption_example_categories: Pick<
    CaptionExampleCategoryRow,
    "id" | "name"
  > | null;
};

export default CaptionExample;
