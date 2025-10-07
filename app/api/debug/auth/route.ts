import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
// Removed prisma-wrapper - using prisma directly
import type { Account, User } from '@prisma/client'

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession({ req: request, ...authOptions })
    
    if (!session?.user?.email) {
      return NextResponse.json({ 
        authenticated: false,
        error: 'No session found'
      })
    }

    // Get access token from session (JWT strategy)
    const accessToken = (session as any).accessToken
    const refreshToken = (session as any).refreshToken
    
    // Create account-like object for compatibility
    const account = accessToken ? {
      id: 'jwt-session',
      provider: 'google',
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: null // JWT handles expiration internally
    } : null

    const user = await prisma.user.findUnique({
    where: {
      email: session.user.email
    },
    select: {
        id: true,
        email: true,
        name: true
      }
    }) as (Pick<User, 'id' | 'email' | 'name'>) | null

    return NextResponse.json({
      authenticated: true,
      session: {
        user: session.user,
        expires: session.expires
      },
      user,
      account: account ? {
        id: account.id,
        provider: account.provider,
        hasAccessToken: !!account.access_token,
        hasRefreshToken: !!account.refresh_token,
        accessTokenLength: account.access_token?.length || 0,
        refreshTokenLength: account.refresh_token?.length || 0,
        expiresAt: account.expires_at,
        isExpired: account.expires_at ? account.expires_at < Math.floor(Date.now() / 1000) : null
      } : null
    })
  } catch (error) {
    console.error('Debug auth error:', error)
    return NextResponse.json(
      { error: 'Failed to check auth status' },
      { status: 500 }
    )
  }
}