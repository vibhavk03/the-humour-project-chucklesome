import { supabase } from '@/utils/supabase/client'
import type { Database } from '@/types/supabase'

type VoteRow = Database['public']['Tables']['study_caption_vote_events']['Row']
export type StudyRating = Pick<VoteRow,
  'id' | 'caption_id' | 'profile_id' | 'study_caption_mapping_id' | 'vote_value' | 'created_datetime_utc'>
export type ResultCaption = {
  id: number
  caption_id: string
  captions: {
    content: string | null
    humor_flavor_id: number | null
    humor_flavors: { slug: string } | null
  } | null
}
export type CaptionResult = {
  captionId: string
  content: string
  flavor: string
  totalRatings: number
  funnyPercent: number | null
}

export const STUDY_RATING_CHOICES = [
  { value: 'didnt get it', label: 'Didn’t get it' },
  { value: 'not funny at all', label: 'Not funny at all' },
  { value: 'not very funny', label: 'Not very funny' },
  { value: 'meh', label: 'Meh' },
  { value: 'funny', label: 'Funny' },
  { value: 'very funny', label: 'Very funny' },
] as const

export type StudyAnalytics = {
  rows: CaptionResult[]
  overview: {
    uniqueParticipants: number
    totalRatings: number
    totalCaptions: number
    ratedCaptions: number
    coveragePercent: number | null
    ratingsPerCaption: { average: number | null; median: number | null; min: number | null; max: number | null }
    distribution: Array<{ value: string; label: string; count: number; percent: number }>
  }
}

// Events are scoped through their mapping, rather than through the caption:
// a caption can occur in multiple studies. Collapse across duplicate mappings.
function latestStudyRatings(captions: ResultCaption[], ratings: StudyRating[]): StudyRating[] {
  const mappings = new Map(captions.map(caption => [caption.id, caption.caption_id]))
  const latest = new Map<string, Map<string, StudyRating>>()
  for (const rating of ratings) {
    if (rating.study_caption_mapping_id === null ||
      mappings.get(rating.study_caption_mapping_id) !== rating.caption_id) continue
    const participants = latest.get(rating.caption_id) ?? new Map<string, StudyRating>()
    const previous = participants.get(rating.profile_id)
    const time = Date.parse(rating.created_datetime_utc)
    const previousTime = previous ? Date.parse(previous.created_datetime_utc) : -Infinity
    if (!previous || time > previousTime || (time === previousTime && rating.id > previous.id)) {
      participants.set(rating.profile_id, rating)
    }
    latest.set(rating.caption_id, participants)
  }
  return [...latest.values()].flatMap(participants => [...participants.values()])
}

function leaderboardFromLatest(captions: ResultCaption[], ratings: StudyRating[]): CaptionResult[] {
  const byCaption = new Map<string, StudyRating[]>()
  for (const rating of ratings) {
    const votes = byCaption.get(rating.caption_id) ?? []
    votes.push(rating)
    byCaption.set(rating.caption_id, votes)
  }
  const uniqueCaptions = new Map(captions.map(caption => [caption.caption_id, caption]))
  return [...uniqueCaptions.values()].map(caption => {
    const votes = byCaption.get(caption.caption_id) ?? []
    const funny = votes.filter(vote => vote.vote_value === 'funny' || vote.vote_value === 'very funny').length
    const flavorId = caption.captions?.humor_flavor_id
    return {
      captionId: caption.caption_id,
      content: caption.captions?.content ?? 'Caption unavailable',
      flavor: caption.captions?.humor_flavors?.slug || (flavorId != null ? `Flavor ${flavorId}` : 'Unknown'),
      totalRatings: votes.length,
      funnyPercent: votes.length ? funny / votes.length * 100 : null,
    }
  }).sort((a, b) => (b.funnyPercent ?? -1) - (a.funnyPercent ?? -1) ||
    b.totalRatings - a.totalRatings || a.captionId.localeCompare(b.captionId))
}

export function buildStudyLeaderboard(captions: ResultCaption[], ratings: StudyRating[]): CaptionResult[] {
  return leaderboardFromLatest(captions, latestStudyRatings(captions, ratings))
}

