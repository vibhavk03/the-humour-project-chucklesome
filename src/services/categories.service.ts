import { supabase } from "@/utils/supabase/client";
import Category from "@/types/common-use-category";
import {
  applyInsertAuditFields,
  applyUpdateAuditFields,
  getCurrentProfileId,
} from "@/utils/supabase/audit";

export class CategoriesService {
  static async getAllCategories(): Promise<Category[]> {
    if (!supabase) return [];
    
    try {
      const { data, error } = await supabase
        .from("common_use_categories")
        .select("*")
        .order("name");
      
      if (error) {
        console.error("Error fetching categories:", error);
        return [];
      }
      
      return data || [];
    } catch (error) {
      console.error("Error fetching categories:", error);
      return [];
    }
  }

  static async getCategoryById(id: number): Promise<Category | null> {
    if (!supabase) return null;
    
    try {
      const { data, error } = await supabase
        .from("common_use_categories")
        .select("*")
        .eq("id", id)
        .single();
      
      if (error) {
        console.error("Error fetching category:", error);
        return null;
      }
      
      return data;
    } catch (error) {
      console.error("Error fetching category:", error);
      return null;
    }
  }

  static async createCategory(name: string): Promise<Category | null> {
    if (!supabase) return null;
    
    try {
      // Check if category with this name already exists
      const { data: existing } = await supabase
        .from("common_use_categories")
        .select("id")
        .eq("name", name)
        .single();
      
      if (existing) {
        throw new Error("A category with this name already exists");
      }
      const profileId = await getCurrentProfileId(supabase);

      const { data, error } = await supabase
        .from("common_use_categories")
        .insert(
          applyInsertAuditFields(
            [
              {
                name,
              },
            ],
            profileId
          )
        )
        .select()
        .single();
      
      if (error) {
        console.error("Error creating category:", error);
        throw new Error(error.message);
      }
      
      return data;
    } catch (error) {
      console.error("Error creating category:", error);
      throw error;
    }
  }

  static async updateCategory(id: number, name: string): Promise<Category | null> {
    if (!supabase) return null;
    
    try {
      // Check if another category with this name already exists
      const { data: existing } = await supabase
        .from("common_use_categories")
        .select("id")
        .eq("name", name)
        .neq("id", id)
        .single();
      
      if (existing) {
        throw new Error("A category with this name already exists");
      }
      const profileId = await getCurrentProfileId(supabase);

      const { data, error } = await supabase
        .from("common_use_categories")
        .update(
          applyUpdateAuditFields(
            {
              name,
            },
            profileId
          )
        )
        .eq("id", id)
        .select()
        .single();
      
      if (error) {
        console.error("Error updating category:", error);
        throw new Error(error.message);
      }
      
      return data;
    } catch (error) {
      console.error("Error updating category:", error);
      throw error;
    }
  }

  static async deleteCategory(id: number): Promise<boolean> {
    if (!supabase) return false;
    
    try {
      // Check if any images are mapped to this category
      const { data: mappings, error: mappingsError } = await supabase
        .from("common_use_category_image_mappings")
        .select("image_id")
        .eq("common_use_category_id", id)
        .limit(1);
      
      if (mappingsError) {
        console.error("Error checking category mappings:", mappingsError);
        throw new Error("Failed to check category usage");
      }
      
      if (mappings && mappings.length > 0) {
        throw new Error("Cannot delete category: Images are still assigned to this category");
      }

      // Delete the category
      const { error } = await supabase
        .from("common_use_categories")
        .delete()
        .eq("id", id);
      
      if (error) {
        console.error("Error deleting category:", error);
        throw new Error(error.message);
      }
      
      return true;
    } catch (error) {
      console.error("Error deleting category:", error);
      throw error;
    }
  }

  static async getImageCountForCategory(categoryId: number): Promise<number> {
    if (!supabase) return 0;
    
    try {
      const { count, error } = await supabase
        .from("common_use_category_image_mappings")
        .select("*", { count: "exact", head: true })
        .eq("common_use_category_id", categoryId);
      
      if (error) {
        console.error("Error getting image count:", error);
        return 0;
      }
      
      return count || 0;
    } catch (error) {
      console.error("Error getting image count:", error);
      return 0;
    }
  }

  // Load only the requested images' category links when a picker provides IDs.
  // Returns a map of imageId -> array of category ids. Paginates so it isn't
  // capped at PostgREST's default row limit.
  static async getImageCategoryMap(imageIds?: string[]): Promise<Map<string, number[]>> {
    const map = new Map<string, number[]>();
    if (!supabase) return map;

    const PAGE = 1000;
    const batches: Array<string[] | undefined> = [];
    if (imageIds === undefined) batches.push(undefined);
    else {
      const uniqueIds = [...new Set(imageIds)];
      // Keep UUID filters comfortably below URL length limits.
      for (let start = 0; start < uniqueIds.length; start += 100) {
        batches.push(uniqueIds.slice(start, start + 100));
      }
    }

    try {
      for (const batch of batches) {
        let offset = 0;
        for (;;) {
          let query = supabase
            .from("common_use_category_image_mappings")
            .select("image_id, common_use_category_id")
            // A stable order keeps range pages from dropping or duplicating links.
            .order("image_id")
            .order("common_use_category_id");
          if (batch) query = query.in("image_id", batch);
          const { data, error } = await query.range(offset, offset + PAGE - 1);

          if (error) {
            if (imageIds !== undefined) {
              throw new Error(`Could not load image categories: ${error.message}`);
            }
            console.error("Error loading image category mappings:", error);
            break;
          }

          const rows = data ?? [];
          for (const row of rows) {
            if (!row.image_id || row.common_use_category_id == null) continue;
            const existing = map.get(row.image_id);
            if (existing) {
              existing.push(row.common_use_category_id);
            } else {
              map.set(row.image_id, [row.common_use_category_id]);
            }
          }

          if (rows.length < PAGE) break;
          offset += PAGE;
        }
      }
    } catch (error) {
      console.error("Error loading image category mappings:", error);
      if (imageIds !== undefined) throw error;
    }

    return map;
  }
}
