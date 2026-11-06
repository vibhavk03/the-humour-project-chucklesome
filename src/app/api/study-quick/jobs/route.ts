import {
  quickStudyJobApi,
  quickStudyJobError,
} from '@/utils/quick-study-job-api'
import { isUUID } from '@/utils/utils'

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
    if (
      !body ||
      typeof body !== 'object' ||
      !('jobId' in body) ||
      typeof body.jobId !== 'string' ||
      !isUUID(body.jobId) ||
      !('rows' in body) ||
      !Array.isArray(body.rows)
    )
      throw new Error()
  } catch {
    return Response.json(
      { error: 'A valid import job ID and caption list are required.' },
      { status: 400 }
    )
  }
  try {
    return Response.json(
      await quickStudyJobApi('', body, 'quick-study-job', request),
      {
        status: 202,
        headers: { 'Cache-Control': 'no-store' },
      }
    )
  } catch (error) {
    return quickStudyJobError(error)
  }
}
