import type { Captions } from "@/types/captions";
import { supabase } from "@/utils/supabase/client";

// Use the logged-in user's client and fetch only the captions published by this job.
export async function loadCaptionJobResults(captionIds: string[], signal: AbortSignal): Promise<Captions[]> {
  signal.throwIfAborted();
  if (!supabase) throw new Error("Supabase is not configured.");
  const ids = [...new Set(captionIds)];
  const captions = new Map<string, Captions>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await supabase.from("captions")
      .select("id, content, image_id, profile_id, humor_flavor_id, caption_request_id, created_datetime_utc")
      .in("id", ids.slice(offset, offset + 100))
      .abortSignal(AbortSignal.any([signal, AbortSignal.timeout(30_000)]));
    signal.throwIfAborted();
    if (error) throw new Error("Unable to load saved captions. Resume generation to try again.");
    for (const caption of data ?? []) captions.set(caption.id, caption);
  }
  if (ids.some((id) => !captions.has(id))) {
    throw new Error("Some saved captions could not be loaded. Resume generation to try again.");
  }
  return ids.map((id) => captions.get(id)!);
}
