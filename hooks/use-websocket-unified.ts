import { useEffect, useRef, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';

export interface WebSocketMessage {
  type: string;
  payload?: any;
  timestamp?: number;
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

interface UseWebSocketOptions {
  autoReconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onEmailUpdate?: (data: EmailUpdateData) => void;
  onSyncStatus?: (data: SyncStatusData) => void;
  onNewEmail?: (email: any) => void;
  onEmailDeleted?: (emailId: string) => void;
  onCalendarEvent?: (event: any) => void;
  onError?: (error: string) => void;
  debug?: boolean;
}

interface WebSocketState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  lastMessage: WebSocketMessage | null;
  subscribedTopics: string[];
}

// Global connection state to prevent multiple simultaneous connections
let globalConnectionState = {
  isConnecting: false,
  lastConnectionAttempt: 0,
  connectionThrottleMs: 1000 // Minimum time between connection attempts
};

export function useWebSocketUnified(options: UseWebSocketOptions = {}) {
  const { data: session, status } = useSession();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isManualCloseRef = useRef(false);

  const {
    autoReconnect = true,
    reconnectInterval = 3000,
    maxReconnectAttempts = 5,
    onEmailUpdate,
    onSyncStatus,
    onNewEmail,
    onEmailDeleted,
    onCalendarEvent,
    onError,
    debug = false
  } = options;

  // Use refs to store callback functions and debug flag to prevent recreation of handlers
  const callbacksRef = useRef({
    onEmailUpdate,
    onSyncStatus,
    onNewEmail,
    onEmailDeleted,
    onCalendarEvent,
    onError
  });
  
  const debugRef = useRef(debug);
  
  // Update refs when callbacks or debug flag change
  callbacksRef.current = {
    onEmailUpdate,
    onSyncStatus,
    onNewEmail,
    onEmailDeleted,
    onCalendarEvent,
    onError
  };
  
  debugRef.current = debug;

  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    isConnecting: false,
    error: null,
    lastMessage: null,
    subscribedTopics: []
  });

  const log = useCallback((message: string, ...args: any[]) => {
    if (debugRef.current) {
      console.log(`[WebSocket] ${message}`, ...args);
    }
  }, []);

  const updateState = useCallback((updates: Partial<WebSocketState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({
          ...message,
          timestamp: Date.now()
        }));
        log('Sent message:', message);
        return true;
      } catch (error) {
        console.error('Failed to send WebSocket message:', error);
        return false;
      }
    }
    return false;
  }, [log]);

  const subscribe = useCallback((topics: string[]) => {
    return sendMessage({
      type: 'subscribe',
      payload: { topics }
    });
  }, [sendMessage]);

  const unsubscribe = useCallback((topics: string[]) => {
    return sendMessage({
      type: 'unsubscribe',
      payload: { topics }
    });
  }, [sendMessage]);

  const startHeartbeat = useCallback(() => {
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
    }
    
    heartbeatTimeoutRef.current = setTimeout(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }));
          log('Sent heartbeat');
          startHeartbeat(); // Schedule next heartbeat
        } catch (error) {
          console.error('Failed to send heartbeat:', error);
        }
      }
    }, 30000);
  }, [log]);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      log('Received message:', message);
      
      updateState({ 
        lastMessage: message,
        error: null 
      });

      // Handle specific message types
      switch (message.type) {
        case 'connected':
          log('WebSocket connected successfully', message.payload);
          
          // Reset global connection state on successful connection
          globalConnectionState.isConnecting = false;
          
          updateState({ 
            isConnected: true, 
            isConnecting: false,
            subscribedTopics: message.payload?.subscribedTopics || []
          });
          reconnectAttemptRef.current = 0;
          startHeartbeat();
          break;

        case 'subscribed':
          log('Successfully subscribed to topics:', message.payload?.topics);
          updateState({
            subscribedTopics: message.payload?.allTopics || []
          });
          break;

        case 'unsubscribed':
          log('Successfully unsubscribed from topics:', message.payload?.topics);
          updateState({
            subscribedTopics: message.payload?.allTopics || []
          });
          break;

        case 'email:update':
          console.log('[WebSocket Client] Received email:update:', message.payload);
          if (callbacksRef.current.onEmailUpdate) {
            console.log('[WebSocket Client] Calling onEmailUpdate callback');
            callbacksRef.current.onEmailUpdate(message.payload);
          } else {
            console.log('[WebSocket Client] No onEmailUpdate callback registered');
          }
          
          // Dispatch custom event for UI components to listen to
          if (message.payload) {
            window.dispatchEvent(new CustomEvent('email-list-refresh', {
              detail: { 
                category: message.payload.category || 'inbox', 
                action: message.payload.action || 'added'
              }
            }));
          }
          break;

        case 'email:new':
          console.log('[WebSocket Client] Received email:new:', message.payload);
          if (callbacksRef.current.onNewEmail) {
            console.log('[WebSocket Client] Calling onNewEmail callback');
            callbacksRef.current.onNewEmail(message.payload);
          } else {
            console.log('[WebSocket Client] No onNewEmail callback registered');
          }
          
          // Dispatch custom event for UI components to listen to
          if (message.payload) {
            window.dispatchEvent(new CustomEvent('new-email-received', {
              detail: message.payload
            }));
            
            // Also trigger email list refresh for appropriate categories
            const email = message.payload;
            const categories = ['inbox'];
            
            // Add to additional categories based on email properties
            if (email.isStarred) categories.push('starred');
            if (email.isImportant) categories.push('important');
            if (!email.isRead) categories.push('unread');
            
            categories.forEach(category => {
              window.dispatchEvent(new CustomEvent('email-list-refresh', {
                detail: { category, action: 'added' }
              }));
            });
          }
          break;

        case 'email:deleted':
          console.log('[WebSocket Client] Received email:deleted:', message.payload);
          if (callbacksRef.current.onEmailDeleted) {
            console.log('[WebSocket Client] Calling onEmailDeleted callback');
            callbacksRef.current.onEmailDeleted(message.payload?.emailId);
          } else {
            console.log('[WebSocket Client] No onEmailDeleted callback registered');
          }
          break;

        case 'sync:status':
          log('Sync status update:', message.payload);
          callbacksRef.current.onSyncStatus?.(message.payload);
          break;

        case 'calendar:event':
          log('Calendar event received:', message.payload);
          callbacksRef.current.onCalendarEvent?.(message.payload);
          break;

        case 'gmail-push-notification':
          console.log('[WebSocket Client] Received gmail-push-notification:', message.payload);
          try {
            const newIds = message.payload?.changes?.newMessageIds 
              || message.payload?.newMessageIds 
              || [];
            const count = Array.isArray(newIds) && newIds.length > 0 
              ? newIds.length 
              : (message.payload?.newEmailCount || 1);
            if (callbacksRef.current.onEmailUpdate) {
              console.log('[WebSocket Client] Processing Gmail push notification with', count, 'new messages');
              callbacksRef.current.onEmailUpdate({
                category: 'inbox',
                action: 'added',
                emailIds: Array.isArray(newIds) ? newIds : [],
                count
              });
            } else {
              console.log('[WebSocket Client] Gmail push notification ignored - no onEmailUpdate callback');
            }
          } catch (e) {
            console.log('[WebSocket Client] Gmail push notification error, using fallback:', e);
            if (callbacksRef.current.onEmailUpdate) {
              callbacksRef.current.onEmailUpdate({
                category: 'inbox',
                action: 'added',
                emailIds: [],
                count: 1
              });
            }
          }
          break;

        case 'error':
          const errorMessage = message.payload?.message || 'Unknown WebSocket error';
          console.error('WebSocket error message:', errorMessage);
          updateState({ error: errorMessage });
          callbacksRef.current.onError?.(errorMessage);
          break;

        case 'ping':
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            try {
              wsRef.current.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
              log('Sent pong response');
            } catch (error) {
              console.error('Failed to send pong response:', error);
            }
          }
          break;

        case 'pong':
          log('Received pong from server');
          break;

        default:
          console.warn('Unknown WebSocket message type:', message.type);
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
      updateState({ error: 'Failed to parse message' });
    }
  }, [log, updateState, startHeartbeat]);

  const handleError = useCallback((event: Event): void => {
    console.error('WebSocket error:', event);
    const errorMessage = 'WebSocket connection error';
    updateState({ 
      error: errorMessage,
      isConnecting: false
    });
    callbacksRef.current.onError?.(errorMessage);
  }, [updateState]);

  const connect = useCallback(async (): Promise<void> => {
    if (status !== 'authenticated' || !session) {
      log('Cannot connect: no session or not authenticated');
      return;
    }

    // Check global connection throttling
    const now = Date.now();
    if (globalConnectionState.isConnecting || 
        (now - globalConnectionState.lastConnectionAttempt) < globalConnectionState.connectionThrottleMs) {
      log('Connection throttled or already connecting');
      return;
    }

    if (wsRef.current?.readyState === WebSocket.CONNECTING || 
        wsRef.current?.readyState === WebSocket.OPEN) {
      log('WebSocket already connecting or connected');
      return;
    }

    if (state.isConnecting) {
      log('Already attempting to connect');
      return;
    }

    try {
      globalConnectionState.isConnecting = true;
      globalConnectionState.lastConnectionAttempt = now;
      
      updateState({ 
        isConnecting: true, 
        error: null 
      });

      log('Attempting to connect to WebSocket...');
      
      // First, get a proper JWT token from the API
      log('Fetching WebSocket token from /api/ws...');
      let response;
      try {
        response = await fetch('/api/ws', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include'
        });
        log(`WebSocket token fetch response: ${response.status} ${response.statusText}`);
      } catch (fetchError) {
        console.error('Failed to fetch WebSocket token:', fetchError);
        throw new Error('Network error while getting WebSocket token');
      }

      if (!response.ok) {
        // Handle 503 Service Unavailable (WebSocket not supported in serverless)
        if (response.status === 503) {
          try {
            const errorData = await response.json();
            if (errorData.fallbackMode) {
              log('WebSocket not supported in serverless environment, falling back to polling');
              updateState({ 
                isConnected: false, 
                isConnecting: false,
                error: 'WebSocket not available - using polling mode'
              });
              globalConnectionState.isConnecting = false;
              return; // Exit gracefully without throwing
            }
          } catch (parseError) {
            // If we can't parse the error response, continue with generic error handling
          }
        }
        
        const errorText = await response.text().catch(() => 'Unknown error');
        log(`WebSocket token fetch failed: ${response.status} - ${errorText}`);
        throw new Error(`Failed to get WebSocket token: ${response.status} - ${errorText}`);
      }

      let tokenData;
      try {
        tokenData = await response.json();
        log('WebSocket token response:', tokenData);
      } catch (parseError) {
        console.error('Failed to parse WebSocket response:', parseError);
        throw new Error('Invalid response format from WebSocket endpoint');
      }

      const { token, wsUrl } = tokenData;

      if (!token || !wsUrl) {
         log('Missing token or WebSocket URL in response:', tokenData);
         throw new Error('Missing token or WebSocket URL in response');
       }

      log('Got WebSocket token, connecting to:', wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        log('WebSocket connection opened');
        globalConnectionState.isConnecting = false;
        reconnectAttemptRef.current = 0;
        isManualCloseRef.current = false;
      };
      
      ws.onmessage = handleMessage;
      ws.onclose = (event: CloseEvent) => {
        log('WebSocket connection closed:', event.code, event.reason);
        
        updateState({ 
          isConnected: false, 
          isConnecting: false,
          subscribedTopics: []
        });

        // Clear heartbeat
        if (heartbeatTimeoutRef.current) {
          clearTimeout(heartbeatTimeoutRef.current);
          heartbeatTimeoutRef.current = null;
        }

        // Auto-reconnect logic
        if (!isManualCloseRef.current && autoReconnect && reconnectAttemptRef.current < maxReconnectAttempts) {
          const delay = reconnectInterval * Math.pow(2, reconnectAttemptRef.current);
          log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttemptRef.current + 1}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptRef.current += 1;
            connect();
          }, delay);
        } else if (reconnectAttemptRef.current >= maxReconnectAttempts) {
          const error = 'Max reconnection attempts reached';
          updateState({ error });
          callbacksRef.current.onError?.(error);
        }
      };
      ws.onerror = handleError;

    } catch (error) {
      globalConnectionState.isConnecting = false;
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect';
      log('Connection failed:', errorMessage);
      updateState({ 
        error: errorMessage,
        isConnecting: false
      });
      callbacksRef.current.onError?.(errorMessage);
      
      // Implement exponential backoff for failed connection attempts
      if (autoReconnect && reconnectAttemptRef.current < maxReconnectAttempts) {
        const delay = Math.min(reconnectInterval * Math.pow(2, reconnectAttemptRef.current), 30000);
        log(`Retrying connection in ${delay}ms due to fetch error`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptRef.current += 1;
          connect();
        }, delay);
      }
    }
  }, [status, session, log, updateState, state.isConnecting, handleMessage, handleError, autoReconnect, maxReconnectAttempts, reconnectInterval]);

  const disconnect = useCallback(() => {
    log('Manually disconnecting WebSocket');
    isManualCloseRef.current = true;
    
    // Clear timeouts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'Manual disconnect');
      wsRef.current = null;
    }

    updateState({
      isConnected: false,
      isConnecting: false,
      subscribedTopics: []
    });
  }, [log, updateState]);

  // Auto-connect when session is available
  useEffect(() => {
    if (status === 'authenticated' && session) {
      isManualCloseRef.current = false;
      connect();
    } else if (status === 'unauthenticated') {
      disconnect();
    }
  }, [status, session, connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (heartbeatTimeoutRef.current) {
        clearTimeout(heartbeatTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    sendMessage,
    subscribe,
    unsubscribe,
    reconnectAttempt: reconnectAttemptRef.current,
    maxReconnectAttempts
  };
}