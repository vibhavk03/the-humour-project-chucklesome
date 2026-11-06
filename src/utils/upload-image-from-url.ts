import 'server-only'
import { createClient } from '@/utils/supabase/server'
import { isHostedImageUrl } from '@/utils/hosted-image-url'
import { getImageUploadHttpError } from '@/utils/image-upload-error'

export class ImageUploadError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

// Shared by server actions and the concurrent Quick Study upload route. Return
// only after nonchalant has saved the image and its canonical URL is verified.
export async function uploadImageFromUrl(url: string, isCommonUse = false, sha256?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  let { data: { session } } = await supabase.auth.getSession()

  if (!user || !session) {
    const { data: { session: refreshedSession } } = await supabase.auth.refreshSession()
    if (!refreshedSession) {
      throw new ImageUploadError('Authentication failed. Please log in and try again.', 401)
    }
    session = refreshedSession
  }
  if (!session.access_token) {
    throw new ImageUploadError('Unable to get access token. Please log in again.', 401)
  }

  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.almostcrackd.ai'
  // Bound legacy synchronous uploads. Quick Study imports use durable jobs.
  const signal = AbortSignal.timeout(110_000)
  let imageId: unknown
  let created = true
  try {
    const response = await fetch(`${baseUrl}/pipeline/upload-image-from-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ imageUrl: url, isCommonUse, ...(sha256 ? { sha256 } : {}) }),
      signal,
    })
    if (!response.ok) {
      let message = await response.text().catch(() => '')
      // CloudFront error pages and empty bodies must not replace a usable error.
      if (response.status === 504) {
        throw new ImageUploadError(getImageUploadHttpError(504), 504)
      }
      try {
        const errorBody = JSON.parse(message)
        message = typeof errorBody?.message === 'string' ? errorBody.message : ''
      } catch {
        if (message.trim().startsWith('<')) message = ''
      }
      throw new ImageUploadError(
        message ? `Failed to upload image from URL: ${message}` : getImageUploadHttpError(response.status),
        response.status
      )
    }

    const body = await response.json()
    imageId = body?.imageId ?? body?.id ?? body?.image?.id
    created = body?.created !== false
  } catch (error) {
    if (signal.aborted) throw new ImageUploadError(getImageUploadHttpError(504), 504)
    throw error
  }
  if (typeof imageId !== 'string' || !imageId) {
    throw new ImageUploadError('Upload did not return an image id.', 502)
  }

  const { data: savedImage, error } = await supabase
    .from('images')
    .select('id, url')
    .eq('id', imageId)
    .single()
  if (error) throw new ImageUploadError(`Could not load the uploaded image: ${error.message}`, 500)
  if (!savedImage?.url || !isHostedImageUrl(savedImage.url)) {
    throw new ImageUploadError('Upload did not return a hosted image.', 502)
  }

  return { image: { id: savedImage.id, url: savedImage.url }, supabase, created }
}
