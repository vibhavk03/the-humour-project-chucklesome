import { quickStudyJobApi, quickStudyJobError } from '@/utils/quick-study-job-api'
import { after } from 'next/server'
import { classifyFileUpload } from '@/utils/classify-file-upload'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body.imageUrl !== 'string' || typeof body.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(body.sha256))
      return Response.json({ error: 'Invalid image upload request.' }, { status: 400 })
    const result = await quickStudyJobApi('', body, 'upload-image-from-url', request)
    if (result.created === true && typeof result.imageId === 'string' && typeof result.imageUrl === 'string') {
      const authorization = request.headers.get('Authorization')
      after(() => classifyFileUpload(authorization, result.imageId, result.imageUrl))
    }
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return quickStudyJobError(error)
  }
}
