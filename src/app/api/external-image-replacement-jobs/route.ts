import {
  quickStudyJobApi,
  quickStudyJobError,
} from '@/utils/quick-study-job-api'
import { IMAGE_REPLACEMENT_STATUSES } from '@/types/external-image-replacement-job'

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams
  const status = search.get('status') ?? ''
  const offset = Number(search.get('offset') ?? '0')
  const mine = search.get('mine') ?? 'false'
  if (
    (status && !IMAGE_REPLACEMENT_STATUSES.some((value) => value === status)) ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 1_000_000 ||
    !['true', 'false'].includes(mine)
  ) {
    return Response.json({ error: 'Invalid job filters.' }, { status: 400 })
  }
  const query = new URLSearchParams({ offset: String(offset), mine })
  if (status) query.set('status', status)
  try {
    return Response.json(
      await quickStudyJobApi(
        `?${query}`,
        undefined,
        'external-image-replacement-jobs',
        request
      ),
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    return quickStudyJobError(error)
  }
}
