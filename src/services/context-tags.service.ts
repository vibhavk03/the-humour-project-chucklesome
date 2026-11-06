import { supabase } from "@/utils/supabase/client";
import CommunityContextTag, { CommunityContextTagMapping } from "@/types/community-context-tag";
import {
  applyInsertAuditFields,
  applyUpdateAuditFields,
  getCurrentProfileId,
} from "@/utils/supabase/audit";

export class ContextTagsService {
  // ============ Tag CRUD ============
  
  static async getAllTags() {
    if (!supabase) return [];
    
    try {
      const response = await supabase
        .from("community_context_tags")
        .select("*")
        .order("name", { ascending: true });
      
      return response?.data ?? [];
    } catch (error) {
      console.error("Error fetching context tags:", error);
      return { error: "Failed to fetch context tags" };
    }
  }

  static async addTag(name: string) {
    if (!supabase) return { error: "Supabase client not available" };
    
    try {
      // Check if tag with this name already exists
      const existingTag = await supabase
        .from("community_context_tags")
        .select("*")
        .ilike("name", name)
        .single();
      
      if (existingTag?.data) {
        return { error: "A tag with this name already exists" };
      }
      
      const profileId = await getCurrentProfileId(supabase);
      const response = await supabase
        .from("community_context_tags")
        .insert(
          applyInsertAuditFields(
            {
              name,
            },
            profileId
          )
        )
        .select("*");
      
      if (response?.data?.[0]) {
        return response.data[0];
      }
      return null;
    } catch (error) {
      console.error("Error creating context tag:", error);
      return { error: "Failed to create context tag" };
    }
  }

  static async updateTag(tagId: number, newName: string) {
    if (!supabase) return { error: "Supabase client not available" };
    
    try {
      const profileId = await getCurrentProfileId(supabase);
      const response = await supabase
        .from("community_context_tags")
        .update(
          applyUpdateAuditFields(
            {
              name: newName,
            },
            profileId
          )
        )
        .eq("id", tagId)
        .select("*");
      
      return response?.data?.[0] ?? null;
    } catch (error) {
      console.error("Error updating context tag:", error);
      return { error: "Failed to update context tag" };
    }
  }

  static async deleteTag(tagId: number) {
    if (!supabase) return { error: "Supabase client not available" };
    
    try {
      // First delete all mappings for this tag
      await supabase
        .from("community_context_tag_mappings")
        .delete()
        .eq("community_context_tag_id", tagId);
      
      // Then delete the tag itself
      await supabase
        .from("community_context_tags")
        .delete()
        .eq("id", tagId);
      
      return { success: true };
    } catch (error) {
      console.error("Error deleting context tag:", error);
      return { error: "Failed to delete context tag" };
    }
  }

  // ============ Tag Assignment CRUD ============
  
  static async getTagsForContext(contextId: number) {
    if (!supabase) return [];
    
    try {
      const response = await supabase
        .from("community_context_tag_mappings")
        .select(`
          id,
          community_context_tag_id,
          community_context_tags (
            id,
            name,
            created_datetime_utc
          )
        `)
        .eq("community_context_id", contextId);
      
      // Transform the response to return flat tag objects
      const tags = response?.data?.map((mapping: any) => ({
        id: mapping.community_context_tags.id,
        name: mapping.community_context_tags.name,
        created_datetime_utc: mapping.community_context_tags.created_datetime_utc,
        mapping_id: mapping.id
      })) ?? [];
      
      return tags;
    } catch (error) {
      console.error("Error fetching tags for context:", error);
      return { error: "Failed to fetch tags for context" };
    }
  }

  static async assignTagToContext(contextId: number, tagId: number) {
    if (!supabase) return { error: "Supabase client not available" };
    
    try {
      const profileId = await getCurrentProfileId(supabase);
      const response = await supabase
        .from("community_context_tag_mappings")
        .insert(
          applyInsertAuditFields(
            {
              community_context_id: contextId,
              community_context_tag_id: tagId,
            },
            profileId
          )
        )
        .select("*");
      
      return response?.data?.[0] ?? null;
    } catch (error) {
      console.error("Error assigning tag to context:", error);
      return { error: "Failed to assign tag to context" };
    }
  }

  static async removeTagFromContext(mappingId: number) {
    if (!supabase) return { error: "Supabase client not available" };
    
    try {
      await supabase
        .from("community_context_tag_mappings")
        .delete()
        .eq("id", mappingId);
      
      return { success: true };
    } catch (error) {
      console.error("Error removing tag from context:", error);
      return { error: "Failed to remove tag from context" };
    }
  }
}
