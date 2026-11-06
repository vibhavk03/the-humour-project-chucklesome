import { supabase } from "@/utils/supabase/client";
import { Term, TermType } from "@/types/term";
import {
  applyInsertAuditFields,
  applyUpdateAuditFields,
  getCurrentProfileId,
} from "@/utils/supabase/audit";

export class TermsService {
  static async getAllTerms(): Promise<Term[]> {
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from("terms")
        .select(`
          *,
          term_types (*)
        `)
        .order("term", { ascending: true });

      if (error) {
        console.error("Error fetching terms:", error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error("Unexpected error fetching terms:", error);
      return [];
    }
  }

  static async getAllTermTypes(): Promise<TermType[]> {
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from("term_types")
        .select("*")
        .order("name", { ascending: true });

      if (error) {
        console.error("Error fetching term types:", error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error("Unexpected error fetching term types:", error);
      return [];
    }
  }

  static async createTerm(termData: {
    term: string;
    definition: string;
    example: string;
    priority: number;
    term_type_id: number;
  }): Promise<Term | null> {
    if (!supabase) return null;

    try {
      const profileId = await getCurrentProfileId(supabase);
      const { data, error } = await supabase
        .from("terms")
        .insert(
          applyInsertAuditFields(
            {
              term: termData.term.trim(),
              definition: termData.definition.trim(),
              example: termData.example.trim(),
              priority: termData.priority,
              term_type_id: termData.term_type_id,
            },
            profileId
          )
        )
        .select(`
          *,
          term_types (*)
        `)
        .single();

      if (error) {
        console.error("Error creating term:", error);
        return null;
      }

      return data;
    } catch (error) {
      console.error("Unexpected error creating term:", error);
      return null;
    }
  }

  static async updateTerm(id: number, updates: {
    term?: string;
    definition?: string;
    example?: string;
    priority?: number;
    term_type_id?: number | null;
  }): Promise<Term | null> {
    if (!supabase) return null;

    try {
      const profileId = await getCurrentProfileId(supabase);
      const updateData: any = applyUpdateAuditFields(
        {
          ...updates,
        },
        profileId
      );

      // Ensure example is trimmed if provided
      if (updates.example !== undefined) {
        updateData.example = updates.example.trim();
      }

      const { data, error } = await supabase
        .from("terms")
        .update(updateData)
        .eq("id", id)
        .select(`
          *,
          term_types (*)
        `)
        .single();

      if (error) {
        console.error("Error updating term:", error);
        return null;
      }

      return data;
    } catch (error) {
      console.error("Unexpected error updating term:", error);
      return null;
    }
  }

  static async deleteTerm(id: number): Promise<boolean> {
    if (!supabase) return false;

    try {
      const { error } = await supabase
        .from("terms")
        .delete()
        .eq("id", id);

      if (error) {
        console.error("Error deleting term:", error);
        return false;
      }

      return true;
    } catch (error) {
      console.error("Unexpected error deleting term:", error);
      return false;
    }
  }

  static async createTermType(termTypeData: {
    name: string;
  }): Promise<TermType | null> {
    if (!supabase) return null;

    try {
      const profileId = await getCurrentProfileId(supabase);
      const { data, error } = await supabase
        .from("term_types")
        .insert(
          applyInsertAuditFields(
            {
              name: termTypeData.name.trim(),
            },
            profileId
          )
        )
        .select()
        .single();

      if (error) {
        console.error("Error creating term type:", error);
        throw error; // Re-throw to be caught by the calling function
      }

      return data;
    } catch (error) {
      console.error("Unexpected error creating term type:", error);
      return null;
    }
  }

  static async updateTermType(id: number, updates: {
    name?: string;
  }): Promise<TermType | null> {
    if (!supabase) return null;

    try {
      const profileId = await getCurrentProfileId(supabase);
      const { data, error } = await supabase
        .from("term_types")
        .update(applyUpdateAuditFields(updates, profileId))
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("Error updating term type:", error);
        return null;
      }

      return data;
    } catch (error) {
      console.error("Unexpected error updating term type:", error);
      return null;
    }
  }

  static async deleteTermType(id: number): Promise<boolean> {
    if (!supabase) return false;

    try {
      // Check if any terms are using this type
      const { data: termsUsingType } = await supabase
        .from("terms")
        .select("id")
        .eq("term_type_id", id)
        .limit(1);

      if (termsUsingType && termsUsingType.length > 0) {
        throw new Error("Cannot delete term type that is being used by terms");
      }

      const { error } = await supabase
        .from("term_types")
        .delete()
        .eq("id", id);

      if (error) {
        console.error("Error deleting term type:", error);
        return false;
      }

      return true;
    } catch (error) {
      console.error("Unexpected error deleting term type:", error);
      return false;
    }
  }
}
