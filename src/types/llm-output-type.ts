import type { Database } from "@/types/supabase";

export type LlmOutputTypeRow =
  Database["public"]["Tables"]["llm_output_types"]["Row"];
export type LlmOutputTypeInsert =
  Database["public"]["Tables"]["llm_output_types"]["Insert"];
export type LlmOutputTypeUpdate =
  Database["public"]["Tables"]["llm_output_types"]["Update"];
export type LlmOutputType = LlmOutputTypeRow;

export default LlmOutputType;
