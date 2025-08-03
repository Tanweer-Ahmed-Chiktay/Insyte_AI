import { PrismaClient } from '@prisma/client'
import { prisma } from './prisma'

/**
 * Wrapper for Prisma operations that handles serverless connection issues
 * Specifically addresses "prepared statement does not exist" errors (PostgreSQL code 26000)
 */
export class PrismaWrapper {
  private static retryCount = 3
  private static retryDelay = 1000 // 1 second

  /**
   * Execute a Prisma operation with retry logic for connection issues
   */
  static async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: string = 'database operation'
  ): Promise<T> {
    let lastError: Error | null = null
    let isPreparedStatementError = false
    let isConnectionError = false

    for (let attempt = 1; attempt <= this.retryCount; attempt++) {
      try {
        // Ensure fresh connection for each retry
        if (attempt > 1) {
          try {
            await prisma.$disconnect()
            // Force a longer delay for prepared statement errors
            const delay = isPreparedStatementError ? this.retryDelay * attempt * 2 : this.retryDelay * attempt
            await new Promise(resolve => setTimeout(resolve, delay))
            // Force reconnection by making a simple query
            await prisma.$queryRaw`SELECT 1`
          } catch (reconnectError) {
            console.warn(`Reconnection attempt failed:`, reconnectError)
          }
        }

        const result = await operation()
        return result
      } catch (error) {
        lastError = error as Error
        
        // Check if this is a prepared statement error (PostgreSQL codes 26000, 42P05, 08P01)
        isPreparedStatementError = 
          error instanceof Error && 
          (error.message.includes('prepared statement') || 
           error.message.includes('26000') ||
           error.message.includes('42P05') ||
           error.message.includes('08P01') ||
           error.message.includes('bind message supplies') ||
           error.message.includes('already exists'))

        // Check if this is a connection error
        isConnectionError = 
          error instanceof Error && 
          (error.message.includes('connection') ||
           error.message.includes('ECONNRESET') ||
           error.message.includes('ENOTFOUND') ||
           error.message.includes('ConnectorError'))

        console.warn(`${context} attempt ${attempt}/${this.retryCount} failed:`, {
          error: error instanceof Error ? error.message : 'Unknown error',
          isPreparedStatementError,
          isConnectionError
        })

        // Only retry for specific error types
        if (attempt < this.retryCount && (isPreparedStatementError || isConnectionError)) {
          continue
        }

        // If we've exhausted retries or it's not a retryable error, throw
        break
      }
    }

    throw lastError || new Error(`${context} failed after ${this.retryCount} attempts`)
  }

  /**
   * Find unique with retry logic
   */
  static async findUnique<T>(
    model: any,
    args: any,
    context: string = 'findUnique'
  ): Promise<T | null> {
    return this.executeWithRetry(
      () => model.findUnique(args),
      context
    )
  }

  /**
   * Find first with retry logic
   */
  static async findFirst<T>(
    model: any,
    args: any,
    context: string = 'findFirst'
  ): Promise<T | null> {
    return this.executeWithRetry(
      () => model.findFirst(args),
      context
    )
  }

  /**
   * Find many with retry logic
   */
  static async findMany<T>(
    model: any,
    args: any,
    context: string = 'findMany'
  ): Promise<T[]> {
    return this.executeWithRetry(
      () => model.findMany(args),
      context
    )
  }

  /**
   * Create with retry logic
   */
  static async create<T>(
    model: any,
    args: any,
    context: string = 'create'
  ): Promise<T> {
    return this.executeWithRetry(
      () => model.create(args),
      context
    )
  }

  /**
   * Update with retry logic
   */
  static async update<T>(
    model: any,
    args: any,
    context: string = 'update'
  ): Promise<T> {
    return this.executeWithRetry(
      () => model.update(args),
      context
    )
  }

  /**
   * Upsert with retry logic
   */
  static async upsert<T>(
    model: any,
    args: any,
    context: string = 'upsert'
  ): Promise<T> {
    return this.executeWithRetry(
      () => model.upsert(args),
      context
    )
  }

  /**
   * Delete with retry logic
   */
  static async delete<T>(
    model: any,
    args: any,
    context: string = 'delete'
  ): Promise<T> {
    return this.executeWithRetry(
      () => model.delete(args),
      context
    )
  }

  /**
   * Raw query with retry logic
   */
  static async queryRaw<T>(
    query: any,
    context: string = 'queryRaw'
  ): Promise<T> {
    return this.executeWithRetry(
      () => prisma.$queryRaw(query),
      context
    )
  }
}

// Export convenience functions
export const safeQuery = PrismaWrapper.executeWithRetry
export const safeFindUnique = PrismaWrapper.findUnique
export const safeFindFirst = PrismaWrapper.findFirst
export const safeFindMany = PrismaWrapper.findMany
export const safeCreate = PrismaWrapper.create
export const safeUpdate = PrismaWrapper.update
export const safeUpsert = PrismaWrapper.upsert
export const safeDelete = PrismaWrapper.delete
export const safeQueryRaw = PrismaWrapper.queryRaw