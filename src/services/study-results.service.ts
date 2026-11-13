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
    metadata?: Database['public']['Tables']['captions']['Row']['metadata']
    image_id?: string
    images?: { url: string | null; image_description: string | null } | null
  } | null
}
export type CaptionResult = {
  captionId: string
  content: string
  imageId: string | null
  imageUrl: string | null
  imageDescription: string | null
  flavor: string
  totalRatings: number
  funnyPercent: number | null
  attribution: FlavorAttribution
}

export type FlavorSource = 'direct' | 'imported' | 'unknown'
export type FlavorAttribution = {
  key: string
  source: FlavorSource
  label: string
  flavorId: number | null
  importedId: string | null
}
type RatingDistribution = Array<{ value: string; label: string; count: number; percent: number }>
export type FlavorSummary = {
  attribution: FlavorAttribution
  captions: number
  ratedCaptions: number
  coveragePercent: number
  uniqueParticipants: number
  totalRatings: number
  distribution: RatingDistribution
}

// Imported IDs belong to the source dataset. Never join them to this project's
// flavor IDs or merge their labels with directly recorded flavor groups.
export function resolveStudyFlavor(caption: ResultCaption['captions']): FlavorAttribution {
  if (caption?.humor_flavor_id != null) {
    return { key: `direct:${caption.humor_flavor_id}`, source: 'direct',
      label: caption.humor_flavors?.slug || `Flavor ${caption.humor_flavor_id}`,
      flavorId: caption.humor_flavor_id, importedId: null }
  }
  const metadata = caption?.metadata
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const name = typeof metadata.flavor_name === 'string' ? metadata.flavor_name.trim() : ''
    const rawId = metadata.flavor_id
    const importedId = (typeof rawId === 'number' && Number.isSafeInteger(rawId) && rawId > 0) ||
      (typeof rawId === 'string' && /^[1-9]\d*$/.test(rawId.trim())) ? String(rawId).trim() : null
    if (name || importedId) {
      return { key: `imported:${JSON.stringify([name || null, importedId])}`, source: 'imported',
        label: name || `Imported flavor ${importedId}`, flavorId: null, importedId }
    }
  }
  return { key: 'unknown', source: 'unknown', label: 'Unknown', flavorId: null, importedId: null }
}

export const STUDY_RATING_CHOICES = [
  { value: 'funny', label: 'Funny' },
  { value: 'not funny', label: 'Not funny' },
] as const

// The voting experience is binary. Normalize the older enum labels on read so
// historical records use the same two categories without rewriting saved data.
function studyRatingCategory(value: string): 'funny' | 'not funny' | null {
  switch (value.trim().toLowerCase()) {
    case 'funny':
    case 'very funny':
      return 'funny'
    case 'not funny':
    case 'not funny at all':
    case 'not very funny':
    case 'meh':
    case 'didnt get it':
    case "didn't get it":
      return 'not funny'
    default:
      return null
  }
}

export type StudyAnalytics = {
  rows: CaptionResult[]
  opportunities: {
    availableCaptions: number
    observedParticipants: number
    participationAvailable: boolean
    potentialRatings: number | null
    ratingsGiven: number
    funnyRatings: number
    notFunnyRatings: number
    otherRatings: number
    potentialUnrated: number | null
    ratingCoveragePercent: number | null
    funnyOfPotentialPercent: number | null
    funnyOfRatedPercent: number | null
  }
  flavors: {
    coverage: Array<{ source: FlavorSource; captions: number; percent: number | null }>
    groups: FlavorSummary[]
  }
  overview: {
    uniqueParticipants: number
    totalRatings: number
    totalCaptions: number
    ratedCaptions: number
    coveragePercent: number | null
    ratingsPerCaption: { average: number | null; median: number | null; min: number | null; max: number | null }
    distribution: RatingDistribution
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
    const funny = votes.filter(vote => studyRatingCategory(vote.vote_value) === 'funny').length
    const attribution = resolveStudyFlavor(caption.captions)
    return {
      captionId: caption.caption_id,
      content: caption.captions?.content ?? 'Caption unavailable',
      imageId: caption.captions?.image_id ?? null,
      imageUrl: caption.captions?.images?.url ?? null,
      imageDescription: caption.captions?.images?.image_description ?? null,
      flavor: attribution.label,
      attribution,
      totalRatings: votes.length,
      funnyPercent: votes.length ? funny / votes.length * 100 : null,
    }
  }).sort((a, b) => (b.funnyPercent ?? -1) - (a.funnyPercent ?? -1) ||
    b.totalRatings - a.totalRatings || a.captionId.localeCompare(b.captionId))
}

export function buildStudyLeaderboard(captions: ResultCaption[], ratings: StudyRating[]): CaptionResult[] {
  return leaderboardFromLatest(captions, latestStudyRatings(captions, ratings))
}

