import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  prismaBeforeExitRegistered?: boolean
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// Register disconnect listener only once to avoid MaxListenersExceededWarning in dev
if (!globalForPrisma.prismaBeforeExitRegistered) {
  process.on('beforeExit', async () => {
    await prisma.$disconnect()
  })
  globalForPrisma.prismaBeforeExitRegistered = true
}