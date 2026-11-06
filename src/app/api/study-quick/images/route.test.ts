import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  query: { select: vi.fn(), eq: vi.fn(), single: vi.fn() },
  client: {
    from: vi.fn(),
    auth: { getUser: vi.fn(), getSession: vi.fn(), refreshSession: vi.fn() },
  },
}))
vi.mock('server-only', () => ({}))
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => mocks.client }))
vi.mock('@/utils/classify-image-category', () => ({ classifyImageCategory: vi.fn() }))
import { classifyImageCategory } from '@/utils/classify-image-category'
import { POST } from './route'

const hostedUrl = 'https://images.almostcrackd.ai/user/uploaded.jpg'
const request = (body: unknown) => new Request('http://localhost/api/study-quick/images', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://api.almostcrackd.ai')
  vi.stubEnv('GOOGLE_AI_API_KEY', 'test-key')
  vi.stubGlobal('fetch', mocks.fetch)
  mocks.client.auth.getUser.mockResolvedValue({ data: { user: { id: 'user' } } })
  mocks.client.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'user-jwt' } } })
  mocks.client.from.mockReturnValue(mocks.query)
  mocks.query.select.mockReturnValue(mocks.query)
  mocks.query.eq.mockReturnValue(mocks.query)
  mocks.query.single.mockResolvedValue({ data: { id: 'uploaded', url: hostedUrl }, error: null })
  mocks.fetch.mockResolvedValue(Response.json({ imageId: 'uploaded' }))
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('Quick Study upload HTTP route', () => {
  it.each(['almostcrackd.ai', 'crackd.ai'])('uses the user JWT and the %s API and returns before classification', async (domain) => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', `https://api.${domain}`)
    const otherDomain = domain === 'crackd.ai' ? 'almostcrackd.ai' : 'crackd.ai'
    const imageUrl = `https://images.${otherDomain}/source.jpg`
    const url = `https://images.${domain}/user/uploaded.jpg`
    mocks.query.single.mockResolvedValue({ data: { id: 'uploaded', url }, error: null })
    const response = await POST(request({ imageUrl: ` ${imageUrl} ` }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, image: { id: 'uploaded', url }, needsClassification: true })
    expect(mocks.fetch).toHaveBeenCalledWith(`https://api.${domain}/pipeline/upload-image-from-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user-jwt' },
      body: JSON.stringify({ imageUrl, isCommonUse: false }),
      signal: expect.any(AbortSignal),
    })
    expect(classifyImageCategory).not.toHaveBeenCalled()
  })

  it('lets multiple API uploads run before any one upload has finished', async () => {
    const pending: Array<(response: Response) => void> = []
    mocks.fetch.mockImplementation(() => new Promise<Response>(resolve => pending.push(resolve)))
    const uploads = Promise.all(Array.from({ length: 5 }, (_, index) =>
      POST(request({ imageUrl: `https://external.example/${index}.jpg` }))
    ))
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(5))
    for (const resolve of pending) resolve(Response.json({ imageId: 'uploaded' }))
    expect((await uploads).every(response => response.status === 200)).toBe(true)
  })

  it('does not request classification when no AI key is configured', async () => {
    vi.stubEnv('GOOGLE_AI_API_KEY', '')
    const response = await POST(request({ imageUrl: 'https://external.example/image.jpg' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ needsClassification: false })
    expect(classifyImageCategory).not.toHaveBeenCalled()
  })

  it('requires a signed-in session and does not upload anonymously', async () => {
    mocks.client.auth.getUser.mockResolvedValue({ data: { user: null } })
    mocks.client.auth.getSession.mockResolvedValue({ data: { session: null } })
    mocks.client.auth.refreshSession.mockResolvedValue({ data: { session: null } })
    const response = await POST(request({ imageUrl: 'https://external.example/image.jpg' }))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Authentication failed. Please log in and try again.' })
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it.each([null, {}, { imageUrl: 42 }, { imageUrl: '' }, { imageUrl: 'not a URL' }, { imageUrl: 'file:///image.jpg' }])(
    'rejects invalid input %j', async (body) => {
      const response = await POST(request(body))
      expect(response.status).toBe(400)
      expect(mocks.fetch).not.toHaveBeenCalled()
    }
  )

  it('reports source failures and does not schedule classification', async () => {
    mocks.fetch.mockResolvedValue(new Response('Source is unavailable', { status: 400 }))
    const response = await POST(request({ imageUrl: 'https://external.example/image.jpg' }))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Failed to upload image from URL: Source is unavailable' })
    expect(mocks.client.from).not.toHaveBeenCalled()
  })

  it.each(['', '<html><body>504 Gateway Timeout</body></html>'])('returns a useful JSON timeout when the upstream response is %j', async (body) => {
    mocks.fetch.mockResolvedValue(new Response(body, { status: 504 }))
    const response = await POST(request({ imageUrl: 'https://external.example/image.jpg' }))
    expect(response.status).toBe(504)
    expect(await response.json()).toEqual({
      error: 'The image upload timed out (HTTP 504). Try a smaller image or a different image URL.',
    })
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(mocks.client.from).not.toHaveBeenCalled()
    expect(classifyImageCategory).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith('Quick Study image upload failed', {
      status: 504, elapsedMs: expect.any(Number), sourceHost: 'external.example',
    })
  })

  it('returns a useful error instead of forwarding a CloudFront HTML error page', async () => {
    mocks.fetch.mockResolvedValue(new Response('<html><body>Bad gateway</body></html>', { status: 502 }))
    const response = await POST(request({ imageUrl: 'https://external.example/image.jpg' }))
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'Could not upload the image (HTTP 502). Please try again.' })
    expect(mocks.client.from).not.toHaveBeenCalled()
  })

  it('preserves the upstream JSON reason for an invalid source image', async () => {
    mocks.fetch.mockResolvedValue(Response.json({ statusCode: 400, message: 'Invalid content-type in image contents' }, { status: 400 }))
    const response = await POST(request({ imageUrl: 'https://external.example/image.jpg' }))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Failed to upload image from URL: Invalid content-type in image contents' })
    expect(mocks.client.from).not.toHaveBeenCalled()
  })

  it('returns a JSON timeout when the upload exceeds its deadline without repeating the upload', async () => {
    const controller = new AbortController()
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(controller.signal)
    mocks.fetch.mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
    }))
    const upload = POST(request({ imageUrl: 'https://external.example/image.jpg' }))
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1))
    expect(timeout).toHaveBeenCalledWith(110_000)
    controller.abort(new DOMException('Upload timed out', 'TimeoutError'))
    const response = await upload
    expect(response.status).toBe(504)
    expect(await response.json()).toEqual({
      error: 'The image upload timed out (HTTP 504). Try a smaller image or a different image URL.',
    })
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(mocks.client.from).not.toHaveBeenCalled()
    expect(classifyImageCategory).not.toHaveBeenCalled()
  })

  it('rejects an uploaded image saved in the wrong environment', async () => {
    mocks.query.single.mockResolvedValue({ data: { id: 'uploaded', url: 'https://images.crackd.ai/image.jpg' }, error: null })
    const response = await POST(request({ imageUrl: 'https://external.example/image.jpg' }))
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'Upload did not return a hosted image.' })
  })
})
