import { supabase } from "@/utils/supabase/client";
import type {
  Study,
  StudyInsert,
  StudyCaptionMapping,
  StudyCaptionMappingWithDetails,
  StudyCaptionMappingWithCaptionDetails,
  StudyImageSet,
  StudyImageSetWithCount,
  StudyImageSetImageMapping,
  StudyImageSetImageMappingWithDetails,
} from "@/types/study";
import type { CaptionVote } from "@/types/caption-vote";
import {
  applyInsertAuditFields,
  applyUpdateAuditFields,
  getCurrentProfileId,
} from "@/utils/supabase/audit";

type CreateStudyPayload = Pick<
  StudyInsert,
  "description" | "start_datetime_utc" | "end_datetime_utc" | "is_private"
> & { slug: string };

export type CreateStudyResult =
  | { data: Study; error: null }
  | { data: null; error: string; code?: string };

// Production still uses is_hidden; expose one visibility field to the UI
// while the two database schemas are being brought into sync.
function normalizeStudy(row: Omit<Study, "is_private"> & {
  is_private?: boolean;
  is_hidden?: boolean;
}): Study {
  return { ...row, is_private: row.is_private ?? row.is_hidden ?? true };
}

function isMissingPrivateColumn(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "PGRST204" && Boolean(error.message?.includes("'is_private'"));
}

function studyCreationError(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const parts = ["message", "details", "hint"].flatMap((key) => {
      const value = (error as Record<string, unknown>)[key];
      return typeof value === "string" && value.trim() ? [value.trim()] : [];
    });
    if (parts.length > 0) return [...new Set(parts)].join(" ");
  }
  if (typeof error === "string" && error.trim()) return error;
  return "An unexpected error occurred while creating the study. Please try again.";
}

export class StudiesService {
  // Release recovery must distinguish a missing row from a failed read, and
  // must never adopt another user's study after an ambiguous create response.
  static async findStudyForRelease(target: { id: number } | { slug: string }, profileId: string): Promise<Study | null> {
    if (!supabase) throw new Error("Supabase client is not configured.");
    let query = supabase.from("studies").select("*").eq("created_by_user_id", profileId);
    query = "id" in target ? query.eq("id", target.id) : query.eq("slug", target.slug);
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(`Could not verify the release draft: ${error.message}`);
    return data ? normalizeStudy(data) : null;
  }

  static isStudyActiveAt(study: Study, at: Date = new Date()): boolean {
    if (study.is_private) return false;

    const currentTime = at.getTime();
    const startTime = study.start_datetime_utc
      ? Date.parse(study.start_datetime_utc)
      : Number.NEGATIVE_INFINITY;
    const endTime = study.end_datetime_utc
      ? Date.parse(study.end_datetime_utc)
      : Number.POSITIVE_INFINITY;

    if (Number.isNaN(startTime) || Number.isNaN(endTime)) return false;
    return startTime <= currentTime && currentTime <= endTime;
  }

  static getCurrentlyShownStudy(studies: Study[], at: Date = new Date()): Study | null {
    return (
      studies
        .filter((study) => StudiesService.isStudyActiveAt(study, at))
        .sort((a, b) => b.id - a.id)[0] ?? null
    );
  }

