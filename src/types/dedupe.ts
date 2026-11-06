export type DedupeCaptionInput = {
  mappingId: number;
  captionId: string;
  caption: string;
  imageId: string | null;
  imageUrl: string | null;
  imageDescription?: string | null;
  captionDescription?: string | null;
  likeCount: number | null;
};

export type DedupeCaptionEntry = DedupeCaptionInput & {
  membershipProbability?: number | null;
  outlierScore?: number | null;
};

export type DedupeBucket = {
  id: string;
  label: string;
  name?: string | null;
  title?: string | null;
  categoryName?: string | null;
  bucketName?: string | null;
  groupName?: string | null;
  displayName?: string | null;
  bucket_name?: string | null;
  category_name?: string | null;
  group_name?: string | null;
  display_name?: string | null;
  mappingIds: number[];
  captions: DedupeCaptionEntry[];
};

export type DedupeMethodResult = {
  method: "cosine" | "hdbscan";
  buckets: DedupeBucket[];
  other: DedupeCaptionEntry[];
  metadata: Record<string, number | string | null>;
};

export type DedupeCaptionsRequest = {
  studyId: number;
};

export type DedupeCaptionsResponse = {
  studyId: number;
  embeddingModel: string;
  embeddingDimensions: number;
  generatedAt: string;
  cosine: DedupeMethodResult;
  hdbscan: DedupeMethodResult;
};

export type DedupeBucketNameInput = {
  id: string;
  captions: Array<{ caption: string }>;
};

export type DedupeBucketNamesRequest = {
  buckets: DedupeBucketNameInput[];
};

export type DedupeBucketNamesResponse = {
  names?:
    | Record<string, string>
    | Array<{
        id: string;
        name?: string | null;
        label?: string | null;
        title?: string | null;
        categoryName?: string | null;
        bucketName?: string | null;
        groupName?: string | null;
        displayName?: string | null;
        bucket_name?: string | null;
        category_name?: string | null;
        group_name?: string | null;
        display_name?: string | null;
      }>;
  buckets?: Array<{
    id: string;
    name?: string | null;
    label?: string | null;
    title?: string | null;
    categoryName?: string | null;
    bucketName?: string | null;
    groupName?: string | null;
    displayName?: string | null;
    bucket_name?: string | null;
    category_name?: string | null;
    group_name?: string | null;
    display_name?: string | null;
  }>;
};
