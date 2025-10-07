/**
 * Pusher Integration for Real-time Gmail Notifications
 * This file contains examples for frontend, backend, and authentication integration
 */

// ============================================================================
// FRONTEND INTEGRATION (React Component)
// ============================================================================

/**
 * React component for displaying real-time email notifications
 * Place this in your React application
 */
/*
import React, { useEffect, useState } from 'react';
import Pusher from 'pusher-js';
import { useSession } from 'next-auth/react';

const PUSHER_CONFIG = {
  key: 'fc1597877650e530dfd2',
  cluster: 'us3',
  forceTLS: true
};

export function EmailNotifications() {
  const { data: session } = useSession();
  const [notifications, setNotifications] = useState([]);
  const [syncStatus, setSyncStatus] = useState('idle');
  const [pusherClient, setPusherClient] = useState(null);

  useEffect(() => {
    if (!session?.user?.id) return;

    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
      authEndpoint: '/api/pusher/auth',
      auth: {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    });

    setPusherClient(pusher);
    const userChannel = pusher.subscribe(`private-user_${session.user.id}`);

    // Listen for new emails
    userChannel.bind('new_email', (data) => {
      console.log('New email received:', data);
      setNotifications(prev => [{
        id: Date.now(),
        type: 'new_email',
        message: `New email: ${data.subject}`,
        data: data,
        timestamp: new Date()
      }, ...prev.slice(0, 9)]);
    });

    // Listen for email updates
    userChannel.bind('email_update', (data) => {
      console.log('Email updated:', data);
      setNotifications(prev => [{
        id: Date.now(),
        type: 'email_update',
        message: `Email ${data.updateType}: ${data.subject || data.gmailId}`,
        data: data,
        timestamp: new Date()
      }, ...prev.slice(0, 9)]);
    });

    // Listen for email deletions
    userChannel.bind('email_deleted', (data) => {
      console.log('Email deleted:', data);
      setNotifications(prev => [{
        id: Date.now(),
        type: 'email_deleted',
        message: `Email deleted: ${data.gmailId}`,
        data: data,
        timestamp: new Date()
      }, ...prev.slice(0, 9)]);
    });

    // Listen for sync status updates
    userChannel.bind('sync_status', (data) => {
      console.log('Sync status:', data);
      setSyncStatus(data.status);
      
      if (data.status === 'error') {
        setNotifications(prev => [{
          id: Date.now(),
          type: 'sync_error',
          message: `Sync error: ${data.error}`,
          data: data,
          timestamp: new Date()
        }, ...prev.slice(0, 9)]);
      }
    });

    return () => {
      userChannel.unbind_all();
      userChannel.unsubscribe();
      pusher.disconnect();
    };
  }, [session?.user?.id]);

  const clearNotifications = () => {
    setNotifications([]);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'syncing': return 'text-blue-500';
      case 'completed': return 'text-green-500';
      case 'error': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'new_email': return '📧';
      case 'email_update': return '✏️';
      case 'email_deleted': return '🗑️';
      case 'sync_error': return '⚠️';
      default: return '📬';
    }
  };

  return (
    <div className="fixed top-4 right-4 w-80 max-h-96 bg-white shadow-lg rounded-lg border border-gray-200 overflow-hidden">
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-900">Email Notifications</h3>
          <div className="flex items-center space-x-2">
            <span className={`text-xs font-medium ${getStatusColor(syncStatus)}`}>
              {syncStatus}
            </span>
            {notifications.length > 0 && (
              <button
                onClick={clearNotifications}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-h-80 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            No notifications yet
          </div>
        ) : (
          notifications.map((notification) => (
            <div
              key={notification.id}
              className="p-3 border-b border-gray-100 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start space-x-2">
                <span className="text-lg">{getNotificationIcon(notification.type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 truncate">
                    {notification.message}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {notification.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default EmailNotifications;
*/

// ============================================================================
// BACKEND INTEGRATION (Cloud Run Worker)
// ============================================================================

const PusherServer = require('pusher');

// Initialize Pusher with your credentials
const pusherServer = new PusherServer({
  appId: '2035618',
  key: 'fc1597877650e530dfd2',
  secret: 'b93708809102c6ab52e4',
  cluster: 'us3',
  useTLS: true,
  // Optional: enable encryption for sensitive data
  encrypted: true
});

// Broadcast new email notification
async function broadcastNewEmail(userId, emailData) {
  try {
    const channel = `private-user_${userId}`;
    const event = 'new_email';
    const payload = {
      gmailId: emailData.id,
      threadId: emailData.threadId,
      subject: emailData.payload?.headers?.find(h => h.name === 'Subject')?.value || 'No Subject',
      from: emailData.payload?.headers?.find(h => h.name === 'From')?.value || 'Unknown Sender',
      snippet: emailData.snippet,
      timestamp: new Date().toISOString(),
      labels: emailData.labelIds || [],
      isUnread: emailData.labelIds?.includes('UNREAD') || false
    };

    await pusherServer.trigger(channel, event, payload);
    console.log(`Broadcasted new email to ${channel}:`, payload.subject);
    
  } catch (error) {
    console.error('Error broadcasting new email:', error);
  }
}

