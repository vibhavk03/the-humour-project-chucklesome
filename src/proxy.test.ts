import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const updateSession = vi.hoisted(() => vi.fn())
vi.mock('@/utils/supabase/middleware', () => ({ updateSession }))
import { proxy } from './proxy'

beforeEach(() => vi.resetAllMocks())

describe('job API routing', () => {
  it.each([
    '/api/study-quick/jobs',
    '/api/study-quick/jobs/00000000-0000-4000-8000-000000000001',
    '/api/study-quick/jobs/00000000-0000-4000-8000-000000000001/retry',
    '/api/external-image-replacement-jobs',
    '/api/external-image-replacement-jobs/alerts',
    '/api/external-image-replacement-jobs/acknowledge',
    '/api/external-image-replacement-jobs/00000000-0000-4000-8000-000000000001/retry',
    '/api/images/file-upload/prepare',
    '/api/images/file-upload/complete',
  ])(
    'lets %s authenticate in its JSON handler instead of redirecting to a page',
    async (path) => {
      const response = await proxy(
        new NextRequest(`http://localhost:3001${path}`)
      )
      expect(response.headers.get('x-middleware-next')).toBe('1')
      expect(response.headers.get('Location')).toBeNull()
      expect(updateSession).not.toHaveBeenCalled()
    }
  )

  it.each([
    '/overview',
    '/external-image-replacement-jobs',
    '/study-quick',
    '/api/study-quick/images',
    '/api/study-quick/jobs-other',
    '/api/external-image-replacement-jobs-other',
    '/api/images/file-upload/prepare-other',
  ])('retains existing authentication for %s', async (path) => {
    const request = new NextRequest(`http://localhost:3001${path}`)
    const response = NextResponse.redirect(new URL('/', request.url))
    updateSession.mockResolvedValue(response)
    expect(await proxy(request)).toBe(response)
    expect(updateSession).toHaveBeenCalledWith(request)
  })
})
