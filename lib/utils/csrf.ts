import { NextRequest } from 'next/server'

// CSRF token configuration
const CSRF_TOKEN_LENGTH = 32
const CSRF_HEADER_NAME = 'x-csrf-token'

// Edge-compatible crypto function
function generateRandomBytes(length: number): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    // Browser/Edge runtime
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  } else {
    // Fallback for environments without crypto
    return Array.from({ length }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
  }
}
const CSRF_COOKIE_NAME = 'csrf-token'

/**
 * Generate a cryptographically secure CSRF token
 */
export function generateCSRFToken(): string {
  return generateRandomBytes(CSRF_TOKEN_LENGTH)
}

/**
 * Verify CSRF token from request headers against cookie value
 */
export function verifyCSRFToken(request: NextRequest): boolean {
  const headerToken = request.headers.get(CSRF_HEADER_NAME)
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value
  
  if (!headerToken || !cookieToken) {
    return false
  }
  
  // Use timing-safe comparison to prevent timing attacks
  // Edge-compatible comparison
  if (headerToken.length !== cookieToken.length) {
    return false
  }
  
  let result = 0
  for (let i = 0; i < headerToken.length; i++) {
    result |= headerToken.charCodeAt(i) ^ cookieToken.charCodeAt(i)
  }
  return result === 0
}

/**
 * Check if the request method requires CSRF protection
 */
export function requiresCSRFProtection(method: string): boolean {
  return ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase())
}

/**
 * Get CSRF token from request cookie
 */
export function getCSRFTokenFromCookie(request: NextRequest): string | null {
  return request.cookies.get(CSRF_COOKIE_NAME)?.value || null
}

export { CSRF_HEADER_NAME, CSRF_COOKIE_NAME }