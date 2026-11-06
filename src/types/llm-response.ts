import type { Database } from "@/types/supabase";

export type LlmResponseRow =
  Database["public"]["Tables"]["llm_model_responses"]["Row"];
export type LlmResponseInsert =
  Database["public"]["Tables"]["llm_model_responses"]["Insert"];
export type LlmResponseUpdate =
  Database["public"]["Tables"]["llm_model_responses"]["Update"];
export type LlmResponse = LlmResponseRow;
