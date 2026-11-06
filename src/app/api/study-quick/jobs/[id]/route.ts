import {
  quickStudyJobApi,
  quickStudyJobError,
} from '@/utils/quick-study-job-api'
import { isUUID } from '@/utils/utils'

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  if (!isUUID(id))
    return Response.json({ error: 'Invalid import job ID.' }, { status: 400 })
  try {
    return Response.json(
      {
        ...(await quickStudyJobApi(
          `/${id}`,
          undefined,
          'quick-study-job',
          request
        )),
        needsClassification: !!process.env.GOOGLE_AI_API_KEY,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    return quickStudyJobError(error)
  }
}