  static async getAllStudies(): Promise<Study[]> {
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from("studies")
        .select("*")
        .order("created_datetime_utc", { ascending: false });

      if (error) {
        console.error("Error fetching studies:", error);
        return [];
      }

      return (data || []).map(normalizeStudy);
    } catch (error) {
      console.error("Error fetching studies:", error);
      return [];
    }
  }

  static async createStudy(payload: CreateStudyPayload): Promise<Study | null> {
    const result = await StudiesService.createStudyWithResult(payload);
    return result.data;
  }

  static async createStudyWithResult(payload: CreateStudyPayload): Promise<CreateStudyResult> {
    if (!supabase) {
      return { data: null, error: "Supabase client is not configured." };
    }

    try {
      const profileId = await getCurrentProfileId(supabase);
      const row = applyInsertAuditFields({
        slug: payload.slug,
        description: payload.description ?? null,
        start_datetime_utc: payload.start_datetime_utc ?? null,
        end_datetime_utc: payload.end_datetime_utc ?? null,
        is_private: payload.is_private ?? true,
      }, profileId);
      let { data, error } = await supabase
        .from("studies")
        .insert([row])
        .select()
        .single();

      // PGRST204 rejects the request before writing a row. Only this specific
      // schema mismatch is safe to retry with the legacy visibility column.
      if (isMissingPrivateColumn(error)) {
        const { is_private, ...fields } = row;
        const legacyRow = { ...fields, is_hidden: is_private };
        ({ data, error } = await supabase
          .from("studies")
          .insert([legacyRow])
          .select()
          .single());
      }

      if (error) {
        console.error("Error creating study:", error);
        return { data: null, error: studyCreationError(error), ...(error.code ? { code: error.code } : {}) };
      }

      if (!data) {
        return { data: null, error: "The database did not return the created study." };
      }
      return { data: normalizeStudy(data), error: null };
    } catch (error) {
      console.error("Error creating study:", error);
      return { data: null, error: studyCreationError(error) };
    }
  }

  // Called only by an explicit Make public action. Read the saved mappings so
  // captions removed during review remain private, then release the study last.
  static async publishStudy(
    id: number,
    updates: { slug?: string; description?: string | null; start_datetime_utc?: string | null; end_datetime_utc?: string | null }
  ): Promise<Study | null> {
    if (!supabase) return null;
    try {
      const profileId = await getCurrentProfileId(supabase);
      if (!profileId) return null;
      const captionIds = new Set<string>();
      const imageIds = new Set<string>();
      const pageSize = 500;
      for (let offset = 0; ; offset += pageSize) {
        const { data: mappings, error } = await supabase
          .from("study_caption_mappings")
          .select("caption_id, captions(image_id)")
          .eq("study_id", id)
          .order("id")
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        for (const mapping of mappings ?? []) {
          captionIds.add(mapping.caption_id);
          const captions = Array.isArray(mapping.captions) ? mapping.captions : [mapping.captions];
          for (const caption of captions) {
            if (caption?.image_id) imageIds.add(caption.image_id);
          }
        }
        if (!mappings || mappings.length < pageSize) break;
      }
      if (!captionIds.size) throw new Error("Select at least one caption before making the study public.");

      for (const [table, ids] of [["images", [...imageIds]], ["captions", [...captionIds]]] as const) {
        for (let offset = 0; offset < ids.length; offset += 200) {
          const batch = ids.slice(offset, offset + 200);
          const { data, error: visibilityError } = await supabase
            .from(table)
            .update(applyUpdateAuditFields({ is_public: true }, profileId))
            .in("id", batch)
            .select("id");
          if (visibilityError) throw visibilityError;
          if (data?.length !== batch.length) throw new Error(`Could not make all study ${table} public.`);
        }
      }
      return await StudiesService.updateStudy(id, { ...updates, is_private: false });
    } catch (error) {
      console.error("Error making study public:", error);
      return null;
    }
  }

  static async updateStudy(
    id: number,
    updates: {
      slug?: string;
      description?: string | null;
      start_datetime_utc?: string | null;
      end_datetime_utc?: string | null;
      is_private?: boolean;
    }
  ): Promise<Study | null> {
    if (!supabase) return null;

    try {
      const profileId = await getCurrentProfileId(supabase);
      const row = applyUpdateAuditFields(updates, profileId);
      let { data, error } = await supabase
        .from("studies")
        .update(row)
        .eq("id", id)
        .select()
        .single();

      if (row.is_private !== undefined && isMissingPrivateColumn(error)) {
        const { is_private, ...fields } = row;
        const legacyRow = { ...fields, is_hidden: is_private };
        ({ data, error } = await supabase
          .from("studies")
          .update(legacyRow)
          .eq("id", id)
          .select()
          .single());
      }

      if (error) {
        console.error("Error updating study:", error);
        return null;
      }

      return data ? normalizeStudy(data) : null;
    } catch (error) {
      console.error("Error updating study:", error);
      return null;
    }
  }

  static async deleteStudy(id: number): Promise<boolean> {
    if (!supabase) return false;

    try {
      const { error } = await supabase
        .from("studies")
        .delete()
        .eq("id", id);

      if (error) {
        console.error("Error deleting study:", error);
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error deleting study:", error);
      return false;
    }
  }

  static async getStudyById(id: number): Promise<Study | null> {
    if (!supabase) return null;

    try {
      const { data, error } = await supabase
        .from("studies")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        console.error("Error fetching study:", error);
        return null;
      }

      return data ? normalizeStudy(data) : null;
    } catch (error) {
      console.error("Error fetching study:", error);
      return null;
    }
  }
}