// Broadcast email update notification (read, starred, etc.)
async function broadcastEmailUpdate(userId, emailData, updateType = 'read') {
  try {
    const channel = `private-user_${userId}`;
    const event = 'email_update';
    const payload = {
      gmailId: emailData.id,
      threadId: emailData.threadId,
      updateType: updateType, // 'read', 'unread', 'starred', 'unstarred', 'archived'
      subject: emailData.payload?.headers?.find(h => h.name === 'Subject')?.value,
      timestamp: new Date().toISOString(),
      labels: emailData.labelIds || []
    };

    await pusherServer.trigger(channel, event, payload);
    console.log(`Broadcasted email update to ${channel}:`, updateType);
    
  } catch (error) {
    console.error('Error broadcasting email update:', error);
  }
}

// Broadcast email deletion notification
async function broadcastEmailDeletion(userId, gmailId) {
  try {
    const channel = `private-user_${userId}`;
    const event = 'email_deleted';
    const payload = {
      gmailId: gmailId,
      timestamp: new Date().toISOString()
    };

    await pusherServer.trigger(channel, event, payload);
    console.log(`Broadcasted email deletion to ${channel}:`, gmailId);
    
  } catch (error) {
    console.error('Error broadcasting email deletion:', error);
  }
}

// Broadcast sync status updates
async function broadcastSyncStatus(userId, status) {
  try {
    const channel = `private-user_${userId}`;
    const event = 'sync_status';
    const payload = {
      status: status.status, // 'syncing', 'completed', 'error'
      message: status.message,
      timestamp: new Date().toISOString(),
      emailsProcessed: status.emailsProcessed || 0,
      totalEmails: status.totalEmails || 0,
      error: status.error || null
    };

    await pusherServer.trigger(channel, event, payload);
    console.log(`Broadcasted sync status to ${channel}:`, status.status);
    
  } catch (error) {
    console.error('Error broadcasting sync status:', error);
  }
}

// ============================================================================
// PUSHER AUTHENTICATION ENDPOINT (Vercel API Route)
// ============================================================================

/**
 * Authentication endpoint for Pusher private channels
 * Create this file: pages/api/pusher/auth.js or app/api/pusher/auth/route.js
 */
/*
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]';
import PusherServer from 'pusher';

const pusherAuth = new PusherServer({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
  useTLS: true
});

export async function POST(request) {
  try {
    const { socket_id: socketId, channel_name: channelName } = await request.json();
    
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 });
    }
    
    const expectedChannel = `private-user_${session.user.id}`;
    if (channelName !== expectedChannel) {
      return new Response('Forbidden', { status: 403 });
    }
    
    const authResponse = pusherAuth.authorizeChannel(socketId, channelName, {
      user_id: session.user.id,
      user_info: {
        name: session.user.name,
        email: session.user.email
      }
    });
    
    return new Response(JSON.stringify(authResponse), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Pusher auth error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
*/

// ============================================================================
// TESTING UTILITIES
// ============================================================================

// Test function to send a sample notification
async function testPusherNotification(userId = '123') {
  try {
    // Get channel info
    const channelInfo = await pusherServer.get({
      path: '/channels',
      params: {
        filter_by_prefix: 'user_'
      }
    });
    
    console.log('Active channels:', channelInfo.body);
    
    // Test trigger
    await pusherServer.trigger('test-channel', 'test-event', {
      message: 'Hello from Pusher!',
      timestamp: new Date().toISOString()
    });
    
    console.log('Test notification sent successfully');
  } catch (error) {
    console.error('Test notification failed:', error);
  }
}

// Test Pusher connection
async function testPusherConnection() {
  try {
    const result = await pusherServer.get({ path: '/channels' });
    console.log('Pusher connection successful:', result.status);
    return true;
  } catch (error) {
    console.error('Pusher connection failed:', error);
    return false;
  }
}

// Export functions for use in your application
module.exports = {
  pusherServer,
  broadcastNewEmail,
  broadcastEmailUpdate,
  broadcastEmailDeletion,
  broadcastSyncStatus,
  testPusherNotification,
  testPusherConnection
};

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * Example usage in your React app:
 * 
 * import { EmailNotifications } from './pusher-integration';
 * 
 * function App() {
 *   return (
 *     <div>
 *       <EmailNotifications />
 *     </div>
 *   );
 * }
 * 
 * Test the integration:
 * node -e "require('./pusher-integration').testPusherNotification('your-user-id')"
 */