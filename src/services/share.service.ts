import { supabase } from "@/utils/supabase/client";

export class ShareService {

  static async getTotalShares() {
    if (!supabase) return [];
    
    try {
      const { data, error } = await supabase
        .from("shares")
        .select("*");

      if (error) {
        console.error("Error fetching shares:", error);
        return [];
      }
      return data;
    } catch (error) {
      console.error("Error fetching shares:", error);
      return [];
    }
  }

  static async getTotalScreenshots() {
    if (!supabase) return [];
    
    try {
      const { data, error } = await supabase
        .from("screenshots")
        .select("*");

      if (error) {
        console.error("Error fetching screenshots:", error);
        return [];
      }
      return data;
    } catch (error) {
      console.error("Error fetching screenshots:", error);
      return [];
    }
  }

  static async getAllDestinations() {
    if (!supabase) return [];
    
    try {
    const { data, error } = await supabase
    .from("share_to_destinations")
    .select("*");

    if (error) {
      console.error("Error fetching share destinations:", error);
      return [];
    }
      return data;
    } catch (error) {
      console.error("Error fetching share destinations:", error);
      return [];
    }
  }

  static async getSharesByDestination(destination_id: number) {
    if (!supabase) return [];
    
    try {
      const { data, error } = await supabase
    .from("shares")
    .select("*")
    .eq("share_to_destination_id", destination_id);

    if (error) {
        console.error('Error fetching shares:', error);
        return [];
      }
      return data;
    } catch (error) {
      console.error('Error fetching shares:', error);
      return [];
    }
  }
}