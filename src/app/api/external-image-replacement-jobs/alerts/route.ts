import {
  quickStudyJobApi,
  quickStudyJobError,
} from '@/utils/quick-study-job-api'

export async function GET(request: Request) {
  try {
    return Response.json(
      await quickStudyJobApi(
        '/alerts',
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
