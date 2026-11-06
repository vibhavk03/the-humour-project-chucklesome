import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/utils/job-request-headers', () => ({
  getJobRequestHeaders: async () => ({
    'Content-Type': 'application/json',
    Authorization: 'Bearer browser-jwt',
  }),
}))
import { ExternalImageReplacementJobsService as jobs } from './external-image-replacement-jobs.service'

const fetchMock = vi.fn()
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockImplementation(async () => Response.json({ jobs: [] }))
})
afterEach(() => vi.unstubAllGlobals())

describe('external image replacement job requests', () => {
  it('sends the browser JWT for listing, alerts, retries and acknowledgements locally', async () => {
    await jobs.list({ mine: true, status: 'failed', offset: 25 })
    await jobs.alerts()
    await jobs.retry('00000000-0000-4000-8000-000000000001')
    await jobs.acknowledge('2026-10-08T18:00:00Z')
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/external-image-replacement-jobs?offset=25&mine=true&status=failed',
      '/api/external-image-replacement-jobs/alerts',
      '/api/external-image-replacement-jobs/00000000-0000-4000-8000-000000000001/retry',
      '/api/external-image-replacement-jobs/acknowledge',
    ])
    for (const [, options] of fetchMock.mock.calls) {
      expect(options.headers.Authorization).toBe('Bearer browser-jwt')
      expect(options.credentials).toBe('same-origin')
      expect(options.cache).toBe('no-store')
    }
  })

  it('shows the JSON sign-in error instead of a generic loading failure', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ error: 'Please sign in again.' }, { status: 401 })
    )
    await expect(jobs.list({})).rejects.toThrow('Please sign in again.')
  })

  it('does not send a request after polling has been cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(jobs.list({}, controller.signal)).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
