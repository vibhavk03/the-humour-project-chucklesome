import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import { getSupabaseConfig } from '@/utils/supabase/config'
import { classifyImageCategory } from '@/utils/classify-image-category'
import { isHostedImageUrl } from '@/utils/hosted-image-url'

// Preserve the existing best-effort category classification for new file
// uploads, using the same JWT as the upload. Reused records are left untouched.
export async function classifyFileUpload(authorization: string | null, imageId: string, imageUrl: string) {
  try {
    if (!process.env.GOOGLE_AI_API_KEY || !authorization || !isHostedImageUrl(imageUrl)) return
    const { supabaseUrl, supabaseKey } = getSupabaseConfig()
    if (!supabaseUrl || !supabaseKey) return
    const client = createClient<Database>(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const saved = await client.from('images').select('id,url').eq('id', imageId).single()
    if (!saved.error && saved.data?.url === imageUrl)
      await classifyImageCategory(client, imageId, imageUrl)
  } catch {
    // Classification is optional and must not change upload success.
  }
}
