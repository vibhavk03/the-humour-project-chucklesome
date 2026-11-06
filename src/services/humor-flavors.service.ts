// services/humor-flavors.service.ts
import { supabase } from "@/utils/supabase/client";
import {
  HumorFlavor,
  HumorFlavorInsert,
  HumorFlavorUpdate,
} from "@/types/humor-flavor";
import {
  applyInsertAuditFields,
  applyUpdateAuditFields,
  getCurrentProfileId,
} from "@/utils/supabase/audit";

export const HumorFlavorsService = {
  // get all humor flavors
  async getAll(): Promise<HumorFlavor[]> {
    if (!supabase) {
      throw new Error("Supabase client is not initialized.");
    }
    const { data, error } = await supabase.from("humor_flavors").select("*");
    if (error) throw new Error(error.message);
    return data || [];
  },
  // Return the subset of the given ids that exist as humor flavors. Used to
  // safely map a caller-provided flavor_id onto captions.humor_flavor_id without
  // risking a foreign-key error when the flavor isn't present in this env.
  async filterExistingIds(ids: number[]): Promise<number[]> {
    if (!supabase || ids.length === 0) return [];
    const { data, error } = await supabase
      .from("humor_flavors")
      .select("id")
      .in("id", ids);
    if (error) throw new Error(error.message);
    return (data || []).map((row) => row.id);
  },
  // create humor flavor
  async create(flavorData: HumorFlavorInsert): Promise<HumorFlavor> {
    if (!supabase) {
      throw new Error("Supabase client is not initialized.");
    }
    const profileId = await getCurrentProfileId(supabase);
    const { data, error } = await supabase
      .from("humor_flavors")
      .insert(applyInsertAuditFields([flavorData], profileId))
      .select();
    if (error) throw new Error(error.message);
    return data[0];
  },

  // update humor flavor
  async update(id: number, updates: HumorFlavorUpdate): Promise<HumorFlavor> {
    if (!supabase) {
      throw new Error("Supabase client is not initialized.");
    }
    const profileId = await getCurrentProfileId(supabase);
    const { data, error } = await supabase
      .from("humor_flavors")
      .update(applyUpdateAuditFields(updates, profileId))
      .eq('id', id)
      .select();
    if (error) throw new Error(error.message);
    return data[0];
  },

  // delete humor flavor
  async delete(id: number): Promise<void> {
    if (!supabase) {
      throw new Error("Supabase client is not initialized.");
    }
    const { error } = await supabase.from("humor_flavors").delete().eq('id', id);
    if (error) throw new Error(error.message);
  }
};
