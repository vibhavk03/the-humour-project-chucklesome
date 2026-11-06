"use server";

import { createClient } from "@/utils/supabase/server";

export async function fetchBugReportsWithProfiles() {
  const supabase = await createClient();
  
  try {
    // Join bug_reports with profiles table using profile_id
    const { data, error } = await supabase
      .from("bug_reports")
      .select(`
        id, 
        created_datetime_utc, 
        modified_datetime_utc, 
        subject, 
        message, 
        profile_id,
        profiles!bug_reports_profile_id_fkey(first_name, last_name)
      `)
      .order("id", { ascending: true });
    
    if (error) {
      console.error("Error fetching bug reports:", error);
      return { data: [], error };
    }
    
    // Transform data to extract first_name and last_name from joined profiles
    const transformedData = (data || []).map((report: any) => {
      let first_name: string | null = null;
      let last_name: string | null = null;
      
      // Handle profiles data - can be object or array depending on relationship
      if (report.profiles) {
        if (Array.isArray(report.profiles) && report.profiles.length > 0) {
          first_name = report.profiles[0].first_name ?? null;
          last_name = report.profiles[0].last_name ?? null;
        } else if (typeof report.profiles === 'object') {
          first_name = report.profiles.first_name ?? null;
          last_name = report.profiles.last_name ?? null;
        }
      }
      
      return {
        id: report.id,
        created_datetime_utc: report.created_datetime_utc,
        modified_datetime_utc: report.modified_datetime_utc,
        subject: report.subject,
        message: report.message,
        profile_id: report.profile_id,
        first_name,
        last_name
      };
    });
    
    return { data: transformedData, error: null };
  } catch (error) {
    console.error("Error:", error);
    return { data: [], error };
  }
}

