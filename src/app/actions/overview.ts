"use server";

import { createClient } from "@/utils/supabase/server";

export async function fetchProfilesCount(): Promise<number> {
  const supabase = await createClient();

  try {
    const { count, error } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true });

    if (error) {
      console.error("Error counting profiles:", error);
      return 0;
    }

    return count ?? 0;
  } catch (error) {
    console.error("Error getting profiles count:", error);
    return 0;
  }
}

export async function fetchSharesCount(): Promise<number> {
  const supabase = await createClient();

  try {
    const { count, error } = await supabase
      .from("shares")
      .select("id", { count: "exact", head: true });

    if (error) {
      console.error("Error counting shares:", error);
      return 0;
    }

    return count ?? 0;
  } catch (error) {
    console.error("Error getting shares count:", error);
    return 0;
  }
}

export async function fetchScreenshotsCount(): Promise<number> {
  const supabase = await createClient();

  try {
    const { count, error } = await supabase
      .from("screenshots")
      .select("id", { count: "exact", head: true });

    if (error) {
      console.error("Error counting screenshots:", error);
      return 0;
    }

    return count ?? 0;
  } catch (error) {
    console.error("Error getting screenshots count:", error);
    return 0;
  }
}
