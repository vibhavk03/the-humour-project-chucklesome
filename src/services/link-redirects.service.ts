import { supabase } from "@/utils/supabase/client";
import {
  applyInsertAuditFields,
  applyUpdateAuditFields,
  getCurrentProfileId,
} from "@/utils/supabase/audit";
import type LinkRedirect from "@/types/link-redirect";
import type {
  LinkRedirectInsert,
  LinkRedirectUpdate,
} from "@/types/link-redirect";

export class LinkRedirectsService {
  static async getAll(): Promise<LinkRedirect[]> {
    if (!supabase) return [];
    
    try {
      const { data, error } = await supabase
        .from("link_redirects")
        .select("*")
        .order("created_datetime_utc", { ascending: false });
      
      if (error) {
        console.error("Error fetching link redirects:", error);
        return [];
      }
      
      return (data || []) as LinkRedirect[];
    } catch (error) {
      console.error("Error fetching link redirects:", error);
      return [];
    }
  }

  static async getBySlug(slug: string): Promise<LinkRedirect | null> {
    if (!supabase) return null;
    
    try {
      const { data, error } = await supabase
        .from("link_redirects")
        .select("*")
        .eq("slug", slug)
        .single();
      
      if (error) {
        console.error("Error fetching link redirect by slug:", error);
        return null;
      }
      
      return data as LinkRedirect;
    } catch (error) {
      console.error("Error fetching link redirect by slug:", error);
      return null;
    }
  }


  static async create(
    linkData: LinkRedirectInsert
  ): Promise<LinkRedirect> {
    if (!supabase) {
      throw new Error("Supabase client is not initialized.");
    }
    
    try {
      const profileId = await getCurrentProfileId(supabase);
      const { data, error } = await supabase
        .from("link_redirects")
        .insert(
          applyInsertAuditFields(
            [
              {
                name: linkData.name,
                slug: linkData.slug,
                destination_url: linkData.destination_url,
                folder_path: linkData.folder_path ?? null,
                visit_count: 0,
              },
            ],
            profileId
          )
        )
        .select()
        .single();
      
      if (error) {
        console.error("Error creating link redirect:", error);
        throw new Error(error.message);
      }
      
      return data as LinkRedirect;
    } catch (error) {
      console.error("Error creating link redirect:", error);
      throw error;
    }
  }

  static async update(
    id: number,
    updates: LinkRedirectUpdate
  ): Promise<LinkRedirect> {
    if (!supabase) {
      throw new Error("Supabase client is not initialized.");
    }
    
    try {
      const profileId = await getCurrentProfileId(supabase);
      const { data, error } = await supabase
        .from("link_redirects")
        .update(applyUpdateAuditFields(updates, profileId))
        .eq("id", id)
        .select()
        .single();
      
      if (error) {
        console.error("Error updating link redirect:", error);
        throw new Error(error.message);
      }
      
      return data as LinkRedirect;
    } catch (error) {
      console.error("Error updating link redirect:", error);
      throw error;
    }
  }

  static async incrementVisitCount(slug: string): Promise<void> {
    if (!supabase) {
      throw new Error("Supabase client is not initialized.");
    }
    
    try {
      const { error } = await supabase.rpc("increment_link_visit_count", {
        link_slug: slug,
      });
      
      if (error) {
        // Fallback to manual update if RPC doesn't exist
        const link = await this.getBySlug(slug);
        if (link) {
          const profileId = await getCurrentProfileId(supabase, {
            allowMissingUser: true,
          });
          const { error: updateError } = await supabase
            .from("link_redirects")
            .update(
              applyUpdateAuditFields(
                {
                  visit_count: link.visit_count + 1,
                },
                profileId
              )
            )
            .eq("id", link.id);
          
          if (updateError) {
            throw new Error(updateError.message);
          }
        } else {
          throw new Error("Link not found");
        }
      }
    } catch (error) {
      console.error("Error incrementing visit count:", error);
      throw error;
    }
  }

  static async delete(id: number): Promise<void> {
    if (!supabase) {
      throw new Error("Supabase client is not initialized.");
    }
    
    try {
      const { error } = await supabase
        .from("link_redirects")
        .delete()
        .eq("id", id);
      
      if (error) {
        console.error("Error deleting link redirect:", error);
        throw new Error(error.message);
      }
    } catch (error) {
      console.error("Error deleting link redirect:", error);
      throw error;
    }
  }
}
