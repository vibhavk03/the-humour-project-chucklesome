import type { Database } from "@/types/supabase";

export type HumorFlavorRow =
  Database["public"]["Tables"]["humor_flavors"]["Row"];
export type HumorFlavorInsert =
  Database["public"]["Tables"]["humor_flavors"]["Insert"];
export type HumorFlavorUpdate =
  Database["public"]["Tables"]["humor_flavors"]["Update"];
export type HumorFlavor = HumorFlavorRow & {
  theme_ids?: number[];
};

export default HumorFlavor;
