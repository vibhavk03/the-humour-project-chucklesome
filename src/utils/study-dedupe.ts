import type { StudyCaptionMappingWithCaptionDetails } from '@/types/study'
import type { DedupeReviewGroup } from '@/services/dedupe.service'
import type { DedupeCaptionEntry } from '@/types/dedupe'
import type { CaptionReviewGroup, CaptionReviewItem } from '@/types/caption-review'

export type DedupeLoadStatus = 'waiting' | 'loading' | 'ready' | 'error'

export function getDedupeImageKey(caption: Pick<DedupeCaptionEntry, 'imageUrl' | 'imageId'>): string | null {
  // A URL can be registered under more than one image id during an import.
  return caption.imageUrl || caption.imageId || null
}

export function getImageSelectionCounts(
  groups: DedupeReviewGroup[],
  selectedIds: Set<number>
) {
  return getCaptionImageSelectionCounts(
    groups.map(group => ({ ...group, captions: group.captions.map(caption => ({ ...caption, id: String(caption.mappingId) })) })),
    new Set([...selectedIds].map(String))
  )
}

export function getCaptionReviewScopeKey(items: CaptionReviewItem[]): string {
  return items.map(item => JSON.stringify([item.id, item.caption])).sort().join('|')
}

export function getCaptionImageSelectionCounts(
  groups: CaptionReviewGroup[],
  selectedIds: Set<string>
) {
  const usage = new Map<
    string,
    { total: number; selected: number; selectedGroups: Set<string> }
  >()
  const seen = new Set<string>()
  for (const group of groups) {
    for (const caption of group.captions) {
      const key = getDedupeImageKey(caption)
      if (!key) continue
      const count = usage.get(key) ?? {
        total: 0,
        selected: 0,
        selectedGroups: new Set<string>(),
      }
      const selected = selectedIds.has(caption.id)
      if (!seen.has(caption.id)) {
        count.total += 1
        if (selected) count.selected += 1
        seen.add(caption.id)
      }
      if (selected && !group.isOutliers) count.selectedGroups.add(group.id)
      usage.set(key, count)
    }
  }
  return usage
}

export function getDedupeScopeKey(
  mappings: StudyCaptionMappingWithCaptionDetails[]
): string {
  return mappings
    .map((mapping) =>
      JSON.stringify([mapping.id, mapping.captions?.content ?? ''])
    )
    .sort()
    .join('|')
}
