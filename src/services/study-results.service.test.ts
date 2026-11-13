import { beforeEach, describe, expect, it, vi } from 'vitest'

const { from, query } = vi.hoisted(() => {
  const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(), abortSignal: vi.fn() }
  return { from: vi.fn(), query }
})
vi.mock('@/utils/supabase/client', () => ({ supabase: { from } }))
import { buildStudyAnalytics, buildStudyLeaderboard, resolveStudyFlavor, StudyResultsService, type ResultCaption, type StudyRating } from './study-results.service'

const caption = (id: number, captionId = `caption-${id}`): ResultCaption => ({
  id, caption_id: captionId,
  captions: { content: `Caption ${id}`, humor_flavor_id: 1, humor_flavors: { slug: 'observational' } },
})
const vote = (id: number, mapping: number | null, value: StudyRating['vote_value'], options: Partial<StudyRating> = {}): StudyRating => ({
  id, caption_id: `caption-${mapping}`, study_caption_mapping_id: mapping, profile_id: 'participant-1',
  vote_value: value, created_datetime_utc: `2026-11-05T12:00:${String(id).padStart(2, '0')}Z`, ...options,
})
const withAttribution = (id: number, fields: Partial<NonNullable<ResultCaption['captions']>>): ResultCaption => ({
  ...caption(id), captions: { ...caption(id).captions!, ...fields },
})

describe('study flavor attribution', () => {
  it('prefers the recorded ID over imported metadata and preserves IDs with no joined label', () => {
    const direct = withAttribution(1, { metadata: { flavor_id: 1517, flavor_name: 'different' } })
    expect(resolveStudyFlavor(direct.captions)).toMatchObject({ source: 'direct', flavorId: 1, label: 'observational', importedId: null })
    expect(resolveStudyFlavor(withAttribution(1, { humor_flavors: null }).captions)).toMatchObject({ label: 'Flavor 1', source: 'direct' })
  })

  it('preserves imported labels and foreign IDs without treating them as canonical flavor IDs', () => {
    const imported = withAttribution(1, { humor_flavor_id: null, humor_flavors: null,
      metadata: { flavor_id: ' 1517 ', flavor_name: ' imported recipe ' } })
    expect(resolveStudyFlavor(imported.captions)).toMatchObject({ source: 'imported', flavorId: null, importedId: '1517', label: 'imported recipe' })
    expect(resolveStudyFlavor(withAttribution(1, { humor_flavor_id: null, humor_flavors: null, metadata: { flavor_id: 1517 } }).captions))
      .toMatchObject({ source: 'imported', importedId: '1517', label: 'Imported flavor 1517' })
  })

  it('accepts name-only imports and keeps malformed or missing metadata unknown', () => {
    expect(resolveStudyFlavor(withAttribution(1, { humor_flavor_id: null, humor_flavors: null, metadata: { flavor_name: 'name only' } }).captions))
      .toMatchObject({ source: 'imported', label: 'name only', importedId: null })
    for (const metadata of [null, [], 'text', { flavor_name: '  ', flavor_id: 0 }, { flavor_name: {}, flavor_id: true }]) {
      expect(resolveStudyFlavor(withAttribution(1, { humor_flavor_id: null, humor_flavors: null, metadata }).captions).source).toBe('unknown')
    }
    expect(resolveStudyFlavor(null).source).toBe('unknown')
  })

  it('does not merge recorded and imported groups with matching names, or imports with different source IDs', () => {
    const captions = [caption(1),
      withAttribution(2, { humor_flavor_id: null, humor_flavors: null, metadata: { flavor_id: 1, flavor_name: 'observational' } }),
      withAttribution(3, { humor_flavor_id: null, humor_flavors: null, metadata: { flavor_id: 1517, flavor_name: 'observational' } }),
      withAttribution(4, { humor_flavor_id: 2 }),
    ]
    const { flavors } = buildStudyAnalytics(captions, [])
    expect(flavors.groups).toHaveLength(4)
    expect(new Set(flavors.groups.map(group => group.attribution.key)).size).toBe(4)
  })
})

