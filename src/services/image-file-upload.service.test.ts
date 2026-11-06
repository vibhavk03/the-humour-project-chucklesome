import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { File } from 'node:buffer'
import { webcrypto } from 'node:crypto'

const mocks = vi.hoisted(() => ({ headers: vi.fn(), prepare: vi.fn(), upload: vi.fn(), fetch: vi.fn() }))
vi.mock('@/utils/job-request-headers', () => ({ getJobRequestHeaders: mocks.headers }))
vi.mock('@/utils/supabase/client', () => ({ supabase: null }))
vi.mock('@/utils/upload-utils', () => ({ prepareImageFileForUpload: mocks.prepare, uploadFileToPresignedUrl: mocks.upload }))
import { imageFileSha256, uploadImageFile } from './image-file-upload.service'

const hash = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
const image = { id: 'existing', url: 'https://images.almostcrackd.ai/sha256/file.jpg' }
const file = () => new File(['abc'], 'photo.jpg', { type: 'image/jpeg' }) as unknown as globalThis.File

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal('fetch', mocks.fetch)
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://api.almostcrackd.ai')
  mocks.headers.mockResolvedValue({ 'Content-Type': 'application/json', Authorization: 'Bearer user-jwt' })
  mocks.prepare.mockImplementation(async value => value)
  mocks.upload.mockResolvedValue(undefined)
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers() })

describe('file upload duplicate checking', () => {
  it('hashes file bytes independently of its name', async () => {
    expect(await imageFileSha256(file())).toBe(hash)
    expect(await imageFileSha256(new File(['abc'], 'renamed.png') as unknown as globalThis.File)).toBe(hash)
  })
  it('reuses a matching image without transferring the file', async () => {
    mocks.fetch.mockResolvedValue(Response.json({ image, reused: true }))
    expect(await uploadImageFile(file())).toEqual({ image, reused: true })
    expect(mocks.fetch).toHaveBeenCalledOnce()
    expect(mocks.fetch).toHaveBeenCalledWith('/api/images/file-upload/prepare', expect.objectContaining({
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user-jwt' },
      body: JSON.stringify({ contentType: 'image/jpeg', sha256: hash, isCommonUse: false }),
    }))
    expect(mocks.upload).not.toHaveBeenCalled()
  })
  it('hashes the compressed bytes and uploads that exact file once', async () => {
    const compressed = new File(['abc'], 'compressed.jpg', { type: 'image/jpeg' }) as unknown as globalThis.File
    mocks.prepare.mockResolvedValue(compressed)
    mocks.fetch.mockResolvedValueOnce(Response.json({ presignedUrl: 'https://s3.example/put', cdnUrl: 'https://temp.example/file' }))
      .mockResolvedValueOnce(Response.json({ imageId: image.id, imageUrl: image.url }))
    expect(await uploadImageFile(new File(['original'], 'original.png') as unknown as globalThis.File, { isCommonUse: true, compressionEnabled: true })).toEqual({ image, reused: false })
    expect(mocks.upload).toHaveBeenCalledWith(compressed, 'https://s3.example/put', expect.objectContaining({ compressionEnabled: false }))
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual({ contentType: 'image/jpeg', sha256: hash, isCommonUse: true })
    expect(JSON.parse(mocks.fetch.mock.calls[1][1].body)).toEqual({ imageUrl: 'https://temp.example/file', sha256: hash, isCommonUse: true })
  })
  it('shares simultaneous identical file uploads within a session', async () => {
    let finish: (() => void) | undefined
    mocks.fetch.mockImplementation(() => new Promise(resolve => { finish = () => resolve(Response.json({ image })) }))
    const uploads = [uploadImageFile(file()), uploadImageFile(file())]
    await vi.waitFor(() => expect(mocks.headers).toHaveBeenCalledTimes(3))
    expect(mocks.fetch).toHaveBeenCalledOnce()
    finish?.()
    const results = await Promise.all(uploads)
    expect(results[0]).toEqual(results[1])
    expect(mocks.fetch).toHaveBeenCalledOnce()
  })
  it('keeps common-use and private checks separate', async () => {
    mocks.fetch.mockImplementation(async () => Response.json({ image }))
    await Promise.all([uploadImageFile(file()), uploadImageFile(file(), { isCommonUse: true })])
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
  })
  it('clears failed requests so a retry can succeed', async () => {
    mocks.fetch.mockRejectedValueOnce(new Error('Network failure'))
    await expect(uploadImageFile(file())).rejects.toThrow('Network failure')
    mocks.fetch.mockResolvedValueOnce(Response.json({ image }))
    expect(await uploadImageFile(file())).toEqual({ image, reused: true })
  })
  it('requires a user JWT before asking for an upload URL', async () => {
    mocks.headers.mockResolvedValue({})
    await expect(uploadImageFile(file())).rejects.toThrow('Please sign in again.')
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it('rejects duplicates hosted in the other environment', async () => {
    mocks.fetch.mockResolvedValue(Response.json({ image: { id: 'wrong', url: 'https://images.crackd.ai/file.jpg' } }))
    await expect(uploadImageFile(file())).rejects.toThrow('Upload did not return a hosted image.')
    expect(mocks.upload).not.toHaveBeenCalled()
  })
  it('returns hash verification errors from the API', async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ presignedUrl: 'https://s3.example/put', cdnUrl: 'https://temp.example/file' }))
      .mockResolvedValueOnce(Response.json({ error: 'Uploaded image does not match its SHA-256 hash' }, { status: 400 }))
    await expect(uploadImageFile(file())).rejects.toThrow('does not match its SHA-256 hash')
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
  })
  it('retries a competing upload without uploading the temporary file twice', async () => {
    vi.useFakeTimers()
    mocks.fetch.mockResolvedValueOnce(Response.json({ presignedUrl: 'https://s3.example/put', cdnUrl: 'https://temp.example/file' }))
      .mockResolvedValueOnce(Response.json({ error: 'Busy' }, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ imageId: image.id, imageUrl: image.url, reused: true }))
    const result = uploadImageFile(file())
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2))
    await vi.advanceTimersByTimeAsync(500)
    expect(await result).toEqual({ image, reused: true })
    expect(mocks.upload).toHaveBeenCalledOnce()
  })
})
