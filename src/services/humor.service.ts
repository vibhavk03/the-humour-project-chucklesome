import { supabase } from "@/utils/supabase/client";
import HumorTheme from "@/types/humor-theme";
import HumorFlavor from "@/types/humor-flavor";
import {
  applyInsertAuditFields,
  applyUpdateAuditFields,
  getCurrentProfileId,
} from "@/utils/supabase/audit";

interface FlavorThemeMapping {
  id: number;
  humor_flavor_id: number;
  humor_theme_id: number;
  created_datetime_utc: string;
}

export class HumorService {
  private static parseId(value: unknown): number | null {
    const parsed = typeof value === "string" && value.trim() === "" ? NaN : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  // Humor Themes
  static async getAllThemes(): Promise<HumorTheme[]> {
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from("humor_themes")
        .select("*")
        .order("name");

      if (error) {
        console.error("Error fetching humor themes:", error);
        return [];
      }
      return data || [];
    } catch (error) {
      console.error("Error fetching humor themes:", error);
      return [];
    }
  }

  static async createTheme(name: string, description?: string): Promise<HumorTheme | null> {
    if (!supabase) return null;

    try {
      const profileId = await getCurrentProfileId(supabase);
      const { data, error } = await supabase
        .from("humor_themes")
        .insert(
          applyInsertAuditFields(
            {
              name,
              description,
            },
            profileId
          )
        )
        .select()
        .single();

      if (error) {
        console.error("Error creating humor theme:", error);
        return null;
      }
      return data;
    } catch (error) {
      console.error("Error creating humor theme:", error);
      return null;
    }
  }

  static async updateTheme(id: number, name: string, description?: string): Promise<boolean> {
    if (!supabase) return false;

    try {
      const profileId = await getCurrentProfileId(supabase);
      const { error } = await supabase
        .from("humor_themes")
        .update(
          applyUpdateAuditFields(
            {
              name,
              description,
            },
            profileId
          )
        )
        .eq("id", id);

      if (error) {
        console.error("Error updating humor theme:", error);
        return false;
      }
      return true;
    } catch (error) {
      console.error("Error updating humor theme:", error);
      return false;
    }
  }

  static async deleteTheme(id: number): Promise<boolean> {
    if (!supabase) return false;

    try {
      const { error } = await supabase
        .from("humor_themes")
        .delete()
        .eq("id", id);

      if (error) {
        console.error("Error deleting humor theme:", error);
        return false;
      }
      return true;
    } catch (error) {
      console.error("Error deleting humor theme:", error);
      return false;
    }
  }

