'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, RefreshCw, Zap, Clock, Mail, CheckCircle, AlertCircle } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { createCSRFHeaders } from '@/lib/utils/csrf-client'

interface SyncStatus {
  isWatchActive: boolean
  hasHistoryId: boolean
  emailCount: number
  lastUpdated: string
  watchExpiration?: string
}

interface SyncResult {
  success: boolean
  syncType: 'full' | 'incremental'
  processedCount: number
  errorCount: number
  newHistoryId?: string
}

export function GmailSyncPanel() {
  const { data: session, status } = useSession()
  const { toast } = useToast()
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isSettingUpWatch, setIsSettingUpWatch] = useState(false)

  useEffect(() => {
    if (status === 'authenticated') {
      fetchSyncStatus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const fetchSyncStatus = async () => {
    if (status !== 'authenticated') return
    
    try {
      setIsLoading(true)
      const response = await fetch('/api/gmail/sync')
      if (response.ok) {
        const data = await response.json()
        setSyncStatus(data)
      } else {
        console.error('Failed to fetch sync status:', response.status, response.statusText)
        toast({
          title: 'Error',
          description: `Failed to fetch sync status: ${response.status}`,
          variant: 'destructive'
        })
      }
    } catch (error) {
      console.error('Failed to fetch sync status:', error)
      toast({
          title: 'Error',
          description: 'Failed to fetch sync status',
          variant: 'destructive'
        })
    } finally {
      setIsLoading(false)
    }
  }

  const setupGmailWatch = async () => {
    if (status !== 'authenticated') return
    
    try {
      setIsSettingUpWatch(true)
      const headers = await createCSRFHeaders()
      const response = await fetch('/api/gmail/watch', {
        method: 'POST',
        headers
      })
      
      if (response.ok) {
        const data = await response.json()
        toast({
          title: 'Success',
          description: 'Gmail watch setup successfully!'
        })
        await fetchSyncStatus()
      } else {
        const error = await response.json()
        const isConfigError = error.error?.includes('Google Cloud Pub/Sub configuration')
        toast({
          title: isConfigError ? 'Configuration Required' : 'Error',
          description: isConfigError 
            ? 'Gmail real-time sync requires Google Cloud Pub/Sub setup. You can still use manual sync.'
            : error.error || 'Failed to setup Gmail watch',
          variant: 'destructive'
        })
      }
    } catch (error) {
      console.error('Failed to setup Gmail watch:', error)
      toast({
        title: 'Error',
        description: 'Failed to setup Gmail watch',
        variant: 'destructive'
      })
    } finally {
      setIsSettingUpWatch(false)
    }
  }

  const performSync = async (force = false) => {
    if (status !== 'authenticated') return
    
    try {
      setIsSyncing(true)
      const headers = await createCSRFHeaders()
      const response = await fetch('/api/gmail/sync', {
        method: 'POST',
        headers,
        body: JSON.stringify({ force }),
      })
      
      if (response.ok) {
        const data: SyncResult = await response.json()
        
        // Trigger cache refresh for all email categories if changes were processed
        if (data.processedCount > 0) {
          // Dispatch a custom event to trigger cache refresh across all email components
          window.dispatchEvent(new CustomEvent('gmail-sync-completed', {
            detail: { processedCount: data.processedCount, syncType: data.syncType }
          }))
        }
        
        toast({
          title: 'Success',
          description: `${data.syncType === 'full' ? 'Full' : 'Incremental'} sync completed! ` +
            `Processed: ${data.processedCount}, Errors: ${data.errorCount}`
        })
        await fetchSyncStatus()
      } else {
        const error = await response.json()
        toast({
          title: 'Error',
          description: error.error || 'Failed to sync Gmail',
          variant: 'destructive'
        })
      }
    } catch (error) {
      console.error('Failed to sync Gmail:', error)
      toast({
        title: 'Error',
        description: 'Failed to sync Gmail',
        variant: 'destructive'
      })
    } finally {
      setIsSyncing(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const getWatchStatus = () => {
    if (!syncStatus) return { status: 'unknown', color: 'secondary' }
    
    if (syncStatus.isWatchActive) {
      return { status: 'Active', color: 'default', icon: CheckCircle }
    } else {
      return { status: 'Inactive', color: 'destructive', icon: AlertCircle }
    }
  }

  if (status === 'loading') {
    return (
      <Card className="w-full max-w-4xl mx-auto">
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading...
        </CardContent>
      </Card>
    )
  }

  if (status === 'unauthenticated') {
    return (
      <Card className="w-full max-w-4xl mx-auto">
        <CardContent className="flex items-center justify-center p-8">
          <AlertCircle className="h-6 w-6 text-yellow-500 mr-2" />
          Please sign in to access Gmail synchronization
        </CardContent>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Card className="w-full max-w-4xl mx-auto">
        <CardContent className="flex items-center justify-center p-6">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="ml-2">Loading sync status...</span>
        </CardContent>
      </Card>
    )
  }

  const watchStatus = getWatchStatus()
  const StatusIcon = watchStatus.icon

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Gmail Synchronization
        </CardTitle>
        <CardDescription>
          Manage your Gmail synchronization settings and monitor sync status
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Watch Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium">Real-time Watch:</span>
            <Badge variant={watchStatus.color as any} className="flex items-center gap-1">
              {StatusIcon && <StatusIcon className="h-3 w-3" />}
              {watchStatus.status}
            </Badge>
          </div>
          <Button
            onClick={setupGmailWatch}
            disabled={isSettingUpWatch}
            variant={syncStatus?.isWatchActive ? 'outline' : 'default'}
            size="sm"
          >
            {isSettingUpWatch && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {syncStatus?.isWatchActive ? 'Refresh Watch' : 'Setup Watch'}
          </Button>
        </div>

        {/* Sync Statistics */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">{syncStatus?.emailCount || 0}</div>
              <div className="text-sm text-muted-foreground">Emails Synced</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">
                {syncStatus?.lastUpdated ? formatDate(syncStatus.lastUpdated) : 'Never'}
              </div>
              <div className="text-sm text-muted-foreground">Last Updated</div>
            </div>
          </div>
        </div>

        {/* Watch Expiration */}
        {syncStatus?.watchExpiration && (
          <div className="p-3 bg-muted rounded-lg">
            <div className="text-sm font-medium">Watch Expiration</div>
            <div className="text-sm text-muted-foreground">
              {formatDate(syncStatus.watchExpiration)}
            </div>
          </div>
        )}

        {/* Sync Actions */}
        <div className="flex gap-2">
          <Button
            onClick={() => performSync(false)}
            disabled={isSyncing}
            variant="outline"
            className="flex-1"
          >
            {isSyncing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            <RefreshCw className="h-4 w-4 mr-2" />
            Incremental Sync
          </Button>
          <Button
            onClick={() => performSync(true)}
            disabled={isSyncing}
            variant="outline"
            className="flex-1"
          >
            {isSyncing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            <Zap className="h-4 w-4 mr-2" />
            Full Sync
          </Button>
        </div>

        {/* Status Information */}
        <div className="text-sm text-muted-foreground space-y-1">
          <div>• <strong>Real-time Watch:</strong> Automatically syncs when Gmail changes occur</div>
          <div>• <strong>Incremental Sync:</strong> Syncs only new changes since last sync</div>
          <div>• <strong>Full Sync:</strong> Re-syncs all emails (use sparingly)</div>
        </div>
      </CardContent>
    </Card>
  )
}