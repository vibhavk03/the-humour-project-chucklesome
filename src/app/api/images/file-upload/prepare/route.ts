import { quickStudyJobApi, quickStudyJobError } from '@/utils/quick-study-job-api'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body.contentType !== 'string' || typeof body.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(body.sha256))
      return Response.json({ error: 'Invalid image upload request.' }, { status: 400 })
    const result = await quickStudyJobApi('', body, 'generate-presigned-url', request)
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return quickStudyJobError(error)
  }
}