  // Humor Flavors
  static async getAllFlavors(): Promise<HumorFlavor[]> {
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from("humor_flavors")
        .select(`
          *,
          humor_flavor_theme_mappings (
            humor_theme_id
          )
        `)
        .order("slug");

      if (error) {
        console.error("Error fetching humor flavors:", error);
        return [];
      }

      // Transform the data to include theme_ids array
      const flavorsWithThemes = (data || []).map((flavor) => ({
        ...flavor,
        theme_ids:
          flavor.humor_flavor_theme_mappings
            ?.map((ft: any) => ft.humor_theme_id)
            .filter((id: number | null) => id != null) || [],
      }));

      return flavorsWithThemes;
    } catch (error) {
      console.error("Error fetching humor flavors:", error);
      return [];
    }
  }

  static async createFlavor(slug: string, description?: string, themeIds?: number[]): Promise<HumorFlavor | null> {
    if (!supabase) return null;

    try {
      const profileId = await getCurrentProfileId(supabase);
      // First create the flavor
      const { data: flavorData, error: flavorError } = await supabase
        .from("humor_flavors")
        .insert(
          applyInsertAuditFields(
            {
              slug,
              description,
            },
            profileId
          )
        )
        .select()
        .single();

      if (flavorError) {
        console.error("Error creating humor flavor:", flavorError);
        return null;
      }

      // Then create the theme associations if provided
      if (flavorData && themeIds && themeIds.length > 0) {
        const mappings = themeIds.map(themeId => ({
          humor_flavor_id: flavorData.id,
          humor_theme_id: themeId
        }));

        const { error: assocError } = await supabase
          .from("humor_flavor_theme_mappings")
          .insert(applyInsertAuditFields(mappings, profileId));

        if (assocError) {
          console.error("Error creating flavor-theme associations:", assocError);
        }
      }

      return flavorData;
    } catch (error) {
      console.error("Error creating humor flavor:", error);
      return null;
    }
  }

  static async updateFlavor(id: number, slug: string, description?: string, themeIds?: number[]): Promise<boolean> {
    if (!supabase) return false;

    try {
      const profileId = await getCurrentProfileId(supabase);
      // Update the flavor
      const { error: updateError } = await supabase
        .from("humor_flavors")
        .update(
          applyUpdateAuditFields(
            {
              slug,
              description,
            },
            profileId
          )
        )
        .eq("id", id);

      if (updateError) {
        console.error("Error updating humor flavor:", updateError);
        return false;
      }

      // Update theme associations if provided
      if (themeIds !== undefined) {
        // Delete existing associations
        const { error: deleteError } = await supabase
          .from("humor_flavor_theme_mappings")
          .delete()
          .eq("humor_flavor_id", id);

        if (deleteError) {
          console.error("Error deleting old associations:", deleteError);
        }

        // Create new associations
        if (themeIds.length > 0) {
          const mappings = themeIds.map(themeId => ({
            humor_flavor_id: id,
            humor_theme_id: themeId
          }));

          const { error: insertError } = await supabase
            .from("humor_flavor_theme_mappings")
            .insert(applyInsertAuditFields(mappings, profileId));

          if (insertError) {
            console.error("Error creating new associations:", insertError);
          }
        }
      }

      return true;
    } catch (error) {
      console.error("Error updating humor flavor:", error);
      return false;
    }
  }

  static async deleteFlavor(id: number): Promise<boolean> {
    if (!supabase) return false;

    try {
      const { error } = await supabase
        .from("humor_flavors")
        .delete()
        .eq("id", id);

      if (error) {
        console.error("Error deleting humor flavor:", error);
        return false;
      }
      return true;
    } catch (error) {
      console.error("Error deleting humor flavor:", error);
      return false;
    }
  }

  // Flavor-Theme Assignment Methods
  static async getThemesByFlavorId(flavorId: number): Promise<number[]> {
    if (!supabase) return [];
    const parsedFlavorId = HumorService.parseId(flavorId);
    if (!parsedFlavorId) return [];

    try {
      const { data, error } = await supabase
        .from("humor_flavor_theme_mappings")
        .select("humor_theme_id")
        .eq("humor_flavor_id", parsedFlavorId);

      if (error) {
        // Silently return empty array - this is normal for new flavors
        return [];
      }

      return data
        ?.map(item => HumorService.parseId(item.humor_theme_id))
        .filter((id): id is number => id != null) || [];
    } catch {
      return [];
    }
  }

  static async assignThemesToFlavor(flavorId: number, themeIds: number[]): Promise<boolean> {
    if (!supabase) return false;
    const parsedFlavorId = HumorService.parseId(flavorId);
    if (!parsedFlavorId) return false;

    try {
      const profileId = await getCurrentProfileId(supabase);
      // First verify the flavor exists
      const { data: flavorExists, error: flavorError } = await supabase
        .from("humor_flavors")
        .select("id")
        .eq("id", parsedFlavorId)
        .single();

      if (flavorError || !flavorExists) {
        return false;
      }

      // Delete existing mappings for this flavor
      const { error: deleteError } = await supabase
        .from("humor_flavor_theme_mappings")
        .delete()
        .eq("humor_flavor_id", parsedFlavorId);

      if (deleteError) {
        // Continue anyway - there might be no existing mappings
      }

      // Insert new mappings if any themes are selected
      if (themeIds && themeIds.length > 0) {
        // Filter out any invalid theme IDs
        const validThemeIds = themeIds
          .map(id => HumorService.parseId(id))
          .filter((id): id is number => id != null && id > 0);

        if (validThemeIds.length === 0) {
          return true; // Successfully cleared mappings
        }

        // Verify themes exist
        const { data: existingThemes, error: themeError } = await supabase
          .from("humor_themes")
          .select("id")
          .in("id", validThemeIds);

        if (themeError) {
          console.error("Error verifying themes:", themeError);
          return false;
        }

        const existingThemeIds = existingThemes?.map(t => t.id) || [];
        const themesToInsert = validThemeIds.filter(id => existingThemeIds.includes(id));

        if (themesToInsert.length === 0) {
          console.warn("No valid themes found to insert");
          return true; // No themes to insert, but that's okay
        }

        const mappings = themesToInsert.map(themeId => ({
          humor_flavor_id: parsedFlavorId,
          humor_theme_id: themeId
        }));


        const { data: insertData, error: insertError } = await supabase
          .from("humor_flavor_theme_mappings")
          .insert(applyInsertAuditFields(mappings, profileId))
          .select();

        if (insertError) {
          // Check if it's a duplicate key error (code 23505)
          if (insertError.code === '23505') {
            return true; // Duplicate is okay
          }
          
          // Always log the error with all available details
          const errorDetails = {
            message: insertError.message || 'Unknown error',
            code: insertError.code || 'NO_CODE',
            details: insertError.details || 'No details',
            hint: insertError.hint || 'No hint',
            mappings: mappings
          };
          
          console.error("Error creating theme mappings:", JSON.stringify(errorDetails, null, 2));
          
          // Also try to log the raw error
          console.error("Raw error object:", insertError);
          
          return false;
        }
      }

      return true;
    } catch (error: any) {
      console.error("Unexpected error in assignThemesToFlavor:", {
        message: error?.message || 'Unknown error',
        stack: error?.stack,
        flavorId,
        themeIds
      });
      return false;
    }
  }

  /**
   * Get all flavor IDs that belong to a specific theme
   */
  static async getFlavorsByThemeId(themeId: number): Promise<number[]> {
    if (!supabase) return [];
    const parsedThemeId = HumorService.parseId(themeId);
    if (!parsedThemeId) return [];

    try {
      const { data, error } = await supabase
        .from("humor_flavor_theme_mappings")
        .select("humor_flavor_id")
        .eq("humor_theme_id", parsedThemeId);

      if (error) {
        return [];
      }

      return data
        ?.map(item => HumorService.parseId(item.humor_flavor_id))
        .filter((id): id is number => id != null) || [];
    } catch {
      return [];
    }
  }
}
