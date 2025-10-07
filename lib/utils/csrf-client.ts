/**
 * Client-side CSRF token utilities
 */

let cachedCSRFToken: string | null = null;

/**
 * Fetches the CSRF token from the server
 */
export async function getCSRFToken(): Promise<string | null> {
  if (cachedCSRFToken) {
    return cachedCSRFToken;
  }

  try {
    const response = await fetch('/api/csrf-token', {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      console.error('Failed to fetch CSRF token:', response.status);
      return null;
    }

    const data = await response.json();
    cachedCSRFToken = data.token;
    return cachedCSRFToken;
  } catch (error) {
    console.error('Error fetching CSRF token:', error);
    return null;
  }
}

/**
 * Creates headers with CSRF token for API requests
 */
export async function createCSRFHeaders(additionalHeaders: Record<string, string> = {}): Promise<Record<string, string>> {
  const token = await getCSRFToken();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...additionalHeaders
  };

  if (token) {
    headers['x-csrf-token'] = token;
  }

  return headers;
}

/**
 * Clears the cached CSRF token (useful for logout or token refresh)
 */
export function clearCSRFToken(): void {
  cachedCSRFToken = null;
}