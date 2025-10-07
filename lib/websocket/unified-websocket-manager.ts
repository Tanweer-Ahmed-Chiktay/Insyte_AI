import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { parse } from 'url';
import jwt from 'jsonwebtoken';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  isAlive?: boolean;
  clientId?: string;
}

interface WebSocketMessage {
  type: string;
  payload?: any;
  timestamp?: number;
}

interface ClientSubscription {
  userId: string;
  topics: Set<string>;
  lastSeen: number;
}

interface EmailUpdateData {
  category: string;
  action: 'added' | 'updated' | 'deleted' | 'moved' | 'starred' | 'unstarred' | 'read' | 'unread';
  emailIds: string[];
  count?: number;
  fromCategory?: string;
  toCategory?: string;
}

interface SyncStatusData {
  category: string;
  status: 'started' | 'completed' | 'failed';
  progress?: number;
  message?: string;
}

class UnifiedWebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, AuthenticatedWebSocket>();
  private subscriptions = new Map<string, ClientSubscription>();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private static instance: UnifiedWebSocketManager | null = null;

  constructor() {
    if (UnifiedWebSocketManager.instance) {
      return UnifiedWebSocketManager.instance;
    }
    UnifiedWebSocketManager.instance = this;
    this.setupHeartbeat();
  }

  static getInstance(): UnifiedWebSocketManager {
    if (!UnifiedWebSocketManager.instance) {
      UnifiedWebSocketManager.instance = new UnifiedWebSocketManager();
    }
    return UnifiedWebSocketManager.instance;
  }

  initialize(server: any): void {
    console.log('WebSocket manager initialize called, current wss:', !!this.wss);
    if (this.wss) {
      console.log('WebSocket server already initialized, skipping');
      return;
    }

    try {
      this.wss = new WebSocketServer({ 
        server,
        path: '/api/ws',
        verifyClient: this.verifyClient.bind(this)
      });

      this.wss.on('connection', this.handleConnection.bind(this));
      console.log('WebSocket server initialized successfully');
    } catch (error) {
      console.error('Failed to initialize WebSocket server:', error);
      this.wss = null;
    }
  }

  private async verifyClient(info: { req: IncomingMessage }): Promise<boolean> {
    const url = parse(info.req.url || '', true);
    const token = url.query.token as string;
    
    try {
      console.log('WebSocket verification - URL:', info.req.url);
      console.log('WebSocket verification - Token received:', token ? `${token.substring(0, 20)}...` : 'NO TOKEN');
      
      if (!token) {
        console.warn('WebSocket connection rejected: No token provided');
        return false;
      }

      if (!process.env.NEXTAUTH_SECRET) {
        console.error('NEXTAUTH_SECRET not configured');
        return false;
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET) as any;
      console.log('WebSocket verification successful for user:', decoded.sub);
      return !!decoded.sub;
    } catch (error) {
      console.error('WebSocket auth error:', error);
      console.error('Token that failed:', token ? `${token.substring(0, 50)}...` : 'NO TOKEN');
      return false;
    }
  }

  private handleConnection(ws: AuthenticatedWebSocket, req: IncomingMessage): void {
    const url = parse(req.url || '', true);
    const token = url.query.token as string;
    
    try {
      const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET!) as any;
      const userId = decoded.sub;
      
      ws.userId = userId;
      ws.isAlive = true;
      
      const clientId = this.generateClientId();
      ws.clientId = clientId;
      
      this.clients.set(clientId, ws);
      this.subscriptions.set(clientId, {
        userId,
        topics: new Set(['email:updates', 'sync:status']), // Default subscriptions
        lastSeen: Date.now()
      });

      console.log(`WebSocket client connected: ${userId} (${clientId})`);

      // Set up event handlers
      ws.on('message', (data) => this.handleMessage(clientId, data));
      ws.on('close', (code, reason) => this.handleDisconnection(clientId, code, reason));
      ws.on('error', (error) => this.handleError(clientId, error));
      ws.on('pong', () => {
        ws.isAlive = true;
        const subscription = this.subscriptions.get(clientId);
        if (subscription) {
          subscription.lastSeen = Date.now();
        }
      });

      // Send welcome message with connection confirmation
      this.sendToClient(clientId, {
        type: 'connected',
        payload: { 
          clientId,
          userId,
          subscribedTopics: Array.from(this.subscriptions.get(clientId)?.topics || [])
        },
        timestamp: Date.now()
      });

    } catch (error) {
      console.error('WebSocket connection error:', error);
      ws.close(1008, 'Authentication failed');
    }
  }

  private handleMessage(clientId: string, data: any): void {
    try {
      const message = JSON.parse(data.toString()) as WebSocketMessage;
      const client = this.clients.get(clientId);
      const subscription = this.subscriptions.get(clientId);
      
      if (!client || !subscription) {
        console.warn(`Invalid client or subscription for ${clientId}`);
        return;
      }

      // Update last seen
      subscription.lastSeen = Date.now();

      switch (message.type) {
        case 'subscribe':
          this.handleSubscribe(clientId, message.payload);
          break;
        case 'unsubscribe':
          this.handleUnsubscribe(clientId, message.payload);
          break;
        case 'ping':
          this.sendToClient(clientId, {
            type: 'pong',
            payload: { timestamp: Date.now() },
            timestamp: Date.now()
          });
          break;
        case 'heartbeat':
          client.isAlive = true;
          subscription.lastSeen = Date.now();
          break;
        default:
          console.warn(`Unknown message type from ${clientId}: ${message.type}`);
          this.sendToClient(clientId, {
            type: 'error',
            payload: { message: `Unknown message type: ${message.type}` },
            timestamp: Date.now()
          });
      }
    } catch (error) {
      console.error(`Error handling WebSocket message from ${clientId}:`, error);
      this.sendToClient(clientId, {
        type: 'error',
        payload: { message: 'Invalid message format' },
        timestamp: Date.now()
      });
    }
  }

  private handleSubscribe(clientId: string, payload: { topics?: string[] }): void {
    const subscription = this.subscriptions.get(clientId);
    if (!subscription || !payload.topics) {
      return;
    }

    payload.topics.forEach(topic => {
      subscription.topics.add(topic);
    });

    this.sendToClient(clientId, {
      type: 'subscribed',
      payload: { 
        topics: payload.topics,
        allTopics: Array.from(subscription.topics)
      },
      timestamp: Date.now()
    });

    console.log(`Client ${clientId} subscribed to topics:`, payload.topics);
  }

  private handleUnsubscribe(clientId: string, payload: { topics?: string[] }): void {
    const subscription = this.subscriptions.get(clientId);
    if (!subscription || !payload.topics) {
      return;
    }

    payload.topics.forEach(topic => {
      subscription.topics.delete(topic);
    });

    this.sendToClient(clientId, {
      type: 'unsubscribed',
      payload: { 
        topics: payload.topics,
        allTopics: Array.from(subscription.topics)
      },
      timestamp: Date.now()
    });

    console.log(`Client ${clientId} unsubscribed from topics:`, payload.topics);
  }

  private handleDisconnection(clientId: string, code?: number, reason?: Buffer): void {
    const subscription = this.subscriptions.get(clientId);
    if (subscription) {
      console.log(`WebSocket client disconnected: ${subscription.userId} (${clientId}) - Code: ${code}, Reason: ${reason?.toString()}`);
    }
    
    this.clients.delete(clientId);
    this.subscriptions.delete(clientId);
  }

  private handleError(clientId: string, error: Error): void {
    console.error(`WebSocket error for client ${clientId}:`, error);
  }

  private setupHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const staleConnections: string[] = [];

      this.clients.forEach((ws, clientId) => {
        const subscription = this.subscriptions.get(clientId);
        
        // Check if connection is stale (no activity in 60 seconds)
        if (subscription && now - subscription.lastSeen > 60000) {
          staleConnections.push(clientId);
          return;
        }

        if (!ws.isAlive) {
          staleConnections.push(clientId);
          return;
        }
        
        ws.isAlive = false;
        ws.ping();
      });

      // Clean up stale connections
      staleConnections.forEach(clientId => {
        const ws = this.clients.get(clientId);
        if (ws) {
          ws.terminate();
        }
        this.handleDisconnection(clientId);
      });

      if (staleConnections.length > 0) {
        console.log(`Cleaned up ${staleConnections.length} stale WebSocket connections`);
      }
    }, 30000); // 30 seconds
  }

  private generateClientId(): string {
    return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private sendToClient(clientId: string, message: WebSocketMessage): void {
    const client = this.clients.get(clientId);
    if (client && client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify({
          ...message,
          timestamp: message.timestamp || Date.now()
        }));
      } catch (error) {
        console.error(`Failed to send message to client ${clientId}:`, error);
        this.handleDisconnection(clientId);
      }
    }
  }

  // Public broadcasting methods
  broadcastToUser(userId: string, message: WebSocketMessage): void {
    console.log(`[WebSocket Manager] Broadcasting ${message.type} to user ${userId}`);
    let sentCount = 0;
    this.subscriptions.forEach((subscription, clientId) => {
      if (subscription.userId === userId) {
        console.log(`[WebSocket Manager] Sending to client ${clientId}`);
        this.sendToClient(clientId, message);
        sentCount++;
      }
    });
    
    if (sentCount === 0) {
      console.log(`[WebSocket Manager] No active connections for user ${userId}`);
    } else {
      console.log(`[WebSocket Manager] Broadcasted ${message.type} to ${sentCount} connections for user ${userId}`);
    }
  }

  broadcastToTopic(topic: string, message: WebSocketMessage): void {
    let sentCount = 0;
    this.subscriptions.forEach((subscription, clientId) => {
      if (subscription.topics.has(topic)) {
        this.sendToClient(clientId, message);
        sentCount++;
      }
    });
    console.log(`Broadcasted message to ${sentCount} clients subscribed to topic ${topic}`);
  }

  // Email-specific methods
  notifyEmailUpdate(userId: string, updateData: EmailUpdateData): void {
    console.log(`[WebSocket Manager] Notifying email update for user ${userId}:`, updateData);
    this.broadcastToUser(userId, {
      type: 'email:update',
      payload: updateData,
      timestamp: Date.now()
    });
  }

  notifyNewEmail(userId: string, email: any): void {
    console.log(`[WebSocket Manager] Notifying new email for user ${userId}:`, email?.id || 'unknown');
    this.broadcastToUser(userId, {
      type: 'email:new',
      payload: email,
      timestamp: Date.now()
    });
  }

  notifyEmailDeleted(userId: string, emailId: string): void {
    console.log(`[WebSocket Manager] Notifying email deleted for user ${userId}:`, emailId);
    this.broadcastToUser(userId, {
      type: 'email:deleted',
      payload: { emailId },
      timestamp: Date.now()
    });
  }

  // Sync status methods
  notifySyncStatus(userId: string, statusData: SyncStatusData): void {
    this.broadcastToUser(userId, {
      type: 'sync:status',
      payload: statusData,
      timestamp: Date.now()
    });
  }

  // Calendar methods
  notifyCalendarEvent(userId: string, event: any): void {
    this.broadcastToUser(userId, {
      type: 'calendar:event',
      payload: event,
      timestamp: Date.now()
    });
  }

  // Statistics and monitoring
  getStats(): {
    totalConnections: number;
    totalUsers: number;
    connectionsPerUser: Array<{ userId: string; connections: number }>;
    topicSubscriptions: Record<string, number>;
  } {
    const userConnectionCounts = new Map<string, number>();
    const topicCounts = new Map<string, number>();

    this.subscriptions.forEach(subscription => {
      // Count connections per user
      const current = userConnectionCounts.get(subscription.userId) || 0;
      userConnectionCounts.set(subscription.userId, current + 1);

      // Count topic subscriptions
      subscription.topics.forEach(topic => {
        const topicCount = topicCounts.get(topic) || 0;
        topicCounts.set(topic, topicCount + 1);
      });
    });

    return {
      totalConnections: this.clients.size,
      totalUsers: userConnectionCounts.size,
      connectionsPerUser: Array.from(userConnectionCounts.entries()).map(([userId, connections]) => ({
        userId,
        connections
      })),
      topicSubscriptions: Object.fromEntries(topicCounts.entries())
    };
  }

  getUserConnections(userId: string): number {
    let count = 0;
    this.subscriptions.forEach(subscription => {
      if (subscription.userId === userId) {
        count++;
      }
    });
    return count;
  }

  shutdown(): void {
    console.log('Shutting down WebSocket manager...');
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    // Gracefully close all connections
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.close(1001, 'Server shutdown');
      }
    });
    
    if (this.wss) {
      this.wss.close(() => {
        console.log('WebSocket server closed');
      });
    }
    
    this.clients.clear();
    this.subscriptions.clear();
    UnifiedWebSocketManager.instance = null;
  }
}

// Singleton instance
export const wsManager = UnifiedWebSocketManager.getInstance();
export { UnifiedWebSocketManager };
export type { 
  WebSocketMessage, 
  AuthenticatedWebSocket, 
  EmailUpdateData, 
  SyncStatusData,
  ClientSubscription 
};