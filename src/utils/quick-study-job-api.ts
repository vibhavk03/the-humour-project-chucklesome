import 'server-only'
import { createClient } from '@/utils/supabase/server'

export class QuickStudyApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

// Short authenticated requests submit or inspect durable work. The user's JWT
// stays in the request; it is never stored in the job or its queue messages.
export async function quickStudyJobApi(
  path: string,
  body?: unknown,
  resource:
    | 'quick-study-job'
    | 'external-image-replacement-jobs'
    | 'generate-presigned-url'
    | 'upload-image-from-url' = 'quick-study-job',
  request?: Request
) {
  const supabase = await createClient()
  const authorization = request?.headers.get('Authorization')
  let token: string | undefined
  if (authorization !== undefined && authorization !== null) {
    token = /^Bearer\s+(\S+)$/i.exec(authorization)?.[1]
    if (!token) throw new QuickStudyApiError('Please sign in again.', 401)
  }
  const {
    data: { user },
  } = token ? await supabase.auth.getUser(token) : await supabase.auth.getUser()
  if (!user) throw new QuickStudyApiError('Please sign in again.', 401)
  if (!token) {
    let {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.access_token) {
      const refreshed = await supabase.auth.refreshSession()
      session = refreshed.data.session
    }
    token = session?.access_token
  }
  if (!token) throw new QuickStudyApiError('Please sign in again.', 401)
  const base =
    process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.almostcrackd.ai'
  const imageRequest = resource === 'generate-presigned-url' || resource === 'upload-image-from-url'
  const serviceName = imageRequest ? 'image service' : 'import service'
  try {
    const response = await fetch(`${base}/pipeline/${resource}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store',
      signal: AbortSignal.timeout(resource === 'upload-image-from-url' ? 110_000 : 15_000),
    })
    const result = await response.json().catch(() => null)
    if (!response.ok) {
      const message =
        typeof result?.message === 'string' ? result.message : null
      throw new QuickStudyApiError(
        message ||
          `Could not contact the ${serviceName} (HTTP ${response.status}).`,
        response.status
      )
    }
    if (!result)
      throw new QuickStudyApiError(
        `The ${serviceName} returned an invalid response.`,
        502
      )
    return result
  } catch (error) {
    if (error instanceof QuickStudyApiError) throw error
    throw new QuickStudyApiError(
      imageRequest ? 'Could not contact the image service. Please retry.' : 'Could not contact the import service. Retry to reconnect to the same job.',
      503
    )
  }
}

export function quickStudyJobError(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof QuickStudyApiError
          ? error.message
          : 'Could not contact the import service.',
    },
    {
      status: error instanceof QuickStudyApiError ? error.status : 500,
      headers: { 'Cache-Control': 'no-store' },
    }
  )
}
