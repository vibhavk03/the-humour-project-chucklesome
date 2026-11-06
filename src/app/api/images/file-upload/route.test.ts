import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ api: vi.fn(), after: vi.fn(), classify: vi.fn() }))
vi.mock('next/server', () => ({ after: mocks.after }))
vi.mock('@/utils/classify-file-upload', () => ({ classifyFileUpload: mocks.classify }))
vi.mock('@/utils/quick-study-job-api', () => ({
  quickStudyJobApi: mocks.api,
  quickStudyJobError: () => Response.json({ error: 'Please sign in again.' }, { status: 401 }),
}))
import { POST as prepare } from './prepare/route'
import { POST as complete } from './complete/route'
const hash = 'a'.repeat(64)
beforeEach(() => { vi.resetAllMocks(); mocks.api.mockResolvedValue({ imageId: 'image' }) })

describe('authenticated file upload proxy', () => {
  it.each([
    ['prepare', prepare, 'generate-presigned-url', { contentType: 'image/jpeg', sha256: hash }],
    ['complete', complete, 'upload-image-from-url', { imageUrl: 'https://temp.example/file', sha256: hash }],
  ] as const)('forwards the browser JWT through %s', async (path, handler, resource, body) => {
    const request = new Request(`http://localhost/api/images/file-upload/${path}`, {
      method: 'POST', headers: { Authorization: 'Bearer browser-jwt' }, body: JSON.stringify(body),
    })
    const response = await handler(request)
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(mocks.api).toHaveBeenCalledWith('', body, resource, request)
  })
  it.each([prepare, complete])('rejects a malformed hash before calling the API', async handler => {
    const response = await handler(new Request('http://localhost/api', { method: 'POST', body: JSON.stringify({ contentType: 'image/jpeg', imageUrl: 'https://temp.example/file', sha256: 'not-a-hash' }) }))
    expect(response.status).toBe(400)
    expect(mocks.api).not.toHaveBeenCalled()
  })
  it('returns JSON authentication errors', async () => {
    mocks.api.mockRejectedValue(new Error('Unauthorized'))
    expect((await prepare(new Request('http://localhost/api', { method: 'POST', body: JSON.stringify({ contentType: 'image/jpeg', sha256: hash }) }))).status).toBe(401)
  })
  it('schedules classification after new file uploads and leaves reused records alone', async () => {
    const request = () => new Request('http://localhost/api', { method: 'POST', headers: { Authorization: 'Bearer browser-jwt' }, body: JSON.stringify({ imageUrl: 'https://temp.example/file', sha256: hash }) })
    mocks.api.mockResolvedValue({ imageId: 'new', imageUrl: 'https://images.almostcrackd.ai/new.jpg', created: true })
    expect((await complete(request())).status).toBe(200)
    expect(mocks.after).toHaveBeenCalledOnce()
    expect(mocks.classify).not.toHaveBeenCalled()
    await mocks.after.mock.calls[0][0]()
    expect(mocks.classify).toHaveBeenCalledWith('Bearer browser-jwt', 'new', 'https://images.almostcrackd.ai/new.jpg')
    mocks.after.mockClear()
    mocks.api.mockResolvedValue({ imageId: 'existing', imageUrl: 'https://images.almostcrackd.ai/old.jpg', created: false })
    await complete(request())
    expect(mocks.after).not.toHaveBeenCalled()
  })
})
