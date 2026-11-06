import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/utils/job-request-headers', () => ({
  getJobRequestHeaders: async () => ({
    'Content-Type': 'application/json',
    Authorization: 'Bearer browser-jwt',
  }),
}))
import {
  createQuickStudyJobRequest,
  submitQuickStudyJob,
  retryQuickStudyJob,
  getQuickStudyJob,
  mergeQuickStudyProgress,
  watchQuickStudyJob,
  type QuickStudyCaption,
  type QuickStudyJobStatus,
} from './quick-study-preparation.service'

const jobId = '00000000-0000-4000-8000-000000000001'
const row: QuickStudyCaption = {
  key: 'a',
  imageId: null,
  previewUrl: 'https://external.example/a.jpg',
  pendingUrl: 'https://external.example/a.jpg',
  caption: 'one',
  status: 'generating',
}
const complete: QuickStudyCaption = {
  ...row,
  imageId: 'image',
  captionId: 'caption',
  previewUrl: 'https://images.almostcrackd.ai/a.jpg',
  pendingUrl: null,
  status: 'complete',
}
const status = (
  overrides: Partial<QuickStudyJobStatus> = {}
): QuickStudyJobStatus => ({
  jobId,
  status: 'queued',
  rows: [row],
  progress: { total: 1, completed: 0, failed: 0 },
  ...overrides,
})
const fetchMock = vi.fn()
beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://api.almostcrackd.ai')
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('durable Quick Study preparation', () => {
  it('sends the browser JWT when submitting, polling and retrying a local job', async () => {
    fetchMock.mockImplementation(async () => Response.json(status()))
    await submitQuickStudyJob(createQuickStudyJobRequest([row], jobId))
    await getQuickStudyJob(jobId)
    await retryQuickStudyJob(jobId)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    for (const [, options] of fetchMock.mock.calls) {
      expect(options.headers.Authorization).toBe('Bearer browser-jwt')
      expect(options.credentials).toBe('same-origin')
    }
  })
  it('returns saved captions immediately with external previews and permanent IDs', async () => {
    const saved = status({
      status: 'completed',
      savedImmediately: true,
      replacementsPending: 1,
      rows: [{ ...complete, previewUrl: row.previewUrl }],
    })
    fetchMock.mockImplementation(async () => Response.json(saved))
    expect(
      await submitQuickStudyJob(createQuickStudyJobRequest([row], jobId))
    ).toEqual(saved)
    expect((await getQuickStudyJob(jobId)).rows[0].captionId).toBe('caption')
  })
  it('rejects an invalid preview even when the caption was saved immediately', async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        status({
          status: 'completed',
          savedImmediately: true,
          rows: [{ ...complete, previewUrl: 'javascript:alert(1)' }],
        })
      )
    )
    await expect(getQuickStudyJob(jobId)).rejects.toThrow('environment')
  })
  it('swaps in the hosted preview while retaining caption edits and image IDs', () => {
    const edited = {
      ...complete,
      caption: 'edited',
      previewUrl: row.previewUrl,
    }
    expect(mergeQuickStudyProgress([edited], [complete])).toEqual([
      { ...edited, previewUrl: complete.previewUrl },
    ])
  })
  it('silently reconnects while replacements run after captions have saved', async () => {
    const progress = vi.fn(),
      error = vi.fn()
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 504 }))
      .mockResolvedValueOnce(
        Response.json(
          status({
            status: 'completed',
            savedImmediately: true,
            replacementsPending: 1,
            rows: [{ ...complete, previewUrl: row.previewUrl }],
          })
        )
      )
      .mockResolvedValueOnce(
        Response.json(
          status({
            status: 'completed',
            savedImmediately: true,
            replacementsPending: 0,
            rows: [complete],
          })
        )
      )
    const watching = watchQuickStudyJob(jobId, {
      savedImmediately: true,
      signal: new AbortController().signal,
      onProgress: progress,
      onConnectionError: error,
    })
    await vi.advanceTimersByTimeAsync(14_000)
    await watching
    expect(progress).toHaveBeenCalledTimes(2)
    expect(error).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
  it('retains a fixed submission ID and exact inputs across a lost HTTP response', async () => {
    const input = createQuickStudyJobRequest(
      [row, { ...row, key: 'b', caption: 'two' }],
      jobId
    )
    fetchMock
      .mockResolvedValueOnce(new Response('<html>504</html>', { status: 504 }))
      .mockResolvedValueOnce(Response.json({ jobId }))
    await expect(submitQuickStudyJob(input)).rejects.toThrow('HTTP 504')
    await submitQuickStudyJob(input)
    expect(fetchMock.mock.calls[0][1].body).toBe(
      fetchMock.mock.calls[1][1].body
    )
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(input)
    expect(input.rows.map((r) => r.imageUrl)).toEqual([
      row.previewUrl,
      row.previewUrl,
    ])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('retries the existing job rather than creating new captions or uploads', async () => {
    fetchMock.mockResolvedValue(Response.json({ jobId }))
    await retryQuickStudyJob(jobId)
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/study-quick/jobs/${jobId}/retry`,
      expect.objectContaining({ method: 'POST', body: '{}' })
    )
  })
  it('rejects imports beyond the durable job limit', () => {
    expect(() => createQuickStudyJobRequest([])).toThrow('2,000')
    expect(() =>
      createQuickStudyJobRequest(Array.from({ length: 2001 }, () => row))
    ).toThrow('2,000')
  })
  it('validates inputs and UTF-8 payload size before locking the import form', () => {
    expect(() =>
      createQuickStudyJobRequest([
        { ...row, pendingUrl: 'http://', previewUrl: null },
      ])
    ).toThrow('valid HTTP')
    expect(() =>
      createQuickStudyJobRequest([{ ...row, caption: ' ' }])
    ).toThrow('characters')
    expect(() =>
      createQuickStudyJobRequest([
        { ...row, meta: { large: '🐱'.repeat(1_000_000) } },
      ])
    ).toThrow('too large')
  })
  it('does not overwrite edited completed captions or resurrect deleted rows during polling', () => {
    const edited = { ...complete, caption: 'edited' }
    expect(
      mergeQuickStudyProgress(
        [edited, { ...row, key: 'b' }],
        [complete, { ...complete, key: 'b' }, { ...complete, key: 'deleted' }]
      )
    ).toEqual([edited, { ...complete, key: 'b' }])
    expect(mergeQuickStudyProgress([], [complete])).toEqual([])
  })
  it.each(['https://external.example/a.jpg', 'https://images.crackd.ai/a.jpg'])(
    'blocks a completed image outside staging: %s',
    async (url) => {
      fetchMock.mockResolvedValue(
        Response.json(
          status({
            status: 'completed',
            rows: [{ ...complete, previewUrl: url }],
          })
        )
      )
      await expect(getQuickStudyJob(jobId)).rejects.toThrow('environment')
    }
  )
  it('accepts production images when connected to the production API', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://api.crackd.ai')
    fetchMock.mockResolvedValue(
      Response.json(
        status({
          status: 'completed',
          rows: [{ ...complete, previewUrl: 'https://images.crackd.ai/a.jpg' }],
        })
      )
    )
    expect((await getQuickStudyJob(jobId)).rows[0].status).toBe('complete')
  })
  it('automatically reconnects after a gateway error without resubmitting work', async () => {
    const progress = vi.fn(),
      error = vi.fn()
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 504 }))
      .mockResolvedValueOnce(
        Response.json(status({ status: 'completed', rows: [complete] }))
      )
    const watching = watchQuickStudyJob(jobId, {
      signal: new AbortController().signal,
      onProgress: progress,
      onConnectionError: error,
    })
    await vi.advanceTimersByTimeAsync(4000)
    await watching
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('job continues'),
      false
    )
    expect(progress).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls.every((call) => call[1].method === 'GET')).toBe(
      true
    )
  })
  it('stops observation on unmount without canceling the durable job', async () => {
    const controller = new AbortController(),
      progress = vi.fn()
    fetchMock.mockResolvedValue(Response.json(status()))
    const watching = watchQuickStudyJob(jobId, {
      signal: controller.signal,
      onProgress: progress,
      onConnectionError: vi.fn(),
    })
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    await watching
    await vi.advanceTimersByTimeAsync(20_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('ignores a response that arrives after cleanup', async () => {
    const controller = new AbortController(),
      progress = vi.fn()
    let finish!: (response: Response) => void
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        })
    )
    const watching = watchQuickStudyJob(jobId, {
      signal: controller.signal,
      onProgress: progress,
      onConnectionError: vi.fn(),
    })
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    finish(Response.json(status()))
    await watching
    expect(progress).not.toHaveBeenCalled()
  })
  it('reports an ownership or authentication failure without polling forever', async () => {
    const error = vi.fn()
    fetchMock.mockResolvedValue(
      Response.json({ error: 'Import job not found' }, { status: 404 })
    )
    await watchQuickStudyJob(jobId, {
      signal: new AbortController().signal,
      onProgress: vi.fn(),
      onConnectionError: error,
    })
    expect(error).toHaveBeenCalledWith('Import job not found', true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('requests optional classification once for captions sharing an image without waiting for it', async () => {
    let polls = 0
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/classify')) return new Promise(() => {})
      polls++
      return Promise.resolve(
        Response.json(
          status({
            status: polls === 1 ? 'running' : 'completed',
            needsClassification: true,
            rows: [complete, { ...complete, key: 'b' }],
          })
        )
      )
    })
    const watching = watchQuickStudyJob(jobId, {
      signal: new AbortController().signal,
      onProgress: vi.fn(),
      onConnectionError: vi.fn(),
    })
    await vi.advanceTimersByTimeAsync(2000)
    await watching
    expect(
      fetchMock.mock.calls.filter((call) => call[0].includes('/classify'))
    ).toHaveLength(1)
  })
})
