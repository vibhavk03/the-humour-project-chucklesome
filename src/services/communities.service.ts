import { getAuthTokenAction } from "@/app/actions";
import { supabase } from "@/utils/supabase/client";
import {
  applyInsertAuditFields,
  applyUpdateAuditFields,
  getCurrentProfileId,
} from "@/utils/supabase/audit";
import Community from "@/types/community";
import Context from "@/types/context";

export class CommunitiesService {
  
  static async addCommunity(
    community_name: string
  ): Promise<Community | { error: string } | null> {
    if (!supabase) return { error: "Supabase client not available" };
    
    try {
      const profileId = await getCurrentProfileId(supabase);
      const response = await supabase
        .from("communities")
        .insert(
          applyInsertAuditFields(
            {
              name: community_name,
            },
            profileId
          )
        )
        .select("*");
      
      if (response?.data?.[0]) {
        return response.data[0] as Community;
      }
      return null;
    } catch (error) {
      console.error("Error inserting new community:", error);
      return { error: "Failed to add community" };
    }
  }

  static async getAllCommunities(): Promise<Community[] | { error: string }> {
    if (!supabase) return [];
    
    try {
      const response = await supabase.from("communities").select("*");
      return (response?.data ?? []) as Community[];
    } catch (error) {
      console.error("Error fetching communities:", error);
      return { error: "Failed to fetch communities" };
    }
  }

  static async getCommunityById(id: Community["id"]): Promise<Community | { error: string } | null> {
    if (!supabase) return null;
    
    try {
      const response = await supabase
        .from("communities")
        .select("*")
        .eq("id", id);
      
      if (response?.data?.[0]) {
        return response.data[0] as Community;
      }
      return null;
    } catch (error) {
      console.error("Error fetching community:", error);
      return { error: "Failed to fetch community" };
    }
  }

  static async renameCommunity(
    id: Community["id"],
    newName: string
  ): Promise<Community | { error: string } | null> {
    if (!supabase) return { error: "Supabase client not available" };
    try {
      const profileId = await getCurrentProfileId(supabase);
      const { data, error } = await supabase
        .from("communities")
        .update(
          applyUpdateAuditFields(
            {
              name: newName,
            },
            profileId
          )
        )
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as Community;
    } catch (error: any) {
      console.error("Error renaming community:", error);
      return { error: error?.message || "Failed to rename community" };
    }
  }
  static async deleteCommunity(
    id: Community["id"]
  ): Promise<{ success: true } | { error: string }> {
    if (!supabase) return { error: "Supabase client not available" };
    try {
      // 1) delete dependent rows (if not cascaded)
      const { error: ctxError } = await supabase
        .from("community_contexts")
        .delete()
        .eq("community_id", id);
      if (ctxError) throw ctxError;

      // 2) delete the community row
      const { error: commError } = await supabase
        .from("communities")
        .delete()
        .eq("id", id);
      if (commError) throw commError;

      return { success: true };
    } catch (error: any) {
      console.error("Error deleting community:", error);
      return { error: error?.message || "Failed to delete community" };
    }
  }

  static async getCommunityContext(
    communityId: Community["id"]
  ): Promise<Context[] | { error: string }> {
    if (!supabase) return [];
    
    try {
      const response = await supabase
        .from("community_contexts")
        .select("*")
        .eq("community_id", communityId);
      
      return (response?.data ?? []) as Context[];
    } catch (error) {
      console.error("Error fetching community context:", error);
      return { error: "Failed to fetch community context" };
    }
  }

  static async getAllCommunityContexts(): Promise<Context[] | { error: string }> {
    if (!supabase) return [];

    try {
      const response = await supabase
        .from("community_contexts")
        .select("*");

      return (response?.data ?? []) as Context[];
    } catch (error) {
      console.error("Error fetching all community contexts:", error);
      return { error: "Failed to fetch all community contexts" };
    }
  }

  static async addContext(
    community_id: number,
    content: string
  ): Promise<Context | { error: string } | null> {
    if (!supabase) return { error: "Supabase client not available" };
    
    try {
      const profileId = await getCurrentProfileId(supabase);
      const response = await supabase
        .from("community_contexts")
        .insert(
          applyInsertAuditFields(
            {
              content: content,
              community_id: community_id,
            },
            profileId
          )
        )
        .select("*");
      
      if (response?.data?.[0]) {
        const createdContext = response.data[0] as Context;
        await this.triggerEmbeddingUpdate(createdContext.id);
        return createdContext;
      }
      return null;
    } catch (error) {
      console.error("Error inserting new context:", error);
      return { error: "Failed to add context" };
    }
  }

