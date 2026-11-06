import { ImageUploadError, uploadImageFromUrl } from '@/utils/upload-image-from-url'

export async function POST(request: Request) {
  const startedAt = Date.now()
  let imageUrl: string
  try {
    const body: unknown = await request.json()
    if (!body || typeof body !== 'object' || !('imageUrl' in body) || typeof body.imageUrl !== 'string') {
      throw new Error('Missing image URL.')
    }
    imageUrl = body.imageUrl.trim()
    if (!['http:', 'https:'].includes(new URL(imageUrl).protocol)) {
      throw new Error('Unsupported image URL.')
    }
  } catch {
    return Response.json({ error: 'A valid HTTP or HTTPS image URL is required.' }, { status: 400 })
  }

  try {
    // Ordinary HTTP requests can run concurrently; client Server Actions queue.
    const { image } = await uploadImageFromUrl(imageUrl, false)
    // Our AWS adapter buffers responses until after() completes. Let the client
    // request best-effort classification separately so it cannot delay uploads.
    return Response.json({ image, success: true, needsClassification: !!process.env.GOOGLE_AI_API_KEY })
  } catch (error) {
    const status = error instanceof ImageUploadError ? error.status : 500
    console.error('Quick Study image upload failed', {
      status,
      elapsedMs: Date.now() - startedAt,
      sourceHost: new URL(imageUrl).hostname,
    })
    return Response.json({
      error: error instanceof Error ? error.message : 'Could not upload the image.',
    }, { status })
  }
}
