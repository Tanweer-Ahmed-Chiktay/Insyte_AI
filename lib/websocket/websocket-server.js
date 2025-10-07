const { WebSocketServer, WebSocket } = require('ws');
const { parse } = require('url');
const jwt = require('jsonwebtoken');

class WebSocketManager {
  constructor() {
    this.wss = null;
    this.clients = new Map();
    this.subscriptions = new Map();
    this.heartbeatInterval = null;
    this.setupHeartbeat();
  }

  initialize(server) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/api/ws',
      verifyClient: this.verifyClient.bind(this)
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    console.log('WebSocket server initialized');
  }

  async verifyClient(info) {
    try {
      // Extract token from URL query parameter
      const url = parse(info.req.url, true);
      const token = url.query.token;
      
      if (!token) {
        console.log('WebSocket: Missing token in URL query');
        return false;
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET);
      return !!decoded.sub;
    } catch (error) {
      console.error('WebSocket auth error:', error);
      return false;
    }
  }

  handleConnection(ws, req) {
    // Extract token from URL query parameter
    const url = parse(req.url, true);
    const token = url.query.token;
    
    if (!token) {
      console.error('WebSocket: Missing token in URL query');
      ws.close(1008, 'Missing authorization');
      return;
    }
    
    try {
      // Token already verified in verifyClient, just decode to get userId
      const decoded = jwt.decode(token);
      const userId = decoded.sub;
      
      ws.userId = userId;
      ws.isAlive = true;
      
      const clientId = this.generateClientId();
      this.clients.set(clientId, ws);
      this.subscriptions.set(clientId, {
        userId,
        topics: new Set()
      });

      console.log(`WebSocket client connected: ${userId}`);

      ws.on('message', (data) => this.handleMessage(clientId, data));
      ws.on('close', (code, reason) => this.handleDisconnection(clientId, code, reason));
      ws.on('error', (error) => {
        console.error(`WebSocket error for client ${clientId}:`, error);
      });
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Send welcome message
      this.sendToClient(clientId, {
        type: 'connected',
        payload: { clientId },
        timestamp: Date.now()
      });

    } catch (error) {
      console.error('WebSocket connection error:', error);
      ws.close(1008, 'Invalid token');
    }
  }

  handleMessage(clientId, data) {
    try {
      const message = JSON.parse(data.toString());
      const client = this.clients.get(clientId);
      const subscription = this.subscriptions.get(clientId);
      
      if (!client || !subscription) {
        return;
      }

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
            payload: {},
            timestamp: Date.now()
          });
          break;
        case 'heartbeat':
          // Update client's alive status and last seen time
          client.isAlive = true;
          subscription.lastSeen = Date.now();
          break;
        default:
          console.warn(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  }

  handleSubscribe(clientId, payload) {
    const subscription = this.subscriptions.get(clientId);
    if (!subscription) return;

    payload.topics.forEach(topic => {
      subscription.topics.add(topic);
    });

    this.sendToClient(clientId, {
      type: 'subscribed',
      payload: { topics: payload.topics },
      timestamp: Date.now()
    });
  }

  handleUnsubscribe(clientId, payload) {
    const subscription = this.subscriptions.get(clientId);
    if (!subscription) return;

    payload.topics.forEach(topic => {
      subscription.topics.delete(topic);
    });

    this.sendToClient(clientId, {
      type: 'unsubscribed',
      payload: { topics: payload.topics },
      timestamp: Date.now()
    });
  }

  handleDisconnection(clientId, code, reason) {
    const subscription = this.subscriptions.get(clientId);
    const reasonText = reason instanceof Buffer ? reason.toString() : reason;
    if (subscription) {
      console.log(`WebSocket client disconnected: ${subscription.userId} (${clientId}) - Code: ${code}, Reason: ${reasonText || ''}`);
    } else {
      console.log(`WebSocket client disconnected: unknown (${clientId}) - Code: ${code}, Reason: ${reasonText || ''}`);
    }
    this.clients.delete(clientId);
    this.subscriptions.delete(clientId);
  }

  broadcastToUser(userId, message) {
    this.subscriptions.forEach((subscription, clientId) => {
      if (subscription.userId === userId) {
        this.sendToClient(clientId, {
          type: message.type || 'broadcast',
          payload: message.payload || message,
          timestamp: Date.now()
        });
      }
    });
  }

  broadcastToTopic(topic, message) {
    this.subscriptions.forEach((subscription, clientId) => {
      if (subscription.topics.has(topic)) {
        this.sendToClient(clientId, {
          type: message.type || 'broadcast',
          payload: message.payload || message,
          timestamp: Date.now()
        });
      }
    });
  }

  setupHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((ws, clientId) => {
        if (!ws.isAlive) {
          this.handleDisconnection(clientId);
          ws.terminate();
          return;
        }
        
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000); // 30 seconds
  }

  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  sendToClient(clientId, message) {
    const client = this.clients.get(clientId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }

  getConnectedClients() {
    return this.clients.size;
  }

  getUserConnections(userId) {
    let count = 0;
    this.subscriptions.forEach(subscription => {
      if (subscription.userId === userId) {
        count++;
      }
    });
    return count;
  }

  shutdown() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    this.clients.forEach(client => {
      client.close(1001, 'Server shutdown');
    });
    
    if (this.wss) {
      this.wss.close();
    }
    
    console.log('WebSocket server shut down');
  }
}

// Singleton instance
const wsManager = new WebSocketManager();

module.exports = { wsManager, WebSocketManager };