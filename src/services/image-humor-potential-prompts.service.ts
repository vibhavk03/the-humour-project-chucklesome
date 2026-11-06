// services/image-humor-potential-prompts.service.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/utils/supabase/client";
import {
  ImageHumorPotentialPrompt,
  ImageHumorPotentialPromptInsert,
  ImageHumorPotentialPromptUpdate,
} from "@/types/image-humor-potential-prompt";
import {
  applyInsertAuditFields,
  applyUpdateAuditFields,
  getCurrentProfileId,
} from "@/utils/supabase/audit";

const TABLE = "image_humor_potential_prompts";

// image_humor_potential_prompts is not yet in the generated Supabase types,
// so the typed client can't resolve this table name until types are
// regenerated (see src/types/image-humor-potential-prompt.ts).
function getUntypedSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error("Supabase client is not initialized.");
  }
  return supabase as unknown as SupabaseClient;
}

export const ImageHumorPotentialPromptsService = {
  // get all active prompts, newest first
  async getAll(): Promise<ImageHumorPotentialPrompt[]> {
    const client = getUntypedSupabase();
    const { data, error } = await client
      .from(TABLE)
      .select("*")
      .eq("is_active", true)
      .order("created_datetime_utc", { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []) as ImageHumorPotentialPrompt[];
  },

  // get a single prompt by id, regardless of is_active
  async getById(id: string): Promise<ImageHumorPotentialPrompt | null> {
    const client = getUntypedSupabase();
    const { data, error } = await client.from(TABLE).select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as ImageHumorPotentialPrompt) ?? null;
  },

  // create a new prompt
  async create(
    promptData: ImageHumorPotentialPromptInsert
  ): Promise<ImageHumorPotentialPrompt> {
    const client = getUntypedSupabase();
    const profileId = await getCurrentProfileId(client);
    const { data, error } = await client
      .from(TABLE)
      .insert(applyInsertAuditFields([promptData], profileId))
      .select();
    if (error) throw new Error(error.message);
    return data[0] as ImageHumorPotentialPrompt;
  },

  // update an existing prompt
  async update(
    id: string,
    updates: ImageHumorPotentialPromptUpdate
  ): Promise<ImageHumorPotentialPrompt> {
    const client = getUntypedSupabase();
    const profileId = await getCurrentProfileId(client);
    const { data, error } = await client
      .from(TABLE)
      .update(applyUpdateAuditFields(updates, profileId))
      .eq("id", id)
      .select();
    if (error) throw new Error(error.message);
    return data[0] as ImageHumorPotentialPrompt;
  },

  // soft delete: sets is_active to false, never hard-deletes (audit trail requirement)
  async softDelete(id: string): Promise<void> {
    const client = getUntypedSupabase();
    const profileId = await getCurrentProfileId(client);
    const { error } = await client
      .from(TABLE)
      .update(applyUpdateAuditFields({ is_active: false }, profileId))
      .eq("id", id);
    if (error) throw new Error(error.message);
  },
};
