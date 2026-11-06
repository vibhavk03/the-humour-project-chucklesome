import {
  StudiesService,
  StudyCaptionMappingsService,
} from '@/services/studies.service'
import type { Study } from '@/types/study'
import { supabase } from '@/utils/supabase/client'
import { getCurrentProfileId } from '@/utils/supabase/audit'

export type QuickStudyReleaseState = {
  study: Study | null
  reservedSlug: string | null
  profileId: string | null
  creationAttempted: boolean
  publicationUncertain: boolean
}

export function createQuickStudyReleaseState(): QuickStudyReleaseState {
  return {
    study: null,
    reservedSlug: null,
    profileId: null,
    creationAttempted: false,
    publicationUncertain: false,
  }
}

// The caller retains this checkpoint for the lifetime of the builder.
// Next saves privately; Release Study publishes. Retries resume the same study.
export async function releaseQuickStudy(
  state: QuickStudyReleaseState,
  input: { slug: string; captionIds: string[]; start: string; end: string; visibility: 'public' | 'private' }
): Promise<Study> {
  const selected = new Set(input.captionIds)
  if (
    !['public', 'private'].includes(input.visibility) ||
    !input.slug.trim() ||
    !selected.size ||
    !Number.isFinite(Date.parse(input.start)) ||
    !Number.isFinite(Date.parse(input.end)) ||
    Date.parse(input.start) >= Date.parse(input.end)
  ) {
    throw new Error(
      'Choose a study name, at least one caption, and an end time after the start time.'
    )
  }
  if (!supabase) throw new Error('Supabase client is not configured.')
  const profileId = await getCurrentProfileId(supabase)
  if (!profileId || (state.profileId && state.profileId !== profileId)) {
    throw new Error(
      'Sign in as the user who started this release before retrying.'
    )
  }
  state.profileId = profileId

  if (state.study || (state.creationAttempted && state.reservedSlug)) {
    const recovered = await StudiesService.findStudyForRelease(
      state.study ? { id: state.study.id } : { slug: state.reservedSlug! },
      profileId
    )
    if (state.study && !recovered)
      throw new Error(
        'The release draft could not be found. No new study was created.'
      )
    state.study = recovered
    state.publicationUncertain = false
    if (recovered && !recovered.is_private) return recovered
  }
  if (!state.study) {
    const retryingUncertainCreation = state.creationAttempted
    if (!retryingUncertainCreation) {
      const existing = await StudiesService.findStudyForRelease(
        { slug: input.slug },
        profileId
      )
      if (existing)
        throw new Error(
          'A study with this name already exists. Choose another name before releasing.'
        )
    }
    // Keep the reservation stable even if the user edits the final name: a
    // delayed original insert must collide, not produce a second study.
    state.reservedSlug ??= input.slug
    state.creationAttempted = true
    const result = await StudiesService.createStudyWithResult({
      slug: state.reservedSlug,
      description: 'Created with Quick Study (captions with images).',
      start_datetime_utc: input.start,
      end_datetime_utc: input.end,
      is_private: true,
    })
    if (result.error !== null) {
      if (result.code === '23505' && !retryingUncertainCreation) {
        // This first insert was definitively rejected, not a lost response.
        state.creationAttempted = false
        state.reservedSlug = null
      }
      throw new Error(result.error)
    }
    state.study = result.data
  }

  const study = state.study
  const mappings = await StudyCaptionMappingsService.getReleaseMappings(
    study.id
  )
  const attached = new Set<string>()
  for (const mapping of mappings) {
    if (!selected.has(mapping.caption_id) || attached.has(mapping.caption_id)) {
      // Only reconcile links on this private draft, never delete caption rows.
      if (!(await StudyCaptionMappingsService.deleteMapping(mapping.id))) {
        throw new Error(
          'Could not update the draft selection. Retry to resume this release.'
        )
      }
    } else attached.add(mapping.caption_id)
  }
  for (const captionId of selected) {
    if (attached.has(captionId)) continue
    const mapping = await StudyCaptionMappingsService.createMapping(
      { study_id: study.id, caption_id: captionId },
      profileId
    )
    if (!mapping)
      throw new Error(
        'Could not attach a caption. Retry to resume this release.'
      )
    attached.add(captionId)
  }
  const verified = await StudyCaptionMappingsService.getReleaseMappings(
    study.id
  )
  const verifiedIds = new Set(verified.map((mapping) => mapping.caption_id))
  if (
    verified.length !== selected.size ||
    verifiedIds.size !== selected.size ||
    [...selected].some((id) => !verifiedIds.has(id))
  ) {
    throw new Error(
      'The attached captions do not match your selection. The study has not been released; please retry.'
    )
  }

  if (input.visibility === 'private') {
    const saved = await StudiesService.updateStudy(study.id, {
      slug: input.slug,
      start_datetime_utc: input.start,
      end_datetime_utc: input.end,
      is_private: true,
    })
    if (!saved) throw new Error('Could not finish the private release. Retry to resume the same study.')
    state.study = saved
    return saved
  }

  state.publicationUncertain = true
  const published = await StudiesService.publishStudy(study.id, {
    slug: input.slug,
    start_datetime_utc: input.start,
    end_datetime_utc: input.end,
  })
  if (published) {
    state.study = published
    state.publicationUncertain = false
    return published
  }
  // A response can be lost after the final update commits. Verify before
  // allowing edits to a draft that may actually already have been released.
  const recovered = await StudiesService.findStudyForRelease(
    { id: study.id },
    profileId
  )
  if (!recovered)
    throw new Error(
      'Could not confirm the release status. Retry to verify it before editing.'
    )
  state.study = recovered
  state.publicationUncertain = false
  if (!recovered.is_private) return recovered
  throw new Error(
    'The study is still private. Retry to finish making it public.'
  )
}