  static async editContext(
    community_id: number,
    context: string
  ): Promise<Context[] | { error: string }> {
    if (!supabase) return { error: "Supabase client not available" };
    
    try {
      // Get the existing context first
      const existingContextResponse = await supabase
        .from("community_contexts")
        .select("id, content")
        .eq("community_id", community_id);
    
      const existingContext = existingContextResponse?.data?.[0];
    
      // Append the new context to the existing one
      const updatedContent = existingContext 
        ? existingContext.content + "\n" + context 
        : context;
    
      // Update with the combined content
      const profileId = await getCurrentProfileId(supabase);
      const response = await supabase
        .from("community_contexts")
        .upsert(
          applyUpdateAuditFields(
            { 
              community_id: community_id, 
              content: updatedContent,
            },
            profileId
          )
        )
        .select();
  
      const savedContext = response?.data?.[0];
      if (savedContext?.id) {
        await this.triggerEmbeddingUpdate(savedContext.id);
      }

      return (response?.data ?? []) as Context[];
    } catch (error) {
      console.error("Error adding to context:", error);
      return { error: "Failed to add to community context" };
    }
  }

  static async updateContextById(
    contextId: number,
    newContent: string
  ): Promise<Context[] | { error: string }> {
    if (!supabase) return { error: "Supabase client not available" };
    
    try {
      const profileId = await getCurrentProfileId(supabase);
      const response = await supabase
        .from("community_contexts")
        .update(
          applyUpdateAuditFields(
            {
              content: newContent,
            },
            profileId
          )
        )
        .eq("id", contextId)
        .select();
  
      const updatedContext = response?.data?.[0] as Context | undefined;
      if (updatedContext) {
        await this.triggerEmbeddingUpdate(updatedContext.id ?? contextId);
      }

      return (response?.data ?? []) as Context[];
    } catch (error) {
      console.error("Error updating context:", error);
      return { error: "Failed to update context" };
    }
  }

  static async deleteContextById(
    contextId: number
  ): Promise<{ success: true } | { error: string }> {
    if (!supabase) return { error: "Supabase client not available" };
    
    try {
      await supabase
        .from("community_contexts")
        .delete()
        .eq("id", contextId);
  
      return { success: true };
    } catch (error) {
      console.error("Error deleting context:", error);
      return { error: "Failed to delete context" };
    }
  }

  static async addCommunityContext(
    communityId: Community["id"],
    content: string
  ): Promise<Context[] | { error: string }> {
    if (!supabase) return { error: "Supabase client not available" };
    
    try {
      const profileId = await getCurrentProfileId(supabase);
      const response = await supabase
        .from("community_contexts")
        .insert(
          applyInsertAuditFields(
            [
              {
                community_id: communityId,
                content,
              },
            ],
            profileId
          )
        )
        .select();
  
      const createdContexts = (response?.data ?? []) as Context[];
      const updatePromises = createdContexts
        .map((ctx) => ctx.id)
        .filter(Boolean)
        .map((id: number) => this.triggerEmbeddingUpdate(id));

      await Promise.all(updatePromises);

      return createdContexts;
    } catch (error) {
      console.error("Error adding community context:", error);
      return { error: "Failed to add community context" };
    }
  }

  static async updateCommunityContext(
    contextId: Context["id"],
    content: string
  ): Promise<Context[] | { error: string }> {
    if (!supabase) return { error: "Supabase client not available" };
    
    try {
      const profileId = await getCurrentProfileId(supabase);
      const response = await supabase
        .from("community_contexts")
        .update(
          applyUpdateAuditFields(
            {
              content,
            },
            profileId
          )
        )
        .eq("id", contextId)
        .select();
  
      const updatedContext = response?.data?.[0] as Context | undefined;
      if (updatedContext) {
        await this.triggerEmbeddingUpdate(updatedContext.id ?? contextId);
      }

      return (response?.data ?? []) as Context[];
    } catch (error) {
      console.error("Error updating community context:", error);
      return { error: "Failed to update community context" };
    }
  }

  static async deleteCommunityContext(
    contextId: Context["id"]
  ): Promise<{ success: true } | { error: string }> {
    if (!supabase) return { error: "Supabase client not available" };
    
    try {
      await supabase
        .from("community_contexts")
        .delete()
        .eq("id", contextId);
  
      return { success: true };
    } catch (error) {
      console.error("Error deleting community context:", error);
      return { error: "Failed to delete community context" };
    }
  }

  private static async triggerEmbeddingUpdate(communityContextId: number) {
    try {
      const auth = await getAuthTokenAction();
      const jwt = auth?.access_token;

      if (!jwt) {
        console.error("Cannot trigger embedding update: missing auth token from getAuthTokenAction");
        return;
      }

      const response = await fetch("/api/community/update-embedding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ communityContextId }),
      });

      if (!response.ok) {
        const message = await response.text();
        console.error(
          `Failed to trigger embedding update (${response.status}): ${message}`,
        );
      }
    } catch (error) {
      console.error("Error calling embedding update endpoint:", error);
    }
  }
}
