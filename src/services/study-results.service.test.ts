import { beforeEach, describe, expect, it, vi } from 'vitest'

const { from, query } = vi.hoisted(() => {
  const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(), abortSignal: vi.fn() }
  return { from: vi.fn(), query }
})
vi.mock('@/utils/supabase/client', () => ({ supabase: { from } }))
import { buildStudyAnalytics, buildStudyLeaderboard, StudyResultsService, type ResultCaption, type StudyRating } from './study-results.service'

const caption = (id: number, captionId = `caption-${id}`): ResultCaption => ({
  id, caption_id: captionId,
  captions: { content: `Caption ${id}`, humor_flavor_id: 1, humor_flavors: { slug: 'observational' } },
})
const vote = (id: number, mapping: number | null, value: StudyRating['vote_value'], options: Partial<StudyRating> = {}): StudyRating => ({
  id, caption_id: `caption-${mapping}`, study_caption_mapping_id: mapping, profile_id: 'participant-1',
  vote_value: value, created_datetime_utc: `2026-11-05T12:00:${String(id).padStart(2, '0')}Z`, ...options,
})

describe('study leaderboard', () => {
  it('uses the latest participant rating per caption, including across duplicate mappings', () => {
    const rows = buildStudyLeaderboard([caption(1), caption(2, 'caption-1')], [
      vote(3, 1, 'not funny at all'),
      vote(1, 1, 'funny'),
      vote(4, 2, 'very funny', { caption_id: 'caption-1' }),
      vote(2, 1, 'meh', { profile_id: 'participant-2' }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ totalRatings: 2, funnyPercent: 50 })
  })

  it('breaks timestamp ties by event ID and does not use insertion order', () => {
    const timestamp = '2026-11-05T12:00:00Z'
    const rows = buildStudyLeaderboard([caption(1)], [
      vote(3, 1, 'meh', { created_datetime_utc: timestamp }),
      vote(2, 1, 'funny', { created_datetime_utc: timestamp }),
    ])
    expect(rows[0]).toMatchObject({ totalRatings: 1, funnyPercent: 0 })
  })

  it('excludes unlinked events, other-study mappings and mismatched caption IDs', () => {
    const rows = buildStudyLeaderboard([caption(1)], [
      vote(1, null, 'funny', { caption_id: 'caption-1' }),
      vote(2, 99, 'funny', { caption_id: 'caption-1' }),
      vote(3, 1, 'funny', { caption_id: 'different-caption' }),
    ])
    expect(rows[0]).toMatchObject({ totalRatings: 0, funnyPercent: null })
  })

  it('includes all six ratings in the denominator and only the two funny choices in the numerator', () => {
    const values: StudyRating['vote_value'][] = ['didnt get it', 'not funny at all', 'not very funny', 'meh', 'funny', 'very funny']
    const rows = buildStudyLeaderboard([caption(1)], values.map((value, index) =>
      vote(index + 1, 1, value, { profile_id: `participant-${index}` })))
    expect(rows[0].totalRatings).toBe(6)
    expect(rows[0].funnyPercent).toBeCloseTo(100 / 3)
  })

  it('sorts by percentage then count, keeps zero above unrated, and retains missing metadata', () => {
    const rows = buildStudyLeaderboard([caption(4), caption(3), caption(2), caption(1), { ...caption(5), captions: null }], [
      vote(1, 1, 'funny'), vote(2, 2, 'very funny'),
      vote(3, 2, 'funny', { profile_id: 'participant-2' }), vote(4, 3, 'meh'),
    ])
    expect(rows.map(row => row.captionId)).toEqual(['caption-2', 'caption-1', 'caption-3', 'caption-4', 'caption-5'])
    expect(rows[4]).toMatchObject({ content: 'Caption unavailable', flavor: 'Unknown', funnyPercent: null })
  })
})

describe('study overview', () => {
  it('uses the same latest ratings for participants, coverage, distribution and the leaderboard', () => {
    const analytics = buildStudyAnalytics([caption(1), caption(2), caption(3), caption(4, 'caption-1')], [
      vote(1, 1, 'meh'),
      vote(2, 4, 'funny', { caption_id: 'caption-1' }),
      vote(3, 2, 'very funny'),
      vote(4, 1, 'not funny at all', { profile_id: 'participant-2' }),
      vote(5, 99, 'funny', { profile_id: 'excluded-participant' }),
    ])
    expect(analytics.overview).toMatchObject({
      uniqueParticipants: 2, totalRatings: 3, totalCaptions: 3, ratedCaptions: 2,
      ratingsPerCaption: { average: 1, median: 1, min: 0, max: 2 },
    })
    expect(analytics.overview.coveragePercent).toBeCloseTo(200 / 3)
    expect(analytics.overview.distribution.map(bucket => [bucket.value, bucket.count])).toEqual([
      ['didnt get it', 0], ['not funny at all', 1], ['not very funny', 0], ['meh', 0], ['funny', 1], ['very funny', 1],
    ])
    expect(analytics.overview.distribution.reduce((total, bucket) => total + bucket.percent, 0)).toBeCloseTo(100)
    expect(analytics.rows.reduce((total, row) => total + row.totalRatings, 0)).toBe(analytics.overview.totalRatings)
  })

  it('shows complete metrics for a sparse study and includes unrated captions in the median', () => {
    const { overview } = buildStudyAnalytics([caption(1), caption(2)], [vote(1, 1, 'meh')])
    expect(overview).toMatchObject({
      uniqueParticipants: 1, totalRatings: 1, ratedCaptions: 1, coveragePercent: 50,
      ratingsPerCaption: { average: 0.5, median: 0.5, min: 0, max: 1 },
    })
  })

  it('preserves all six choices and zeroes for a study without feedback', () => {
    const { overview } = buildStudyAnalytics([caption(1)], [])
    expect(overview).toMatchObject({
      uniqueParticipants: 0, totalRatings: 0, ratedCaptions: 0, coveragePercent: 0,
      ratingsPerCaption: { average: 0, median: 0, min: 0, max: 0 },
    })
    expect(overview.distribution).toHaveLength(6)
    expect(overview.distribution.every(bucket => bucket.count === 0 && bucket.percent === 0)).toBe(true)
  })

  it('uses unavailable values rather than dividing by zero when there are no captions', () => {
    const { rows, overview } = buildStudyAnalytics([], [vote(1, 1, 'funny')])
    expect(rows).toEqual([])
    expect(overview).toMatchObject({
      uniqueParticipants: 0, totalRatings: 0, totalCaptions: 0, coveragePercent: null,
      ratingsPerCaption: { average: null, median: null, min: null, max: null },
    })
  })

  it('shows a uniform recorded distribution as-is, without declaring the leaderboard trustworthy', () => {
    const { overview } = buildStudyAnalytics([caption(1)], [
      vote(1, 1, 'funny'), vote(2, 1, 'funny', { profile_id: 'participant-2' }),
    ])
    expect(overview.distribution.find(bucket => bucket.value === 'funny')).toMatchObject({ count: 2, percent: 100 })
    expect(overview.uniqueParticipants).toBe(2)
  })

  it('makes unexpected stored rating values visible rather than dropping them from the distribution', () => {
    const { overview } = buildStudyAnalytics([caption(1)], [vote(1, 1, 'unexpected' as StudyRating['vote_value'])])
    expect(overview.distribution.at(-1)).toMatchObject({ value: 'other', count: 1, percent: 100 })
    expect(overview.totalRatings).toBe(1)
  })
})

beforeEach(() => {
  vi.resetAllMocks()
  from.mockReturnValue(query)
  for (const method of ['select', 'eq', 'order', 'range'] as const) query[method].mockReturnValue(query)
})

describe('StudyResultsService', () => {
  it('counts study-linked events on the server and preserves zero counts', async () => {
    query.abortSignal.mockResolvedValueOnce({ count: 55738, error: null })
      .mockResolvedValueOnce({ count: 0, error: null })
    const signal = new AbortController().signal
    await expect(StudyResultsService.getEventCounts([3, 113, 3], signal)).resolves.toEqual({ 3: 55738, 113: 0 })
    expect(query.select).toHaveBeenCalledWith('id, study_caption_mappings!inner(study_id)', { count: 'exact', head: true })
    expect(query.eq.mock.calls).toEqual([['study_caption_mappings.study_id', 3], ['study_caption_mappings.study_id', 113]])
    expect(query.abortSignal).toHaveBeenCalledWith(signal)
    expect(query.range).not.toHaveBeenCalled()
  })

  it('bounds parallel count requests for larger study lists', async () => {
    let active = 0
    let maximum = 0
    query.abortSignal.mockImplementation(async () => {
      active++
      maximum = Math.max(maximum, active)
      await Promise.resolve()
      active--
      return { count: 1, error: null }
    })
    const counts = await StudyResultsService.getEventCounts([1, 2, 3, 4, 5, 6, 7], new AbortController().signal)
    expect(maximum).toBe(4)
    expect(Object.keys(counts)).toHaveLength(7)
  })

  it('does not turn a failed or missing count into zero', async () => {
    query.abortSignal.mockResolvedValueOnce({ count: null, error: { message: 'permission denied' } })
    await expect(StudyResultsService.getEventCounts([3], new AbortController().signal)).rejects.toThrow('permission denied')
    query.abortSignal.mockResolvedValueOnce({ count: null, error: null })
    await expect(StudyResultsService.getEventCounts([3], new AbortController().signal)).rejects.toThrow('did not return a rating count')
  })

  it('skips empty lists and rejects invalid IDs or cancelled count requests', async () => {
    const signal = new AbortController().signal
    await expect(StudyResultsService.getEventCounts([], signal)).resolves.toEqual({})
    await expect(StudyResultsService.getEventCounts([0], signal)).rejects.toThrow('Invalid study ID')
    const controller = new AbortController()
    controller.abort()
    await expect(StudyResultsService.getEventCounts([3], controller.signal)).rejects.toThrow()
    expect(from).not.toHaveBeenCalled()
  })

  it('paginates captions and study-linked events beyond the database row limit', async () => {
    const captions = Array.from({ length: 500 }, (_, i) => caption(i + 1))
    const ratings = Array.from({ length: 500 }, (_, i) => vote(1, 1, 'meh', { id: i + 1 }))
    query.abortSignal
      .mockResolvedValueOnce({ data: captions, error: null })
      .mockResolvedValueOnce({ data: [caption(501)], error: null })
      .mockResolvedValueOnce({ data: ratings, error: null })
      .mockResolvedValueOnce({ data: [vote(2, 1, 'funny', { id: 501 })], error: null })
    const signal = new AbortController().signal
    const rows = await StudyResultsService.get(7, signal)
    expect(rows).toHaveLength(501)
    expect(rows.find(row => row.captionId === 'caption-1')).toMatchObject({ totalRatings: 1, funnyPercent: 100 })
    expect(query.eq).toHaveBeenCalledWith('study_id', 7)
    expect(query.eq).toHaveBeenCalledWith('study_caption_mappings.study_id', 7)
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining('study_caption_mappings!inner(study_id)'))
    expect(query.range.mock.calls).toEqual([[0, 499], [500, 999], [0, 499], [500, 999]])
    expect(query.abortSignal).toHaveBeenCalledWith(signal)
  })

  it('propagates failed reads instead of presenting them as no ratings', async () => {
    query.abortSignal.mockResolvedValueOnce({ data: [caption(1)], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } })
    await expect(StudyResultsService.get(7, new AbortController().signal)).rejects.toThrow('Could not load study ratings: permission denied')
  })

  it('skips rating queries for an empty study', async () => {
    query.abortSignal.mockResolvedValueOnce({ data: [], error: null })
    await expect(StudyResultsService.get(7, new AbortController().signal)).resolves.toEqual([])
    expect(from).toHaveBeenCalledTimes(1)
  })

  it('rejects invalid IDs and cancelled requests before reading data', async () => {
    await expect(StudyResultsService.get(0, new AbortController().signal)).rejects.toThrow('Invalid study ID')
    const controller = new AbortController()
    controller.abort()
    await expect(StudyResultsService.get(7, controller.signal)).rejects.toThrow()
    expect(from).not.toHaveBeenCalled()
  })
})