describe('study flavor summaries', () => {
  it('reconciles group metrics with study totals using the latest in-study ratings and distinct captions', () => {
    const imported = withAttribution(2, { humor_flavor_id: null, humor_flavors: null, metadata: { flavor_name: 'observational', flavor_id: 1517 } })
    const unknown = withAttribution(3, { humor_flavor_id: null, humor_flavors: null })
    const { flavors, overview } = buildStudyAnalytics([caption(1), imported, unknown, caption(4, 'caption-1')], [
      vote(1, 1, 'meh'), vote(2, 4, 'very funny', { caption_id: 'caption-1' }),
      vote(3, 2, 'funny'), vote(4, 2, 'didnt get it', { profile_id: 'participant-2' }),
      vote(5, 99, 'funny', { profile_id: 'excluded' }),
    ])
    const direct = flavors.groups.find(group => group.attribution.source === 'direct')!
    const importedGroup = flavors.groups.find(group => group.attribution.source === 'imported')!
    const unknownGroup = flavors.groups.find(group => group.attribution.source === 'unknown')!
    expect(direct).toMatchObject({ captions: 1, ratedCaptions: 1, uniqueParticipants: 1, totalRatings: 1, coveragePercent: 100 })
    expect(direct.distribution.find(bucket => bucket.value === 'funny')).toMatchObject({ count: 1, percent: 100 })
    expect(importedGroup).toMatchObject({ captions: 1, ratedCaptions: 1, uniqueParticipants: 2, totalRatings: 2 })
    expect(importedGroup.distribution.find(bucket => bucket.value === 'funny')).toMatchObject({ count: 1, percent: 50 })
    expect(unknownGroup).toMatchObject({ captions: 1, ratedCaptions: 0, uniqueParticipants: 0, totalRatings: 0, coveragePercent: 0 })
    expect(flavors.groups.reduce((total, group) => total + group.totalRatings, 0)).toBe(overview.totalRatings)
    expect(flavors.groups.reduce((total, group) => total + group.captions, 0)).toBe(overview.totalCaptions)
    expect(flavors.groups.reduce((total, group) => total + group.uniqueParticipants, 0)).toBe(3)
    expect(overview.uniqueParticipants).toBe(2)
    expect(flavors.coverage.map(item => item.captions)).toEqual([1, 1, 1])
    expect(flavors.coverage.reduce((sum, item) => sum + (item.percent ?? 0), 0)).toBeCloseTo(100)
  })

  it('supports a single flavor with sparse ratings and keeps unrated captions in its coverage denominator', () => {
    const { flavors } = buildStudyAnalytics([caption(1), caption(2)], [vote(1, 1, 'meh')])
    expect(flavors.groups).toHaveLength(1)
    expect(flavors.groups[0]).toMatchObject({ captions: 2, ratedCaptions: 1, totalRatings: 1, uniqueParticipants: 1, coveragePercent: 50 })
  })

  it('supports imported-only, unknown-only and empty studies without any ratings', () => {
    const imported = withAttribution(1, { humor_flavor_id: null, humor_flavors: null, metadata: { flavor_name: 'source recipe' } })
    const onlyImported = buildStudyAnalytics([imported], []).flavors
    expect(onlyImported.coverage.find(item => item.source === 'imported')).toMatchObject({ captions: 1, percent: 100 })
    expect(onlyImported.groups[0].distribution).toHaveLength(2)
    expect(onlyImported.groups[0].distribution.every(bucket => bucket.count === 0)).toBe(true)
    const onlyUnknown = buildStudyAnalytics([withAttribution(1, { humor_flavor_id: null, humor_flavors: null })], []).flavors
    expect(onlyUnknown.groups[0]).toMatchObject({ attribution: { source: 'unknown' }, totalRatings: 0 })
    const empty = buildStudyAnalytics([], []).flavors
    expect(empty.groups).toEqual([])
    expect(empty.coverage.every(item => item.captions === 0 && item.percent === null)).toBe(true)
  })

  it('keeps unexpected stored rating values in their flavor distribution', () => {
    const { flavors } = buildStudyAnalytics([caption(1)], [vote(1, 1, 'unexpected' as StudyRating['vote_value'])])
    expect(flavors.groups[0].distribution.at(-1)).toMatchObject({ value: 'other', count: 1, percent: 100 })
  })
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

  it('normalizes historical rating labels into the binary distribution consistently with Funny %', () => {
    const values: StudyRating['vote_value'][] = ['didnt get it', 'not funny at all', 'not very funny', 'meh', 'funny', 'very funny']
    const rows = buildStudyLeaderboard([caption(1)], values.map((value, index) =>
      vote(index + 1, 1, value, { profile_id: `participant-${index}` })))
    expect(rows[0].totalRatings).toBe(6)
    expect(rows[0].funnyPercent).toBeCloseTo(100 / 3)
    const { overview, flavors } = buildStudyAnalytics([caption(1)], values.map((value, index) =>
      vote(index + 1, 1, value, { profile_id: `participant-${index}` })))
    expect(overview.distribution.map(bucket => [bucket.value, bucket.count])).toEqual([['funny', 2], ['not funny', 4]])
    expect(overview.distribution[0].percent).toBeCloseTo(rows[0].funnyPercent!)
    expect(flavors.groups[0].distribution).toEqual(overview.distribution)
  })

  it('accepts the binary Not funny value and preserves latest-vote counting', () => {
    const { rows, overview } = buildStudyAnalytics([caption(1)], [
      vote(1, 1, 'funny'), vote(2, 1, 'not funny' as StudyRating['vote_value']),
    ])
    expect(rows[0]).toMatchObject({ totalRatings: 1, funnyPercent: 0 })
    expect(overview.distribution).toEqual([
      { value: 'funny', label: 'Funny', count: 0, percent: 0 },
      { value: 'not funny', label: 'Not funny', count: 1, percent: 100 },
    ])
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
      ['funny', 2], ['not funny', 1],
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

  it('preserves both binary categories and zeroes for a study without feedback', () => {
    const { overview } = buildStudyAnalytics([caption(1)], [])
    expect(overview).toMatchObject({
      uniqueParticipants: 0, totalRatings: 0, ratedCaptions: 0, coveragePercent: 0,
      ratingsPerCaption: { average: 0, median: 0, min: 0, max: 0 },
    })
    expect(overview.distribution).toHaveLength(2)
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

describe('study rating opportunities', () => {
  it('separates Funny out of available opportunities from Funny out of submitted ratings', () => {
    const captions = Array.from({ length: 100 }, (_, index) => caption(index + 1))
    const ratings = Array.from({ length: 50 }, (_, index) => vote(index + 1, index + 1,
      index < 20 ? 'funny' : 'not very funny'))
    const { opportunities } = buildStudyAnalytics(captions, ratings, ['participant-1'])
    expect(opportunities).toMatchObject({
      availableCaptions: 100, observedParticipants: 1, potentialRatings: 100, ratingsGiven: 50,
      funnyRatings: 20, notFunnyRatings: 30, otherRatings: 0, potentialUnrated: 50,
      ratingCoveragePercent: 50, funnyOfPotentialPercent: 20, funnyOfRatedPercent: 40,
    })
  })

  it('unions starters and raters and counts each participant-caption opportunity once', () => {
    const { opportunities, overview } = buildStudyAnalytics([caption(1), caption(2), caption(3), caption(4, 'caption-1')], [
      vote(1, 1, 'not very funny', { profile_id: 'a' }),
      vote(2, 4, 'funny', { caption_id: 'caption-1', profile_id: 'a' }),
      vote(3, 2, 'not very funny', { profile_id: 'a' }),
      vote(4, 1, 'funny', { profile_id: 'b' }),
      vote(5, 99, 'funny', { profile_id: 'excluded' }),
    ], ['a', 'c', 'c'])
    expect(opportunities).toMatchObject({
      availableCaptions: 3, observedParticipants: 3, potentialRatings: 9, ratingsGiven: 3,
      funnyRatings: 2, notFunnyRatings: 1, potentialUnrated: 6,
    })
    expect(opportunities.ratingCoveragePercent).toBeCloseTo(100 / 3)
    expect(opportunities.funnyOfPotentialPercent).toBeCloseTo(200 / 9)
    expect(opportunities.funnyOfRatedPercent).toBeCloseTo(200 / 3)
    expect(overview.uniqueParticipants).toBe(2)
  })

  it('includes starters with no ratings without treating unrated opportunities as negative votes', () => {
    const { opportunities } = buildStudyAnalytics([caption(1), caption(2)], [], ['a', 'b'])
    expect(opportunities).toMatchObject({
      potentialRatings: 4, potentialUnrated: 4, ratingsGiven: 0, funnyRatings: 0, notFunnyRatings: 0,
      ratingCoveragePercent: 0, funnyOfPotentialPercent: 0, funnyOfRatedPercent: null,
    })
  })

  it('does not invent rates when no participants are known or participation could not be loaded', () => {
    expect(buildStudyAnalytics([caption(1)], []).opportunities).toMatchObject({
      potentialRatings: 0, ratingCoveragePercent: null, funnyOfPotentialPercent: null,
    })
    expect(buildStudyAnalytics([caption(1)], [vote(1, 1, 'funny')], null).opportunities).toMatchObject({
      observedParticipants: 1, participationAvailable: false, potentialRatings: null, potentialUnrated: null,
      ratingsGiven: 1, funnyRatings: 1, funnyOfPotentialPercent: null, funnyOfRatedPercent: 100,
    })
    expect(buildStudyAnalytics([], [], null).opportunities).toMatchObject({
      potentialRatings: 0, potentialUnrated: 0, ratingCoveragePercent: null,
    })
  })

  it('keeps unrecognized submitted ratings distinct from negative or unrated opportunities', () => {
    const { opportunities } = buildStudyAnalytics([caption(1), caption(2)], [vote(1, 1, 'unexpected' as StudyRating['vote_value'])])
    expect(opportunities).toMatchObject({
      potentialRatings: 2, ratingsGiven: 1, funnyRatings: 0, notFunnyRatings: 0, otherRatings: 1, potentialUnrated: 1,
    })
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
      .mockResolvedValueOnce({ data: [], error: null })
    const signal = new AbortController().signal
    const rows = await StudyResultsService.get(7, signal)
    expect(rows).toHaveLength(501)
    expect(rows.find(row => row.captionId === 'caption-1')).toMatchObject({ totalRatings: 1, funnyPercent: 100 })
    expect(query.eq).toHaveBeenCalledWith('study_id', 7)
    expect(query.eq).toHaveBeenCalledWith('study_caption_mappings.study_id', 7)
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining('study_caption_mappings!inner(study_id)'))
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining('metadata'))
    expect(query.range.mock.calls).toEqual([[0, 499], [500, 999], [0, 499], [500, 999], [0, 499]])
    expect(query.abortSignal).toHaveBeenCalledWith(signal)
  })

  it('propagates failed reads instead of presenting them as no ratings', async () => {
    query.abortSignal.mockResolvedValueOnce({ data: [caption(1)], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } })
    await expect(StudyResultsService.get(7, new AbortController().signal)).rejects.toThrow('Could not load study ratings: permission denied')
  })

  it('loads all study-scoped starter pages for the opportunity estimate', async () => {
    const starters = Array.from({ length: 500 }, (_, index) => ({ profile_id: `starter-${index}` }))
    query.abortSignal.mockResolvedValueOnce({ data: [caption(1)], error: null })
      .mockResolvedValueOnce({ data: [vote(1, 1, 'funny')], error: null })
      .mockResolvedValueOnce({ data: starters, error: null })
      .mockResolvedValueOnce({ data: [{ profile_id: 'starter-500' }], error: null })
    const { opportunities } = await StudyResultsService.getAnalytics(7, new AbortController().signal)
    expect(opportunities).toMatchObject({ observedParticipants: 502, potentialRatings: 502, ratingsGiven: 1 })
    expect(from).toHaveBeenCalledWith('study_participations')
    expect(query.select).toHaveBeenCalledWith('profile_id')
    expect(query.eq).toHaveBeenLastCalledWith('study_id', 7)
    expect(query.order).toHaveBeenLastCalledWith('profile_id')
    expect(query.range).toHaveBeenLastCalledWith(500, 999)
  })

  it('keeps existing results while withholding opportunity rates after a participation read failure', async () => {
    query.abortSignal.mockResolvedValueOnce({ data: [caption(1)], error: null })
      .mockResolvedValueOnce({ data: [vote(1, 1, 'funny')], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } })
    const { rows, opportunities } = await StudyResultsService.getAnalytics(7, new AbortController().signal)
    expect(rows[0].funnyPercent).toBe(100)
    expect(opportunities).toMatchObject({ participationAvailable: false, potentialRatings: null, ratingsGiven: 1, funnyRatings: 1 })
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
