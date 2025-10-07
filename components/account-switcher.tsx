'use client'

import { useState } from 'react'
import { useSession, signOut, signIn } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { UserCircle, LogOut, UserPlus, AlertCircle } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

export function AccountSwitcher() {
  const { data: session } = useSession()
  const { toast } = useToast()
  const [isOpen, setIsOpen] = useState(false)
  const [isSwitching, setIsSwitching] = useState(false)

  const handleSwitchAccount = async () => {
    setIsSwitching(true)
    try {
      // Sign out and redirect to sign in with account selection
      await signOut({ 
        redirect: false 
      })
      
      // Small delay to ensure sign out completes
      setTimeout(() => {
        signIn('google', { 
          callbackUrl: window.location.href,
          prompt: 'select_account'
        })
      }, 500)
      
    } catch (error) {
      console.error('Error switching accounts:', error)
      toast({
        title: 'Error',
        description: 'Failed to switch accounts. Please try again.',
        variant: 'destructive'
      })
    } finally {
      setIsSwitching(false)
      setIsOpen(false)
    }
  }

  const handleAddAccount = async () => {
    try {
      // Force account selection prompt
      await signIn('google', { 
        callbackUrl: window.location.href,
        prompt: 'select_account consent'
      })
    } catch (error) {
      console.error('Error adding account:', error)
      toast({
        title: 'Error',
        description: 'Failed to add account. Please try again.',
        variant: 'destructive'
      })
    }
  }

  if (!session?.user) {
    return null
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="w-full justify-start p-2">
          <div className="flex items-center space-x-2 w-full">
            <Avatar className="h-8 w-8">
              <AvatarImage 
                src={session.user.image || ''} 
                alt={session.user.name || 'User'}
              />
              <AvatarFallback>
                <UserCircle className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium truncate">
                {session.user.name || 'User'}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {session.user.email}
              </p>
            </div>
          </div>
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Account Management</DialogTitle>
          <DialogDescription>
            Switch between Google accounts or add a new one.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Current Account */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Current Account</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center space-x-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage 
                    src={session.user.image || ''} 
                    alt={session.user.name || 'User'}
                  />
                  <AvatarFallback>
                    <UserCircle className="h-5 w-5" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="font-medium">{session.user.name}</p>
                  <p className="text-sm text-muted-foreground">{session.user.email}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Account Actions */}
          <div className="space-y-2">
            <Button 
              onClick={handleSwitchAccount}
              disabled={isSwitching}
              className="w-full"
              variant="outline"
            >
              <UserPlus className="mr-2 h-4 w-4" />
              {isSwitching ? 'Switching...' : 'Switch to Different Account'}
            </Button>
            
            <Button 
              onClick={handleAddAccount}
              className="w-full"
              variant="outline"
            >
              <UserPlus className="mr-2 h-4 w-4" />
              Add Another Account
            </Button>
            
            <Button 
              onClick={() => signOut({ callbackUrl: '/' })}
              className="w-full"
              variant="destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out Completely
            </Button>
          </div>
          
          {/* Help Text */}
          <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg">
            <div className="flex items-start space-x-2">
              <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-700 dark:text-blue-300">
                <p className="font-medium mb-1">Account Switching Tips:</p>
                  <ul className="text-xs space-y-1">
                    <li>• Use &quot;Switch Account&quot; to change to a different Google account</li>
                    <li>• Use &quot;Add Account&quot; to sign in with an additional account</li>
                    <li>• If you encounter errors, try signing out completely first</li>
                  </ul>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}