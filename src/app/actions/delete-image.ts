"use server";

import { createClient } from "@/utils/supabase/server";

export type DeleteImageResult =
  | { success: true; deletedId: string }
  | { success: false; error: string };

export async function deleteImageAction(imageId: string): Promise<DeleteImageResult> {
  const trimmedId = imageId?.trim();
  if (!trimmedId) {
    return { success: false, error: "Image ID is required." };
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, error: "Authentication required to delete images." };
    }

    const { data, error } = await supabase
      .from("images")
      .delete()
      .eq("id", trimmedId)
      .select("id");

    if (error) {
      console.error(`Error deleting image ${trimmedId}:`, error);
      return { success: false, error: error.message || "Failed to delete image." };
    }

    if (!data || data.length === 0) {
      return {
        success: false,
        error: "Image could not be deleted. Check permissions and try again.",
      };
    }

    return { success: true, deletedId: trimmedId };
  } catch (error) {
    console.error(`Error deleting image ${trimmedId}:`, error);
    return { success: false, error: "Failed to delete image." };
  }
}
