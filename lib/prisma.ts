import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const getDatabaseUrl = () => {
  const baseUrl = process.env.DATABASE_URL || ''
  const separator = baseUrl.includes('?') ? '&' : '?'
  // Disable prepared statements and connection pooling to fix serverless issues
  return `${baseUrl}${separator}prepared_statements=false&connection_limit=1&pool_timeout=0`
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