export class StudyCaptionMappingsService {
  // Paginated, error-aware read used when reconciling/retrying a release.
  static async getReleaseMappings(studyId: number): Promise<Pick<StudyCaptionMapping, "id" | "caption_id">[]> {
    if (!supabase) throw new Error("Supabase client is not configured.");
    const result: Pick<StudyCaptionMapping, "id" | "caption_id">[] = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase.from("study_caption_mappings")
        .select("id, caption_id").eq("study_id", studyId).order("id").range(offset, offset + pageSize - 1);
      if (error) throw new Error(`Could not verify attached captions: ${error.message}`);
      if (!data) throw new Error("Could not verify attached captions.");
      result.push(...data);
      if (data.length < pageSize) return result;
    }
  }

  private static normalizeMapping(
    item: any
  ): StudyCaptionMappingWithDetails {
    return {
      ...(item as StudyCaptionMapping),
      studies: Array.isArray(item.studies)
        ? item.studies[0] ?? null
        : item.studies ?? null,
      captions: Array.isArray(item.captions)
        ? item.captions[0] ?? null
        : item.captions ?? null,
    };
  }

  static async getAllMappings(): Promise<StudyCaptionMappingWithDetails[]> {
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from("study_caption_mappings")
        .select("*, studies(id, slug), captions(id, content)")
        .order("created_datetime_utc", { ascending: false });

      if (error) {
        console.error("Error fetching study caption mappings:", error);
        return [];
      }

      return (data || []).map((item: any) =>
        StudyCaptionMappingsService.normalizeMapping(item)
      );
    } catch (error) {
      console.error("Error fetching study caption mappings:", error);
      return [];
    }
  }

  static async getMappingsByStudyId(
    studyId: number
  ): Promise<StudyCaptionMappingWithCaptionDetails[]> {
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from("study_caption_mappings")
        .select(
          `
          *,
          captions (
            id,
            content,
            image_id,
            images(url, image_description),
            created_datetime_utc,
            like_count,
            humor_flavor_id,
            humor_flavors:humor_flavor_id ( id, slug ),
            caption_requests (
              llm_model_responses (
                id,
                created_datetime_utc,
                humor_flavor_id,
                humor_flavors:humor_flavor_id ( id, slug )
              )
            )
          )
        `
        )
        .eq("study_id", studyId)
        .order("created_datetime_utc", { ascending: false });

      if (error) {
        console.error("Error fetching study caption mappings:", error);
        return [];
      }

      return (data || []).map((item: any) =>
        StudyCaptionMappingsService.normalizeMapping(item)
      ) as StudyCaptionMappingWithCaptionDetails[];
    } catch (error) {
      console.error("Error fetching study caption mappings:", error);
      return [];
    }
  }

  static async getCaptionVotesByStudyId(
    studyId: number
  ): Promise<CaptionVote[]> {
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("study_caption_mappings")
      .select(
        `
        caption_id,
        captions!inner (
          id,
          caption_votes ( id, caption_id, vote_value, profile_id )
        )
      `
      )
      .eq("study_id", studyId);

    if (error) {
      console.error("Error fetching caption votes:", error);
      return [];
    }

    const votes: CaptionVote[] = [];

    for (const mapping of data ?? []) {
      const captionRaw = (mapping as any)?.captions;
      const captions = Array.isArray(captionRaw)
        ? captionRaw
        : captionRaw
          ? [captionRaw]
          : [];

      for (const caption of captions) {
        const rawVotes = caption?.caption_votes;
        const voteList = Array.isArray(rawVotes)
          ? rawVotes
          : rawVotes
            ? [rawVotes]
            : [];

        for (const vote of voteList) {
          if (!vote) continue;
          const captionId = vote.caption_id ?? mapping.caption_id;
          if (!captionId) continue;
          if (vote.vote_value === null || vote.vote_value === undefined) continue;
          if (vote.id === null || vote.id === undefined) continue;
          votes.push({
            id: vote.id,
            caption_id: captionId,
            vote_value: vote.vote_value,
            profile_id: vote.profile_id,
          });
        }
      }
    }

    return votes;
  }

  static async createMapping(payload: {
    study_id: number;
    caption_id: string;
  }, actingProfileId?: string): Promise<StudyCaptionMappingWithDetails | null> {
    if (!supabase) return null;

    try {
      const profileId = actingProfileId ?? await getCurrentProfileId(supabase);
      const { data, error } = await supabase
        .from("study_caption_mappings")
        .insert(
          applyInsertAuditFields(
            [
              {
                study_id: payload.study_id,
                caption_id: payload.caption_id,
              },
            ],
            profileId
          )
        )
        .select("*, studies(id, slug), captions(id, content)")
        .single();

      if (error) {
        console.error("Error creating study caption mapping:", error);
        return null;
      }

      if (!data) return null;
      return StudyCaptionMappingsService.normalizeMapping(data);
    } catch (error) {
      console.error("Error creating study caption mapping:", error);
      return null;
    }
  }

  static async updateMapping(
    id: number,
    updates: {
      study_id?: number;
      caption_id?: string;
    }
  ): Promise<StudyCaptionMappingWithDetails | null> {
    if (!supabase) return null;

    try {
      const profileId = await getCurrentProfileId(supabase);
      const { data, error } = await supabase
        .from("study_caption_mappings")
        .update(applyUpdateAuditFields(updates, profileId))
        .eq("id", id)
        .select("*, studies(id, slug), captions(id, content)")
        .single();

      if (error) {
        console.error("Error updating study caption mapping:", error);
        return null;
      }

      if (!data) return null;
      return StudyCaptionMappingsService.normalizeMapping(data);
    } catch (error) {
      console.error("Error updating study caption mapping:", error);
      return null;
    }
  }

  static async deleteMapping(id: number): Promise<boolean> {
    if (!supabase) return false;

    try {
      const { error } = await supabase
        .from("study_caption_mappings")
        .delete()
        .eq("id", id);

      if (error) {
        console.error("Error deleting study caption mapping:", error);
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error deleting study caption mapping:", error);
      return false;
    }
  }
}

