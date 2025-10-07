// WebSocket service wrapper for the unified WebSocket manager
// Provides backward compatibility and convenience methods

import { wsManager } from './websocket/unified-websocket-manager';
import type { 
  WebSocketMessage, 
  EmailUpdateData, 
  SyncStatusData 
} from './websocket/unified-websocket-manager';

class WebSocketService {
  private static instance: WebSocketService | null = null;

  constructor() {
    if (WebSocketService.instance) {
      return WebSocketService.instance;
    }
    WebSocketService.instance = this;
  }

  /**
   * Broadcast email update to user
   */
  broadcastEmailUpdate(userId: string, updateData: EmailUpdateData) {
    wsManager.notifyEmailUpdate(userId, updateData);
  }

  /**
   * Broadcast sync status to user
   */
  broadcastSyncStatus(userId: string, statusData: SyncStatusData) {
    wsManager.notifySyncStatus(userId, statusData);
  }

  /**
   * Broadcast error to user
   */
  broadcastError(userId: string, error: string) {
    wsManager.broadcastToUser(userId, {
      type: 'error',
      payload: { message: error },
      timestamp: Date.now()
    });
  }

  /**
   * Broadcast new email to user
   */
  broadcastNewEmail(userId: string, email: any) {
    wsManager.notifyNewEmail(userId, email);
  }

  /**
   * Broadcast email deletion to user
   */
  broadcastEmailDeleted(userId: string, emailId: string) {
    wsManager.notifyEmailDeleted(userId, emailId);
  }

  /**
   * Broadcast calendar event to user
   */
  broadcastCalendarEvent(userId: string, event: any) {
    wsManager.notifyCalendarEvent(userId, event);
  }

  /**
   * Get service statistics
   */
  getStats() {
    return wsManager.getStats();
  }

  /**
   * Get user connection count
   */
  getUserConnections(userId: string): number {
    return wsManager.getUserConnections(userId);
  }

  /**
   * Stop the WebSocket service
   */
  stop() {
    wsManager.shutdown();
    WebSocketService.instance = null;
  }
}

// Singleton instance
let globalWebSocketService: WebSocketService | null = null;

export function getWebSocketService(): WebSocketService {
  if (!globalWebSocketService) {
    globalWebSocketService = new WebSocketService();
  }
  return globalWebSocketService;
}

export { WebSocketService, type WebSocketMessage, type EmailUpdateData, type SyncStatusData };