import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { CSRF_COOKIE_NAME } from '@/lib/utils/csrf'

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic'

/**
 * GET /api/csrf-token
 * Returns the CSRF token for authenticated users
 */
export async function GET(request: NextRequest) {
  try {
    // Verify user is authenticated
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get CSRF token from cookie (set by middleware)
    const csrfToken = request.cookies.get(CSRF_COOKIE_NAME)?.value

    if (!csrfToken) {
      return NextResponse.json(
        { error: 'CSRF token not available' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      token: csrfToken,
      message: 'Include this token in the x-csrf-token header for state-changing requests'
    })
  } catch (error) {
    console.error('CSRF token endpoint error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}