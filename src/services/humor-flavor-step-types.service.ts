import { supabase } from "@/utils/supabase/client";
import HumorFlavorStepType from "@/types/humor-flavor-step-type";

export class HumorFlavorStepTypesService {
  static async getAll(): Promise<HumorFlavorStepType[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from("humor_flavor_step_types")
        .select("*");
      if (error) {
        console.error("Error fetching humor flavor step types:", error);
        return [];
      }
      return (data || []).map((row) => ({
        ...row,
        name: row.description,
      }));
    } catch (error) {
      console.error("Error fetching humor flavor step types:", error);
      return [];
    }
  }
}
