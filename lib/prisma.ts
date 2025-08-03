import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
    datasources: {
      db: {
        url: process.env.DATABASE_URL + '?pgbouncer=true&prepared_statements=false',
      },
    },
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// Gracefully disconnect on process termination
process.on('beforeExit', async () => {
  await prisma.$disconnect()
})