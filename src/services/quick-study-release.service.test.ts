import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/services/studies.service', () => ({
  StudiesService: {
    createStudyWithResult: vi.fn(),
    findStudyForRelease: vi.fn(),
    publishStudy: vi.fn(),
    updateStudy: vi.fn(),
  },
  StudyCaptionMappingsService: {
    getReleaseMappings: vi.fn(),
    createMapping: vi.fn(),
    deleteMapping: vi.fn(),
  },
}))
vi.mock('@/utils/supabase/client', () => ({ supabase: {} }))
vi.mock('@/utils/supabase/audit', () => ({ getCurrentProfileId: vi.fn() }))
import {
  StudiesService,
  StudyCaptionMappingsService,
} from '@/services/studies.service'
import { getCurrentProfileId } from '@/utils/supabase/audit'
import type { Study, StudyCaptionMappingWithDetails } from '@/types/study'
import {
  createQuickStudyReleaseState,
  releaseQuickStudy,
} from './quick-study-release.service'

const draft = {
  id: 42,
  slug: '09-28-2-captions-flavor',
  is_private: true,
  created_by_user_id: 'actor',
} as Study
const input = {
  visibility: 'public' as const,
  slug: draft.slug!,
  captionIds: ['a', 'b'],
  start: '2026-09-28T12:00:00Z',
  end: '2026-09-29T12:00:00Z',
}
let dbStudy: Study | null
let dbMappings: { id: number; caption_id: string }[]
let sequence: number

beforeEach(() => {
  vi.resetAllMocks()
  dbStudy = null
  dbMappings = []
  sequence = 0
  vi.mocked(getCurrentProfileId).mockResolvedValue('actor')
  vi.mocked(StudiesService.updateStudy).mockImplementation(async (_id, updates) => {
    dbStudy = { ...dbStudy!, ...updates }
    return dbStudy
  })
  vi.mocked(StudiesService.createStudyWithResult).mockImplementation(
    async (payload) => {
      dbStudy = { ...draft, ...payload }
      return { data: dbStudy, error: null }
    }
  )
  vi.mocked(StudiesService.findStudyForRelease).mockImplementation(
    async () => dbStudy
  )
  vi.mocked(StudyCaptionMappingsService.getReleaseMappings).mockImplementation(
    async () => [...dbMappings]
  )
  vi.mocked(StudyCaptionMappingsService.createMapping).mockImplementation(
    async (payload) => {
      const mapping = { id: ++sequence, ...payload }
      dbMappings.push(mapping)
      return mapping as StudyCaptionMappingWithDetails
    }
  )
  vi.mocked(StudyCaptionMappingsService.deleteMapping).mockImplementation(
    async (id) => {
      dbMappings = dbMappings.filter((mapping) => mapping.id !== id)
      return true
    }
  )
  vi.mocked(StudiesService.publishStudy).mockImplementation(
    async (_id, updates) => {
      dbStudy = { ...dbStudy!, ...updates, is_private: false }
      return dbStudy
    }
  )
})

