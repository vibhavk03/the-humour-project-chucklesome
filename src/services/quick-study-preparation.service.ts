import { isHostedImageUrl } from '@/utils/hosted-image-url'
import { getJobRequestHeaders } from '@/utils/job-request-headers'

export type QuickStudyCaption = {
  key: string
  imageId: string | null
  pendingUrl: string | null
  previewUrl: string | null
  caption: string
  captionId?: string | null
  status:
    | 'ready'
    | 'needs-upload'
    | 'invalid'
    | 'generating'
    | 'complete'
    | 'error'
  message?: string | null
  flavorId?: number | null
  userId?: string | null
  meta?: Record<string, unknown> | null
}

export type QuickStudyJobRequest = {
  jobId: string
  rows: Array<{
    key: string
    imageId: string | null
    imageUrl: string
    caption: string
    flavorId: number | null
    userId: string | null
    meta: Record<string, unknown> | null
  }>
}
export type QuickStudyJobStatus = {
  jobId: string
  status: 'queued' | 'running' | 'completed' | 'partially_completed' | 'failed'
  progress: { total: number; completed: number; failed: number }
  rows: QuickStudyCaption[]
  needsClassification?: boolean
  savedImmediately?: boolean
  replacementsPending?: number
}

export class QuickStudyJobError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

export function createQuickStudyJobRequest(
  rows: QuickStudyCaption[],
  jobId: string = crypto.randomUUID()
): QuickStudyJobRequest {
  if (!rows.length || rows.length > 2000)
    throw new Error('Import between 1 and 2,000 captions at a time.')
  const request = {
    jobId,
    rows: rows.map((row) => ({
      key: row.key,
      imageId: row.imageId,
      imageUrl: (row.pendingUrl ?? row.previewUrl ?? '').trim(),
      caption: row.caption.trim(),
      flavorId:
        row.flavorId != null && Number.isSafeInteger(row.flavorId)
          ? row.flavorId
          : null,
      userId: row.userId ?? null,
      meta: row.meta ?? null,
    })),
  }
  for (const row of request.rows) {
    let validUrl = false
    try {
      validUrl = ['http:', 'https:'].includes(new URL(row.imageUrl).protocol)
    } catch {
      validUrl = false
    }
    if (!validUrl)
      throw new Error('Every caption needs a valid HTTP or HTTPS image URL.')
    if (!row.caption || row.caption.length > 100_000)
      throw new Error('Each caption needs between 1 and 100,000 characters.')
  }
  if (
    new TextEncoder().encode(JSON.stringify(request)).byteLength > 4_000_000
  ) {
    throw new Error('Import is too large; split it into smaller lists.')
  }
  return request
}

