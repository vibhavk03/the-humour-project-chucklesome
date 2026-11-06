import type { Database } from "@/types/supabase";
import type HumorFlavorStepType from "./humor-flavor-step-type";

type HumorFlavorStepRow =
  Database["public"]["Tables"]["humor_flavor_steps"]["Row"];
type LlmModelRow = Database["public"]["Tables"]["llm_models"]["Row"];

export type HumorFlavorStepInsert =
  Database["public"]["Tables"]["humor_flavor_steps"]["Insert"];
export type HumorFlavorStepUpdate =
  Database["public"]["Tables"]["humor_flavor_steps"]["Update"];
export type HumorFlavorStep = HumorFlavorStepRow & {
  humor_flavor_step_types?: HumorFlavorStepType | HumorFlavorStepType[] | null;
  llm_models?: Pick<LlmModelRow, "name" | "provider_model_id"> | null;
};

export default HumorFlavorStep;
