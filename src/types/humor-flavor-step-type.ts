import type { Database } from "@/types/supabase";

export type HumorFlavorStepTypeRow =
  Database["public"]["Tables"]["humor_flavor_step_types"]["Row"];
export type HumorFlavorStepTypeInsert =
  Database["public"]["Tables"]["humor_flavor_step_types"]["Insert"];
export type HumorFlavorStepTypeUpdate =
  Database["public"]["Tables"]["humor_flavor_step_types"]["Update"];
export type HumorFlavorStepType = HumorFlavorStepTypeRow & {
  name?: string;
};

export default HumorFlavorStepType;
