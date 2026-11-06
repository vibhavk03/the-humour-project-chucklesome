import { NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  // Job handlers verify the user's JWT and the API checks superadmin access.
  // Let them return JSON auth errors instead of redirecting fetches to HTML.
  if (
    pathname === '/api/study-quick/jobs' ||
    pathname.startsWith('/api/study-quick/jobs/') ||
    pathname === '/api/external-image-replacement-jobs' ||
    pathname.startsWith('/api/external-image-replacement-jobs/') ||
    pathname === '/api/images/file-upload/prepare' ||
    pathname === '/api/images/file-upload/complete'
  ) {
    return NextResponse.next()
  }
  // Update Supabase session, handles auth redirects
  return await updateSession(request)
}
