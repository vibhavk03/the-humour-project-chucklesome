import { supabase } from '@/utils/supabase/client'

// Send the browser's current session explicitly. Localhost cookies are shared
// across ports, so job requests must not depend solely on the server's cookies.
export async function getJobRequestHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (supabase) {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession()
    if (error) throw new Error('Please sign in again.')
    if (session?.access_token)
      headers.Authorization = `Bearer ${session.access_token}`
  }
  return headers
}
