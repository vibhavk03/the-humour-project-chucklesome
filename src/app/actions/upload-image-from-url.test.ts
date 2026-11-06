import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: { select: vi.fn(), eq: vi.fn(), single: vi.fn(), insert: vi.fn() },
  client: {
    from: vi.fn(),
    auth: { getUser: vi.fn(), getSession: vi.fn(), refreshSession: vi.fn() },
  },
  fetch: vi.fn(),
}))
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => mocks.client }))
vi.mock('server-only', () => ({}))
vi.mock('@/utils/classify-image-category', () => ({ classifyImageCategory: vi.fn() }))
import { insertImageSafeAction, uploadImageFromUrlAction, uploadImageFromUrlSafeAction } from '@/app/actions'
import { classifyImageCategory } from '@/utils/classify-image-category'

const sourceUrl = 'https://external.example/image.jpg'
const hostedUrl = 'https://images.almostcrackd.ai/user/uploaded.jpg'

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://api.almostcrackd.ai')
  vi.stubGlobal('fetch', mocks.fetch)
  mocks.client.auth.getUser.mockResolvedValue({ data: { user: { id: 'user' } } })
  mocks.client.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'user-jwt' } } })
  mocks.client.from.mockReturnValue(mocks.query)
  mocks.query.select.mockReturnValue(mocks.query)
  mocks.query.eq.mockReturnValue(mocks.query)
  mocks.query.single.mockResolvedValue({ data: { id: 'uploaded', url: hostedUrl }, error: null })
  mocks.fetch.mockResolvedValue(Response.json({ imageId: 'uploaded', now: 123 }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('upload image from URL', () => {
  it.each(['almostcrackd.ai', 'crackd.ai'])('uses the %s API with the user JWT and creates a private image', async (domain) => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', `https://api.${domain}`)
    const url = `https://images.${domain}/user/uploaded.jpg`
    mocks.query.single.mockResolvedValue({ data: { id: 'uploaded', url }, error: null })
    expect(await uploadImageFromUrlSafeAction(sourceUrl)).toEqual({
      success: true, image: { id: 'uploaded', url },
    })
    expect(mocks.fetch).toHaveBeenCalledWith(`https://api.${domain}/pipeline/upload-image-from-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user-jwt' },
      body: JSON.stringify({ imageUrl: sourceUrl, isCommonUse: false }),
      signal: expect.any(AbortSignal),
    })
    expect(mocks.client.from).toHaveBeenCalledWith('images')
    expect(mocks.query.eq).toHaveBeenCalledWith('id', 'uploaded')
    expect(classifyImageCategory).toHaveBeenCalledWith(mocks.client, 'uploaded', url)
  })

  it('preserves common-use uploads for existing callers', async () => {
    await uploadImageFromUrlAction(sourceUrl, true)
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual({
      imageUrl: sourceUrl, isCommonUse: true,
    })
  })

  it('preserves category metadata when the API reuses an existing image record', async () => {
    mocks.fetch.mockResolvedValue(Response.json({ imageId: 'uploaded', created: false, reused: true }))
    expect(await uploadImageFromUrlSafeAction(sourceUrl)).toEqual({ success: true, image: { id: 'uploaded', url: hostedUrl } })
    expect(classifyImageCategory).not.toHaveBeenCalled()
  })

  it.each(['almostcrackd.ai', 'crackd.ai'])('copies the opposite environment URL through the %s API', async (domain) => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', `https://api.${domain}`)
    const otherDomain = domain === 'crackd.ai' ? 'almostcrackd.ai' : 'crackd.ai'
    const inputUrl = `https://images.${otherDomain}/image.jpg`
    const url = `https://images.${domain}/user/copied.jpg`
    mocks.query.single.mockResolvedValue({ data: { id: 'uploaded', url }, error: null })
    expect(await uploadImageFromUrlSafeAction(inputUrl)).toEqual({
      success: true, image: { id: 'uploaded', url },
    })
    expect(mocks.fetch).toHaveBeenCalledWith(`https://api.${domain}/pipeline/upload-image-from-url`, expect.objectContaining({
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user-jwt' },
      body: JSON.stringify({ imageUrl: inputUrl, isCommonUse: false }),
    }))
  })

  it.each(['almostcrackd.ai', 'crackd.ai'])('finalizes private file uploads to the %s image CDN instead of storing the temporary URL', async (domain) => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', `https://api.${domain}`)
    const cdnUrl = `https://presigned-url-uploads.${domain}/user/file.jpg`
    const presignedUrl = 'https://upload.example/file.jpg?signature=example'
    const url = `https://images.${domain}/user/uploaded.jpg`
    mocks.query.single.mockResolvedValue({ data: { id: 'uploaded', url }, error: null })
    mocks.fetch
      .mockResolvedValueOnce(Response.json({ presignedUrl, cdnUrl }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    expect(await insertImageSafeAction({ base64: 'data:image/jpeg;base64,YWJj', contentType: 'image/jpeg', isPrivate: true })).toEqual({
      success: true, image: { id: 'uploaded', url },
    })
    expect(mocks.fetch).toHaveBeenNthCalledWith(1, `https://api.${domain}/pipeline/generate-presigned-url`, expect.objectContaining({
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user-jwt' },
      body: JSON.stringify({ contentType: 'image/jpeg' }),
    }))
    expect(mocks.fetch).toHaveBeenNthCalledWith(2, presignedUrl, {
      method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: Buffer.from('abc'),
    })
    expect(mocks.fetch).toHaveBeenNthCalledWith(3, `https://api.${domain}/pipeline/upload-image-from-url`, expect.objectContaining({
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user-jwt' },
      body: JSON.stringify({ imageUrl: cdnUrl, isCommonUse: false }),
    }))
    expect(mocks.query.insert).not.toHaveBeenCalled()
  })

  it('does not register the temporary file URL if API finalization fails', async () => {
    mocks.fetch
      .mockResolvedValueOnce(Response.json({ presignedUrl: 'https://upload.example/image.jpg', cdnUrl: 'https://presigned-url-uploads.almostcrackd.ai/image.jpg' }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response('Processing failed', { status: 500 }))
    expect(await insertImageSafeAction({ base64: 'YWJj', contentType: 'image/jpeg', isPrivate: true })).toEqual({
      error: 'Failed to upload image from URL: Processing failed',
    })
    expect(mocks.query.insert).not.toHaveBeenCalled()
  })

  it('returns API failures as data for the UI and never registers the source URL', async () => {
    mocks.fetch.mockResolvedValue(new Response('Source image unavailable', { status: 400 }))
    expect(await uploadImageFromUrlSafeAction(sourceUrl)).toEqual({
      error: 'Failed to upload image from URL: Source image unavailable',
    })
    expect(mocks.client.from).not.toHaveBeenCalled()
    expect(classifyImageCategory).not.toHaveBeenCalled()
  })

  it('requires a signed-in session before calling the API', async () => {
    mocks.client.auth.getUser.mockResolvedValue({ data: { user: null } })
    mocks.client.auth.getSession.mockResolvedValue({ data: { session: null } })
    mocks.client.auth.refreshSession.mockResolvedValue({ data: { session: null } })
    expect(await uploadImageFromUrlSafeAction(sourceUrl)).toEqual({
      error: 'Authentication failed. Please log in and try again.',
    })
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('does not fabricate an image when the API omits its ID', async () => {
    mocks.fetch.mockResolvedValue(Response.json({}))
    expect(await uploadImageFromUrlSafeAction(sourceUrl)).toEqual({ error: 'Upload did not return an image id.' })
    expect(mocks.client.from).not.toHaveBeenCalled()
  })

  it('reports database read errors instead of returning the source URL', async () => {
    mocks.query.single.mockResolvedValue({ data: null, error: { message: 'Read failed' } })
    expect(await uploadImageFromUrlSafeAction(sourceUrl)).toEqual({
      error: 'Could not load the uploaded image: Read failed',
    })
    expect(classifyImageCategory).not.toHaveBeenCalled()
  })

  it.each([null, { id: 'uploaded', url: null }, { id: 'uploaded', url: sourceUrl }])(
    'rejects saved images without a hosted URL: %j', async (data) => {
      mocks.query.single.mockResolvedValue({ data, error: null })
      expect(await uploadImageFromUrlSafeAction(sourceUrl)).toEqual({ error: 'Upload did not return a hosted image.' })
      expect(classifyImageCategory).not.toHaveBeenCalled()
    }
  )

  it.each(['almostcrackd.ai', 'crackd.ai'])('rejects a saved image in the opposite environment when uploading to %s', async (domain) => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', `https://api.${domain}`)
    const otherDomain = domain === 'crackd.ai' ? 'almostcrackd.ai' : 'crackd.ai'
    mocks.query.single.mockResolvedValue({ data: { id: 'uploaded', url: `https://images.${otherDomain}/image.jpg` }, error: null })
    expect(await uploadImageFromUrlSafeAction(sourceUrl)).toEqual({ error: 'Upload did not return a hosted image.' })
    expect(classifyImageCategory).not.toHaveBeenCalled()
  })
})
