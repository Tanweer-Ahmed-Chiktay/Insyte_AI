import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { prisma } from '@/lib/prisma'

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const diagnostics = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    checks: {
      database: { status: 'unknown', error: null as string | null },
      auth: { status: 'unknown', error: null as string | null },
      envVars: {
        DATABASE_URL: !!process.env.DATABASE_URL,
        NEXTAUTH_SECRET: !!process.env.NEXTAUTH_SECRET,
        GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
        GROQ_API_KEY: !!process.env.GROQ_API_KEY,
        SERPAPI_API_KEY: !!process.env.SERPAPI_API_KEY,
        ELEVENLABS_API_KEY: !!process.env.ELEVENLABS_API_KEY,
        NEXTAUTH_URL: process.env.NEXTAUTH_URL
      }
    }
  }

  // Test database connection
  try {
    await prisma.$connect()
    await prisma.$queryRaw`SELECT 1`
    diagnostics.checks.database.status = 'connected'
  } catch (error) {
    diagnostics.checks.database.status = 'failed'
    diagnostics.checks.database.error = error instanceof Error ? error.message : 'Unknown database error'
  } finally {
    await prisma.$disconnect()
  }

  // Test JWT token parsing
  try {
    const token = await getToken({ 
      req: request as any, 
      secret: process.env.NEXTAUTH_SECRET 
    })
    diagnostics.checks.auth.status = token ? 'authenticated' : 'unauthenticated'
  } catch (error) {
    diagnostics.checks.auth.status = 'failed'
    diagnostics.checks.auth.error = error instanceof Error ? error.message : 'Unknown auth error'
  }

  return NextResponse.json(diagnostics, { 
    status: 200,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  })
}