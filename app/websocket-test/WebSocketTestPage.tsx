'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

interface WebSocketMessage {
  type: string;
  payload?: any;
  timestamp?: number;
}

export function WebSocketTestPage() {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<Array<{type: string, data: any, timestamp: string}>>([]);
  const [token, setToken] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [url, setUrl] = useState('');
  const { toast } = useToast();

  // Get WebSocket URL based on environment
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    setUrl(`${protocol}//${host}/api/ws`);
  }, []);

  // Connect to WebSocket
  const connect = () => {
    if (!token.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a valid token',
        variant: 'destructive',
      });
      return;
    }

    try {
      const wsUrl = `${url}?token=${encodeURIComponent(token)}`;
      const socket = new WebSocket(wsUrl);
      
      socket.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        addMessage('connection', { status: 'connected' });
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('WebSocket message received:', data);
          
          if (data.type === 'connected') {
            setIsAuthenticated(true);
          }
          
          addMessage(data.type || 'message', data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          addMessage('error', { error: 'Failed to parse message', raw: event.data });
        }
      };

      socket.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        setIsAuthenticated(false);
        addMessage('connection', { 
          status: 'disconnected',
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean 
        });
        
        // Auto-reconnect if not a normal closure
        if (event.code !== 1000) {
          setTimeout(() => {
            console.log('Attempting to reconnect...');
            connect();
          }, 3000);
        }
      };

      socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        addMessage('error', { error: 'WebSocket error occurred' });
      };

      setWs(socket);
      return () => {
        socket.close();
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      toast({
        title: 'Connection Error',
        description: 'Failed to connect to WebSocket server',
        variant: 'destructive',
      });
    }
  };

  // Disconnect from WebSocket
  const disconnect = () => {
    if (ws) {
      ws.close(1000, 'User disconnected');
      setWs(null);
      setIsConnected(false);
      setIsAuthenticated(false);
    }
  };

  // Send a test message
  const sendTestMessage = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      toast({
        title: 'Error',
        description: 'WebSocket is not connected',
        variant: 'destructive',
      });
      return;
    }

    const testMessage = {
      type: 'test',
      payload: {
        message: 'This is a test message',
        timestamp: new Date().toISOString(),
      },
    };

    ws.send(JSON.stringify(testMessage));
    addMessage('sent', testMessage);
  };

  // Simulate Gmail push notification
  const simulateGmailPush = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      toast({
        title: 'Error',
        description: 'WebSocket is not connected',
        variant: 'destructive',
      });
      return;
    }

    const testMessage = {
      type: 'gmail-push-notification',
      payload: {
        emailAddress: 'test@example.com',
        historyId: `history-id-${Date.now()}`,
        changes: {
          newMessageIds: [`msg-${Date.now()}`],
        },
        newEmailCount: 1,
        timestamp: Date.now(),
      },
    };

    ws.send(JSON.stringify(testMessage));
    addMessage('sent', testMessage);
  };

  // Add a message to the log
  const addMessage = (type: string, data: any) => {
    const message = {
      type,
      data,
      timestamp: new Date().toISOString(),
    };
    
    setMessages(prev => [message, ...prev].slice(0, 100)); // Keep last 100 messages
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">WebSocket Test</h1>
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Connection</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="token">JWT Token</Label>
              <Input
                id="token"
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Enter JWT token"
                className="mt-1"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Get a token from your browser's localStorage or cookies after logging in
              </p>
            </div>
            
            <div className="flex gap-2">
              {!isConnected ? (
                <Button onClick={connect} disabled={!token.trim()}>
                  Connect
                </Button>
              ) : (
                <Button onClick={disconnect} variant="destructive">
                  Disconnect
                </Button>
              )}
              
              <div className="flex items-center gap-2 ml-4">
                <div className={`w-3 h-3 rounded-full ${
                  isConnected ? 'bg-green-500' : 'bg-red-500'
                }`}></div>
                <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
                {isAuthenticated && (
                  <Badge variant="secondary">Authenticated</Badge>
                )}
              </div>
            </div>
            
            <div className="text-sm">
              <p><strong>WebSocket URL:</strong> {url}</p>
              <p><strong>Status:</strong> {ws?.readyState === WebSocket.OPEN ? 'Open' : 'Closed'}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Test Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button 
              onClick={sendTestMessage} 
              disabled={!isConnected || !isAuthenticated}
            >
              Send Test Message
            </Button>
            <Button 
              onClick={simulateGmailPush} 
              disabled={!isConnected || !isAuthenticated}
              variant="outline"
            >
              Simulate Gmail Push
            </Button>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Message Log</CardTitle>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setMessages([])}
            >
              Clear Log
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto border rounded-md p-2">
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No messages yet. Connect to start receiving messages.
              </p>
            ) : (
              messages.map((msg, index) => (
                <div 
                  key={index} 
                  className="text-xs p-2 bg-background rounded border-b last:border-b-0"
                >
                  <div className="font-mono font-medium">
                    [{new Date(msg.timestamp).toLocaleTimeString()}] {msg.type}
                  </div>
                  <pre className="text-xs mt-1 overflow-x-auto">
                    {JSON.stringify(msg.data, null, 2)}
                  </pre>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
