import {
  quickStudyJobApi,
  quickStudyJobError,
} from '@/utils/quick-study-job-api'
import { isUUID } from '@/utils/utils'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  if (!isUUID(id))
    return Response.json(
      { error: 'Invalid image replacement job ID.' },
      { status: 400 }
    )
  try {
    return Response.json(
      await quickStudyJobApi(
        `/${id}/retry`,
        {},
        'external-image-replacement-jobs',
        request
      ),
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    return quickStudyJobError(error)
  }
}
