import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const getDatabaseUrl = () => {
  const baseUrl = process.env.DATABASE_URL || ''
  const separator = baseUrl.includes('?') ? '&' : '?'
  // Optimize for serverless with pgbouncer and connection limits
  return `${baseUrl}${separator}pgbouncer=true&prepared_statements=false&connection_limit=1&pool_timeout=20`
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
    datasources: {
      db: {
        url: getDatabaseUrl(),
      },
    },
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// Gracefully disconnect on process termination
process.on('beforeExit', async () => {
  await prisma.$disconnect()
})