'use client'

export const dynamic = 'force-dynamic';

import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import Link from 'next/link'
import { Suspense } from 'react'

const errorMessages: Record<string, string> = {
  Configuration: 'There is a problem with the server configuration.',
  AccessDenied: 'You do not have permission to sign in.',
  Verification: 'The verification token has expired or has already been used.',
  OAuthSignin: 'Error in constructing an authorization URL.',
  OAuthCallback: 'Error in handling the response from an OAuth provider.',
  OAuthCreateAccount: 'Could not create OAuth account in the database.',
  EmailCreateAccount: 'Could not create email provider account in the database.',
  Callback: 'Error in the OAuth callback handler route.',
  OAuthAccountNotLinked: 'The email on the account is already linked, but not with this OAuth account.',
  EmailSignin: 'Sending the e-mail with the verification token failed.',
  CredentialsSignin: 'The authorize callback returned null in the Credentials provider.',
  SessionRequired: 'The content of this page requires you to be signed in at all times.',
  Default: 'An error occurred during authentication.'
}

function AuthErrorContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  
  const errorMessage = error && errorMessages[error] 
    ? errorMessages[error] 
    : errorMessages.Default

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md p-6 space-y-4">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-red-600">Authentication Error</h1>
          <p className="text-gray-600">{errorMessage}</p>
          {error && (
            <p className="text-sm text-gray-500">Error code: {error}</p>
          )}
        </div>
        
        <div className="space-y-2">
          <Button asChild className="w-full">
            <Link href="/">Return to Home</Link>
          </Button>
          <Button variant="outline" asChild className="w-full">
            <Link href="/api/auth/signin">Try Again</Link>
          </Button>
          {(error === 'OAuthAccountNotLinked' || error === 'AccessDenied') && (
            <Button variant="outline" asChild className="w-full">
              <Link href="/api/auth/signout?callbackUrl=/api/auth/signin">
                Sign Out & Try Different Account
              </Link>
            </Button>
          )}
        </div>
        
        <div className="text-center space-y-2">
          {error === 'OAuthAccountNotLinked' && (
            <div className="bg-blue-50 p-3 rounded-lg">
              <p className="text-sm text-blue-700">
                <strong>Account Switching Issue:</strong> This email is already linked to another account. 
                Try signing out completely and then signing in with the correct account.
              </p>
            </div>
          )}
          {error === 'AccessDenied' && (
            <div className="bg-yellow-50 p-3 rounded-lg">
              <p className="text-sm text-yellow-700">
                <strong>Access Denied:</strong> Make sure you&apos;re using the correct Google account 
                and have granted all necessary permissions.
              </p>
            </div>
          )}
          <p className="text-sm text-gray-500">
            If this problem persists, please contact support.
          </p>
        </div>
      </Card>
    </div>
  )
}

export default function AuthError() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md p-6 space-y-4">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold text-red-600">Authentication Error</h1>
            <p className="text-gray-600">Loading...</p>
          </div>
        </Card>
      </div>
    }>
      <AuthErrorContent />
    </Suspense>
  )
}