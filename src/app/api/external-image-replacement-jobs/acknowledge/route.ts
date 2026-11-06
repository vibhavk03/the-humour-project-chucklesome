import {
  quickStudyJobApi,
  quickStudyJobError,
} from '@/utils/quick-study-job-api'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (
    typeof body?.before !== 'string' ||
    !Number.isFinite(Date.parse(body.before))
  )
    return Response.json(
      { error: 'A valid alert timestamp is required.' },
      { status: 400 }
    )
  try {
    return Response.json(
      await quickStudyJobApi(
        '/acknowledge',
        { before: body.before },
        'external-image-replacement-jobs',
        request
      ),
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    return quickStudyJobError(error)
  }
}
