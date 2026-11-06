import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  auth: { getUser: vi.fn(), getSession: vi.fn(), refreshSession: vi.fn() },
}))
vi.mock('server-only', () => ({}))
vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({ auth: mocks.auth }),
}))
import { POST } from './route'
import { GET } from './[id]/route'
import { POST as retry } from './[id]/retry/route'

const jobId = '00000000-0000-4000-8000-000000000001'
const input = {
  jobId,
  rows: [
    {
      key: 'a',
      imageId: null,
      imageUrl: 'https://external.example/a.jpg',
      caption: 'one',
    },
  ],
}
const request = (body: unknown) =>
  new Request('http://localhost/api/study-quick/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
const params = { params: Promise.resolve({ id: jobId }) }
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', mocks.fetch)
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://api.almostcrackd.ai')
  vi.stubEnv('GOOGLE_AI_API_KEY', '')
  mocks.auth.getUser.mockResolvedValue({ data: { user: { id: 'user' } } })
  mocks.auth.getSession.mockResolvedValue({
    data: { session: { access_token: 'user-jwt' } },
  })
  mocks.fetch.mockImplementation(async () => Response.json({ jobId }))
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
describe('Quick Study job proxy', () => {
  it.each(['almostcrackd.ai', 'crackd.ai'])(
    'submits with the user JWT to the %s API',
    async (domain) => {
      vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', `https://api.${domain}`)
      const response = await POST(request(input))
      expect(response.status).toBe(202)
      expect(await response.json()).toEqual({ jobId })
      expect(mocks.fetch).toHaveBeenCalledWith(
        `https://api.${domain}/pipeline/quick-study-job`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(input),
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer user-jwt',
          },
          signal: expect.any(AbortSignal),
          cache: 'no-store',
        })
      )
    }
  )
  it('polls and retries the exact job without caching user data', async () => {
    const response = await GET(request({}), params)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(mocks.fetch.mock.calls[0][0]).toBe(
      `https://api.almostcrackd.ai/pipeline/quick-study-job/${jobId}`
    )
    expect(mocks.fetch.mock.calls[0][1].method).toBe('GET')
    expect((await retry(request({}), params)).status).toBe(202)
    expect(mocks.fetch.mock.calls[1][0]).toBe(
      `https://api.almostcrackd.ai/pipeline/quick-study-job/${jobId}/retry`
    )
    expect(mocks.fetch.mock.calls[1][1].method).toBe('POST')
  })
  it('requires a verified signed-in user even if a session object is present', async () => {
    mocks.auth.getUser.mockResolvedValue({ data: { user: null } })
    expect((await POST(request(input))).status).toBe(401)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it('queues, polls and retries using the verified browser JWT without requiring server cookies', async () => {
    mocks.auth.getSession.mockResolvedValue({ data: { session: null } })
    const submission = request(input)
    submission.headers.set('Authorization', 'Bearer browser-jwt')
    expect((await POST(submission)).status).toBe(202)
    expect((await GET(submission, params)).status).toBe(200)
    expect((await retry(submission, params)).status).toBe(202)
    expect(mocks.auth.getUser.mock.calls).toEqual([
      ['browser-jwt'],
      ['browser-jwt'],
      ['browser-jwt'],
    ])
    expect(mocks.auth.getSession).not.toHaveBeenCalled()
    expect(mocks.auth.refreshSession).not.toHaveBeenCalled()
    for (const [, options] of mocks.fetch.mock.calls)
      expect(options.headers.Authorization).toBe('Bearer browser-jwt')
  })
  it('rejects an unverified browser JWT even when cookie authentication is available', async () => {
    mocks.auth.getUser.mockResolvedValue({ data: { user: null } })
    const submission = request(input)
    submission.headers.set('Authorization', 'Bearer invalid-jwt')
    const response = await POST(submission)
    expect(response.status).toBe(401)
    expect(response.headers.get('Location')).toBeNull()
    expect(await response.json()).toEqual({ error: 'Please sign in again.' })
    expect(mocks.auth.getUser).toHaveBeenCalledWith('invalid-jwt')
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it.each(['Basic browser-jwt', 'Bearer', 'Bearer first second'])(
    'rejects malformed authorization %s without falling back to cookies',
    async (authorization) => {
      const submission = request(input)
      submission.headers.set('Authorization', authorization)
      expect((await POST(submission)).status).toBe(401)
      expect(mocks.auth.getUser).not.toHaveBeenCalled()
      expect(mocks.fetch).not.toHaveBeenCalled()
    }
  )
  it('refreshes the user session when needed', async () => {
    mocks.auth.getSession.mockResolvedValue({ data: { session: null } })
    mocks.auth.refreshSession.mockResolvedValue({
      data: { session: { access_token: 'refreshed-jwt' } },
    })
    expect((await POST(request(input))).status).toBe(202)
    expect(mocks.fetch.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer refreshed-jwt'
    )
  })
  it.each([null, {}, { jobId: '../unsafe', rows: [] }])(
    'rejects invalid submission %j',
    async (body) => {
      expect((await POST(request(body))).status).toBe(400)
      expect(mocks.fetch).not.toHaveBeenCalled()
    }
  )
  it('rejects unsafe IDs before building a backend path', async () => {
    expect(
      (await GET(request({}), { params: Promise.resolve({ id: '../unsafe' }) }))
        .status
    ).toBe(400)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it('retains ownership failures and hides HTML gateway errors', async () => {
    mocks.fetch.mockResolvedValueOnce(
      Response.json({ message: 'Import job not found' }, { status: 404 })
    )
    const missing = await GET(request({}), params)
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ error: 'Import job not found' })
    mocks.fetch.mockResolvedValueOnce(
      new Response('<html>504</html>', { status: 504 })
    )
    const timeout = await POST(request(input))
    expect(timeout.status).toBe(504)
    expect((await timeout.json()).error).toContain('HTTP 504')
  })
  it('returns a reconnectable error when the API connection is interrupted', async () => {
    mocks.fetch.mockRejectedValue(new Error('network failed'))
    const response = await POST(request(input))
    expect(response.status).toBe(503)
    expect((await response.json()).error).toContain('same job')
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
  })
})