export function buildStudyAnalytics(captions: ResultCaption[], ratings: StudyRating[]): StudyAnalytics {
  const latest = latestStudyRatings(captions, ratings)
  const rows = leaderboardFromLatest(captions, latest)
  const counts = rows.map(row => row.totalRatings).sort((a, b) => a - b)
  const totalRatings = latest.length
  const ratedCaptions = counts.filter(count => count > 0).length
  const distribution = STUDY_RATING_CHOICES.map(choice => ({
    ...choice, count: latest.filter(rating => rating.vote_value === choice.value).length,
  }))
  const unrecognized = totalRatings - distribution.reduce((total, choice) => total + choice.count, 0)
  const buckets: Array<{ value: string; label: string; count: number }> = [...distribution]
  // Preserve unexpected stored values in the denominator and make them visible.
  if (unrecognized > 0) buckets.push({ value: 'other', label: 'Other / unrecognized', count: unrecognized })
  const middle = Math.floor(counts.length / 2)
  return {
    rows,
    overview: {
      uniqueParticipants: new Set(latest.map(rating => rating.profile_id)).size,
      totalRatings,
      totalCaptions: rows.length,
      ratedCaptions,
      coveragePercent: rows.length ? ratedCaptions / rows.length * 100 : null,
      ratingsPerCaption: {
        average: counts.length ? totalRatings / counts.length : null,
        median: counts.length ? (counts.length % 2 ? counts[middle] : (counts[middle - 1] + counts[middle]) / 2) : null,
        min: counts[0] ?? null,
        max: counts.at(-1) ?? null,
      },
      distribution: buckets.map(choice => ({ ...choice, percent: totalRatings ? choice.count / totalRatings * 100 : 0 })),
    },
  }
}

const PAGE_SIZE = 500

export const StudyResultsService = {
  async getEventCounts(studyIds: number[], signal: AbortSignal): Promise<Record<number, number>> {
    if (!supabase) throw new Error('Supabase is not configured.')
    const client = supabase
    const ids = [...new Set(studyIds)]
    if (ids.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error('Invalid study ID.')
    const counts: Record<number, number> = {}
    let next = 0
    let failure: Error | undefined
    // Count on the server without downloading the rating history. Bound parallel
    // requests so larger study lists don't overwhelm the database or browser.
    await Promise.all(Array.from({ length: Math.min(4, ids.length) }, async () => {
      while (next < ids.length && !failure) {
        signal.throwIfAborted()
        const id = ids[next++]
        try {
          const { count, error } = await client.from('study_caption_vote_events')
            .select('id, study_caption_mappings!inner(study_id)', { count: 'exact', head: true })
            .eq('study_caption_mappings.study_id', id).abortSignal(signal)
          if (error) throw new Error(`Could not load rating counts: ${error.message}`)
          if (count === null) throw new Error('The database did not return a rating count.')
          counts[id] = count
        } catch (cause) {
          failure = cause instanceof Error ? cause : new Error('Could not load rating counts.')
        }
      }
    }))
    signal.throwIfAborted()
    if (failure) throw failure
    return counts
  },
  async get(studyId: number, signal: AbortSignal): Promise<CaptionResult[]> {
    return (await StudyResultsService.getAnalytics(studyId, signal)).rows
  },
  async getAnalytics(studyId: number, signal: AbortSignal): Promise<StudyAnalytics> {
    if (!Number.isSafeInteger(studyId) || studyId <= 0) throw new Error('Invalid study ID.')
    if (!supabase) throw new Error('Supabase is not configured.')
    const captions: ResultCaption[] = []
    // Fetch all pages; Supabase's row limit must not silently truncate results.
    for (let offset = 0; ; offset += PAGE_SIZE) {
      signal.throwIfAborted()
      const { data, error } = await supabase.from('study_caption_mappings')
        .select('id, caption_id, captions(content, humor_flavor_id, humor_flavors:humor_flavor_id(slug))')
        .eq('study_id', studyId).order('id').range(offset, offset + PAGE_SIZE - 1).abortSignal(signal)
      if (error) throw new Error(`Could not load study captions: ${error.message}`)
      captions.push(...(data ?? []))
      if (!data || data.length < PAGE_SIZE) break
    }
    if (!captions.length) return buildStudyAnalytics([], [])
    const ratings: StudyRating[] = []
    for (let offset = 0; ; offset += PAGE_SIZE) {
      signal.throwIfAborted()
      const { data, error } = await supabase.from('study_caption_vote_events')
        .select('id, caption_id, profile_id, study_caption_mapping_id, vote_value, created_datetime_utc, study_caption_mappings!inner(study_id)')
        .eq('study_caption_mappings.study_id', studyId)
        .order('id').range(offset, offset + PAGE_SIZE - 1).abortSignal(signal)
      if (error) throw new Error(`Could not load study ratings: ${error.message}`)
      ratings.push(...(data ?? []))
      if (!data || data.length < PAGE_SIZE) break
    }
    signal.throwIfAborted()
    return buildStudyAnalytics(captions, ratings)
  },
}
