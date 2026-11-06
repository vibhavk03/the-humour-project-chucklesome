import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() },
  client: { from: vi.fn(), auth: { getUser: vi.fn() } },
}))
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => mocks.client }))
vi.mock('@/utils/classify-image-category', () => ({ classifyImageCategory: vi.fn() }))
import { classifyImageCategory } from '@/utils/classify-image-category'
import { POST } from './route'

const imageId = '5cc7bff7-e98d-4301-b741-ff7e6dcdeae1'
const url = 'https://images.almostcrackd.ai/user/image.jpg'
const request = (body: unknown) => new Request('http://localhost/api/study-quick/images/classify', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://api.almostcrackd.ai')
  mocks.client.auth.getUser.mockResolvedValue({ data: { user: { id: 'user' } } })
  mocks.client.from.mockReturnValue(mocks.query)
  mocks.query.select.mockReturnValue(mocks.query)
  mocks.query.eq.mockReturnValue(mocks.query)
  mocks.query.maybeSingle.mockResolvedValue({ data: { id: imageId, url }, error: null })
})
afterEach(() => vi.unstubAllEnvs())

describe('background Quick Study image classification', () => {
  it.each(['almostcrackd.ai', 'crackd.ai'])('classifies only the signed-in user image at the %s canonical host', async (domain) => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', `https://api.${domain}`)
    const savedUrl = `https://images.${domain}/user/image.jpg`
    mocks.query.maybeSingle.mockResolvedValue({ data: { id: imageId, url: savedUrl }, error: null })
    const response = await POST(request({ imageId, imageUrl: 'https://untrusted.example/image.jpg' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(mocks.query.eq).toHaveBeenCalledWith('id', imageId)
    expect(mocks.query.eq).toHaveBeenCalledWith('profile_id', 'user')
    expect(classifyImageCategory).toHaveBeenCalledWith(mocks.client, imageId, savedUrl)
  })

  it('denies unauthenticated classification', async () => {
    mocks.client.auth.getUser.mockResolvedValue({ data: { user: null } })
    expect((await POST(request({ imageId }))).status).toBe(401)
    expect(mocks.client.from).not.toHaveBeenCalled()
    expect(classifyImageCategory).not.toHaveBeenCalled()
  })

  it.each([{}, { imageId: 'not-an-id' }])('rejects invalid image IDs: %j', async (body) => {
    expect((await POST(request(body))).status).toBe(400)
    expect(classifyImageCategory).not.toHaveBeenCalled()
  })

  it('does not classify an image that is missing or belongs to another user', async () => {
    mocks.query.maybeSingle.mockResolvedValue({ data: null, error: null })
    expect((await POST(request({ imageId }))).status).toBe(404)
    expect(classifyImageCategory).not.toHaveBeenCalled()
  })

  it('requires a canonical URL in the current environment', async () => {
    mocks.query.maybeSingle.mockResolvedValue({ data: { id: imageId, url: 'https://images.crackd.ai/image.jpg' }, error: null })
    expect((await POST(request({ imageId }))).status).toBe(400)
    expect(classifyImageCategory).not.toHaveBeenCalled()
  })

  it('reports database read failures without classifying', async () => {
    mocks.query.maybeSingle.mockResolvedValue({ data: null, error: { message: 'Database unavailable' } })
    expect((await POST(request({ imageId }))).status).toBe(500)
    expect(classifyImageCategory).not.toHaveBeenCalled()
  })
})
