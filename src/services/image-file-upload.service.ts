import { getJobRequestHeaders } from '@/utils/job-request-headers'
import { isHostedImageUrl } from '@/utils/hosted-image-url'
import { getImageUploadHttpError } from '@/utils/image-upload-error'
import { prepareImageFileForUpload, uploadFileToPresignedUrl } from '@/utils/upload-utils'
import { supabase } from '@/utils/supabase/client'

export type UploadedFileImage = { id: string; url: string }
type UploadOptions = {
  isCommonUse?: boolean
  compressionEnabled?: boolean
  onProgress?: (progress: { loaded: number; total: number; percentage: number }) => void
}
const activeUploads = new Map<string, Promise<{ image: UploadedFileImage; reused: boolean }>>()

export async function imageFileSha256(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function checkedImage(value: unknown): UploadedFileImage {
  const image = value as Partial<UploadedFileImage> | null
  if (!image || typeof image.id !== 'string' || !image.id || typeof image.url !== 'string' || !isHostedImageUrl(image.url))
    throw new Error('Upload did not return a hosted image.')
  return { id: image.id, url: image.url }
}

async function imageApi(path: string, body: unknown) {
  const headers = await getJobRequestHeaders()
  if (!headers.Authorization) throw new Error('Please sign in again.')
  const response = await fetch(`/api/images/file-upload/${path}`, {
    method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(110_000),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(typeof result?.error === 'string' ? result.error : getImageUploadHttpError(response.status))
    throw Object.assign(error, { status: response.status })
  }
  if (!result) throw new Error('The upload service returned an invalid response.')
  return result
}

async function uploadPreparedFile(file: File, sha256: string, options: UploadOptions) {
  const isCommonUse = options.isCommonUse ?? false
  const prepared = await imageApi('prepare', { contentType: file.type, sha256, isCommonUse })
  if (prepared.image) return { image: checkedImage(prepared.image), reused: true }
  if (typeof prepared.presignedUrl !== 'string' || typeof prepared.cdnUrl !== 'string')
    throw new Error('The upload service did not return an upload URL.')
  await uploadFileToPresignedUrl(file, prepared.presignedUrl, {
    compressionEnabled: false, maxRetries: 3, onProgress: options.onProgress,
  })
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await imageApi('complete', { imageUrl: prepared.cdnUrl, sha256, isCommonUse })
      let image: unknown = { id: result.imageId, url: result.imageUrl }
      // Supports an API deployment that still returns only the saved image ID.
      if (!result.imageUrl && typeof result.imageId === 'string' && supabase) {
        const saved = await supabase.from('images').select('id,url').eq('id', result.imageId).single()
        if (saved.error) throw saved.error
        image = saved.data
      }
      return { image: checkedImage(image), reused: result.reused === true }
    } catch (error) {
      if ((error as { status?: number }).status !== 409 || attempt >= 4) throw error
      await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt))
    }
  }
}

// Hash the bytes actually sent to S3, after any optional compression. Share work
// for identical files submitted concurrently by the same signed-in session.
export async function uploadImageFile(file: File, options: UploadOptions = {}) {
  const prepared = await prepareImageFileForUpload(file, options.compressionEnabled)
  const sha256 = await imageFileSha256(prepared)
  const headers = await getJobRequestHeaders()
  if (!headers.Authorization) throw new Error('Please sign in again.')
  const key = `${process.env.NEXT_PUBLIC_API_BASE_URL}:${headers.Authorization}:${options.isCommonUse === true}:${sha256}`
  const active = activeUploads.get(key)
  if (active) return active
  const upload = uploadPreparedFile(prepared, sha256, options)
  activeUploads.set(key, upload)
  try {
    return await upload
  } finally {
    activeUploads.delete(key)
  }
}
