import type { Database } from "@/types/supabase";

export type HumorFlavorMixRow =
  Database["public"]["Tables"]["humor_flavor_mix"]["Row"];
export type HumorFlavorMixInsert =
  Database["public"]["Tables"]["humor_flavor_mix"]["Insert"];
export type HumorFlavorMixUpdate =
  Database["public"]["Tables"]["humor_flavor_mix"]["Update"];
export type HumorFlavorMix = HumorFlavorMixRow;

export default HumorFlavorMix;
