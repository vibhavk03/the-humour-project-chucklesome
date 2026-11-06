import type { Database } from "@/types/supabase";

export type LlmPromptChainRow =
  Database["public"]["Tables"]["llm_prompt_chains"]["Row"];
export type LlmPromptChainInsert =
  Database["public"]["Tables"]["llm_prompt_chains"]["Insert"];
export type LlmPromptChainUpdate =
  Database["public"]["Tables"]["llm_prompt_chains"]["Update"];
export type LlmPromptChain = LlmPromptChainRow;
