import { supabase } from "@/utils/supabase/client";
import {
  applyInsertAuditFields,
  applyUpdateAuditFields,
  getCurrentProfileId,
} from "@/utils/supabase/audit";
import type CaptionExample from "@/types/caption-example";
import type {
  CaptionExampleInsert,
  CaptionExampleUpdate,
  CaptionExampleWithCategory,
} from "@/types/caption-example";

export type CaptionCategory = { id: number; name: string };

export class CaptionExamplesService {
  static async getAllCaptionExamples() {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from("caption_examples")
        .select("*, caption_example_categories ( id, name )")
        .order("created_datetime_utc", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CaptionExampleWithCategory[];
    } catch (error) {
      console.error("Error fetching caption examples:", error);
      return [] as CaptionExampleWithCategory[];
    }
  }

  static async getCategories(): Promise<CaptionCategory[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from("caption_example_categories")
        .select("id, name")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CaptionCategory[];
    } catch (error) {
      console.error("Error fetching caption example categories:", error);
      return [];
    }
  }

  static async addCaptionExample(example: CaptionExampleInsert) {
    if (!supabase) return { error: "Supabase client not available" };
    try {
      const profileId = await getCurrentProfileId(supabase);
      const { data, error } = await supabase
        .from("caption_examples")
        .insert([
          applyInsertAuditFields(
            {
              ...example,
            },
            profileId
          ),
        ])
        .select("*")
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Error adding caption example:", error);
      return { error: "Failed to add caption example" };
    }
  }

  static async updateCaptionExample(
    id: number,
    updates: CaptionExampleUpdate
  ) {
    if (!supabase) return { error: "Supabase client not available" };
    try {
      const profileId = await getCurrentProfileId(supabase);
      const { data, error } = await supabase
        .from("caption_examples")
        .update(
          applyUpdateAuditFields(
            {
              ...updates,
            },
            profileId
          )
        )
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Error updating caption example:", error);
      return { error: "Failed to update caption example" };
    }
  }

  static async deleteCaptionExample(id: number) {
    if (!supabase) return { error: "Supabase client not available" };
    try {
      const { error } = await supabase
        .from("caption_examples")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error("Error deleting caption example:", error);
      return { error: "Failed to delete caption example" };
    }
  }
}
