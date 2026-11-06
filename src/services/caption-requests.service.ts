import { supabase } from "@/utils/supabase/client";
import type {
  CaptionRequestDetails,
  CaptionRequestListItem,
  CaptionRequestResponse,
} from "@/types/caption-request";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class CaptionRequestsService {
  private static buildSearchFilters(query: string) {
    const trimmed = query.trim();
    if (!trimmed) return null;

    const filters: string[] = [];
    const numericId = Number(trimmed);
    if (!Number.isNaN(numericId)) {
      filters.push(`id.eq.${numericId}`);
    }

    if (uuidRegex.test(trimmed)) {
      filters.push(`image_id.eq.${trimmed}`, `profile_id.eq.${trimmed}`);
    }

    if (!filters.length) return "";
    return filters.join(",");
  }

  static async searchCaptionRequests(params: {
    searchQuery: string;
    offset: number;
    limit: number;
  }): Promise<{ requests: CaptionRequestListItem[]; totalCount: number }> {
    if (!supabase) return { requests: [], totalCount: 0 };

    const { searchQuery, offset, limit } = params;
    const trimmed = searchQuery.trim();
    const filters = this.buildSearchFilters(trimmed);

    if (trimmed && filters === "") {
      return { requests: [], totalCount: 0 };
    }

    try {
      let query = supabase
        .from("caption_requests")
        .select(
          `
          id,
          created_datetime_utc,
          image_id,
          profile_id,
          profiles:profiles!caption_requests_profile_id_fkey ( first_name, last_name ),
          images ( url )
        `,
          { count: "exact" }
        )
        .order("created_datetime_utc", { ascending: false })
        .range(offset, offset + limit - 1);

      if (filters) {
        query = query.or(filters);
      }

      const { data, error, count } = await query;
      if (error) {
        console.error("Error fetching caption requests:", error);
        return { requests: [], totalCount: 0 };
      }

      return {
        requests: (data || []) as CaptionRequestListItem[],
        totalCount: count || 0,
      };
    } catch (error) {
      console.error("Error fetching caption requests:", error);
      return { requests: [], totalCount: 0 };
    }
  }

  static async getCaptionRequestDetails(
    captionRequestId: number
  ): Promise<CaptionRequestDetails | null> {
    if (!supabase) return null;

    try {
      const { data, error } = await supabase
        .from("caption_requests")
        .select(
          `
          id,
          created_datetime_utc,
          image_id,
          profile_id,
          profiles:profiles!caption_requests_profile_id_fkey ( first_name, last_name, email ),
          images ( url, image_description ),
          llm_model_responses (
            id,
            created_datetime_utc,
            llm_model_id,
            humor_flavor_id,
            processing_time_seconds,
            llm_model_response,
            llm_system_prompt,
            llm_user_prompt,
            llm_temperature,
            profile_id,
            caption_request_id,
            llm_models ( name ),
            humor_flavors:humor_flavor_id ( slug )
          )
        `
        )
        .eq("id", captionRequestId)
        .single();

      if (error) {
        console.error("Error fetching caption request details:", error);
        return null;
      }

      const responses = (data.llm_model_responses || []) as any[];
      const formattedResponses: CaptionRequestResponse[] = responses.map((resp) => {
        let modelResponse = resp.llm_model_response;
        if (typeof modelResponse === "string") {
          try {
            const parsed = JSON.parse(modelResponse);
            if (parsed && typeof parsed === "object") {
              modelResponse = JSON.stringify(parsed, null, 2);
            }
          } catch {
            // ignore non-JSON strings
          }
        }

        return {
          id: resp.id,
          created_datetime_utc: resp.created_datetime_utc,
          llm_model_id: resp.llm_model_id,
          humor_flavor_id: resp.humor_flavor_id,
          processing_time_seconds: resp.processing_time_seconds,
          llm_model_response: modelResponse,
          llm_system_prompt: resp.llm_system_prompt,
          llm_user_prompt: resp.llm_user_prompt,
          llm_temperature: resp.llm_temperature,
          profile_id: resp.profile_id,
          caption_request_id: resp.caption_request_id,
          llm_model_name: resp.llm_models?.name ?? null,
          humor_flavor_slug: resp.humor_flavors?.slug ?? null,
        };
      });

      return {
        id: data.id,
        created_datetime_utc: data.created_datetime_utc,
        image_id: data.image_id,
        profile_id: data.profile_id,
        profiles: data.profiles ?? null,
        images: data.images ?? null,
        llm_model_responses: formattedResponses,
      };
    } catch (error) {
      console.error("Error fetching caption request details:", error);
      return null;
    }
  }
}
