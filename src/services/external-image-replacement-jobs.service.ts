import type {
  ExternalImageReplacementAlerts,
  ExternalImageReplacementJobs,
  ImageReplacementStatus,
} from '@/types/external-image-replacement-job'
import { isUUID } from '@/utils/utils'
import { getJobRequestHeaders } from '@/utils/job-request-headers'

async function request<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal
): Promise<T> {
  const headers = await getJobRequestHeaders()
  signal?.throwIfAborted()
  const response = await fetch(`/api/external-image-replacement-jobs${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20_000)])
      : AbortSignal.timeout(20_000),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok || !result)
    throw new Error(
      typeof result?.error === 'string'
        ? result.error
        : 'Could not load image replacement jobs. Try again.'
    )
  return result as T
}
export const ExternalImageReplacementJobsService = {
  list(
    filters: {
      status?: ImageReplacementStatus | ''
      mine?: boolean
      offset?: number
    },
    signal?: AbortSignal
  ) {
    const query = new URLSearchParams({
      offset: String(filters.offset ?? 0),
      mine: String(filters.mine ?? false),
    })
    if (filters.status) query.set('status', filters.status)
    return request<ExternalImageReplacementJobs>(`?${query}`, undefined, signal)
  },
  alerts(signal?: AbortSignal) {
    return request<ExternalImageReplacementAlerts>('/alerts', undefined, signal)
  },
  retry(jobId: string) {
    if (!isUUID(jobId))
      return Promise.reject(new Error('Invalid image replacement job ID.'))
    return request<{ jobId: string; queued: boolean }>(`/${jobId}/retry`, {})
  },
  acknowledge(before: string) {
    return request<{ acknowledged: number }>('/acknowledge', { before })
  },
}
