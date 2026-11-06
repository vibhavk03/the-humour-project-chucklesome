import { createClient } from '@/utils/supabase/server'
import { classifyImageCategory } from '@/utils/classify-image-category'
import { isHostedImageUrl } from '@/utils/hosted-image-url'
import { isUUID } from '@/utils/utils'

export async function POST(request: Request) {
  let imageId: string
  try {
    const body: unknown = await request.json()
    if (!body || typeof body !== 'object' || !('imageId' in body) || typeof body.imageId !== 'string' || !isUUID(body.imageId)) {
      throw new Error('Invalid image ID.')
    }
    imageId = body.imageId
  } catch {
    return Response.json({ error: 'A valid image ID is required.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Authentication required.' }, { status: 401 })
  const { data: image, error } = await supabase
    .from('images')
    .select('id, url')
    .eq('id', imageId)
    .eq('profile_id', user.id)
    .maybeSingle()
  if (error) return Response.json({ error: 'Could not load the image.' }, { status: 500 })
  if (!image) return Response.json({ error: 'Image not found.' }, { status: 404 })
  if (!image.url || !isHostedImageUrl(image.url)) {
    return Response.json({ error: 'Image must be hosted in this environment.' }, { status: 400 })
  }

  await classifyImageCategory(supabase, image.id, image.url)
  return Response.json({ success: true })
}
