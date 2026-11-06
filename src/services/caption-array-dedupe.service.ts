import { getAuthTokenAction } from '@/app/actions'
import type {
  CaptionReviewGroup,
  CaptionReviewItem,
} from '@/types/caption-review'
import { isUUID } from '@/utils/utils'

export const CAPTION_ARRAY_REVIEW_LIMIT = 500
const REQUEST_TIMEOUT_MS = 120_000
export type CaptionArrayGroups = Record<string, string[]>

export function validateCaptionArrayGroups(
  body: unknown,
  captionIds: string[]
): CaptionArrayGroups {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Invalid caption groups returned. Please retry the review.')
  }
  const expected = new Set(captionIds)
  const seen = new Set<string>()
  for (const [name, ids] of Object.entries(body)) {
    if (!name.trim() || !Array.isArray(ids) || ids.length === 0) {
      throw new Error(
        'Invalid caption group returned. Please retry the review.'
      )
    }
    for (const id of ids) {
      if (typeof id !== 'string' || !expected.has(id) || seen.has(id)) {
        throw new Error(
          'Caption groups contain unknown or repeated captions. Please retry the review.'
        )
      }
      seen.add(id)
    }
  }
  if (seen.size !== expected.size) {
    throw new Error('Some captions are missing from the review. Please retry.')
  }
  return body as CaptionArrayGroups
}

export async function requestCaptionArrayDedupe(
  captionIds: string[],
  signal?: AbortSignal
): Promise<CaptionArrayGroups> {
  const ids = [...new Set(captionIds.map((id) => id.trim().toLowerCase()))]
  if (
    !ids.length ||
    ids.length > CAPTION_ARRAY_REVIEW_LIMIT ||
    ids.some((id) => !isUUID(id))
  ) {
    throw new Error(
      `Review requires 1–${CAPTION_ARRAY_REVIEW_LIMIT} saved caption IDs.`
    )
  }
  signal?.throwIfAborted()
  const auth = await getAuthTokenAction()
  if (!auth?.access_token)
    throw new Error('Authentication required. Please sign in and try again.')
  signal?.throwIfAborted()
  const controller = new AbortController()
  const cancel = () => controller.abort()
  signal?.addEventListener('abort', cancel, { once: true })
  const timeout = setTimeout(cancel, REQUEST_TIMEOUT_MS)
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.almostcrackd.ai'
    const response = await fetch(
      `${baseUrl}/pipeline/deduplicate-caption-array`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.access_token}`,
        },
        body: JSON.stringify(ids),
        signal: controller.signal,
      }
    )
    const body: unknown = await response.json().catch(() => null)
    controller.signal.throwIfAborted()
    if (!response.ok) {
      const error = body as {
        error?: unknown
        message?: unknown
        statusMessage?: unknown
      } | null
      const message = [error?.error, error?.message, error?.statusMessage].find(
        (value) => typeof value === 'string' && value
      )
      throw new Error(
        typeof message === 'string'
          ? message
          : 'Caption review is unavailable. Retry, or choose No in step 3 to keep all captions.'
      )
    }
    return validateCaptionArrayGroups(body, ids)
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', cancel)
  }
}

export function buildCaptionArrayGroups(
  groups: CaptionArrayGroups,
  items: CaptionReviewItem[]
): CaptionReviewGroup[] {
  const byId = new Map(items.map((item) => [item.id.toLowerCase(), item]))
  return Object.entries(groups)
    .sort(([a], [b]) => Number(a === 'Other') - Number(b === 'Other'))
    .map(([name, ids]) => ({
      id: name,
      name, // Preserve the API's names, including suffixes such as "(2)".
      isOutliers: name === 'Other',
      captions: ids.map((id) => {
        const item = byId.get(id)
        if (!item)
          throw new Error('Caption review is out of date. Please retry.')
        return item
      }),
    }))
}
