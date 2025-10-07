/**
 * Enhanced Real-Time Sync Engine with Advanced Features
 * Implements failover, deduplication, edge optimization, and conflict resolution
 * Based on improve2.txt specifications for ultra-fast synchronization
 */

import { Email } from './email-store'
import { cacheHierarchy } from './cache-hierarchy'
import { preloadEngine } from './preload-engine'

interface SyncMessage {
  id: string
  type: 'email-new' | 'email-updated' | 'email-deleted' | 'thread-updated' | 'heartbeat' | 'sync-request'
  payload: any
  timestamp: number
  source: string
  sequenceId: number
  checksum?: string
}

interface WebSocketEndpoint {
  url: string
  region: string
  latency: number
  reliability: number
  lastConnected: number
  failureCount: number
  isActive: boolean
}

interface SyncMetrics {
  messagesReceived: number
  messagesSent: number
  duplicatesFiltered: number
  conflictsResolved: number
  averageLatency: number
  connectionUptime: number
  failoverCount: number
  edgeOptimizations: number
}

interface ConflictResolution {
  emailId: string
  localVersion: any
  remoteVersion: any
  resolution: 'local' | 'remote' | 'merge'
  timestamp: number
}

interface MessageQueue {
  pending: SyncMessage[]
  failed: SyncMessage[]
  processing: Set<string>
}

export class RealtimeSyncEngine {
  private static instance: RealtimeSyncEngine
  private primaryWs: WebSocket | null = null
  private backupWs: WebSocket | null = null
  private endpoints: WebSocketEndpoint[] = []
  private currentEndpoint: WebSocketEndpoint | null = null
  private backupEndpoint: WebSocketEndpoint | null = null
  
  // Message handling
  private messageQueue: MessageQueue = {
    pending: [],
    failed: [],
    processing: new Set()
  }
  private processedMessages = new Set<string>()
  private sequenceId = 0
  private lastHeartbeat = 0
  private heartbeatInterval: NodeJS.Timeout | null = null
  
  // Conflict resolution
  private conflictQueue: ConflictResolution[] = []
  private isResolvingConflicts = false
  
  // Performance metrics
  private metrics: SyncMetrics = {
    messagesReceived: 0,
    messagesSent: 0,
    duplicatesFiltered: 0,
    conflictsResolved: 0,
    averageLatency: 0,
    connectionUptime: 0,
    failoverCount: 0,
    edgeOptimizations: 0
  }
  
  // Configuration
  private config = {
    heartbeatInterval: 30000, // 30 seconds
    reconnectDelay: 1000, // Start with 1 second
    maxReconnectDelay: 30000, // Max 30 seconds
    messageTimeout: 10000, // 10 seconds
    maxQueueSize: 1000,
    deduplicationWindow: 60000, // 1 minute
    latencyThreshold: 200, // 200ms
    reliabilityThreshold: 0.95
  }
  
  private constructor() {
    this.initialize()
  }
  
  static getInstance(): RealtimeSyncEngine {
    if (!RealtimeSyncEngine.instance) {
      RealtimeSyncEngine.instance = new RealtimeSyncEngine()
    }
    return RealtimeSyncEngine.instance
  }
  
  private async initialize(): Promise<void> {
    // Discover edge endpoints
    await this.discoverEdgeEndpoints()
    
    // Setup message processing
    this.startMessageProcessing()
    
    // Setup periodic tasks
    this.setupPeriodicTasks()
    
    // Connect to optimal endpoints
    await this.connectToOptimalEndpoints()
    
    console.log('[RealtimeSyncEngine] Initialized with', this.endpoints.length, 'endpoints')
  }
  
