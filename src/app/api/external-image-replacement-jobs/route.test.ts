import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  auth: { getUser: vi.fn(), getSession: vi.fn(), refreshSession: vi.fn() },
}))
vi.mock('server-only', () => ({}))
vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({ auth: mocks.auth }),
}))
import { GET } from './route'
import { GET as alerts } from './alerts/route'
import { POST as acknowledge } from './acknowledge/route'
import { POST as retry } from './[id]/retry/route'

const jobId = '00000000-0000-4000-8000-000000000001'
const getRequest = (query = '') =>
  new Request(`http://localhost/api/external-image-replacement-jobs${query}`)
const postRequest = (body: unknown) =>
  new Request('http://localhost/api/external-image-replacement-jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', mocks.fetch)
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://api.almostcrackd.ai')
  mocks.auth.getUser.mockResolvedValue({ data: { user: { id: 'actor' } } })
  mocks.auth.getSession.mockResolvedValue({
    data: { session: { access_token: 'user-jwt' } },
  })
  mocks.fetch.mockImplementation(async () => Response.json({ jobs: [] }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
describe('external image replacement job proxy', () => {
  it.each(['almostcrackd.ai', 'crackd.ai'])(
    'lists jobs using the signed-in JWT in %s',
    async (domain) => {
      vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', `https://api.${domain}`)
      const response = await GET(
        getRequest('?mine=true&status=failed&offset=25')
      )
      expect(response.status).toBe(200)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect(mocks.fetch).toHaveBeenCalledWith(
        `https://api.${domain}/pipeline/external-image-replacement-jobs?offset=25&mine=true&status=failed`,
        expect.objectContaining({
          method: 'GET',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer user-jwt',
          },
        })
      )
    }
  )
  it('requires a verified user to inspect failures', async () => {
    mocks.auth.getUser.mockResolvedValue({ data: { user: null } })
    expect((await alerts(getRequest())).status).toBe(401)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it('authenticates listing, alerts, retries and acknowledgements with the browser JWT locally', async () => {
    mocks.auth.getSession.mockResolvedValue({ data: { session: null } })
    const listing = getRequest()
    listing.headers.set('Authorization', 'Bearer browser-jwt')
    const before = '2026-10-08T18:00:00Z'
    const dismissal = postRequest({ before })
    dismissal.headers.set('Authorization', 'Bearer browser-jwt')
    expect((await GET(listing)).status).toBe(200)
    expect((await alerts(listing)).status).toBe(200)
    expect(
      (await retry(dismissal, { params: Promise.resolve({ id: jobId }) }))
        .status
    ).toBe(200)
    expect((await acknowledge(dismissal)).status).toBe(200)
    expect(mocks.auth.getUser).toHaveBeenCalledTimes(4)
    expect(mocks.auth.getUser).toHaveBeenCalledWith('browser-jwt')
    expect(mocks.auth.getSession).not.toHaveBeenCalled()
    for (const [, options] of mocks.fetch.mock.calls)
      expect(options.headers.Authorization).toBe('Bearer browser-jwt')
  })
  it.each(['?status=bad', '?offset=-1', '?offset=1.5', '?mine=yes'])(
    'rejects invalid filters %s',
    async (query) => {
      expect((await GET(getRequest(query))).status).toBe(400)
      expect(mocks.fetch).not.toHaveBeenCalled()
    }
  )
  it('forwards retry and dismissal to the dedicated API with snapshot timestamp', async () => {
    expect(
      (await retry(postRequest({}), { params: Promise.resolve({ id: jobId }) }))
        .status
    ).toBe(200)
    const before = '2026-10-08T18:00:00Z'
    expect((await acknowledge(postRequest({ before }))).status).toBe(200)
    expect(mocks.fetch.mock.calls[0][0]).toContain(
      `/external-image-replacement-jobs/${jobId}/retry`
    )
    expect(mocks.fetch.mock.calls[1][1].body).toBe(JSON.stringify({ before }))
  })
  it('rejects unsafe job IDs and malformed dismissal timestamps', async () => {
    expect(
      (
        await retry(postRequest({}), {
          params: Promise.resolve({ id: '../unsafe' }),
        })
      ).status
    ).toBe(400)
    expect(
      (await acknowledge(postRequest({ before: 'not a timestamp' }))).status
    ).toBe(400)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
})