export class StudyImageSetsService {
  // Prefer embedded counts; older or restricted PostgREST configurations use
  // paged membership IDs without downloading image details or querying each set.
  static async getAllImageSetsWithCounts(): Promise<StudyImageSetWithCount[]> {
    if (!supabase) throw new Error("Supabase client is not configured.");
    const { data, error } = await supabase
      .from("study_image_sets")
      .select("*, study_image_set_image_mappings(count)")
      .order("created_datetime_utc", { ascending: false });
    if (error) {
      const countUnavailable = error.code === "PGRST123" ||
        (error.code === "42703" && /\bcount\b/i.test(error.message));
      if (!countUnavailable) throw new Error(`Could not load image sets: ${error.message}`);
      const { data: imageSets, error: setsError } = await supabase
        .from("study_image_sets")
        .select("*")
        .order("created_datetime_utc", { ascending: false });
      if (setsError) throw new Error(`Could not load image sets: ${setsError.message}`);
      const sets = imageSets ?? [];
      const counts = await StudyImageSetsService.getMembershipCounts(sets.map((set) => set.id));
      return sets.map((set) => ({ ...set, imageCount: counts.get(set.id) ?? 0 }));
    }
    return (data ?? []).map(({ study_image_set_image_mappings, ...imageSet }) => ({
      ...imageSet,
      imageCount: study_image_set_image_mappings[0]?.count ?? 0,
    }));
  }

  private static async getMembershipCounts(setIds: number[]): Promise<Map<number, number>> {
    const client = supabase;
    if (!client) throw new Error("Supabase client is not configured.");
    const counts = new Map<number, number>();
    const batches: number[][] = [];
    for (let start = 0; start < setIds.length; start += 100) batches.push(setIds.slice(start, start + 100));
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, batches.length) }, async () => {
      while (next < batches.length) {
        const ids = batches[next++];
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await client
            .from("study_image_set_image_mappings")
            .select("study_image_set_id")
            .in("study_image_set_id", ids)
            .order("id")
            .range(offset, offset + 999);
          if (error) throw new Error(`Could not count image sets: ${error.message}`);
          for (const row of data ?? []) counts.set(row.study_image_set_id, (counts.get(row.study_image_set_id) ?? 0) + 1);
          if ((data?.length ?? 0) < 1000) break;
        }
      }
    }));
    return counts;
  }

  static async getAllImageSets(): Promise<StudyImageSet[]> {
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from("study_image_sets")
        .select("*")
        .order("created_datetime_utc", { ascending: false });

      if (error) {
        console.error("Error fetching study image sets:", error);
        return [];
      }

      return (data || []) as StudyImageSet[];
    } catch (error) {
      console.error("Error fetching study image sets:", error);
      return [];
    }
  }

  static async getImageSetById(id: number): Promise<StudyImageSet | null> {
    if (!supabase) return null;

    try {
      const { data, error } = await supabase
        .from("study_image_sets")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        console.error("Error fetching study image set:", error);
        return null;
      }

      return data as StudyImageSet;
    } catch (error) {
      console.error("Error fetching study image set:", error);
      return null;
    }
  }

  static async createImageSet(payload: {
    slug: string;
    description?: string | null;
  }): Promise<StudyImageSet | null> {
    if (!supabase) return null;

    try {
      const profileId = await getCurrentProfileId(supabase);
      const { data, error } = await supabase
        .from("study_image_sets")
        .insert(
          applyInsertAuditFields(
            [
              {
                slug: payload.slug,
                description: payload.description ?? null,
              },
            ],
            profileId
          )
        )
        .select()
        .single();

      if (error) {
        console.error("Error creating study image set:", error);
        return null;
      }

      return data as StudyImageSet;
    } catch (error) {
      console.error("Error creating study image set:", error);
      return null;
    }
  }

  static async updateImageSet(
    id: number,
    updates: {
      slug?: string;
      description?: string | null;
    }
  ): Promise<StudyImageSet | null> {
    if (!supabase) return null;

    try {
      const profileId = await getCurrentProfileId(supabase);
      const { data, error } = await supabase
        .from("study_image_sets")
        .update(applyUpdateAuditFields(updates, profileId))
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("Error updating study image set:", error);
        return null;
      }

      return data as StudyImageSet;
    } catch (error) {
      console.error("Error updating study image set:", error);
      return null;
    }
  }

  static async deleteImageSet(id: number): Promise<boolean> {
    if (!supabase) return false;

    try {
      const { error } = await supabase
        .from("study_image_sets")
        .delete()
        .eq("id", id);

      if (error) {
        console.error("Error deleting study image set:", error);
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error deleting study image set:", error);
      return false;
    }
  }
}

