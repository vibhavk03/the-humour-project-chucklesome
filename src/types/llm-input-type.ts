import type { Database } from "@/types/supabase";

export type LlmInputTypeRow =
  Database["public"]["Tables"]["llm_input_types"]["Row"];
export type LlmInputTypeInsert =
  Database["public"]["Tables"]["llm_input_types"]["Insert"];
export type LlmInputTypeUpdate =
  Database["public"]["Tables"]["llm_input_types"]["Update"];
export type LlmInputType = LlmInputTypeRow;

export default LlmInputType;
