import { supabase } from "@/utils/supabase/client";
import {
  applyInsertAuditFields,
  getCurrentProfileId,
} from "@/utils/supabase/audit";

export type AllowedDomain = {
  id: number;
  apex_domain: string;
};

export class AllowedDomainsService {
  static async list(): Promise<AllowedDomain[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from("allowed_signup_domains")
        .select("id, apex_domain")
        .order("id", { ascending: true });
      if (error) {
        console.error("Error fetching allowed domains:", error);
        return [];
      }
      return data || [];
    } catch (e) {
      console.error("Unexpected error fetching allowed domains:", e);
      return [];
    }
  }

  static async add(domain: string): Promise<boolean> {
    if (!supabase) return false;
    try {
      const cleaned = domain.trim().toLowerCase();
      if (!cleaned) return false;
      const profileId = await getCurrentProfileId(supabase);
      const { error } = await supabase
        .from("allowed_signup_domains")
        .insert(
          applyInsertAuditFields(
            {
              apex_domain: cleaned,
            },
            profileId
          )
        );
      if (error) {
        console.error("Error adding allowed domain:", error);
        return false;
      }
      return true;
    } catch (e) {
      console.error("Unexpected error adding allowed domain:", e);
      return false;
    }
  }

  static async remove(id: number): Promise<boolean> {
    if (!supabase) return false;
    try {
      // Try by id first, then by domain
      await supabase
        .from("allowed_signup_domains")
        .delete()
        .eq("id", id);
      return true;
    } catch (e) {
      console.error("Unexpected error removing allowed domain:", e);
      return false;
    }
  }
}
