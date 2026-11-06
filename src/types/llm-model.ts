import type { Database } from "@/types/supabase";

export type LlmModelRow = Database["public"]["Tables"]["llm_models"]["Row"];
export type LlmModelInsert =
  Database["public"]["Tables"]["llm_models"]["Insert"];
export type LlmModelUpdate =
  Database["public"]["Tables"]["llm_models"]["Update"];
export type LlmModel = LlmModelRow;

export default LlmModel;