function ratingDistribution(ratings: StudyRating[]): RatingDistribution {
  const totalRatings = ratings.length
  const distribution = STUDY_RATING_CHOICES.map(choice => ({
    ...choice, count: ratings.filter(rating => studyRatingCategory(rating.vote_value) === choice.value).length,
  }))
  const unrecognized = totalRatings - distribution.reduce((total, choice) => total + choice.count, 0)
  const buckets: Array<{ value: string; label: string; count: number }> = [...distribution]
  // Preserve unexpected stored values in the denominator and make them visible.
  if (unrecognized > 0) buckets.push({ value: 'other', label: 'Other / unrecognized', count: unrecognized })
  return buckets.map(choice => ({ ...choice, percent: totalRatings ? choice.count / totalRatings * 100 : 0 }))
}

// Participation IDs add recorded starters who have not submitted any ratings.
// null means participation could not be loaded; do not invent a denominator.
export function buildStudyAnalytics(captions: ResultCaption[], ratings: StudyRating[], participationIds: string[] | null = []): StudyAnalytics {
  const latest = latestStudyRatings(captions, ratings)
  const rows = leaderboardFromLatest(captions, latest)
  const counts = rows.map(row => row.totalRatings).sort((a, b) => a - b)
  const totalRatings = latest.length
  const participants = new Set([...latest.map(rating => rating.profile_id), ...(participationIds ?? [])])
  const potentialRatings = rows.length === 0 ? 0 : participationIds === null ? null : rows.length * participants.size
  const funnyRatings = latest.filter(rating => studyRatingCategory(rating.vote_value) === 'funny').length
  const notFunnyRatings = latest.filter(rating => studyRatingCategory(rating.vote_value) === 'not funny').length
  const ratedCaptions = counts.filter(count => count > 0).length
  const groups = new Map<string, { attribution: FlavorAttribution; rows: CaptionResult[]; ratings: StudyRating[] }>()
  const groupByCaption = new Map<string, string>()
  for (const row of rows) {
    const group = groups.get(row.attribution.key) ?? { attribution: row.attribution, rows: [], ratings: [] }
    group.rows.push(row)
    groups.set(row.attribution.key, group)
    groupByCaption.set(row.captionId, row.attribution.key)
  }
  for (const rating of latest) groups.get(groupByCaption.get(rating.caption_id)!)!.ratings.push(rating)
  const flavorGroups: FlavorSummary[] = [...groups.values()].map(group => {
    const rated = group.rows.filter(row => row.totalRatings > 0).length
    return { attribution: group.attribution, captions: group.rows.length, ratedCaptions: rated,
      coveragePercent: rated / group.rows.length * 100,
      uniqueParticipants: new Set(group.ratings.map(rating => rating.profile_id)).size,
      totalRatings: group.ratings.length, distribution: ratingDistribution(group.ratings) }
  }).sort((a, b) => b.captions - a.captions || a.attribution.key.localeCompare(b.attribution.key))
  const coverage = (['direct', 'imported', 'unknown'] as const).map(source => {
    const count = rows.filter(row => row.attribution.source === source).length
    return { source, captions: count, percent: rows.length ? count / rows.length * 100 : null }
  })
  const middle = Math.floor(counts.length / 2)
  return {
    rows,
    opportunities: {
      availableCaptions: rows.length,
      observedParticipants: participants.size,
      participationAvailable: participationIds !== null,
      potentialRatings,
      ratingsGiven: totalRatings,
      funnyRatings,
      notFunnyRatings,
      otherRatings: totalRatings - funnyRatings - notFunnyRatings,
      potentialUnrated: potentialRatings === null ? null : potentialRatings - totalRatings,
      ratingCoveragePercent: potentialRatings ? totalRatings / potentialRatings * 100 : null,
      funnyOfPotentialPercent: potentialRatings ? funnyRatings / potentialRatings * 100 : null,
      funnyOfRatedPercent: totalRatings ? funnyRatings / totalRatings * 100 : null,
    },
    flavors: { coverage, groups: flavorGroups },
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
      distribution: ratingDistribution(latest),
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
        .select('id, caption_id, captions(content, image_id, images(url, image_description), humor_flavor_id, metadata, humor_flavors:humor_flavor_id(slug))')
        .eq('study_id', studyId).order('id').range(offset, offset + PAGE_SIZE - 1).abortSignal(signal)
      if (error) throw new Error(`Could not load study captions: ${error.message}`)
      captions.push(...(data ?? []))
      if (!data || data.length < PAGE_SIZE) break
    }
    if (!captions.length) return buildStudyAnalytics([], [], null)
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
    let participationIds: string[] | null = []
    try {
      for (let offset = 0; ; offset += PAGE_SIZE) {
        signal.throwIfAborted()
        const { data, error } = await supabase.from('study_participations')
          .select('profile_id').eq('study_id', studyId).order('profile_id')
          .range(offset, offset + PAGE_SIZE - 1).abortSignal(signal)
        if (error) throw error
        participationIds.push(...(data ?? []).map(row => row.profile_id))
        if (!data || data.length < PAGE_SIZE) break
      }
    } catch {
      // Existing results stay useful when optional participation data is missing.
      // An unsuccessful read must not masquerade as an empty participant cohort.
      participationIds = null
    }
    signal.throwIfAborted()
    return buildStudyAnalytics(captions, ratings, participationIds)
  },
}
