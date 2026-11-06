import type { StudyCaptionMappingWithCaptionDetails } from '@/types/study'

// IDs belong to the caller: caption UUIDs for Quick Study, mapping IDs for
// existing-study review. No study or mapping needs to exist to show a preview.
export type CaptionReviewItem = {
  id: string
  caption: string
  imageId: string | null
  imageUrl: string | null
}

export type CaptionReviewGroup = {
  id: string
  name: string
  isOutliers: boolean
  captions: CaptionReviewItem[]
}

export function mappingToReviewItem(
  mapping: StudyCaptionMappingWithCaptionDetails
): CaptionReviewItem {
  return {
    id: String(mapping.id),
    caption: mapping.captions?.content ?? '',
    imageId: mapping.captions?.image_id ?? null,
    imageUrl: mapping.captions?.images?.url ?? null,
  }
}
