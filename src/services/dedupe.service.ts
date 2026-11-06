import { getAuthTokenAction } from "@/app/actions";
import type {
  DedupeBucket,
  DedupeBucketNamesResponse,
  DedupeCaptionEntry,
  DedupeCaptionsResponse,
  DedupeMethodResult,
} from "@/types/dedupe";
import type { StudyCaptionMappingWithCaptionDetails } from "@/types/study";

const DEDUPE_REQUEST_TIMEOUT_MS = 120000;
const GENERIC_BUCKET_NAME_PATTERN =
  /^(?:(?:hdbscan|cosine)\s+)?(?:group|bucket|cluster)\s+\d+$/i;

export type DedupeReviewGroup = {
  id: string;
  name: string;
  isOutliers: boolean;
  captions: DedupeCaptionEntry[];
};

function getErrorMessage(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") return fallback;
  const record = body as Record<string, unknown>;
  return (
    (typeof record.error === "string" && record.error) ||
    (typeof record.message === "string" && record.message) ||
    (typeof record.statusMessage === "string" && record.statusMessage) ||
    fallback
  );
}

async function getAuthToken() {
  const auth = await getAuthTokenAction();
  const token = auth?.access_token;
  if (!token) throw new Error("Authentication required. Please sign in and try again.");
  return token;
}

