import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { useWebSocketUnified, WebSocketMessage } from '@/hooks/use-websocket-unified';

interface WebSocketTesterProps {
  onTestMessage?: (message: any) => void;
}

export function WebSocketTester({ onTestMessage }: WebSocketTesterProps) {
  const { toast } = useToast();
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [messages, setMessages] = useState<any[]>([]);
  const [reconnectCount, setReconnectCount] = useState(0);
  const [lastMessage, setLastMessage] = useState<any>(null);

  // WebSocket connection with all event handlers
  const ws = useWebSocketUnified({
    debug: true,
    onEmailUpdate: (data) => {
      const message = { type: 'email:update', data, timestamp: new Date().toISOString() };
      setMessages(prev => [message, ...prev].slice(0, 50)); // Keep last 50 messages
      setLastMessage(message);
      onTestMessage?.(message);
    },
    onSyncStatus: (data) => {
      const message = { type: 'sync:status', data, timestamp: new Date().toISOString() };
      setMessages(prev => [message, ...prev].slice(0, 50));
      setLastMessage(message);
      onTestMessage?.(message);
    },
    onNewEmail: (data) => {
      const message = { type: 'email:new', data, timestamp: new Date().toISOString() };
      setMessages(prev => [message, ...prev].slice(0, 50));
      setLastMessage(message);
      onTestMessage?.(message);
    },
    onEmailDeleted: (emailId) => {
      const message = { type: 'email:deleted', data: { emailId }, timestamp: new Date().toISOString() };
      setMessages(prev => [message, ...prev].slice(0, 50));
      setLastMessage(message);
      onTestMessage?.(message);
    },
    onError: (error) => {
      console.error('WebSocket error:', error);
      toast({
        title: 'WebSocket Error',
        description: error,
        variant: 'destructive',
      });
    },
  });

  // Update connection status
  useEffect(() => {
    if (ws.isConnected) {
      setConnectionStatus('connected');
    } else if (ws.isConnecting) {
      setConnectionStatus('connecting');
    } else {
      setConnectionStatus('disconnected');
    }
  }, [ws.isConnected, ws.isConnecting]);

  // Simulate Gmail push notification
  const simulateGmailPush = () => {
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

    // This would normally come from the WebSocket server
    window.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify(testMessage),
      })
    );
  };

  // Test reconnection by manually disconnecting and reconnecting
  const testReconnection = () => {
    setReconnectCount(prev => prev + 1);
    // Force a reconnection by dispatching a close event
    window.dispatchEvent(new Event('offline'));
    setTimeout(() => {
      window.dispatchEvent(new Event('online'));
    }, 2000);
  };

  return (
    <Card className="w-full max-w-4xl mx-auto mt-8">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>WebSocket Connection Tester</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={ws.isConnected ? 'default' : 'destructive'}>
              {ws.isConnected ? 'Connected' : ws.isConnecting ? 'Connecting...' : 'Disconnected'}
            </Badge>
            {ws.error && <Badge variant="destructive">Error: {ws.error}</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button 
onClick={simulateGmailPush}
              disabled={!ws.isConnected}
            >
              Simulate Gmail Push
            </Button>
            <Button 
              variant="outline" 
              onClick={testReconnection}
              disabled={!ws.isConnected}
            >
              Test Reconnection
            </Button>
            <div className="text-sm text-muted-foreground ml-4 flex items-center">
              Reconnects: {reconnectCount}
            </div>
          </div>
          
          {lastMessage && (
            <div className="mt-4 p-4 bg-muted/50 rounded-md">
              <h3 className="font-medium mb-2">Last Message:</h3>
              <pre className="text-xs bg-background p-2 rounded overflow-auto max-h-40">
                {JSON.stringify(lastMessage, null, 2)}
              </pre>
            </div>
          )}

          <div className="mt-4">
            <h3 className="font-medium mb-2">Message History (Newest First):</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto border rounded-md p-2">
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No messages received yet
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
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