  private async discoverEdgeEndpoints(): Promise<void> {
    // Define potential edge endpoints
    const potentialEndpoints = [
      { url: 'wss://sync-us-east.example.com/ws', region: 'us-east' },
      { url: 'wss://sync-us-west.example.com/ws', region: 'us-west' },
      { url: 'wss://sync-eu.example.com/ws', region: 'eu' },
      { url: 'wss://sync-asia.example.com/ws', region: 'asia' },
      { url: 'wss://localhost:3001/ws', region: 'local' } // Development fallback
    ]
    
    // Measure latency to each endpoint
    const endpointPromises = potentialEndpoints.map(async (endpoint) => {
      const latency = await this.measureEndpointLatency(endpoint.url)
      return {
        ...endpoint,
        latency,
        reliability: 1.0, // Start with perfect reliability
        lastConnected: 0,
        failureCount: 0,
        isActive: false
      }
    })
    
    this.endpoints = await Promise.all(endpointPromises)
    
    // Sort by latency (best first)
    this.endpoints.sort((a, b) => a.latency - b.latency)
    
    console.log('[RealtimeSyncEngine] Discovered endpoints:', this.endpoints.map(e => `${e.region}: ${e.latency}ms`))
  }
  
  private async measureEndpointLatency(url: string): Promise<number> {
    const startTime = Date.now()
    
    try {
      // Use HTTP endpoint for latency measurement
      const httpUrl = url.replace('wss://', 'https://').replace('ws://', 'http://').replace('/ws', '/ping')
      
      const response = await fetch(httpUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000) // 5 second timeout
      })
      
