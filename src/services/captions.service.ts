import { supabase } from "@/utils/supabase/client";
import UserImage from "@/types/userImage";
import { Captions, CaptionDetails, CaptionSearchResult, ReportedCaptions } from "@/types/captions";
import { isUUID } from "@/utils/utils";
import { applyInsertAuditFields, getCurrentProfileId } from "@/utils/supabase/audit";
import type { Json } from "@/types/supabase";

function normalizeUtcRange(startISO?: string, endISO?: string) {
  if (!startISO || !endISO) return null;
  const start = new Date(startISO);
  const end = new Date(endISO);
  const startUtc = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), 0, 0, 0, 0)).toISOString();
  const endUtc = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate(), 23, 59, 59, 999)).toISOString();
  return { startUtc, endUtc };
}


export type GroupBy = "day" | "week" | "month";

export class CaptionService {
  // Create a standalone caption for an image (used by the quick-study builder to
  // publish a study directly from image+caption pairs, without the pipeline).
  // `opts` lets the caller attach recognized fields (humor flavor, author) that
  // map to real columns, plus a free-form `metadata` blob kept for display.
  // Returns the new caption id, or null on failure.
  static async createCaption(
    content: string,
    imageId: string,
    opts?: {
      humorFlavorId?: number | null;
      // author of the caption; falls back to the current user's profile.
      profileId?: string | null;
      metadata?: Record<string, Json | undefined> | null;
      actingProfileId?: string;
    }
  ): Promise<string | null> {
    if (!supabase) return null;
    try {
      const currentProfileId = opts?.actingProfileId ?? await getCurrentProfileId(supabase);
      if (!currentProfileId) {
        console.error("Cannot create caption without a profile id");
        return null;
      }
      // The audit fields (created_by_user_id, etc.) are always the acting user;
      // profile_id is the caption's author, which the caller may override.
      const profileId = opts?.profileId ?? currentProfileId;
      const { data, error } = await supabase
        .from("captions")
        .insert(
          applyInsertAuditFields(
            // Quick Study drafts stay off public caption feeds until release.
            [
              {
                content,
                image_id: imageId,
                is_public: false,
                profile_id: profileId,
                ...(opts?.humorFlavorId != null
                  ? { humor_flavor_id: opts.humorFlavorId }
                  : {}),
                ...(opts?.metadata && Object.keys(opts.metadata).length > 0
                  ? { metadata: opts.metadata }
                  : {}),
              },
            ],
            currentProfileId
          )
        )
        .select("id")
        .single();
      if (error) {
        console.error("Error creating caption:", error);
        return null;
      }
      return data?.id ?? null;
    } catch (error) {
      console.error("Error creating caption:", error);
      return null;
    }
  }

