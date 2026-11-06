import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const query = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    limit: vi.fn(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
  }
  return { query, client: { from: vi.fn(), auth: { getUser: vi.fn() } }, fetch: vi.fn() }
})
vi.mock('@/utils/supabase/client', () => ({ supabase: mocks.client }))
import { CaptionService } from './captions.service'
import { ImageService } from './images.service'

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://api.almostcrackd.ai')
  vi.stubGlobal('fetch', mocks.fetch)
  mocks.client.from.mockReturnValue(mocks.query)
  mocks.client.auth.getUser.mockResolvedValue({
    data: { user: { id: 'admin-id' } },
    error: null,
  })
  for (const method of ['select', 'insert', 'update', 'eq', 'limit'] as const)
    mocks.query[method].mockReturnValue(mocks.query)
  mocks.query.single.mockResolvedValue({ data: { id: 'new-id' }, error: null })
  mocks.query.maybeSingle.mockResolvedValue({ data: null, error: null })
  mocks.fetch.mockResolvedValue(Response.json({
    image: { id: 'uploaded', url: 'https://images.almostcrackd.ai/user/uploaded.jpg' },
  }))
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('Quick Study draft privacy', () => {
  it("creates captions privately using the logged-in user's audit fields", async () => {
    await CaptionService.createCaption('A joke', 'image-id')
    expect(mocks.query.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        is_public: false,
        profile_id: 'admin-id',
        created_by_user_id: 'admin-id',
      }),
    ])
  })

  it('registers new hosted image URLs privately with user audit fields', async () => {
    await ImageService.registerImageUrl('https://images.almostcrackd.ai/image.jpg')
    expect(mocks.query.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        url: 'https://images.almostcrackd.ai/image.jpg',
        is_public: false,
        is_common_use: false,
        created_by_user_id: 'admin-id',
        modified_by_user_id: 'admin-id',
      }),
    ])
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it.each([true, false])(
    "does not change a reused image's visibility (%s)",
    async (isPublic) => {
      mocks.query.maybeSingle.mockResolvedValue({
        data: { id: 'existing', is_public: isPublic },
        error: null,
      })
      expect(
        await ImageService.registerImageUrl('https://images.almostcrackd.ai/image.jpg')
      ).toEqual({ id: 'existing', url: 'https://images.almostcrackd.ai/image.jpg' })
      expect(mocks.query.insert).not.toHaveBeenCalled()
      expect(mocks.query.update).not.toHaveBeenCalled()
      expect(mocks.fetch).not.toHaveBeenCalled()
    }
  )

  it('uploads external URLs even if an old external image row already exists', async () => {
    mocks.query.maybeSingle.mockResolvedValue({ data: { id: 'old-external' }, error: null })
    expect(await ImageService.registerImageUrl(' https://example.com/image.jpg ')).toEqual({
      id: 'uploaded', url: 'https://images.almostcrackd.ai/user/uploaded.jpg',
    })
    expect(mocks.fetch).toHaveBeenCalledWith('/api/study-quick/images', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl: 'https://example.com/image.jpg' }),
    })
    // The API creates the hosted record; the browser must not insert the source URL.
    expect(mocks.client.from).not.toHaveBeenCalled()
  })

  it('does not insert an external URL when its upload fails', async () => {
    mocks.fetch.mockResolvedValue(Response.json({ error: 'Source image unavailable' }, { status: 400 }))
    expect(await ImageService.registerImageUrl('https://example.com/image.jpg')).toEqual({
      error: 'Source image unavailable',
    })
    expect(mocks.query.insert).not.toHaveBeenCalled()
  })

  it.each(['almostcrackd.ai', 'crackd.ai'])('copies the opposite environment image to %s rather than reusing a legacy row', async (domain) => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', `https://api.${domain}`)
    const otherDomain = domain === 'crackd.ai' ? 'almostcrackd.ai' : 'crackd.ai'
    const sourceUrl = `https://images.${otherDomain}/image.jpg`
    const url = `https://images.${domain}/user/uploaded.jpg`
    mocks.query.maybeSingle.mockResolvedValue({ data: { id: 'old-cross-environment' }, error: null })
    mocks.fetch.mockResolvedValue(Response.json({ image: { id: 'uploaded', url } }))
    expect(await ImageService.registerImageUrl(sourceUrl)).toEqual({ id: 'uploaded', url })
    expect(mocks.fetch).toHaveBeenCalledWith('/api/study-quick/images', expect.objectContaining({
      body: JSON.stringify({ imageUrl: sourceUrl }),
    }))
    expect(mocks.client.from).not.toHaveBeenCalled()
  })

  it('registers production URLs directly in production', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://api.crackd.ai')
    await ImageService.registerImageUrl('https://images.crackd.ai/image.jpg')
    expect(mocks.query.insert).toHaveBeenCalledWith([
      expect.objectContaining({ url: 'https://images.crackd.ai/image.jpg', is_public: false }),
    ])
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it.each([
    {},
    { image: { id: 'uploaded', url: 'https://example.com/image.jpg' } },
    { image: { id: 'uploaded', url: 'https://images.crackd.ai/image.jpg' } },
    { image: { id: 'uploaded' } },
  ])('rejects upload results without a hosted image: %j', async (result) => {
    mocks.fetch.mockResolvedValue(Response.json(result))
    expect(await ImageService.registerImageUrl('https://example.com/image.jpg')).toEqual({
      error: 'Upload did not return a hosted image.',
    })
    expect(mocks.query.insert).not.toHaveBeenCalled()
  })

  it('starts external upload requests concurrently without the Server Action queue', async () => {
    const pending: Array<(response: Response) => void> = []
    mocks.fetch.mockImplementation(() => new Promise<Response>(resolve => pending.push(resolve)))
    const uploads = Promise.all(Array.from({ length: 5 }, (_, index) =>
      ImageService.registerImageUrl(`https://example.com/image-${index}.jpg`)
    ))
    // No response has resolved yet, but all five HTTP uploads have started.
    expect(mocks.fetch).toHaveBeenCalledTimes(5)
    for (const resolve of pending) {
      resolve(Response.json({ image: { id: 'uploaded', url: 'https://images.almostcrackd.ai/image.jpg' } }))
    }
    expect((await uploads).every(result => result.id === 'uploaded')).toBe(true)
    expect(mocks.query.insert).not.toHaveBeenCalled()
  })

  it('returns a usable error for an HTTP failure without a JSON response', async () => {
    mocks.fetch.mockResolvedValue(new Response('Bad gateway', { status: 502 }))
    expect(await ImageService.registerImageUrl('https://example.com/image.jpg')).toEqual({
      error: 'Could not upload the image (HTTP 502). Please try again.',
    })
    expect(mocks.query.insert).not.toHaveBeenCalled()
  })

  it.each(['', '<html><body>504 Gateway Timeout</body></html>'])('identifies a proxy timeout with body %j without inserting or retrying', async (body) => {
    mocks.fetch.mockResolvedValue(new Response(body, { status: 504 }))
    expect(await ImageService.registerImageUrl('https://example.com/image.jpg')).toEqual({
      error: 'The image upload timed out (HTTP 504). Try a smaller image or a different image URL.',
    })
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(mocks.client.from).not.toHaveBeenCalled()
  })

  it('returns the hosted image without waiting for slow background classification', async () => {
    let finishClassification!: (response: Response) => void
    mocks.fetch
      .mockResolvedValueOnce(Response.json({
        image: { id: 'uploaded', url: 'https://images.almostcrackd.ai/image.jpg' }, needsClassification: true,
      }))
      .mockImplementationOnce(() => new Promise<Response>(resolve => { finishClassification = resolve }))
    expect(await ImageService.registerImageUrl('https://external.example/image.jpg')).toEqual({
      id: 'uploaded', url: 'https://images.almostcrackd.ai/image.jpg',
    })
    expect(mocks.fetch).toHaveBeenNthCalledWith(2, '/api/study-quick/images/classify', {
      method: 'POST', credentials: 'same-origin', keepalive: true,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageId: 'uploaded' }),
    })
    finishClassification(new Response(null, { status: 200 }))
  })

  it('does not fail the upload when optional classification cannot be requested', async () => {
    mocks.fetch
      .mockResolvedValueOnce(Response.json({
        image: { id: 'uploaded', url: 'https://images.almostcrackd.ai/image.jpg' }, needsClassification: true,
      }))
      .mockRejectedValueOnce(new Error('Classification unavailable'))
    expect(await ImageService.registerImageUrl('https://external.example/image.jpg')).toEqual({
      id: 'uploaded', url: 'https://images.almostcrackd.ai/image.jpg',
    })
  })
})