      if (response.ok) {
        return Date.now() - startTime
      }
    } catch (error) {
      console.warn('[RealtimeSyncEngine] Failed to measure latency for', url, error)
    }
    
    return 9999 // High latency for failed endpoints
  }
  
  private async connectToOptimalEndpoints(): Promise<void> {
    // Select primary endpoint (lowest latency, high reliability)
    this.currentEndpoint = this.endpoints.find(e => 
      e.latency < this.config.latencyThreshold && 
      e.reliability > this.config.reliabilityThreshold
    ) || this.endpoints[0]
    
    // Select backup endpoint (different region, good performance)
    this.backupEndpoint = this.endpoints.find(e => 
      e !== this.currentEndpoint && 
      e.region !== this.currentEndpoint?.region &&
      e.reliability > 0.8
    ) || this.endpoints[1]
    
    // Connect to primary
    if (this.currentEndpoint) {
      await this.connectToPrimary()
    }
    
    // Connect to backup
    if (this.backupEndpoint) {
      await this.connectToBackup()
    }
  }
  
  private async connectToPrimary(): Promise<void> {
    if (!this.currentEndpoint) return
    
    try {
      this.primaryWs = new WebSocket(this.currentEndpoint.url)
      this.setupWebSocketHandlers(this.primaryWs, 'primary')
      
      await this.waitForConnection(this.primaryWs)
      
      this.currentEndpoint.isActive = true
      this.currentEndpoint.lastConnected = Date.now()
      this.currentEndpoint.failureCount = 0
      
      // Start heartbeat
      this.startHeartbeat()
      
      console.log('[RealtimeSyncEngine] Connected to primary:', this.currentEndpoint.region)
      
    } catch (error) {
      console.error('[RealtimeSyncEngine] Failed to connect to primary:', error)
      this.currentEndpoint.failureCount++
      this.currentEndpoint.reliability *= 0.9
      
      // Try backup or reconnect
      await this.handlePrimaryFailure()
    }
  }
  
  private async connectToBackup(): Promise<void> {
    if (!this.backupEndpoint) return
    
    try {
      this.backupWs = new WebSocket(this.backupEndpoint.url)
      this.setupWebSocketHandlers(this.backupWs, 'backup')
      
      await this.waitForConnection(this.backupWs)
      
      this.backupEndpoint.isActive = true
      this.backupEndpoint.lastConnected = Date.now()
      
      console.log('[RealtimeSyncEngine] Connected to backup:', this.backupEndpoint.region)
      
    } catch (error) {
      console.warn('[RealtimeSyncEngine] Failed to connect to backup:', error)
      this.backupEndpoint.failureCount++
    }
  }
  
  private waitForConnection(ws: WebSocket): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'))
      }, 10000)
      
      ws.onopen = () => {
        clearTimeout(timeout)
        resolve()
      }
      
      ws.onerror = (error) => {
        clearTimeout(timeout)
        reject(error)
      }
    })
  }
  
  private setupWebSocketHandlers(ws: WebSocket, type: 'primary' | 'backup'): void {
    ws.onmessage = (event) => {
      this.handleMessage(event.data, type)
    }
    
    ws.onclose = (event) => {
      console.warn(`[RealtimeSyncEngine] ${type} connection closed:`, event.code, event.reason)
      
      if (type === 'primary') {
        this.handlePrimaryFailure()
      } else {
        this.handleBackupFailure()
      }
    }
    
    ws.onerror = (error) => {
      console.error(`[RealtimeSyncEngine] ${type} connection error:`, error)
    }
  }
  
  private async handleMessage(data: string, source: 'primary' | 'backup'): Promise<void> {
    try {
      const message: SyncMessage = JSON.parse(data)
      
      // Update metrics
      this.metrics.messagesReceived++
      
      // Check for duplicates
      if (this.processedMessages.has(message.id)) {
        this.metrics.duplicatesFiltered++
        return
      }
      
      // Add to processed messages (with cleanup)
      this.processedMessages.add(message.id)
      this.cleanupProcessedMessages()
      
      // Handle different message types
      switch (message.type) {
        case 'email-new':
          await this.handleNewEmail(message)
          break
          
        case 'email-updated':
          await this.handleEmailUpdate(message)
          break
          
        case 'email-deleted':
          await this.handleEmailDeletion(message)
          break
          
        case 'thread-updated':
          await this.handleThreadUpdate(message)
          break
          
        case 'heartbeat':
          this.handleHeartbeat(message, source)
          break
          
        case 'sync-request':
          await this.handleSyncRequest(message)
          break
      }
      
    } catch (error) {
      console.error('[RealtimeSyncEngine] Failed to handle message:', error)
    }
  }
  
  private async handleNewEmail(message: SyncMessage): Promise<void> {
    const email = message.payload as Email
    
    // Check for conflicts
    const existingEmail = await cacheHierarchy.get(`email-${email.id}`)
    if (existingEmail) {
      await this.resolveConflict(email.id, existingEmail, email)
      return
    }
    
    // Cache new email
    await cacheHierarchy.set(`email-${email.id}`, email, { priority: 0.8 })
    
    // Trigger preload for related content
    await preloadEngine.preloadEmail(email.id, 0.6)
    
    // Broadcast to other tabs
    this.broadcastToTabs('email-new', email)
    
    console.log('[RealtimeSyncEngine] New email received:', email.subject)
  }
  
  private async handleEmailUpdate(message: SyncMessage): Promise<void> {
    const email = message.payload as Email
    
    // Get existing version
    const existingEmail = await cacheHierarchy.get(`email-${email.id}`)
    
    if (existingEmail) {
      // Check for conflicts
      if (this.hasConflict(existingEmail, email)) {
        await this.resolveConflict(email.id, existingEmail, email)
        return
      }
    }
    
    // Update cache
    await cacheHierarchy.set(`email-${email.id}`, email, { priority: 0.8 })
    
    // Broadcast update
    this.broadcastToTabs('email-updated', email)
  }
  
  private async handleEmailDeletion(message: SyncMessage): Promise<void> {
    const { emailId } = message.payload
    
    // Remove from cache
    await cacheHierarchy.invalidate(`email-${emailId}`)
    
    // Cancel any pending preloads
    preloadEngine.cancelPreloads(emailId)
    
    // Broadcast deletion
    this.broadcastToTabs('email-deleted', { emailId })
  }
  
  private async handleThreadUpdate(message: SyncMessage): Promise<void> {
    const { threadId, emails } = message.payload
    
    // Update all emails in thread
    for (const email of emails) {
      await cacheHierarchy.set(`email-${email.id}`, email, { priority: 0.7 })
    }
    
    // Broadcast thread update
    this.broadcastToTabs('thread-updated', { threadId, emails })
  }
  
  private handleHeartbeat(message: SyncMessage, source: 'primary' | 'backup'): void {
    this.lastHeartbeat = Date.now()
    
    // Calculate latency
    const latency = Date.now() - message.timestamp
    
    // Update endpoint metrics
    const endpoint = source === 'primary' ? this.currentEndpoint : this.backupEndpoint
    if (endpoint) {
      endpoint.latency = (endpoint.latency + latency) / 2 // Moving average
    }
    
    // Update overall metrics
    this.metrics.averageLatency = (this.metrics.averageLatency + latency) / 2
  }
  
  private async handleSyncRequest(message: SyncMessage): Promise<void> {
    const { since } = message.payload
    
    // This would typically trigger a full sync
    // For now, just acknowledge
    this.sendMessage({
      type: 'sync-request',
      payload: { acknowledged: true, since },
      timestamp: Date.now()
    })
  }
  
  private hasConflict(local: any, remote: any): boolean {
    // Simple conflict detection based on timestamps
    return local.updatedAt && remote.updatedAt && 
           Math.abs(local.updatedAt - remote.updatedAt) > 1000 && // More than 1 second difference
           JSON.stringify(local) !== JSON.stringify(remote)
  }
  
  private async resolveConflict(emailId: string, local: any, remote: any): Promise<void> {
    const conflict: ConflictResolution = {
      emailId,
      localVersion: local,
      remoteVersion: remote,
      resolution: 'remote', // Default to remote wins
      timestamp: Date.now()
    }
    
    // Simple resolution strategy: newest wins
    if (local.updatedAt > remote.updatedAt) {
      conflict.resolution = 'local'
    } else if (local.updatedAt < remote.updatedAt) {
      conflict.resolution = 'remote'
    } else {
      // Same timestamp, merge if possible
      conflict.resolution = 'merge'
    }
    
    this.conflictQueue.push(conflict)
    this.metrics.conflictsResolved++
    
    // Process conflict
    await this.processConflict(conflict)
  }
  
  private async processConflict(conflict: ConflictResolution): Promise<void> {
    let resolvedVersion: any
    
    switch (conflict.resolution) {
      case 'local':
        resolvedVersion = conflict.localVersion
        break
        
      case 'remote':
        resolvedVersion = conflict.remoteVersion
        break
        
      case 'merge':
        // Simple merge strategy
        resolvedVersion = {
          ...conflict.localVersion,
          ...conflict.remoteVersion,
          updatedAt: Math.max(conflict.localVersion.updatedAt, conflict.remoteVersion.updatedAt)
        }
        break
    }
    
    // Update cache with resolved version
    await cacheHierarchy.set(`email-${conflict.emailId}`, resolvedVersion, { priority: 0.9 })
    
    // Broadcast resolution
    this.broadcastToTabs('conflict-resolved', {
      emailId: conflict.emailId,
      resolution: conflict.resolution,
      version: resolvedVersion
    })
  }
  
  private async handlePrimaryFailure(): Promise<void> {
    console.warn('[RealtimeSyncEngine] Primary connection failed, attempting failover')
    
    this.metrics.failoverCount++
    
    if (this.currentEndpoint) {
      this.currentEndpoint.isActive = false
      this.currentEndpoint.reliability *= 0.8
    }
    
    // Promote backup to primary if available
    if (this.backupWs && this.backupWs.readyState === WebSocket.OPEN) {
      console.log('[RealtimeSyncEngine] Promoting backup to primary')
      
      this.primaryWs = this.backupWs
      this.currentEndpoint = this.backupEndpoint
      this.backupWs = null
      this.backupEndpoint = null
      
      // Find new backup
      await this.findNewBackup()
    } else {
      // No backup available, try to reconnect
      await this.reconnectToPrimary()
    }
  }
  
  private async handleBackupFailure(): Promise<void> {
    console.warn('[RealtimeSyncEngine] Backup connection failed')
    
    if (this.backupEndpoint) {
      this.backupEndpoint.isActive = false
      this.backupEndpoint.reliability *= 0.9
    }
    
    // Find new backup
    await this.findNewBackup()
  }
  
  private async findNewBackup(): Promise<void> {
    // Find best available endpoint that's not the current primary
    const availableEndpoints = this.endpoints.filter(e => 
      e !== this.currentEndpoint && 
      e.reliability > 0.5 &&
      e.failureCount < 5
    )
    
    if (availableEndpoints.length > 0) {
      // Sort by reliability and latency
      availableEndpoints.sort((a, b) => 
        (b.reliability - a.reliability) || (a.latency - b.latency)
      )
      
      this.backupEndpoint = availableEndpoints[0]
      await this.connectToBackup()
    }
  }
  
  private async reconnectToPrimary(): Promise<void> {
    const delay = Math.min(
      this.config.reconnectDelay * Math.pow(2, this.currentEndpoint?.failureCount || 0),
      this.config.maxReconnectDelay
    )
    
    console.log(`[RealtimeSyncEngine] Reconnecting to primary in ${delay}ms`)
    
    setTimeout(async () => {
      await this.connectToPrimary()
    }, delay)
  }
  
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
    }
    
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat()
    }, this.config.heartbeatInterval)
  }
  
  private sendHeartbeat(): void {
    this.sendMessage({
      type: 'heartbeat',
      payload: { timestamp: Date.now() },
      timestamp: Date.now()
    })
  }
  
  private sendMessage(partial: Partial<SyncMessage>): void {
    const message: SyncMessage = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: partial.type || 'heartbeat',
      payload: partial.payload || {},
      timestamp: partial.timestamp || Date.now(),
      source: 'client',
      sequenceId: ++this.sequenceId,
      ...partial
    }
    
    // Add to queue if connection is not ready
    if (!this.primaryWs || this.primaryWs.readyState !== WebSocket.OPEN) {
      this.messageQueue.pending.push(message)
      return
    }
    
    try {
      this.primaryWs.send(JSON.stringify(message))
      this.metrics.messagesSent++
    } catch (error) {
      console.error('[RealtimeSyncEngine] Failed to send message:', error)
      this.messageQueue.failed.push(message)
    }
  }
  
  private startMessageProcessing(): void {
    // Process pending messages every second
    setInterval(() => {
      this.processPendingMessages()
    }, 1000)
    
    // Retry failed messages every 5 seconds
    setInterval(() => {
      this.retryFailedMessages()
    }, 5000)
  }
  
  private processPendingMessages(): void {
    if (!this.primaryWs || this.primaryWs.readyState !== WebSocket.OPEN) {
      return
    }
    
    while (this.messageQueue.pending.length > 0) {
      const message = this.messageQueue.pending.shift()
      if (!message) break
      
      try {
        this.primaryWs.send(JSON.stringify(message))
        this.metrics.messagesSent++
      } catch (error) {
        this.messageQueue.failed.push(message)
        break
      }
    }
  }
  
  private retryFailedMessages(): void {
    if (!this.primaryWs || this.primaryWs.readyState !== WebSocket.OPEN) {
      return
    }
    
    const retryMessages = this.messageQueue.failed.splice(0, 10) // Retry up to 10 at a time
    
    for (const message of retryMessages) {
      try {
        this.primaryWs.send(JSON.stringify(message))
        this.metrics.messagesSent++
      } catch (error) {
        // If still failing, check message age
        if (Date.now() - message.timestamp < this.config.messageTimeout) {
          this.messageQueue.failed.push(message)
        }
        // Otherwise, discard old messages
      }
    }
  }
  
  private cleanupProcessedMessages(): void {
    // Keep only recent message IDs for deduplication
    if (this.processedMessages.size > 1000) {
      const messagesToKeep = Array.from(this.processedMessages).slice(-500)
      this.processedMessages.clear()
      messagesToKeep.forEach(id => this.processedMessages.add(id))
    }
  }
  
  private broadcastToTabs(type: string, data: any): void {
    // Use BroadcastChannel to communicate with other tabs
    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel('realtime-sync')
      channel.postMessage({ type, data, timestamp: Date.now() })
    }
  }
  
  private setupPeriodicTasks(): void {
    // Periodic tasks disabled - relying on Pub/Sub for real-time updates
    // No automatic endpoint optimization, conflict cleanup, or metric updates
    console.log('Periodic tasks disabled - using Pub/Sub for real-time updates')
  }
  
  private async optimizeEndpoints(): Promise<void> {
    console.log('[RealtimeSyncEngine] Optimizing endpoints')
    
    // Re-measure latencies
    for (const endpoint of this.endpoints) {
      if (!endpoint.isActive) {
        endpoint.latency = await this.measureEndpointLatency(endpoint.url)
      }
    }
    
    // Re-sort endpoints
    this.endpoints.sort((a, b) => 
      (b.reliability - a.reliability) || (a.latency - b.latency)
    )
    
    // Check if we should switch to a better endpoint
    const bestEndpoint = this.endpoints[0]
    if (bestEndpoint !== this.currentEndpoint && 
        bestEndpoint.latency < this.currentEndpoint!.latency * 0.8) {
      
      console.log('[RealtimeSyncEngine] Switching to better endpoint:', bestEndpoint.region)
      this.metrics.edgeOptimizations++
      
      // Gradual migration to avoid disruption
      await this.migrateToEndpoint(bestEndpoint)
    }
  }
  
  private async migrateToEndpoint(newEndpoint: WebSocketEndpoint): Promise<void> {
    // Connect to new endpoint as backup first
    const oldBackup = this.backupEndpoint
    this.backupEndpoint = newEndpoint
    
    try {
      await this.connectToBackup()
      
      // Wait a bit to ensure stability
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Promote new endpoint to primary
      if (this.backupWs && this.backupWs.readyState === WebSocket.OPEN) {
        // Close old primary
        if (this.primaryWs) {
          this.primaryWs.close()
        }
        
        // Promote backup to primary
        this.primaryWs = this.backupWs
        this.currentEndpoint = this.backupEndpoint
        this.backupWs = null
        this.backupEndpoint = oldBackup
        
        console.log('[RealtimeSyncEngine] Successfully migrated to:', newEndpoint.region)
      }
    } catch (error) {
      console.error('[RealtimeSyncEngine] Failed to migrate to new endpoint:', error)
      this.backupEndpoint = oldBackup
    }
  }
  
  private cleanupConflicts(): void {
    const oneHourAgo = Date.now() - 60 * 60 * 1000
    this.conflictQueue = this.conflictQueue.filter(c => c.timestamp > oneHourAgo)
  }
  
  private updateMetrics(): void {
    // Calculate uptime
    if (this.primaryWs && this.primaryWs.readyState === WebSocket.OPEN) {
      this.metrics.connectionUptime += 60 // Add 1 minute
    }
    
    // Log metrics periodically
    if (this.metrics.connectionUptime % 300 === 0) { // Every 5 minutes
      console.log('[RealtimeSyncEngine] Metrics:', {
        uptime: `${this.metrics.connectionUptime / 60} minutes`,
        latency: `${this.metrics.averageLatency.toFixed(1)}ms`,
        messages: `${this.metrics.messagesReceived}/${this.metrics.messagesSent}`,
        conflicts: this.metrics.conflictsResolved,
        failovers: this.metrics.failoverCount
      })
    }
  }
  
  // Public API
  public async connect(): Promise<void> {
    await this.connectToOptimalEndpoints()
  }
  
  public disconnect(): void {
    if (this.primaryWs) {
      this.primaryWs.close()
      this.primaryWs = null
    }
    
    if (this.backupWs) {
      this.backupWs.close()
      this.backupWs = null
    }
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }
  
  public getStatus(): {
    connected: boolean
    primaryEndpoint: string | null
    backupEndpoint: string | null
    latency: number
    uptime: number
  } {
    return {
      connected: this.primaryWs?.readyState === WebSocket.OPEN,
      primaryEndpoint: this.currentEndpoint?.region || null,
      backupEndpoint: this.backupEndpoint?.region || null,
      latency: this.metrics.averageLatency,
      uptime: this.metrics.connectionUptime
    }
  }
  
  public getMetrics(): SyncMetrics {
    return { ...this.metrics }
  }
  
  public getEndpoints(): WebSocketEndpoint[] {
    return [...this.endpoints]
  }
  
  public forceSync(): void {
    this.sendMessage({
      type: 'sync-request',
      payload: { force: true, timestamp: Date.now() },
      timestamp: Date.now()
    })
  }
}

// Export singleton instance - only in production
export const realtimeSyncEngine = process.env.NODE_ENV === 'production' 
  ? RealtimeSyncEngine.getInstance() 
  : null
export default realtimeSyncEngine