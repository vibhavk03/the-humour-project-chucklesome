import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({
  getAuthTokenAction: vi.fn(),
}));
import {
  buildDedupeGroups,
  formatBucketSummary,
  getDescriptiveBucketName,
  isGenericBucketName,
  normalizeBucketNamesResponse,
  selectDedupeMethodResult,
} from "./dedupe.service";
import type { DedupeCaptionsResponse, DedupeMethodResult } from "@/types/dedupe";
import type { StudyCaptionMappingWithCaptionDetails } from "@/types/study";

const method = (overrides: Partial<DedupeMethodResult>): DedupeMethodResult => ({
  method: "hdbscan",
  buckets: [],
  other: [],
  metadata: {},
  ...overrides,
});

const mapping = (id: number, content: string): StudyCaptionMappingWithCaptionDetails =>
  ({
    id,
    caption_id: `caption-${id}`,
    captions: {
      id: `caption-${id}`,
      content,
      image_id: `image-${id}`,
      images: { url: `https://example.com/${id}.jpg`, image_description: null },
      created_datetime_utc: "2026-07-29T00:00:00.000Z",
      like_count: 0,
      humor_flavor_id: null,
    },
  }) as StudyCaptionMappingWithCaptionDetails;

describe("formatBucketSummary", () => {
  it("formats bucket and outlier counts", () => {
    expect(formatBucketSummary(2, 9)).toBe("2 buckets and 9 outliers");
    expect(formatBucketSummary(1, 1)).toBe("1 bucket and 1 outlier");
  });
});

describe("normalizeBucketNamesResponse", () => {
  it("accepts the nonchalant names-array shape", () => {
    expect(
      normalizeBucketNamesResponse({
        names: [{ id: "a", name: "Library Panic" }],
      })
    ).toEqual({ a: "Library Panic" });
  });

  it("accepts legacy map and bucket-array shapes", () => {
    expect(
      normalizeBucketNamesResponse({
        names: { a: "Wordplay Setup" },
        buckets: [{ id: "b", bucket_name: "Literal Misread" }],
      })
    ).toEqual({ a: "Wordplay Setup", b: "Literal Misread" });
  });

  it("ignores generic clustering labels", () => {
    expect(
      normalizeBucketNamesResponse({
        names: { a: "Hdbscan Group 1" },
        buckets: [{ id: "b", label: "Cosine Cluster 2", category_name: "Prop Confusion" }],
      })
    ).toEqual({ b: "Prop Confusion" });
  });
});

describe("bucket names", () => {
  it("classifies method-generated labels as generic", () => {
    expect(isGenericBucketName("Hdbscan Group 1")).toBe(true);
    expect(isGenericBucketName("Cosine Cluster 2")).toBe(true);
    expect(isGenericBucketName("Bucket 3")).toBe(true);
    expect(isGenericBucketName("Visual Misdirection")).toBe(false);
  });

  it("prefers descriptive staging fields over generic labels", () => {
    expect(
      getDescriptiveBucketName({
        label: "Hdbscan Group 1",
        category_name: "Role Reversal",
      })
    ).toBe("Role Reversal");
  });
});

describe("selectDedupeMethodResult", () => {
  it("prefers hdbscan when it has bucket data", () => {
    const hdbscan = method({
      buckets: [{ id: "h", label: "H", mappingIds: [], captions: [] }],
    });
    const cosine = method({ method: "cosine" });
    const response = { hdbscan, cosine } as DedupeCaptionsResponse;

    expect(selectDedupeMethodResult(response)).toBe(hdbscan);
  });

  it("falls back to cosine when hdbscan is empty", () => {
    const hdbscan = method({});
    const cosine = method({ method: "cosine", other: [] });
    const response = { hdbscan, cosine } as DedupeCaptionsResponse;

    expect(selectDedupeMethodResult(response)).toBe(cosine);
  });

  it("falls back to cosine when hdbscan has only outliers", () => {
    const hdbscan = method({
      other: [
        {
          mappingId: 1,
          captionId: "caption-1",
          caption: "outlier",
          imageId: null,
          imageUrl: null,
          likeCount: null,
        },
      ],
    });
    const cosine = method({
      method: "cosine",
      buckets: [{ id: "c", label: "Cosine Group 1", mappingIds: [], captions: [] }],
    });
    const response = { hdbscan, cosine } as DedupeCaptionsResponse;

    expect(selectDedupeMethodResult(response)).toBe(cosine);
  });
});

describe("buildDedupeGroups", () => {
  it("uses generated names and appends missing mappings as outliers", () => {
    const mappings = [mapping(1, "same joke"), mapping(2, "same premise"), mapping(3, "unique")];
    const groups = buildDedupeGroups(
      method({
        buckets: [
          {
            id: "bucket-a",
            label: "Cluster 1",
            mappingIds: [1, 2],
            captions: [
              { ...mappings[0], mappingId: 1, captionId: "caption-1", caption: "same joke", imageId: "image-1", imageUrl: null, likeCount: null },
              { ...mappings[1], mappingId: 2, captionId: "caption-2", caption: "same premise", imageId: "image-2", imageUrl: null, likeCount: null },
            ],
          },
        ],
      }),
      mappings,
      { "bucket-a": "Shared Premise Joke" }
    );

    expect(groups.map((group) => group.name)).toEqual(["Shared Premise Joke", "Outliers"]);
    expect(groups[1].captions.map((caption) => caption.mappingId)).toEqual([3]);
  });

  it("does not display generic hdbscan labels as names", () => {
    const mappings = [mapping(1, "same joke"), mapping(2, "same premise")];
    const groups = buildDedupeGroups(
      method({
        buckets: [
          {
            id: "bucket-a",
            label: "Hdbscan Group 1",
            mappingIds: [1, 2],
            captions: [
              { ...mappings[0], mappingId: 1, captionId: "caption-1", caption: "same joke", imageId: "image-1", imageUrl: null, likeCount: null },
              { ...mappings[1], mappingId: 2, captionId: "caption-2", caption: "same premise", imageId: "image-2", imageUrl: null, likeCount: null },
            ],
          },
        ],
      }),
      mappings
    );

    expect(groups[0].name).toBe("Bucket 1");
  });
});