  static async getAllCaptions(): Promise<CaptionSearchResult[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from("captions")
        .select("id, content, image_id, profile_id, created_datetime_utc, is_public")
        .order("created_datetime_utc", { ascending: false });

      if (error) {
        console.error("Error fetching all captions:", error);
        return [];
      }
      return (data || []) as unknown as CaptionSearchResult[];
    } catch (error) {
      console.error("Error fetching all captions:", error);
      return [];
    }
  }

  static async getAllCaptionsCount(): Promise<number> {
    if (!supabase) return 0;

    try {
      const { count, error } = await supabase
        .from("captions")
        .select("*", { count: "exact", head: true });

      if (error) {
        console.error("Error counting captions:", error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.error("Error getting caption count:", error);
      return 0;
    }
  }

  static async searchCaptions(searchTerm: string, limit: number = 50, offset: number = 0): Promise<{
    captions: CaptionSearchResult[];
    totalCount: number;
  }> {
    if (!supabase) return { captions: [], totalCount: 0 };
    
    try {
      const trimmedTerm = searchTerm.trim();
      
      if (!trimmedTerm) {
        // If no search term, return paginated results
        const { data, error, count } = await supabase
          .from("captions")
          .select("id, content, image_id, profile_id, images(url)", { count: "exact" })
          .order("created_datetime_utc", { ascending: false })
          .order("id", { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) {
          console.error("Error fetching captions:", error);
          return { captions: [], totalCount: 0 };
        }
        
        return {
          captions: (data || []) as unknown as Captions[],
          totalCount: count || 0
        };
      }

      const filters = [`content.ilike.%${trimmedTerm}%`];
      if (isUUID(trimmedTerm)) {
        filters.push(`id.eq.${trimmedTerm}`, `image_id.eq.${trimmedTerm}`);
      }

      // Search across content only for now (to avoid UUID casting issues)
      const { data, error, count } = await supabase
        .from("captions")
        .select("id, content, image_id, profile_id, images(url)", { count: "exact" })
        .or(filters.join(","))
        .order("created_datetime_utc", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error("Error searching captions:", error);
        return { captions: [], totalCount: 0 };
      }

      return {
        captions: (data || []) as unknown as CaptionSearchResult[],
        totalCount: count || 0
      };
    } catch (error) {
      console.error("Error searching captions:", error);
      return { captions: [], totalCount: 0 };
    }
  }

  static async getAllCaptionsWithPagination(limit: number = 50, offset: number = 0): Promise<{
    captions: CaptionSearchResult[];
    totalCount: number;
  }> {
    if (!supabase) return { captions: [], totalCount: 0 };
    
    try {
      const { data, error, count } = await supabase
        .from("captions")
        .select("id, content, image_id, profile_id", { count: "exact" })
        .order("created_datetime_utc", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error("Error fetching captions:", error);
        return { captions: [], totalCount: 0 };
      }

      return {
        captions: (data || []) as unknown as CaptionSearchResult[],
        totalCount: count || 0
      };
    } catch (error) {
      console.error("Error fetching captions:", error);
      return { captions: [], totalCount: 0 };
    }
  }

  static async getCaptionsByImageId(image_id: UserImage["id"]) {
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from("captions")
        .select(`
          id,
          content,
          created_datetime_utc,
          profile_id,
          profiles:profiles!captions_profile_id_fkey ( first_name, last_name ),
          caption_requests (
            llm_model_responses(
              id,
              llm_model_response,
              created_datetime_utc,
              humor_flavor_id,
              humor_flavors:humor_flavor_id ( id, slug ),
              llm_models (name)
            )
          )
        `)
        .eq("image_id", image_id)
        .order("humor_flavor_id", {
          referencedTable: "caption_requests.llm_model_responses",
          ascending: true,
        })
        .order("created_datetime_utc", {
          referencedTable: "caption_requests.llm_model_responses",
          ascending: true,
        });

      if (error) {
        console.error(`Error fetching captions for image ${image_id}:`, error);
        return [];
      }

      return (data ?? []).map((caption: any) => {
        const cr = caption.caption_requests;
        const requests = Array.isArray(cr) ? cr : cr ? [cr] : [];

        const llm_responses = requests
          .flatMap((req: any) => req?.llm_model_responses ?? [])
          .map((resp: any) => {
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
              llm_model_response: modelResponse,
              llm_model_name: resp.llm_models?.name || "Unknown Model",
              created_datetime_utc: resp.created_datetime_utc,
              humor_flavor_id: resp.humor_flavor_id,
              humor_flavor_slug: resp.humor_flavors?.slug ?? null,
            };
          });

        return {
          id: caption.id,
          content: caption.content,
          created_datetime_utc: caption.created_datetime_utc,
          profile_id: caption.profile_id,
          llm_responses,
        } as Captions;
      });
    } catch (error) {
      console.error(`Error fetching captions for image ${image_id}:`, error);
      return [];
    }
  }

  static async getCaptionDetails(captionId: string): Promise<CaptionDetails | null> {
    if (!supabase) return null;

    try {
      const { data, error } = await supabase
        .from("captions")
        .select(`
          id,
          content,
          image_id,
          profile_id,
          created_datetime_utc,
          modified_datetime_utc,
          is_public,
          is_featured,
          like_count,
          caption_request_id,
          llm_prompt_chain_id,
          humor_flavor_id,
          profiles:profiles!captions_profile_id_fkey ( first_name, last_name ),
          images ( url ),
          humor_flavors ( id, slug ),
          caption_saved:caption_saves(count),
          caption_votes ( vote_value ),
          caption_requests (
            llm_model_responses (
              id,
              llm_model_response,
              created_datetime_utc,
              llm_prompt_chain_id,
              humor_flavor_id,
              humor_flavor_step_id,
              llm_system_prompt,
              llm_user_prompt,
              llm_temperature,
              processing_time_seconds,
              humor_flavor_steps ( order_by ),
              humor_flavors:humor_flavor_id ( id, slug ),
              llm_models (name)
            )
          )
        `)
        .eq("id", captionId)
        .single();

      if (error || !data) {
        console.error(`Error fetching caption ${captionId}:`, error);
        return null;
      }

      const requestRows = Array.isArray(data.caption_requests)
        ? data.caption_requests
        : data.caption_requests
          ? [data.caption_requests]
          : [];

      const responseRows = requestRows.flatMap((req: any) =>
        Array.isArray(req?.llm_model_responses)
          ? req.llm_model_responses
          : req?.llm_model_responses
            ? [req.llm_model_responses]
            : []
      );

      const captionPromptChainId = data.llm_prompt_chain_id ?? null;
      const chainScopedRows =
        captionPromptChainId == null
          ? responseRows
          : responseRows.filter(
              (resp: any) => resp?.llm_prompt_chain_id === captionPromptChainId
            );

      const mappedResponses = chainScopedRows.map((resp: any) => {
        let modelResponse = resp.llm_model_response;
        const stepRaw = resp?.humor_flavor_steps;
        const stepRow = Array.isArray(stepRaw) ? stepRaw[0] : stepRaw;
        const stepOrderBy =
          typeof stepRow?.order_by === "number" ? stepRow.order_by : null;
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
          llm_model_response: modelResponse,
          llm_model_name: resp.llm_models?.name || "Unknown Model",
          created_datetime_utc: resp.created_datetime_utc,
          humor_flavor_id: resp.humor_flavor_id,
          humor_flavor_slug: resp.humor_flavors?.slug ?? null,
          humor_flavor_step_id: resp.humor_flavor_step_id ?? null,
          humor_flavor_step_order_by: stepOrderBy,
          llm_system_prompt: resp.llm_system_prompt ?? null,
          llm_user_prompt: resp.llm_user_prompt ?? null,
          llm_temperature: resp.llm_temperature ?? null,
          processing_time_seconds: resp.processing_time_seconds ?? null,
        };
      });

      const latestResponseByStepKey = new Map<
        string,
        (typeof mappedResponses)[number]
      >();
      for (const response of mappedResponses) {
        const stepKey =
          response.humor_flavor_step_id != null
            ? `step:${response.humor_flavor_step_id}`
            : response.humor_flavor_step_order_by != null
              ? `order:${response.humor_flavor_step_order_by}`
              : `response:${response.id}`;
        const existing = latestResponseByStepKey.get(stepKey);
        if (!existing) {
          latestResponseByStepKey.set(stepKey, response);
          continue;
        }

        const existingTime = Date.parse(existing.created_datetime_utc ?? "");
        const responseTime = Date.parse(response.created_datetime_utc ?? "");
        const safeExistingTime = Number.isNaN(existingTime)
          ? Number.NEGATIVE_INFINITY
          : existingTime;
        const safeResponseTime = Number.isNaN(responseTime)
          ? Number.NEGATIVE_INFINITY
          : responseTime;

        if (
          safeResponseTime > safeExistingTime ||
          (safeResponseTime === safeExistingTime &&
            String(response.id).localeCompare(String(existing.id)) > 0)
        ) {
          latestResponseByStepKey.set(stepKey, response);
        }
      }

      const llm_responses = [...latestResponseByStepKey.values()];
      llm_responses.sort((a, b) => {
        const aStep = a.humor_flavor_step_order_by ?? Number.POSITIVE_INFINITY;
        const bStep = b.humor_flavor_step_order_by ?? Number.POSITIVE_INFINITY;
        if (aStep !== bStep) return aStep - bStep;

        const aCreated = Date.parse(a.created_datetime_utc ?? "");
        const bCreated = Date.parse(b.created_datetime_utc ?? "");
        const safeACreated = Number.isNaN(aCreated) ? Number.POSITIVE_INFINITY : aCreated;
        const safeBCreated = Number.isNaN(bCreated) ? Number.POSITIVE_INFINITY : bCreated;
        if (safeACreated !== safeBCreated) return safeACreated - safeBCreated;

        return String(a.id).localeCompare(String(b.id));
      });

      const shareCount =
        Array.isArray(data.caption_saved) && data.caption_saved[0]?.count != null
          ? data.caption_saved[0].count
          : 0;
      const rawCaptionVotes = Array.isArray(data.caption_votes)
        ? data.caption_votes
        : data.caption_votes
          ? [data.caption_votes]
          : [];
      const dislikeCount = rawCaptionVotes.reduce((count: number, vote: any) => {
        if (typeof vote?.vote_value !== "number") return count;
        return vote.vote_value < 0 ? count + 1 : count;
      }, 0);

      return {
        id: data.id,
        content: data.content,
        image_id: data.image_id,
        profile_id: data.profile_id,
        created_datetime_utc: data.created_datetime_utc,
        modified_datetime_utc: data.modified_datetime_utc,
        is_public: data.is_public,
        is_featured: data.is_featured,
        like_count: data.like_count ?? 0,
        caption_request_id: data.caption_request_id,
        llm_prompt_chain_id: data.llm_prompt_chain_id ?? null,
        humor_flavor_id: data.humor_flavor_id,
        profiles: data.profiles ?? null,
        images: data.images ?? null,
        humor_flavors: data.humor_flavors ?? null,
        share_count: shareCount,
        dislike_count: dislikeCount,
        llm_responses,
      };
    } catch (error) {
      console.error(`Error fetching caption ${captionId}:`, error);
      return null;
    }
  }

  // Fetch just the free-form metadata blob for a caption (attached at creation,
  // e.g. via Quick Study import). Intentionally isolated from getCaptionDetails
  // and error-tolerant: if the `metadata` column doesn't exist yet in this env,
  // this returns null instead of breaking the caption page.
  static async getCaptionMetadata(
    captionId: string
  ): Promise<Record<string, unknown> | null> {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from("captions")
        .select("metadata")
        .eq("id", captionId)
        .single();
      if (error) return null;
      const metadata = (data as { metadata?: unknown } | null)?.metadata;
      return metadata && typeof metadata === "object"
        ? (metadata as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  private static looksLikeUUID(s: string) {
    return isUUID(s);
  }

  private static getResponseTime(value?: string | null) {
    if (!value) return Number.NEGATIVE_INFINITY;
    const time = Date.parse(value);
    return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
  }

  private static normalizeHumorFlavor(
    value: any
  ): { id: number; slug: string } | null {
    const row = Array.isArray(value) ? value[0] : value;
    if (!row) return null;
    if (typeof row.id !== "number" || typeof row.slug !== "string") return null;
    return {
      id: row.id,
      slug: row.slug,
    };
  }

  private static resolveCaptionFlavorFromRow(row: any): {
    humor_flavor_id: number | null;
    humor_flavors: { id: number; slug: string } | null;
  } {
    const directFlavor = this.normalizeHumorFlavor(row?.humor_flavors);
    const directFlavorId =
      typeof row?.humor_flavor_id === "number"
        ? row.humor_flavor_id
        : directFlavor?.id ?? null;

    if (directFlavor?.slug || directFlavorId != null) {
      return {
        humor_flavor_id: directFlavorId,
        humor_flavors: directFlavor,
      };
    }

    const requestRaw = row?.caption_requests;
    const requests = Array.isArray(requestRaw)
      ? requestRaw
      : requestRaw
        ? [requestRaw]
        : [];
    const responses = requests.flatMap((request: any) => {
      const rawResponses = request?.llm_model_responses;
      if (!rawResponses) return [];
      return Array.isArray(rawResponses) ? rawResponses : [rawResponses];
    });

    const primaryResponse = responses.reduce<any | null>((current, response) => {
      if (!response) return current;
      if (!current) return response;
      const responseFlavor = this.normalizeHumorFlavor(response?.humor_flavors);
      const currentFlavor = this.normalizeHumorFlavor(current?.humor_flavors);
      const responseHasFlavor =
        Boolean(responseFlavor?.slug) || response?.humor_flavor_id != null;
      const currentHasFlavor =
        Boolean(currentFlavor?.slug) || current?.humor_flavor_id != null;
      if (responseHasFlavor && !currentHasFlavor) return response;
      if (!responseHasFlavor && currentHasFlavor) return current;
      return this.getResponseTime(response?.created_datetime_utc) >
        this.getResponseTime(current?.created_datetime_utc)
        ? response
        : current;
    }, null);

    const resolvedFlavor = this.normalizeHumorFlavor(primaryResponse?.humor_flavors);
    const resolvedFlavorId =
      typeof primaryResponse?.humor_flavor_id === "number"
        ? primaryResponse.humor_flavor_id
        : resolvedFlavor?.id ?? null;

    return {
      humor_flavor_id: resolvedFlavorId,
      humor_flavors: resolvedFlavor,
    };
  }

  private static buildCaptionRequestFlavorKey(
    captionRequestId: number,
    llmPromptChainId: number | null
  ) {
    return `${captionRequestId}:${llmPromptChainId ?? "null"}`;
  }

  private static async fetchCaptionRequestFlavorMap(
    requests: Array<{ caption_request_id: number; llm_prompt_chain_id: number | null }>
  ) {
    if (!supabase || requests.length === 0) {
      return new Map<
        string,
        { humor_flavor_id: number | null; humor_flavors: { id: number; slug: string } | null }
      >();
    }

    try {
      const uniqueIds = [...new Set(requests.map((request) => request.caption_request_id))];
      const requestedKeys = new Set(
        requests.map((request) =>
          this.buildCaptionRequestFlavorKey(
            request.caption_request_id,
            request.llm_prompt_chain_id
          )
        )
      );
      const { data, error } = await supabase
        .from("llm_model_responses")
        .select(`
          caption_request_id,
          llm_prompt_chain_id,
          created_datetime_utc,
          humor_flavor_id,
          humor_flavors:humor_flavor_id ( id, slug )
        `)
        .in("caption_request_id", uniqueIds);

      if (error) {
        console.error("Error fetching caption request flavors:", error);
        return new Map();
      }

      const bestByRequestKey = new Map<
        string,
        {
          created_datetime_utc: string | null;
          humor_flavor_id: number | null;
          humor_flavors: { id: number; slug: string } | null;
        }
      >();

      for (const row of (data ?? []) as any[]) {
        const captionRequestId =
          typeof row?.caption_request_id === "number" ? row.caption_request_id : null;
        if (captionRequestId == null) continue;
        const llmPromptChainId =
          typeof row?.llm_prompt_chain_id === "number" ? row.llm_prompt_chain_id : null;
        const requestKey = this.buildCaptionRequestFlavorKey(
          captionRequestId,
          llmPromptChainId
        );
        if (!requestedKeys.has(requestKey)) continue;

        const nextFlavor = this.normalizeHumorFlavor(row?.humor_flavors);
        const nextHasFlavor = Boolean(nextFlavor?.slug) || row?.humor_flavor_id != null;
        const current = bestByRequestKey.get(requestKey);

        if (!current) {
          bestByRequestKey.set(requestKey, {
            created_datetime_utc: row?.created_datetime_utc ?? null,
            humor_flavor_id:
              typeof row?.humor_flavor_id === "number" ? row.humor_flavor_id : null,
            humor_flavors: nextFlavor,
          });
          continue;
        }

        const currentHasFlavor =
          Boolean(current.humor_flavors?.slug) || current.humor_flavor_id != null;
        if (nextHasFlavor && !currentHasFlavor) {
          bestByRequestKey.set(requestKey, {
            created_datetime_utc: row?.created_datetime_utc ?? null,
            humor_flavor_id:
              typeof row?.humor_flavor_id === "number" ? row.humor_flavor_id : null,
            humor_flavors: nextFlavor,
          });
          continue;
        }

        if (
          nextHasFlavor === currentHasFlavor &&
          this.getResponseTime(row?.created_datetime_utc) >
            this.getResponseTime(current.created_datetime_utc)
        ) {
          bestByRequestKey.set(requestKey, {
            created_datetime_utc: row?.created_datetime_utc ?? null,
            humor_flavor_id:
              typeof row?.humor_flavor_id === "number" ? row.humor_flavor_id : null,
            humor_flavors: nextFlavor,
          });
        }
      }

      return new Map(
        [...bestByRequestKey.entries()].map(([requestKey, value]) => [
          requestKey,
          {
            humor_flavor_id: value.humor_flavor_id,
            humor_flavors: value.humor_flavors,
          },
        ])
      );
    } catch (error) {
      console.error("Error fetching caption request flavors:", error);
      return new Map();
    }
  }

  static async searchCaptionsEnhanced(params: {
    searchQuery: string;
    searchType: "all" | "content" | "id" | "imageId" | "profileId";
    offset: number;
    limit: number;
    sortBy: "created" | "content" | "imageId" | "likes" | "shares";
    sortOrder: "asc" | "desc";
    startISO?: string;
    endISO?: string;
    profileId?: string;
  }): Promise<{ captions: CaptionSearchResult[]; totalCount: number }> {
    if (!supabase) return { captions: [], totalCount: 0 };

    const {
      searchQuery,
      searchType,
      offset,
      limit,
      sortBy,
      sortOrder,
      profileId,
    } = params;

    try {
      let query = supabase
        .from("captions")
        .select(`
          id,
          content,
          image_id,
          profile_id,
          caption_request_id,
          llm_prompt_chain_id,
          humor_flavor_id,
          profiles:profiles!captions_profile_id_fkey ( first_name, last_name, email ),
          images ( url ),
          humor_flavors:humor_flavor_id ( id, slug ),
          created_datetime_utc,
          is_public,
          like_count,
          caption_saved:caption_saves(count)
        `, {
          count: "exact",
        });
      const dr = normalizeUtcRange(params.startISO, params.endISO);
      if (dr) {
        query = query.gte("created_datetime_utc", dr.startUtc).lte("created_datetime_utc", dr.endUtc);
      }

      if (profileId) {
        if (this.looksLikeUUID(profileId)) {
          query = query.eq("profile_id", profileId);
        } else {
          query = query.eq("profile_id", "__no_match__");
        }
      }

      // search
      const q = (searchQuery ?? "").trim();
      if (q) {
        if (searchType === "content") {
          query = query.ilike("content", `%${q}%`);
        } else if (searchType === "id") {
          if (this.looksLikeUUID(q)) {
            query = query.eq("id", q);
          } else {
            query = query.eq("id", "__no_match__");
          }
        } else if (searchType === "imageId") {
          if (this.looksLikeUUID(q)) {
            query = query.eq("image_id", q);
          } else {
            query = query.eq("image_id", "__no_match__");
          }
        } else if (searchType === "profileId") {
          if (this.looksLikeUUID(q)) {
            query = query.eq("profile_id", q);
          } else {
            query = query.eq("profile_id", "__no_match__");
          }
        } else {
          if (this.looksLikeUUID(q)) {
            query = query.or(
              [`content.ilike.%${q}%`, `id.eq.${q}`, `image_id.eq.${q}`, `profile_id.eq.${q}`].join(",")
            );
          } else {
            query = query.ilike("content", `%${q}%`);
          }
        }
      }

      // -sort
      if (sortBy === "created") {
        query = query.order("created_datetime_utc", { ascending: sortOrder === "asc" });
      } else if (sortBy === "content") {
        query = query.order("content", { ascending: sortOrder === "asc", nullsFirst: true });
      } else if (sortBy === "imageId") {
        query = query.order("image_id", { ascending: sortOrder === "asc", nullsFirst: true });
      }
      else if (sortBy === "likes") {
        query = query.order("like_count", {
          ascending: sortOrder === "asc",
          nullsFirst: true,
        });
      }
      else if (sortBy === "shares") {
        query = query.order("count", {
          ascending: sortOrder === "asc",
          nullsFirst: true,
          foreignTable: "caption_saves",
        });
      }
      query = query.order("id", { ascending: true }); 

      const from = Math.max(0, offset || 0);
      const to = from + Math.max(1, limit || 50) - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) {
        console.error("Error searching captions:", error);
        return { captions: [], totalCount: 0 };
      }

      const raw = (data || []) as any[];
      const captionRequestFlavorMap = await this.fetchCaptionRequestFlavorMap(
        raw
          .map((row) => {
            const directFlavor = this.normalizeHumorFlavor(row?.humor_flavors);
            if (directFlavor?.slug || row?.humor_flavor_id != null) return null;
            const captionRequestId =
              typeof row?.caption_request_id === "number" ? row.caption_request_id : null;
            if (captionRequestId == null) return null;
            return {
              caption_request_id: captionRequestId,
              llm_prompt_chain_id:
                typeof row?.llm_prompt_chain_id === "number"
                  ? row.llm_prompt_chain_id
                  : null,
            };
          })
          .filter(
            (
              value
            ): value is { caption_request_id: number; llm_prompt_chain_id: number | null } =>
              value != null
          )
      );

      const captions: CaptionSearchResult[] = raw.map((row) => {
        const shareCount =
          Array.isArray(row.caption_saved) && row.caption_saved[0]?.count != null
            ? row.caption_saved[0].count
            : 0;
        const directFlavor = this.resolveCaptionFlavorFromRow(row);
        const requestFlavor =
          typeof row?.caption_request_id === "number"
            ? captionRequestFlavorMap.get(
                this.buildCaptionRequestFlavorKey(
                  row.caption_request_id,
                  typeof row?.llm_prompt_chain_id === "number"
                    ? row.llm_prompt_chain_id
                    : null
                )
              )
            : null;
        const resolvedFlavor =
          directFlavor.humor_flavors?.slug || directFlavor.humor_flavor_id != null
            ? directFlavor
            : requestFlavor ?? directFlavor;

        return {
          id: row.id,
          created_datetime_utc: row.created_datetime_utc,
          modified_datetime_utc: row.modified_datetime_utc,
          content: row.content,
          is_public: row.is_public,
          humor_flavor_id: resolvedFlavor.humor_flavor_id,
          humor_flavors: resolvedFlavor.humor_flavors,
          profile_id: row.profile_id,
          profiles: row.profiles,
          image_id: row.image_id,
          images: row.images,
          like_count: row.like_count ?? 0,
          share_count: shareCount,
        };
      });

      return {
        captions,
        totalCount: count ?? 0,
      };

    } catch (err) {
      console.error("searchCaptionsEnhanced failed:", err);
      return { captions: [], totalCount: 0 };
    }
  }

  static async fetchAllForChartUsingTableCriteria(
    params: {
      searchQuery: string;
      searchType: "all" | "content" | "id" | "imageId" | "profileId";
      startISO?: string;
      endISO?: string;
    },
    days = 90
  ): Promise<Captions[]> {
    const client = supabase;
    if (!client) return [];

    let startUTC: string, endUTC: string;

    const picked = normalizeUtcRange(params.startISO, params.endISO);
    if (picked) {
      startUTC = picked.startUtc;
      endUTC = picked.endUtc;
    } else {
      const now = new Date();
      endUTC = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999
      )).toISOString();
      const startLocal = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0
      ));
      const clampedDays = Math.min(90, Math.max(1, days));
      startLocal.setUTCDate(startLocal.getUTCDate() - clampedDays + 1);
      startUTC = startLocal.toISOString();
    }

    const makeBaseQuery = () => {
      let q = client
        .from("captions")
        .select("id, content, image_id, profile_id, created_datetime_utc, is_public")
        .gte("created_datetime_utc", startUTC)
        .lte("created_datetime_utc", endUTC);

      // Mirror the table’s search
      const { searchQuery, searchType } = params;
      const qtext = (searchQuery ?? "").trim();
      if (qtext) {
        if (searchType === "content") {
          q = q.ilike("content", `%${qtext}%`);
        } else if (searchType === "id") {
          q = this.looksLikeUUID(qtext) ? q.eq("id", qtext) : q.eq("id", "__no_match__");
        } else if (searchType === "imageId") {
          q = this.looksLikeUUID(qtext) ? q.eq("image_id", qtext) : q.eq("image_id", "__no_match__");
        } else if (searchType === "profileId") {
          q = this.looksLikeUUID(qtext) ? q.eq("profile_id", qtext) : q.eq("profile_id", "__no_match__");
        } else {
          if (this.looksLikeUUID(qtext)) {
            q = q.or(
              [`content.ilike.%${qtext}%`, `id.eq.${qtext}`, `image_id.eq.${qtext}`, `profile_id.eq.${qtext}`].join(",")
            );
          } else {
            q = q.ilike("content", `%${qtext}%`);
          }
        }
      }

      return q.order("created_datetime_utc", { ascending: true });
    };

    const PAGE = 1000;
    const all: Captions[] = [];
    let from = 0;

    while (true) {
      const { data, error } = await makeBaseQuery().range(from, from + PAGE - 1);
      if (error) {
        console.error("fetchAllForChartUsingTableCriteria error:", error);
        break;
      }
      const batch = (data || []) as unknown as Captions[];
      all.push(...batch);
      if (batch.length < PAGE) break;
      from += PAGE;
    }

    return all;
  }
  
  static async getAllReportedCaptions(): Promise<ReportedCaptions[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from("reported_captions")
        .select(`
          captions(content, image_id, images(url)),
          id, 
          reason, 
          caption_id, 
          profile_id,
          created_datetime_utc,
          profiles:profiles!reported_captions_profile_id_fkey(first_name, last_name)
        `)        
        .order("created_datetime_utc", { ascending: false });

      if (error) {
        console.error("Error fetching reported captions:", error);
        return [];
      }
      return (data || []) as unknown as ReportedCaptions[];

    } catch (error) {
      console.error("Error fetching all reported captions:", error);
      return [];
    }
  }

  static async keepReportedCaption(reportedCaptionId: number): Promise<boolean> {
    if (!supabase) return false;
    try {
      const { error } = await supabase
        .from("reported_captions")
        .delete()
        .eq("id", reportedCaptionId); 

      if (error) {
        console.error(`Error dismissing reported caption ${reportedCaptionId}:`, error);
        return false;
      }
      return true;
    } catch (error) {
      console.error(`Error dismissing reported caption ${reportedCaptionId}:`, error);
      return false;
    }
  }

  static async deleteCaption(captionId: string): Promise<boolean> {
    if (!supabase) return false;

    if(!isUUID(captionId)) {
      console.error(`Invalid caption ID format: ${captionId}`);
      return false;
    }
    
    try {
      const { error } = await supabase
        .from("captions")
        .delete()
        .eq("id", captionId); 

      if (error) {
        console.error(`Error deleting caption ${captionId}:`, error);
        return false;
      }
      return true;
    } catch (error) {
      console.error(`Error deleting caption ${captionId}:`, error);
      return false;
    }
  }

  // Overwrite a caption's text in place. Used by the study wizard's caption
  // preview so admins can fix a generated caption without re-running the flavor.
  static async updateCaption(
    captionId: string,
    content: string
  ): Promise<boolean> {
    if (!supabase) return false;

    if (!isUUID(captionId)) {
      console.error(`Invalid caption ID format: ${captionId}`);
      return false;
    }

    const trimmed = content.trim();
    if (!trimmed) {
      console.error("Refusing to save an empty caption.");
      return false;
    }

    try {
      const { error } = await supabase
        .from("captions")
        .update({ content: trimmed })
        .eq("id", captionId);

      if (error) {
        console.error(`Error updating caption ${captionId}:`, error);
        return false;
      }
      return true;
    } catch (error) {
      console.error(`Error updating caption ${captionId}:`, error);
      return false;
    }
  }

  // Create a standalone copy of an existing caption (same image, flavor and
  // text). Returns the new caption id so the caller can map it to a study.
  // Kept study-agnostic on purpose; the wizard links it via
  // StudyCaptionMappingsService.createMapping.
  static async duplicateCaption(captionId: string): Promise<string | null> {
    if (!supabase) return null;

    if (!isUUID(captionId)) {
      console.error(`Invalid caption ID format: ${captionId}`);
      return null;
    }

    try {
      const { data: source, error: readError } = await supabase
        .from("captions")
        .select("content, image_id, profile_id, humor_flavor_id")
        .eq("id", captionId)
        .single();

      if (readError || !source) {
        console.error(`Error reading caption ${captionId} to duplicate:`, readError);
        return null;
      }

      const { data: inserted, error: insertError } = await supabase
        .from("captions")
        .insert([
          {
            content: source.content,
            image_id: source.image_id,
            profile_id: source.profile_id,
            humor_flavor_id: source.humor_flavor_id,
            // Public so a duplicated study caption also shows on the Top 100 /
            // Past Week pages, same as the original.
            is_public: true,
          },
        ])
        .select("id")
        .single();

      if (insertError || !inserted) {
        console.error(`Error duplicating caption ${captionId}:`, insertError);
        return null;
      }
      return inserted.id;
    } catch (error) {
      console.error(`Error duplicating caption ${captionId}:`, error);
      return null;
    }
  }
}