export async function requestCaptionDedupe(
  studyId: number,
  signal?: AbortSignal
): Promise<DedupeCaptionsResponse> {
  const token = await getAuthToken();
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.almostcrackd.ai";
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), DEDUPE_REQUEST_TIMEOUT_MS);
  const cancelFromCaller = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", cancelFromCaller, { once: true });

  try {
    const response = await fetch(`${baseUrl}/pipeline/deduplicate-study-captions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ studyId }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(getErrorMessage(body, "Failed to dedupe captions."));
    }
    return body as DedupeCaptionsResponse;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", cancelFromCaller);
  }
}

export async function requestBucketNames(
  buckets: DedupeBucket[]
): Promise<Record<string, string>> {
  if (buckets.length === 0) return {};
  const token = await getAuthToken();
  const response = await fetch("/api/dedupe/bucket-names", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      buckets: buckets.map((bucket) => ({
        id: bucket.id,
        captions: bucket.captions
          .map((caption) => caption.caption.trim())
          .filter(Boolean)
          .map((caption) => ({ caption })),
      })),
    }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(getErrorMessage(body, "Failed to name dedupe buckets."));
  }
  return normalizeBucketNamesResponse(body as DedupeBucketNamesResponse);
}

export function normalizeBucketNamesResponse(response: DedupeBucketNamesResponse) {
  const names: Record<string, string> = {};
  if (Array.isArray(response.names)) {
    for (const bucket of response.names) {
      const name = getDescriptiveBucketName(bucket);
      if (bucket.id && name) {
        names[bucket.id] = name;
      }
    }
  } else if (response.names && typeof response.names === "object") {
    for (const [id, name] of Object.entries(response.names)) {
      if (typeof name === "string" && name.trim() && !isGenericBucketName(name)) {
        names[id] = name;
      }
    }
  }
  for (const bucket of response.buckets ?? []) {
    const name = getDescriptiveBucketName(bucket);
    if (bucket.id && name) {
      names[bucket.id] = name;
    }
  }
  return names;
}

export function selectDedupeMethodResult(result: DedupeCaptionsResponse): DedupeMethodResult {
  if (result.hdbscan.buckets.length > 0) {
    return result.hdbscan;
  }
  return result.cosine;
}

export function hydrateDedupeResult(
  result: DedupeCaptionsResponse,
  mappings: StudyCaptionMappingWithCaptionDetails[]
): DedupeCaptionsResponse {
  const mappingDetailsById = new Map(
    mappings.map((mapping) => [
      mapping.id,
      {
        caption: mapping.captions?.content ?? "",
        imageId: mapping.captions?.image_id ?? null,
        imageUrl: mapping.captions?.images?.url ?? null,
        imageDescription: mapping.captions?.images?.image_description ?? null,
        likeCount: mapping.captions?.like_count ?? null,
        captionId: mapping.caption_id ?? mapping.captions?.id ?? "",
      },
    ])
  );

  const hydrateCaption = (caption: DedupeCaptionEntry): DedupeCaptionEntry => {
    const mapping = mappingDetailsById.get(caption.mappingId);
    return {
      ...caption,
      captionId: caption.captionId || mapping?.captionId || "",
      caption: caption.caption || mapping?.caption || "",
      imageId: caption.imageId ?? mapping?.imageId ?? null,
      imageUrl: caption.imageUrl ?? mapping?.imageUrl ?? null,
      imageDescription: caption.imageDescription ?? mapping?.imageDescription ?? null,
      likeCount: caption.likeCount ?? mapping?.likeCount ?? null,
    };
  };

  const hydrateMethod = (method: DedupeMethodResult): DedupeMethodResult => ({
    ...method,
    buckets: method.buckets.map((bucket) => ({
      ...bucket,
      captions: bucket.captions.map(hydrateCaption),
    })),
    other: method.other.map(hydrateCaption),
  });

  return {
    ...result,
    cosine: hydrateMethod(result.cosine),
    hdbscan: hydrateMethod(result.hdbscan),
  };
}

function wordsOnlyName(name: string, fallback: string) {
  const words = name
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s']/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);
  if (words.length === 0) return fallback;
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function isGenericBucketName(name: string) {
  return GENERIC_BUCKET_NAME_PATTERN.test(name.trim().replace(/[_-]+/g, " "));
}

export function getDescriptiveBucketName(
  bucket: Partial<
    Record<
      | "name"
      | "title"
      | "categoryName"
      | "bucketName"
      | "groupName"
      | "displayName"
      | "bucket_name"
      | "category_name"
      | "group_name"
      | "display_name"
      | "label",
      string | null
    >
  >
) {
  const candidates = [
    bucket.name,
    bucket.title,
    bucket.categoryName,
    bucket.bucketName,
    bucket.groupName,
    bucket.displayName,
    bucket.bucket_name,
    bucket.category_name,
    bucket.group_name,
    bucket.display_name,
    bucket.label,
  ];
  return (
    candidates.find(
      (candidate): candidate is string =>
        typeof candidate === "string" && candidate.trim().length > 0 && !isGenericBucketName(candidate)
    ) ?? null
  );
}

function bucketDisplayName(
  bucket: DedupeBucket,
  index: number,
  generatedNames: Record<string, string>
) {
  const fallback = `Bucket ${index + 1}`;
  const name = generatedNames[bucket.id] ?? getDescriptiveBucketName(bucket) ?? fallback;
  return wordsOnlyName(name, fallback);
}

export function buildDedupeGroups(
  method: DedupeMethodResult,
  mappings: StudyCaptionMappingWithCaptionDetails[],
  generatedNames: Record<string, string> = {}
): DedupeReviewGroup[] {
  const seen = new Set<number>();
  const groups = method.buckets.map((bucket, index) => {
    for (const caption of bucket.captions) seen.add(caption.mappingId);
    return {
      id: bucket.id,
      name: bucketDisplayName(bucket, index, generatedNames),
      isOutliers: false,
      captions: bucket.captions,
    };
  });

  const outliers = [...method.other];
  for (const caption of outliers) seen.add(caption.mappingId);

  for (const mapping of mappings) {
    if (seen.has(mapping.id)) continue;
    outliers.push({
      mappingId: mapping.id,
      captionId: mapping.caption_id ?? mapping.captions?.id ?? "",
      caption: mapping.captions?.content ?? "",
      imageId: mapping.captions?.image_id ?? null,
      imageUrl: mapping.captions?.images?.url ?? null,
      imageDescription: mapping.captions?.images?.image_description ?? null,
      likeCount: mapping.captions?.like_count ?? null,
    });
  }

  if (outliers.length > 0) {
    groups.push({
      id: `${method.method}-outliers`,
      name: "Outliers",
      isOutliers: true,
      captions: outliers,
    });
  }

  return groups;
}

export function formatBucketSummary(bucketCount: number, outlierCount: number) {
  return `${bucketCount} bucket${bucketCount === 1 ? "" : "s"} and ${outlierCount} outlier${
    outlierCount === 1 ? "" : "s"
  }`;
}