export class StudyImageSetImageMappingsService {
  private static normalizeMapping(
    item: any
  ): StudyImageSetImageMappingWithDetails {
    return {
      ...(item as StudyImageSetImageMapping),
      images: Array.isArray(item.images)
        ? item.images[0] ?? null
        : item.images ?? null,
    };
  }

  static async getMappingsByImageSetId(
    studyImageSetId: number
  ): Promise<StudyImageSetImageMappingWithDetails[]> {
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from("study_image_set_image_mappings")
        .select(
          "*, images(id, url, image_description, additional_context, celebrity_recognition)"
        )
        .eq("study_image_set_id", studyImageSetId)
        .order("created_datetime_utc", { ascending: false });

      if (error) {
        console.error("Error fetching study image set mappings:", error);
        return [];
      }

      return (data || []).map((item: any) =>
        StudyImageSetImageMappingsService.normalizeMapping(item)
      );
    } catch (error) {
      console.error("Error fetching study image set mappings:", error);
      return [];
    }
  }

  static async createMapping(payload: {
    study_image_set_id: number;
    image_id: string;
  }): Promise<StudyImageSetImageMappingWithDetails | null> {
    if (!supabase) return null;

    try {
      const profileId = await getCurrentProfileId(supabase);
      const { data, error } = await supabase
        .from("study_image_set_image_mappings")
        .insert(
          applyInsertAuditFields(
            [
              {
                study_image_set_id: payload.study_image_set_id,
                image_id: payload.image_id,
              },
            ],
            profileId
          )
        )
        .select(
          "*, images(id, url, image_description, additional_context, celebrity_recognition)"
        )
        .single();

      if (error) {
        console.error("Error creating study image set mapping:", error);
        return null;
      }

      if (!data) return null;
      return StudyImageSetImageMappingsService.normalizeMapping(data);
    } catch (error) {
      console.error("Error creating study image set mapping:", error);
      return null;
    }
  }

  static async updateMapping(
    id: number,
    updates: {
      study_image_set_id?: number;
      image_id?: string;
    }
  ): Promise<StudyImageSetImageMappingWithDetails | null> {
    if (!supabase) return null;

    try {
      const profileId = await getCurrentProfileId(supabase);
      const { data, error } = await supabase
        .from("study_image_set_image_mappings")
        .update(applyUpdateAuditFields(updates, profileId))
        .eq("id", id)
        .select(
          "*, images(id, url, image_description, additional_context, celebrity_recognition)"
        )
        .single();

      if (error) {
        console.error("Error updating study image set mapping:", error);
        return null;
      }

      if (!data) return null;
      return StudyImageSetImageMappingsService.normalizeMapping(data);
    } catch (error) {
      console.error("Error updating study image set mapping:", error);
      return null;
    }
  }

  static async deleteMapping(id: number): Promise<boolean> {
    if (!supabase) return false;

    try {
      const { error } = await supabase
        .from("study_image_set_image_mappings")
        .delete()
        .eq("id", id);

      if (error) {
        console.error("Error deleting study image set mapping:", error);
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error deleting study image set mapping:", error);
      return false;
    }
  }
}
