// image_humor_potential_prompts is not yet in the generated Supabase types
// (src/types/supabase.ts), so this is hand-authored to match the table's
// actual schema instead of deriving from Database["public"]["Tables"][...].
// Regenerate via `npm run supabase:types` and switch this to the generated
// Row/Insert/Update pattern (see src/types/humor-flavor.ts) once available.

export type ImageHumorPotentialPromptRow = {
  id: string;
  created_datetime_utc: string;
  modified_datetime_utc: string;
  name: string;
  description: string | null;
  system_prompt: string;
  user_prompt: string;
  llm_model_id: number;
  llm_temperature: number;
  is_active: boolean;
  created_by_user_id: string | null;
  modified_by_user_id: string | null;
  created_by_client_id: string | null;
  modified_by_client_id: string | null;
};

// Audit columns (created_by_user_id, etc.) are intentionally omitted —
// callers never set them directly; applyInsertAuditFields/
// applyUpdateAuditFields inject them in the service layer.
export type ImageHumorPotentialPromptInsert = {
  id?: string;
  created_datetime_utc?: string;
  modified_datetime_utc?: string;
  name: string;
  description?: string | null;
  system_prompt: string;
  user_prompt: string;
  llm_model_id: number;
  llm_temperature?: number;
  is_active?: boolean;
};

export type ImageHumorPotentialPromptUpdate = {
  name?: string;
  description?: string | null;
  system_prompt?: string;
  user_prompt?: string;
  llm_model_id?: number;
  llm_temperature?: number;
  is_active?: boolean;
};

export type ImageHumorPotentialPrompt = ImageHumorPotentialPromptRow;

export default ImageHumorPotentialPrompt;