describe('Quick Study release', () => {
  it('releases privately with selected mappings without publishing the study or its contents', async () => {
    const state = createQuickStudyReleaseState()
    const study = await releaseQuickStudy(state, { ...input, visibility: 'private' })
    expect(study.is_private).toBe(true)
    expect(dbMappings.map(mapping => mapping.caption_id)).toEqual(['a', 'b'])
    expect(StudiesService.publishStudy).not.toHaveBeenCalled()
    expect(StudiesService.updateStudy).toHaveBeenCalledWith(42, expect.objectContaining({ is_private: true }))
  })
  it('reuses the same study when a private release needs retrying', async () => {
    const state = createQuickStudyReleaseState()
    vi.mocked(StudiesService.updateStudy).mockResolvedValueOnce(null)
    await expect(releaseQuickStudy(state, { ...input, visibility: 'private' })).rejects.toThrow('private release')
    await releaseQuickStudy(state, { ...input, visibility: 'private' })
    expect(StudiesService.createStudyWithResult).toHaveBeenCalledTimes(1)
    expect(StudyCaptionMappingsService.createMapping).toHaveBeenCalledTimes(2)
    expect(StudiesService.publishStudy).not.toHaveBeenCalled()
  })
  it('saves a private study with mappings on Next, then releases the same study', async () => {
    const state = createQuickStudyReleaseState()
    const saved = await releaseQuickStudy(state, { ...input, visibility: 'private' })
    expect(saved.is_private).toBe(true)
    expect(dbMappings.map(mapping => mapping.caption_id)).toEqual(['a', 'b'])
    expect(StudiesService.publishStudy).not.toHaveBeenCalled()

    const released = await releaseQuickStudy(state, {
      ...input,
      slug: 'edited-before-release',
      end: '2026-09-30T12:00:00Z',
    })
    expect(released).toMatchObject({
      id: saved.id,
      slug: 'edited-before-release',
      end_datetime_utc: '2026-09-30T12:00:00Z',
      is_private: false,
    })
    expect(StudiesService.createStudyWithResult).toHaveBeenCalledTimes(1)
    expect(StudyCaptionMappingsService.createMapping).toHaveBeenCalledTimes(2)
    expect(StudiesService.publishStudy).toHaveBeenCalledTimes(1)
  })
  it('saves revised selections to the same private study when Next is clicked again', async () => {
    const state = createQuickStudyReleaseState()
    await releaseQuickStudy(state, { ...input, visibility: 'private' })
    const saved = await releaseQuickStudy(state, {
      ...input,
      visibility: 'private',
      captionIds: ['b', 'c'],
    })
    expect(saved.is_private).toBe(true)
    expect(dbMappings.map(mapping => mapping.caption_id)).toEqual(['b', 'c'])
    expect(StudiesService.createStudyWithResult).toHaveBeenCalledTimes(1)
    expect(StudiesService.publishStudy).not.toHaveBeenCalled()
  })
  it('never adopts an unrelated existing study with the same name', async () => {
    dbStudy = draft
    const state = createQuickStudyReleaseState()
    await expect(releaseQuickStudy(state, input)).rejects.toThrow(
      'already exists'
    )
    expect(state.creationAttempted).toBe(false)
    expect(StudiesService.createStudyWithResult).not.toHaveBeenCalled()
    expect(
      StudyCaptionMappingsService.getReleaseMappings
    ).not.toHaveBeenCalled()
    expect(StudiesService.publishStudy).not.toHaveBeenCalled()
  })
  it('allows a new name after a definitive first-insert uniqueness conflict', async () => {
    const state = createQuickStudyReleaseState()
    vi.mocked(StudiesService.createStudyWithResult).mockResolvedValueOnce({
      data: null,
      error: 'Name taken',
      code: '23505',
    })
    await expect(releaseQuickStudy(state, input)).rejects.toThrow('Name taken')
    expect(state.creationAttempted).toBe(false)
    await releaseQuickStudy(state, { ...input, slug: 'different-name' })
    expect(dbStudy?.slug).toBe('different-name')
  })
  it('keeps the original slug reservation on an uncertain retry, then applies the edited name at release', async () => {
    const state = createQuickStudyReleaseState()
    vi.mocked(StudiesService.createStudyWithResult).mockResolvedValueOnce({
      data: null,
      error: 'Response lost',
    })
    await expect(releaseQuickStudy(state, input)).rejects.toThrow()
    await releaseQuickStudy(state, { ...input, slug: 'edited-final-name' })
    expect(StudiesService.createStudyWithResult).toHaveBeenLastCalledWith(
      expect.objectContaining({ slug: input.slug })
    )
    expect(dbStudy?.slug).toBe('edited-final-name')
  })
  it('creates privately, attaches only selected captions, verifies, then publishes last', async () => {
    const state = createQuickStudyReleaseState()
    expect(state.study).toBeNull()
    const published = await releaseQuickStudy(state, input)
    expect(published).toMatchObject({ id: 42, is_private: false })
    expect(StudiesService.createStudyWithResult).toHaveBeenCalledWith(
      expect.objectContaining({ is_private: true, slug: input.slug })
    )
    expect(dbMappings.map((mapping) => mapping.caption_id)).toEqual(['a', 'b'])
    expect(
      StudyCaptionMappingsService.getReleaseMappings
    ).toHaveBeenCalledTimes(2)
    expect(StudiesService.publishStudy).toHaveBeenCalledTimes(1)
    expect(StudiesService.publishStudy).toHaveBeenCalledWith(42, {
      slug: input.slug,
      start_datetime_utc: input.start,
      end_datetime_utc: input.end,
    })
    const verifyOrder = vi
      .mocked(StudyCaptionMappingsService.getReleaseMappings)
      .mock.invocationCallOrder.at(-1)!
    expect(
      vi.mocked(StudiesService.publishStudy).mock.invocationCallOrder[0]
    ).toBeGreaterThan(verifyOrder)
  })
  it('creates nothing with zero selections or invalid name/schedule', async () => {
    for (const invalid of [
      { captionIds: [] },
      { slug: '' },
      { end: input.start },
      { start: 'invalid' },
    ]) {
      await expect(
        releaseQuickStudy(createQuickStudyReleaseState(), {
          ...input,
          ...invalid,
        })
      ).rejects.toThrow('Choose a study name')
    }
    expect(StudiesService.createStudyWithResult).not.toHaveBeenCalled()
  })
  it('retains a partial private draft, then retries only missing mappings', async () => {
    const state = createQuickStudyReleaseState()
    const create = vi.mocked(StudyCaptionMappingsService.createMapping)
    const normal = create.getMockImplementation()!
    create.mockImplementation(async (payload, actor) =>
      payload.caption_id === 'b' ? null : normal(payload, actor)
    )
    await expect(releaseQuickStudy(state, input)).rejects.toThrow(
      'Could not attach'
    )
    expect(state.study).toMatchObject({ id: 42, is_private: true })
    expect(StudiesService.publishStudy).not.toHaveBeenCalled()
    create.mockImplementation(normal)
    await releaseQuickStudy(state, input)
    expect(StudiesService.createStudyWithResult).toHaveBeenCalledTimes(1)
    expect(
      create.mock.calls.filter(([payload]) => payload.caption_id === 'a')
    ).toHaveLength(1)
    expect(dbMappings.map((mapping) => mapping.caption_id)).toEqual(['a', 'b'])
  })
  it('recovers a committed mapping whose insert response was lost', async () => {
    const state = createQuickStudyReleaseState()
    const create = vi.mocked(StudyCaptionMappingsService.createMapping)
    const normal = create.getMockImplementation()!
    create.mockImplementationOnce(async (payload, actor) => {
      await normal(payload, actor)
      return null
    })
    await expect(releaseQuickStudy(state, input)).rejects.toThrow(
      'Could not attach'
    )
    await releaseQuickStudy(state, input)
    expect(
      create.mock.calls.filter(([payload]) => payload.caption_id === 'a')
    ).toHaveLength(1)
    expect(dbMappings).toHaveLength(2)
  })
  it('reconciles changed selections and duplicate links on the same private draft', async () => {
    const state = createQuickStudyReleaseState()
    vi.mocked(StudiesService.publishStudy).mockResolvedValueOnce(null)
    await expect(releaseQuickStudy(state, input)).rejects.toThrow(
      'still private'
    )
    dbMappings.push({ id: ++sequence, caption_id: 'b' })
    await releaseQuickStudy(state, {
      ...input,
      slug: 'changed-name',
      captionIds: ['b', 'c'],
    })
    expect(StudiesService.createStudyWithResult).toHaveBeenCalledTimes(1)
    expect(dbMappings.map((mapping) => mapping.caption_id)).toEqual(['b', 'c'])
    expect(StudyCaptionMappingsService.deleteMapping).toHaveBeenCalledTimes(2)
    expect(dbStudy?.slug).toBe('changed-name')
  })
  it('does not publish when links cannot be removed', async () => {
    const state = createQuickStudyReleaseState()
    vi.mocked(StudiesService.publishStudy).mockResolvedValueOnce(null)
    await expect(releaseQuickStudy(state, input)).rejects.toThrow()
    vi.mocked(StudiesService.publishStudy).mockClear()
    vi.mocked(StudyCaptionMappingsService.deleteMapping).mockResolvedValueOnce(
      false
    )
    await expect(
      releaseQuickStudy(state, { ...input, captionIds: ['b'] })
    ).rejects.toThrow('Could not update')
    expect(StudiesService.publishStudy).not.toHaveBeenCalled()
  })
  it('recovers an uncertain study creation by reserved slug and actor before any new insert', async () => {
    const state = createQuickStudyReleaseState()
    vi.mocked(StudiesService.createStudyWithResult).mockImplementationOnce(
      async () => {
        dbStudy = draft
        return { data: null, error: 'Response lost' }
      }
    )
    await expect(releaseQuickStudy(state, input)).rejects.toThrow(
      'Response lost'
    )
    expect(state).toMatchObject({
      reservedSlug: input.slug,
      creationAttempted: true,
      study: null,
    })
    await releaseQuickStudy(state, { ...input, slug: 'edited-name' })
    expect(StudiesService.findStudyForRelease).toHaveBeenCalledWith(
      { slug: input.slug },
      'actor'
    )
    expect(StudiesService.createStudyWithResult).toHaveBeenCalledTimes(1)
    expect(dbStudy?.slug).toBe('edited-name')
  })
  it('stops rather than inserting again when recovery cannot be read', async () => {
    const state = createQuickStudyReleaseState()
    vi.mocked(StudiesService.createStudyWithResult).mockResolvedValueOnce({
      data: null,
      error: 'Response lost',
    })
    await expect(releaseQuickStudy(state, input)).rejects.toThrow()
    vi.mocked(StudiesService.findStudyForRelease).mockRejectedValueOnce(
      new Error('Read failed')
    )
    await expect(releaseQuickStudy(state, input)).rejects.toThrow('Read failed')
    expect(StudiesService.createStudyWithResult).toHaveBeenCalledTimes(1)
  })
  it('can retry a confirmed failed creation', async () => {
    const state = createQuickStudyReleaseState()
    vi.mocked(StudiesService.createStudyWithResult).mockResolvedValueOnce({
      data: null,
      error: 'Insert rejected',
    })
    await expect(releaseQuickStudy(state, input)).rejects.toThrow()
    await releaseQuickStudy(state, input)
    expect(StudiesService.findStudyForRelease).toHaveBeenCalledWith(
      { slug: input.slug },
      'actor'
    )
    expect(StudiesService.createStudyWithResult).toHaveBeenCalledTimes(2)
  })
  it('does not treat a failed mapping read as an empty draft', async () => {
    const state = createQuickStudyReleaseState()
    vi.mocked(
      StudyCaptionMappingsService.getReleaseMappings
    ).mockRejectedValueOnce(new Error('Read failed'))
    await expect(releaseQuickStudy(state, input)).rejects.toThrow('Read failed')
    expect(StudyCaptionMappingsService.createMapping).not.toHaveBeenCalled()
    expect(StudiesService.publishStudy).not.toHaveBeenCalled()
  })
  it('refuses to publish mismatched mappings', async () => {
    vi.mocked(StudyCaptionMappingsService.getReleaseMappings)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 1, caption_id: 'a' }])
    await expect(
      releaseQuickStudy(createQuickStudyReleaseState(), input)
    ).rejects.toThrow('do not match')
    expect(StudiesService.publishStudy).not.toHaveBeenCalled()
  })
  it('recognizes a successful release even if its response was lost', async () => {
    vi.mocked(StudiesService.publishStudy).mockImplementationOnce(async () => {
      dbStudy = { ...draft, is_private: false }
      return null
    })
    const state = createQuickStudyReleaseState()
    expect(await releaseQuickStudy(state, input)).toMatchObject({
      is_private: false,
    })
    expect(state.publicationUncertain).toBe(false)
  })
  it('keeps an uncertain release locked until a retry can verify its status', async () => {
    const state = createQuickStudyReleaseState()
    vi.mocked(StudiesService.publishStudy).mockImplementationOnce(async () => {
      dbStudy = { ...draft, is_private: false }
      return null
    })
    vi.mocked(StudiesService.findStudyForRelease)
      .mockResolvedValueOnce(null) // Initial name check.
      .mockRejectedValueOnce(new Error('Offline'))
    await expect(releaseQuickStudy(state, input)).rejects.toThrow('Offline')
    expect(state.publicationUncertain).toBe(true)
    expect(await releaseQuickStudy(state, input)).toMatchObject({
      is_private: false,
    })
    expect(state.publicationUncertain).toBe(false)
    expect(StudiesService.publishStudy).toHaveBeenCalledTimes(1)
    expect(StudyCaptionMappingsService.createMapping).toHaveBeenCalledTimes(2)
  })
  it('will not recreate a deleted draft or resume as a different user', async () => {
    const state = {
      ...createQuickStudyReleaseState(),
      study: draft,
      profileId: 'actor',
    }
    await expect(releaseQuickStudy(state, input)).rejects.toThrow(
      'could not be found'
    )
    vi.mocked(getCurrentProfileId).mockResolvedValueOnce('different-actor')
    await expect(releaseQuickStudy(state, input)).rejects.toThrow(
      'Sign in as the user'
    )
    expect(StudiesService.createStudyWithResult).not.toHaveBeenCalled()
  })
})
