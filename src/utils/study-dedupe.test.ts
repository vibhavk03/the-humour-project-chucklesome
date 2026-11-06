import { describe, expect, it } from 'vitest'
import type { StudyCaptionMappingWithCaptionDetails } from '@/types/study'
import { getCaptionImageSelectionCounts, getCaptionReviewScopeKey, getDedupeScopeKey, getImageSelectionCounts } from './study-dedupe'
import type { CaptionReviewItem } from '@/types/caption-review'
import type { DedupeReviewGroup } from '@/services/dedupe.service'
import type { DedupeCaptionEntry } from '@/types/dedupe'

const mapping = (
  id: number,
  content: string
): StudyCaptionMappingWithCaptionDetails =>
  ({
    id,
    captions: { content },
  }) as StudyCaptionMappingWithCaptionDetails

describe('getDedupeScopeKey', () => {
  it('is stable when mappings are reordered', () => {
    const first = mapping(1, 'First')
    const second = mapping(2, 'Second')

    expect(getDedupeScopeKey([first, second])).toBe(
      getDedupeScopeKey([second, first])
    )
  })

  it('changes when caption content changes', () => {
    expect(getDedupeScopeKey([mapping(1, 'Before')])).not.toBe(
      getDedupeScopeKey([mapping(1, 'After')])
    )
  })
})

describe('caption UUID review without a study', () => {
  const first: CaptionReviewItem = { id: 'caption-a', caption: 'First joke', imageId: 'image-a', imageUrl: 'shared.jpg' }
  const second: CaptionReviewItem = { ...first, id: 'caption-b', caption: 'Second joke', imageId: 'image-b' }

  it('invalidates saved edits and deletions but not reordering or image changes', () => {
    const original = getCaptionReviewScopeKey([first, second])
    expect(getCaptionReviewScopeKey([second, first])).toBe(original)
    expect(getCaptionReviewScopeKey([{ ...first, imageUrl: 'new-url' }, second])).toBe(original)
    expect(getCaptionReviewScopeKey([{ ...first, caption: 'Edited' }, second])).not.toBe(original)
    expect(getCaptionReviewScopeKey([first])).not.toBe(original)
  })

  it('counts selected images by caption UUID and excludes outliers from cluster counts', () => {
    const groups = [
      { id: 'group', name: 'Named group', isOutliers: false, captions: [first] },
      { id: 'Other', name: 'Other', isOutliers: true, captions: [second] },
    ]
    expect(getCaptionImageSelectionCounts(groups, new Set([first.id, second.id])).get('shared.jpg')).toEqual({ total: 2, selected: 2, selectedGroups: new Set(['group']) })
    expect(getCaptionImageSelectionCounts(groups, new Set([second.id])).get('shared.jpg')).toEqual({ total: 2, selected: 1, selectedGroups: new Set() })
    expect(getCaptionImageSelectionCounts(groups, new Set()).get('shared.jpg')?.selected).toBe(0)
  })
})

describe('image selections across clusters', () => {
  const entry = (
    id: number,
    imageUrl: string | null = 'https://example.com/shared.jpg'
  ) =>
    ({
      mappingId: id,
      imageId: `image-${id}`,
      imageUrl,
    }) as DedupeCaptionEntry
  const group = (
    id: string,
    captions: DedupeCaptionEntry[],
    isOutliers = false
  ): DedupeReviewGroup => ({
    id,
    name: id,
    captions,
    isOutliers,
  })

  it('counts the same URL under different image ids and updates when captions are removed', () => {
    const groups = [group('a', [entry(1), entry(2)]), group('b', [entry(3)])]
    const key = 'https://example.com/shared.jpg'
    expect(getImageSelectionCounts(groups, new Set([1, 3])).get(key)).toEqual({
      total: 3,
      selected: 2,
      selectedGroups: new Set(['a', 'b']),
    })
    expect(getImageSelectionCounts(groups, new Set([1])).get(key)).toEqual({
      total: 3,
      selected: 1,
      selectedGroups: new Set(['a']),
    })
  })

  it('counts a mapping once even if it appears in multiple clusters, and does not count outliers as a cluster', () => {
    const groups = [
      group('a', [entry(1)]),
      group('b', [entry(1)]),
      group('outliers', [entry(2)], true),
    ]
    expect(
      getImageSelectionCounts(groups, new Set([1, 2])).get(
        'https://example.com/shared.jpg'
      )
    ).toEqual({
      total: 2,
      selected: 2,
      selectedGroups: new Set(['a', 'b']),
    })
  })

  it('falls back to image id and leaves unknown images uncounted', () => {
    const missing = { ...entry(2, null), imageId: null }
    const usage = getImageSelectionCounts(
      [group('a', [entry(1, null), missing])],
      new Set([1, 2])
    )
    expect(usage.size).toBe(1)
    expect(usage.get('image-1')?.selected).toBe(1)
  })
})