async function requestJob(path: string, body?: unknown, signal?: AbortSignal) {
  const headers = await getJobRequestHeaders()
  signal?.throwIfAborted()
  const response = await fetch(`/api/study-quick/jobs${path}`, {
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
  if (!response.ok)
    throw new QuickStudyJobError(
      typeof result?.error === 'string'
        ? result.error
        : `Could not contact the import service (HTTP ${response.status}). Retry to reconnect to the same job.`,
      response.status
    )
  if (!result)
    throw new QuickStudyJobError(
      'The import service returned an invalid response.',
      502
    )
  return result
}

// Resubmitting this exact request after a lost response is safe: the backend
// compares immutable inputs and returns the same committed job.
export async function submitQuickStudyJob(request: QuickStudyJobRequest) {
  const result = await requestJob('', request)
  if (result.jobId !== request.jobId)
    throw new QuickStudyJobError(
      'The import service returned the wrong job.',
      502
    )
  if (result.savedImmediately === true)
    validateQuickStudyJob(result, request.jobId)
  return result as QuickStudyJobStatus
}
export async function retryQuickStudyJob(jobId: string) {
  const result = await requestJob(`/${jobId}/retry`, {})
  if (result.jobId !== jobId)
    throw new QuickStudyJobError(
      'The import service returned the wrong job.',
      502
    )
}
export async function getQuickStudyJob(
  jobId: string,
  signal?: AbortSignal
): Promise<QuickStudyJobStatus> {
  const job = (await requestJob(
    `/${jobId}`,
    undefined,
    signal
  )) as QuickStudyJobStatus
  validateQuickStudyJob(job, jobId)
  return job
}

function isHttpUrl(value: string) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

function validateQuickStudyJob(job: QuickStudyJobStatus, jobId: string) {
  if (
    job.jobId !== jobId ||
    !Array.isArray(job.rows) ||
    ![
      'queued',
      'running',
      'completed',
      'partially_completed',
      'failed',
    ].includes(job.status)
  ) {
    throw new QuickStudyJobError(
      'The import service returned an invalid job.',
      502
    )
  }
  if (
    job.rows.some(
      (row) =>
        row.status === 'complete' &&
        (!row.imageId ||
          !row.captionId ||
          !row.previewUrl ||
          !isHttpUrl(row.previewUrl) ||
          (job.savedImmediately !== true && !isHostedImageUrl(row.previewUrl)))
    )
  ) {
    throw new QuickStudyJobError(
      'A saved image does not belong to this environment.',
      422
    )
  }
}

export function mergeQuickStudyProgress(
  current: QuickStudyCaption[],
  incoming: QuickStudyCaption[]
) {
  const updates = new Map(incoming.map((row) => [row.key, row]))
  // Polling never restores a deleted row or overwrites an edited saved caption.
  return current.map((row) =>
    row.status === 'complete'
      ? {
          ...row,
          previewUrl: updates.get(row.key)?.previewUrl ?? row.previewUrl,
        }
      : { ...row, ...updates.get(row.key) }
  )
}

export function isQuickStudyJobFinished(job: QuickStudyJobStatus) {
  return ['completed', 'partially_completed', 'failed'].includes(job.status)
}

function waitForPoll(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
    if (signal.aborted) done()
  })
}

// Losing the page only stops observation. Workers and scheduled dispatch keep
// running. Temporary network failures never mark persisted tasks as failed.
export async function watchQuickStudyJob(
  jobId: string,
  options: {
    signal: AbortSignal
    savedImmediately?: boolean
    classifiedImages?: Set<string>
    onProgress: (job: QuickStudyJobStatus) => void
    onConnectionError: (message: string, terminal: boolean) => void
  }
) {
  let failures = 0
  let pollInterval = 2000
  let imagesOnly = options.savedImmediately === true
  const classified = options.classifiedImages ?? new Set<string>()
  while (!options.signal.aborted) {
    try {
      const job = await getQuickStudyJob(jobId, options.signal)
      if (options.signal.aborted) return
      failures = 0
      imagesOnly = job.savedImmediately === true
      options.onProgress(job)
      pollInterval = job.savedImmediately ? 10_000 : 2000
      if (job.needsClassification) {
        for (const row of job.rows) {
          if (
            row.status !== 'complete' ||
            !row.imageId ||
            !row.previewUrl ||
            !isHostedImageUrl(row.previewUrl) ||
            classified.has(row.imageId)
          )
            continue
          classified.add(row.imageId)
          void fetch('/api/study-quick/images/classify', {
            method: 'POST',
            credentials: 'same-origin',
            keepalive: true,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageId: row.imageId }),
          }).catch(() => undefined)
        }
      }
      if (isQuickStudyJobFinished(job) && !job.replacementsPending) return
    } catch (error) {
      if (options.signal.aborted) return
      const terminal =
        error instanceof QuickStudyJobError &&
        error.status >= 400 &&
        error.status < 500 &&
        ![408, 429].includes(error.status)
      if (!imagesOnly)
        options.onConnectionError(
          terminal && error instanceof Error
            ? error.message
            : 'Progress is temporarily unavailable. Your job continues in the background; reconnecting…',
          terminal
        )
      if (terminal) return
      failures++
    }
    await waitForPoll(
      failures
        ? Math.min(15_000, 2000 * 2 ** Math.min(failures, 3))
        : pollInterval,
      options.signal
    )
  }
}
