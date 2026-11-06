import { supabase } from "@/utils/supabase/client";
import Category from "@/types/common-use-category";
import { ReportedImages } from "@/types/images";
import UserImage from "@/types/userImage";
import { isUUID } from "@/utils/utils";
import { isHostedImageUrl } from "@/utils/hosted-image-url";
import { getImageUploadHttpError } from "@/utils/image-upload-error";
import {
  applyInsertAuditFields,
  applyUpdateAuditFields,
  getCurrentProfileId,
} from "@/utils/supabase/audit";

const IMAGE_WITH_PROFILE_SELECT =
  "*, profiles:profiles!images_profile_id_fkey(first_name, last_name)";

export type ImagePickerImage = Pick<UserImage, "id" | "url" | "image_description" | "created_datetime_utc">;

export class ImageService {
  // Image pickers do not need profile joins, analysis fields, or a library count.
  static async getRecentImagesForPicker(limit = 200): Promise<ImagePickerImage[]> {
    if (!supabase) throw new Error("Supabase client is not configured.");
    const { data, error } = await supabase
      .from("images")
      .select("id, url, image_description, created_datetime_utc")
      .order("created_datetime_utc", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Could not load images: ${error.message}`);
    return data ?? [];
  }

  private static resolveSort(sort?: string) {
    switch (sort) {
      case "By Oldest":
        return "oldest";
      case "By Image ID (A-Z)":
        return "id-asc";
      case "By Image ID (Z-A)":
        return "id-desc";
      case "By Most Recent":
      default:
        return "most-recent";
    }
  }

  private static applySort(query: any, sort?: string) {
    const resolvedSort = ImageService.resolveSort(sort);
    switch (resolvedSort) {
      case "oldest":
        return query
          .order("created_datetime_utc", { ascending: true })
          .order("id", { ascending: true });
      case "id-asc":
        return query.order("id", { ascending: true });
      case "id-desc":
        return query.order("id", { ascending: false });
      case "most-recent":
      default:
        return query
          .order("created_datetime_utc", { ascending: false })
          .order("id", { ascending: false });
    }
  }

  private static applyImageScope(
    query: any,
    scope: "all" | "common-use" | "user-uploaded"
  ) {
    if (scope === "common-use") {
      return query.eq("is_common_use", true);
    }
    if (scope === "user-uploaded") {
      return query.or("is_common_use.is.null,is_common_use.eq.false");
    }
    return query;
  }

  private static applyProfileScope(query: any, profileId?: string) {
    if (!profileId) return query;
    if (isUUID(profileId)) {
      return query.eq("profile_id", profileId);
    }
    return query.eq("profile_id", "__no_match__");
  }

  private static normalizeSearchValue(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) return value.filter(Boolean).join(" ");
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  private static matchesImageSearchTerm(image: UserImage, term: string): boolean {
    const normalizedTerm = term.toLowerCase();
    const idMatch = image.id?.toLowerCase().includes(normalizedTerm);
    const descriptionMatch = ImageService
      .normalizeSearchValue(image.image_description)
      .toLowerCase()
      .includes(normalizedTerm);
    const celebrityMatch = ImageService
      .normalizeSearchValue(image.celebrity_recognition)
      .toLowerCase()
      .includes(normalizedTerm);
    const contextMatch = ImageService
      .normalizeSearchValue(image.additional_context)
      .toLowerCase()
      .includes(normalizedTerm);

    return idMatch || descriptionMatch || celebrityMatch || contextMatch;
  }

  static async getImageById(imageId: string): Promise<UserImage | null> {
    if (!supabase) return null;

    try {
      const { data, error } = await supabase
        .from("images")
        .select("*")
        .eq("id", imageId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching image by id:", error);
        return null;
      }
      return data ?? null;
    } catch (error) {
      console.error(`Error fetching image ${imageId}:`, error);
      return null;
    }
  }

  static async getAllImages() {
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from("images")
        .select(IMAGE_WITH_PROFILE_SELECT);

      if (error) {
        console.error("Error fetching images:", error);
        return [];
      }
      return data;
    } catch (error) {
      console.error("Error fetching images:", error);
      return [];
    }
  }

  // Quick Study only registers this environment's canonical image URLs directly.
  // Other URLs must be copied by nonchalant, which creates the private row itself.
  static async registerImageUrl(
    url: string,
    actingProfileId?: string
  ): Promise<{ id?: string; url?: string; error?: string }> {
    if (!supabase) return { error: "Supabase client is not configured." };
    try {
      url = url.trim();
      if (!isHostedImageUrl(url)) {
        // Use HTTP so the builder's five workers upload concurrently instead of
        // waiting in Next.js's client Server Action queue. Cookies carry the JWT.
        const response = await fetch("/api/study-quick/images", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: url }),
        });
        const result: { image?: { id?: string; url?: string }; error?: string; needsClassification?: boolean } | null =
          await response.json().catch(() => null);
        if (!response.ok || result?.error) {
          return { error: result?.error || getImageUploadHttpError(response.status) };
        }
        if (!result?.image?.id || !result.image.url || !isHostedImageUrl(result.image.url)) {
          return { error: "Upload did not return a hosted image." };
        }
        if (result.needsClassification) {
          // Keep this small, optional request alive if the user leaves the page.
          // Study preparation can proceed while the category is assigned.
          void fetch("/api/study-quick/images/classify", {
            method: "POST", credentials: "same-origin", keepalive: true,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageId: result.image.id }),
          }).catch(() => {});
        }
        return { id: result.image.id, url: result.image.url };
      }

      const profileId = actingProfileId ?? await getCurrentProfileId(supabase);
      const { data: existing } = await supabase
        .from("images")
        .select("id, is_public")
        .eq("url", url)
        .limit(1)
        .maybeSingle();
      if (existing?.id) {
        // Reusing an image in a draft must not change its visibility.
        return { id: existing.id, url };
      }

      const { data, error } = await supabase
        .from("images")
        .insert(
          applyInsertAuditFields(
            [{ url, profile_id: profileId, is_public: false, is_common_use: false }],
            profileId
          )
        )
        .select("id")
        .single();
      if (error) {
        console.error("Error registering image url:", error);
        return { error: error.message };
      }
      return { id: data?.id, url };
    } catch (error) {
      console.error("Error registering image url:", error);
      return { error: error instanceof Error ? error.message : "Could not register the image url." };
    }
  }

  /**
   * Search images by ID (exact/partial), celebrity recognition, description, or additional context.
   * Returns paginated results.
   */
  static async searchImages(
    searchTerm: string,
    limit: number = 100,
    offset: number = 0,
    scope: "all" | "common-use" | "user-uploaded" = "all",
    sort?: string,
    profileId?: string
  ): Promise<{ images: UserImage[]; totalCount: number }> {
    if (!supabase) return { images: [], totalCount: 0 };

    const trimmedTerm = searchTerm.trim();
    if (!trimmedTerm) {
      // If no search term, return empty
      return { images: [], totalCount: 0 };
    }

    try {
      // IMPORTANT: UUID columns in PostgreSQL don't support ilike operator
      // We must use .eq() for exact UUID matches, or fetch and filter client-side for partial matches
      const isUUIDMatch = isUUID(trimmedTerm);
      
      if (isUUIDMatch) {
        // Exact UUID match - use .eq() which works with UUID columns
        // NEVER use ilike on UUID columns - it causes: "operator does not exist: uuid ~~* unknown"
        const scopedQuery = ImageService.applyImageScope(
          supabase.from("images").select(IMAGE_WITH_PROFILE_SELECT, { count: "exact" }),
          scope
        );
        const baseQuery = ImageService.applyProfileScope(scopedQuery, profileId);
        const sortedQuery = ImageService.applySort(baseQuery, sort);
        const { data, error, count } = await sortedQuery
          .eq("id", trimmedTerm)
          .range(offset, offset + limit - 1);

        if (error) {
          console.error("Error searching images by ID:", error);
          return { images: [], totalCount: 0 };
        }

        return {
          images: (data || []) as unknown as UserImage[],
          totalCount: count || 0
        };
      } else {
        // Partial match - UUID columns don't support ilike, so fetch and filter client-side
        // Fetch a reasonable batch for filtering (pagination will be applied after filtering)
        const scopedQuery = ImageService.applyImageScope(
          supabase.from("images").select(IMAGE_WITH_PROFILE_SELECT, { count: "exact" }),
          scope
        );
        const baseQuery = ImageService.applyProfileScope(scopedQuery, profileId);
        const sortedQuery = ImageService.applySort(baseQuery, sort);
        const { data: allData, error: allError } = await sortedQuery
          .limit(10000); // Fetch a large batch for filtering

        if (allError) {
          console.error("Error fetching images for filtering:", allError);
          return { images: [], totalCount: 0 };
        }

        const filtered = (allData || []).filter((img: UserImage) =>
          ImageService.matchesImageSearchTerm(img, trimmedTerm)
        );
        const paginated = filtered.slice(offset, offset + limit);

        return {
          images: paginated as unknown as UserImage[],
          totalCount: filtered.length
        };
      }
    } catch (error) {
      console.error("Error searching images:", error);
      return { images: [], totalCount: 0 };
    }
  }

  /**
   * Get all images with pagination
   */
  static async getAllImagesWithPagination(
    limit: number = 100,
    offset: number = 0,
    scope: "all" | "common-use" | "user-uploaded" = "all",
    sort?: string,
    profileId?: string
  ): Promise<{ images: UserImage[]; totalCount: number }> {
    if (!supabase) return { images: [], totalCount: 0 };

    try {
      const scopedQuery = ImageService.applyImageScope(
        supabase.from("images").select(IMAGE_WITH_PROFILE_SELECT, { count: "exact" }),
        scope
      );
      const baseQuery = ImageService.applyProfileScope(scopedQuery, profileId);
      const sortedQuery = ImageService.applySort(baseQuery, sort);
      const { data, error, count } = await sortedQuery
        .range(offset, offset + limit - 1);

      if (error) {
        console.error("Error fetching images with pagination:", error);
        return { images: [], totalCount: 0 };
      }

      return {
        images: (data || []) as unknown as UserImage[],
        totalCount: count || 0
      };
    } catch (error) {
      console.error("Error fetching images with pagination:", error);
      return { images: [], totalCount: 0 };
    }
  }

  static async getAllImagesCount(): Promise<number> {
  if (!supabase) return 0;

  try {
    const { count, error } = await supabase
      .from("images")
      .select("*", { count: "exact", head: true });

    if (error) {
      console.error("Error counting images:", error);
      return 0;
    }

    return count || 0;
  } catch (error) {
    console.error("Error getting image count:", error);
    return 0;
  }
}


  static async markAsCommonUse(image_id: string) {
    if (!supabase) return { error: "Supabase client not available" };
    
    try {
      const profileId = await getCurrentProfileId(supabase);
      const { error } = await supabase
        .from("images")
        .update(
          applyUpdateAuditFields(
            {
              is_common_use: true,
            },
            profileId
          )
        )
        .match({ id: image_id });

      if (error) {
        console.error("Error setting image as common use", error);
        return { error: "Failed to set image as common use." };
      }
      return "Success";
    } catch (error) {
      console.error("Error setting image as common use:", error);
      return { error: "Failed to set image as common use." };
    }
  }

  static async mapImageToCategories(
    image_id: string, 
    category_ids: Category["id"][]
  ) {
    if (!supabase) return { error: "Supabase client not available" };
    
    try {
      // First delete existing mappings to avoid duplicates
      const { error: deleteError } = await supabase
        .from("common_use_category_image_mappings")
        .delete()
        .eq("image_id", image_id);

      if (deleteError) {
        console.error("Error deleting existing mappings:", deleteError);
        // Don't fail if delete fails - might be no existing mappings
      }

      // If no categories to add, we're done
      if (category_ids.length === 0) {
        return { success: true };
      }

      const mappings = category_ids.map(category_id => ({
        image_id: image_id,
        common_use_category_id: category_id
      }));
      const profileId = await getCurrentProfileId(supabase);

      const { data, error } = await supabase
        .from("common_use_category_image_mappings")
        .insert(applyInsertAuditFields(mappings, profileId))
        .select("id");

      if (error) {
        console.error("Error setting image categories in database:", error);
        // Check if it's an RLS policy error (empty object)
        if (error && Object.keys(error).length === 0) {
          console.error("RLS policy error - user may not have permission to insert category mappings");
        }
        return { error: error?.message || "Failed to set image categories in database" };
      }
      
      console.log(`Successfully mapped ${category_ids.length} categories to image ${image_id}`);
      return { data, success: true };
    } catch (error) {
      console.error("Error setting image categories:", error);
      return { error: "Failed to set image categories" };
    }
  }

  // Keep backward compatibility
  static async mapImageToCategory(
    image_id: string, 
    category_id: Category["id"]
  ) {
    return this.mapImageToCategories(image_id, [category_id]);
  }

  static async getImageCategories(image_id: string): Promise<Category["id"][]> {
    if (!supabase) return [];
    
    try {
      const { data, error } = await supabase
        .from("common_use_category_image_mappings")
        .select("common_use_category_id")
        .eq("image_id", image_id);

      if (error) {
        console.error("Error fetching image categories:", error);
        // Check if it's an RLS policy error (empty object)
        if (error && Object.keys(error).length === 0) {
          console.error("RLS policy error - user may not have permission to read category mappings");
        }
        return [];
      }

      return (
        data
          ?.map((item) => item.common_use_category_id)
          .filter((id): id is number => typeof id === "number") || []
      );
    } catch (error) {
      console.error("Error fetching image categories:", error);
      return [];
    }
  }

  static async updateImageCategories(
    image_id: string,
    category_ids: Category["id"][]
  ) {
    if (!supabase) return { error: "Supabase client not available" };
    
    try {
      // First, delete existing category mappings
      const { error: deleteError } = await supabase
        .from("common_use_category_image_mappings")
        .delete()
        .eq("image_id", image_id);

      if (deleteError) {
        console.error("Error deleting existing categories:", deleteError);
        // Check if it's an RLS policy error (empty object)
        if (deleteError && Object.keys(deleteError).length === 0) {
          console.error("RLS policy error - user may not have permission to delete category mappings");
        }
        // Don't fail completely - try to insert anyway
      }

      // If no new categories, we're done
      if (category_ids.length === 0) {
        return { success: true };
      }

      // Add new category mappings
      const mappings = category_ids.map(category_id => ({
        image_id: image_id,
        common_use_category_id: category_id
      }));
      const profileId = await getCurrentProfileId(supabase);

      const { error: insertError } = await supabase
        .from("common_use_category_image_mappings")
        .insert(applyInsertAuditFields(mappings, profileId));

      if (insertError) {
        console.error("Error inserting new categories:", insertError);
        // Check if it's an RLS policy error (empty object)
        if (insertError && Object.keys(insertError).length === 0) {
          console.error("RLS policy error - user may not have permission to insert category mappings");
        }
        return { error: insertError?.message || "Failed to insert categories - possible permission issue" };
      }

      return { success: true };
    } catch (error) {
      console.error("Error updating image categories:", error);
      return { error: "Failed to update categories" };
    }
  }

  static async getAllCommonUseImages() {
    if (!supabase) return [];
    
    try {
      const { data, error } = await supabase
        .from("images")
        .select(IMAGE_WITH_PROFILE_SELECT)
        .eq("is_common_use", true)
        .order("created_datetime_utc", { ascending: false })
        .limit(100); // Limit to most recent 100 images for performance

      if (error) {
        console.error("Error fetching images from database:", error);
        return [];
      }
      return data;
    } catch (error) {
      console.error("Error fetching images from database:", error);
      return [];
    }
  }

  /**
   * Search common-use images by ID (exact/partial), celebrity recognition,
   * description, or additional context. Returns paginated results.
   */
  static async searchCommonUseImages(
    searchTerm: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<{ images: UserImage[]; totalCount: number }> {
    if (!supabase) return { images: [], totalCount: 0 };

    const trimmedTerm = searchTerm.trim();
    if (!trimmedTerm) {
      // If no search term, return empty
      return { images: [], totalCount: 0 };
    }

    try {
      // IMPORTANT: UUID columns in PostgreSQL don't support ilike operator
      // We must use .eq() for exact UUID matches, or fetch and filter client-side for partial matches
      const isUUIDMatch = isUUID(trimmedTerm);
      
      if (isUUIDMatch) {
        // Exact UUID match - use .eq() which works with UUID columns
        // NEVER use ilike on UUID columns - it causes: "operator does not exist: uuid ~~* unknown"
        const { data, error, count } = await supabase
          .from("images")
          .select(IMAGE_WITH_PROFILE_SELECT, { count: "exact" })
          .eq("is_common_use", true)
          .eq("id", trimmedTerm)
          .order("created_datetime_utc", { ascending: false })
          .order("id", { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) {
          console.error("Error searching common-use images by ID:", error);
          return { images: [], totalCount: 0 };
        }

        return {
          images: (data || []) as unknown as UserImage[],
          totalCount: count || 0
        };
      } else {
        // Partial match - UUID columns don't support ilike, so fetch and filter client-side
        // Fetch a reasonable batch for filtering (pagination will be applied after filtering)
        const { data: allData, error: allError } = await supabase
          .from("images")
          .select(IMAGE_WITH_PROFILE_SELECT, { count: "exact" })
          .eq("is_common_use", true)
          .order("created_datetime_utc", { ascending: false })
          .order("id", { ascending: false })
          .limit(10000); // Fetch a large batch for filtering

        if (allError) {
          console.error("Error fetching common-use images for filtering:", allError);
          return { images: [], totalCount: 0 };
        }

        const filtered = (allData || []).filter((img: UserImage) =>
          ImageService.matchesImageSearchTerm(img, trimmedTerm)
        );
        const paginated = filtered.slice(offset, offset + limit);

        return {
          images: paginated as unknown as UserImage[],
          totalCount: filtered.length
        };
      }
    } catch (error) {
      console.error("Error searching common-use images:", error);
      return { images: [], totalCount: 0 };
    }
  }

  /**
   * Get all common-use images with pagination
   */
  static async getAllCommonUseImagesWithPagination(
    limit: number = 100,
    offset: number = 0
  ): Promise<{ images: UserImage[]; totalCount: number }> {
    if (!supabase) return { images: [], totalCount: 0 };

    try {
      const { data, error, count } = await supabase
        .from("images")
        .select(IMAGE_WITH_PROFILE_SELECT, { count: "exact" })
        .eq("is_common_use", true)
        .order("created_datetime_utc", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error("Error fetching common-use images with pagination:", error);
        return { images: [], totalCount: 0 };
      }

      return {
        images: (data || []) as unknown as UserImage[],
        totalCount: count || 0
      };
    } catch (error) {
      console.error("Error fetching common-use images with pagination:", error);
      return { images: [], totalCount: 0 };
    }
  }

  static async getImagesByCategories(
    category_ids: number[],
    limit: number = 100,
    offset: number = 0
  ): Promise<{ data?: UserImage[]; totalCount?: number; error?: string }> {
    if (!supabase) return { error: "Supabase client not available" };
    
    try {
      const { data: mappingData, error: mappingError } = await supabase
        .from("common_use_category_image_mappings")
        .select("image_id")
        .in("common_use_category_id", category_ids);
  
      if (mappingError) {
        console.error("Error getting image mappings:", mappingError);
        return { error: "Failed to get image mappings from database" };
      }
  
      if (!mappingData || mappingData.length === 0) {
        return { data: [], totalCount: 0 };
      }
  
      const imageIds = mappingData
        .map((m) => m.image_id)
        .filter((id): id is string => typeof id === "string");

      if (imageIds.length === 0) {
        return { data: [], totalCount: 0 };
      }

      const uniqueImageIds = [...new Set(imageIds)]; // Remove duplicates
  
      // 2) Fetch the actual image records with pagination
      const { data: imagesData, error: imagesError, count } = await supabase
        .from("images")
        .select(IMAGE_WITH_PROFILE_SELECT, { count: "exact" })
        .in("id", uniqueImageIds)
        .eq("is_common_use", true)
        .order("created_datetime_utc", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + limit - 1);
  
      if (imagesError) {
        console.error("Error getting images:", imagesError);
        return { error: "Failed to get images from database" };
      }
  
      return { 
        data: (imagesData || []) as unknown as UserImage[],
        totalCount: count || 0
      };
    } catch (error) {
      console.error("Error getting images by categories:", error);
      return { error: "Failed to get images by categories" };
    }
  }

  // Keep backward compatibility
  static async getImageByCategory(category_id: number) {
    return this.getImagesByCategories([category_id]);
  }

  static async deleteCommonUseImage(imageId: string) {
    if (!supabase) {
      return { error: "Supabase client not available", success: false };
    }
    
    try {
      const { data, error: deleteError } = await supabase
        .from("images")
        .delete()
        .eq("id", imageId)
        .select("id");
      
      if (deleteError) {
        return { error: "Failed to delete image", success: false };
      }

      if (!data || data.length === 0) {
        return { error: "Image could not be deleted", success: false };
      }
      
      return { success: true };
    } catch (error) {
      return { error: `Failed to delete image: ${error}`, success: false };
    }
  }

  static async getAllReportedImages(): Promise<ReportedImages[]> {
    if (!supabase) return [];
    
    try {
      const { data, error } = await supabase
        .from("reported_images")
        .select(`
          id,
          image_id,
          reason,
          created_datetime_utc,
          profiles:profiles!reported_images_profile_id_fkey ( first_name, last_name ),
          images ( url )
        `)
        .order("created_datetime_utc", { ascending: false });

      if (error) {
        console.error("Error fetching reported images:", error);
        return [];
      }
      return (data || []) as unknown as ReportedImages[];
      
    } catch (error) {
      console.error("Error fetching reported images:", error);
      return [];
    }
  }

  static async keepReportedImage(reportedImageId: number): Promise<boolean> {
    if (!supabase) return false;
    try {
      const { error } = await supabase
        .from("reported_images")
        .delete()
        .eq("id", reportedImageId); 

      if (error) {
        console.error(`Error dismissing reported image ${reportedImageId}:`, error);
        return false;
      }
      return true;
    } catch (error) {
      console.error(`Error dismissing reported image ${reportedImageId}:`, error);
      return false;
    }
  }
  
  static async deleteImage(imageId: string): Promise<boolean> {
    if (!supabase) return false;
    
    try {
      const { data, error } = await supabase
        .from("images")
        .delete()
        .eq("id", imageId)
        .select("id");

      if (error) {
        console.error(`Error deleting image ${imageId}:`, error);
        return false;
      }

      if (!data || data.length === 0) {
        console.error(`No image deleted for ${imageId}`);
        return false;
      }
      return true;
    } catch (error) {
      console.error(`Error deleting image ${imageId}:`, error);
      return false;
      }
  }
}
