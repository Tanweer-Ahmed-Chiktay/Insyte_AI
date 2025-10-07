// Load environment variables from mounted secret files
const fs = require('fs');
const path = require('path');

// Function to load environment variables from mounted secret directory
function loadSecretsFromVolume() {
  const secretsDir = '/etc/secrets';
  console.log('Checking secrets directory:', secretsDir);
  
  // Always try dotenv first
  const path = require('path');
  require('dotenv').config({ path: path.join(__dirname, '.env') });
  console.log('Loaded dotenv configuration from:', path.join(__dirname, '.env'));
  
  if (fs.existsSync(secretsDir)) {
    const files = fs.readdirSync(secretsDir);
    console.log('Found secret files:', files);
    files.forEach(file => {
      try {
        const filePath = path.join(secretsDir, file);
        const content = fs.readFileSync(filePath, 'utf8').trim();
        process.env[file] = content;
        console.log(`Loaded secret: ${file}`);
      } catch (error) {
        console.log(`Could not read secret file ${file}:`, error.message);
      }
    });
  } else {
    console.log('Secrets directory not found, using dotenv only');
  }
  
  console.log('DATABASE_URL loaded:', !!process.env.DATABASE_URL);
  console.log('GOOGLE_CLOUD_PROJECT_ID loaded:', !!process.env.GOOGLE_CLOUD_PROJECT_ID);
  console.log('GOOGLE_CLIENT_ID loaded:', !!process.env.GOOGLE_CLIENT_ID);
  console.log('ENCRYPTION_KEY loaded:', !!process.env.ENCRYPTION_KEY);
}

loadSecretsFromVolume();

// Validate critical environment variables
function validateEnvironment() {
  const required = [
    'DATABASE_URL',
    'GOOGLE_CLIENT_ID', 
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_CLOUD_PROJECT_ID'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`   - ${key}`));
    process.exit(1);
  }
  
  console.log('✅ All required environment variables present');
  
  // Log configuration for debugging
  console.log('Environment configuration:');
  console.log('- NEXTAUTH_URL:', process.env.NEXTAUTH_URL);
  console.log('- GOOGLE_CLOUD_PROJECT_ID:', process.env.GOOGLE_CLOUD_PROJECT_ID);
  console.log('- PUSHER_CLUSTER:', process.env.PUSHER_CLUSTER);
  console.log('- PUSHER_APP_ID:', process.env.PUSHER_APP_ID);
}

validateEnvironment();

const express = require('express');
const { PubSub } = require('@google-cloud/pubsub');
const { google } = require('googleapis');
const { PrismaClient } = require('@prisma/client');
const Pusher = require('pusher');
const crypto = require('crypto');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

const app = express();
const port = process.env.PORT || 8080;

// Initialize services
const pubsub = new PubSub({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
});

// Initialize Prisma client after secrets are loaded
let prisma;
try {
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      }
    },
    log: ['error', 'warn']
  });
} catch (error) {
  console.error('Failed to initialize Prisma client:', error);
  prisma = null;
}

// Function to ensure Prisma client is working
async function ensurePrismaClient() {
  if (!prisma) {
    try {
      console.log('Attempting to regenerate Prisma client...');
      await execAsync('npx prisma generate');
      prisma = new PrismaClient({
        datasources: {
          db: {
            url: process.env.DATABASE_URL
          }
        },
        log: ['error', 'warn']
      });
      console.log('Prisma client regenerated successfully');
    } catch (error) {
      console.error('Failed to regenerate Prisma client:', error);
      throw error;
    }
  }
  return prisma;
}

// Initialize Pusher with proper error handling
let pusher;
try {
  pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID || '1932969',
    key: process.env.PUSHER_KEY || process.env.NEXT_PUBLIC_PUSHER_KEY || 'fc1597877650e530dfd2',
    secret: process.env.PUSHER_SECRET,
    cluster: process.env.PUSHER_CLUSTER || 'us3',
    useTLS: true
  });
  console.log('Pusher initialized successfully with key:', process.env.PUSHER_KEY || process.env.NEXT_PUBLIC_PUSHER_KEY);
} catch (error) {
  console.error('Failed to initialize Pusher:', error);
  pusher = null;
}

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.raw({ type: 'application/json', limit: '10mb' }));

// Encryption utilities
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

function decrypt(encryptedData) {
  if (!encryptedData || typeof encryptedData !== 'string') {
    console.log('Invalid encrypted data: must be a non-empty string');
    return null;
  }
  
  if (!ENCRYPTION_KEY) {
    console.error('ENCRYPTION_KEY environment variable is not set');
    return encryptedData; // Return as-is if no encryption key
  }
  
  try {
    const parts = encryptedData.split(':');
    
    // Try new format first: encrypted:iv:tag (AES-256-GCM)
    if (parts.length === 3) {
      try {
        const [encrypted, iv, tag] = parts;
        const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'base64'), Buffer.from(iv, 'hex'));
        decipher.setAuthTag(Buffer.from(tag, 'hex'));
        
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      } catch (error) {
        console.log('Failed to decrypt with new format, trying old format:', error.message);
      }
    }
    
    // Fallback to old format: iv:encrypted (AES-256-CBC)
    if (parts.length === 2) {
      try {
        const [iv, encrypted] = parts;
        const decipher = crypto.createDecipher('aes-256-cbc', ENCRYPTION_KEY);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      } catch (error) {
        console.log('Failed to decrypt with old format:', error.message);
      }
    }
    
    // If only 1 part, assume it's plain text (unencrypted)
    if (parts.length === 1) {
      console.log('Token appears to be unencrypted, returning as-is');
      return encryptedData;
    }
  } catch (error) {
    console.error('Decryption error:', error.message);
  }
  
  console.log('All decryption methods failed, returning original data');
  return encryptedData;
}

// Improved Gmail API helper with better error handling and token refresh
async function getGmailClient(accessToken, refreshToken, userId) {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.NEXTAUTH_URL || 'https://insyte2.vercel.app'
    );

    // Validate tokens before setting
    if (!accessToken || !refreshToken) {
      throw new Error('Missing access token or refresh token');
    }

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    // Set up automatic token refresh with better error handling
    oauth2Client.on('tokens', async (tokens) => {
      console.log('OAuth tokens refreshed for user:', userId);
      try {
        if (tokens.access_token) {
          // Update tokens in database
          const prismaClient = await ensurePrismaClient();
          await prismaClient.account.updateMany({
            where: {
              userId: userId,
              provider: 'google'
            },
            data: {
              access_token: tokens.access_token, // Store new access token
              expires_at: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : null
            }
          });
          console.log('Updated access token in database for user:', userId);
        }
      } catch (error) {
        console.error('Failed to update tokens in database:', error);
      }
    });

    // Create Gmail client
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Test the credentials with a simple call
    try {
      await gmail.users.getProfile({ userId: 'me' });
      console.log('Gmail client credentials verified successfully for user:', userId);
      return gmail;
    } catch (error) {
      console.error('Gmail credentials test failed:', error.message);
      
      // If it's an auth error, try to refresh token manually
      if (error.code === 401 || error.message?.includes('invalid_grant')) {
        console.log('Attempting manual token refresh...');
        try {
          const { credentials } = await oauth2Client.refreshAccessToken();
          oauth2Client.setCredentials(credentials);
          
          // Test again after refresh
          await gmail.users.getProfile({ userId: 'me' });
          console.log('Gmail client working after manual token refresh');
          return gmail;
        } catch (refreshError) {
          console.error('Manual token refresh failed:', refreshError.message);
          throw new Error(`OAuth token refresh failed: ${refreshError.message}`);
        }
      }
      
      throw error;
    }
  } catch (error) {
    console.error('Failed to create Gmail client:', error.message);
    throw error;
  }
}

// Process Gmail history with improved error handling
async function processGmailHistory(userId, historyId) {
  try {
    console.log(`Processing Gmail history for user ${userId}, historyId: ${historyId}`);

    // Get user credentials from database
    const prismaClient = await ensurePrismaClient();
    const account = await prismaClient.account.findFirst({
      where: {
        userId: userId,
        provider: 'google'
      },
      select: {
        access_token: true,
        refresh_token: true,
        userId: true
      }
    });

    if (!account) {
      console.error('Failed to get user account for userId:', userId);
      return;
    }

    // Decrypt tokens with better error handling
    const accessToken = decrypt(account.access_token);
    const refreshToken = decrypt(account.refresh_token);

    if (!accessToken || !refreshToken) {
      console.error('Failed to decrypt tokens for user:', userId);
      return;
    }

    const gmail = await getGmailClient(accessToken, refreshToken, userId);

    // Get history since last known historyId
    const user = await prismaClient.user.findUnique({
      where: { id: userId },
      select: { historyId: true }
    });

    const startHistoryId = user?.historyId || historyId;

    console.log(`Fetching Gmail history from ${startHistoryId} for user ${userId}`);

    const historyResponse = await gmail.users.history.list({
      userId: 'me',
      startHistoryId: startHistoryId,
      historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'],
      maxResults: 100 // Limit to avoid timeouts
    });

    if (!historyResponse.data.history || historyResponse.data.history.length === 0) {
      console.log('No new history found for user:', userId);
      return;
    }

    console.log(`Processing ${historyResponse.data.history.length} history records for user ${userId}`);

    // Process each history record
    for (const historyRecord of historyResponse.data.history) {
      try {
        if (historyRecord.messagesAdded) {
          for (const messageAdded of historyRecord.messagesAdded) {
            await processNewMessage(gmail, userId, messageAdded.message);
          }
        }

        if (historyRecord.messagesDeleted) {
          for (const messageDeleted of historyRecord.messagesDeleted) {
            await processDeletedMessage(userId, messageDeleted.message.id);
          }
        }

        if (historyRecord.labelsAdded || historyRecord.labelsRemoved) {
          await processLabelChanges(gmail, userId, historyRecord);
        }
      } catch (recordError) {
        console.error('Error processing individual history record:', recordError.message);
        // Continue processing other records
      }
    }

    // Update user's last known historyId (convert to string)
    await prismaClient.user.update({
      where: { id: userId },
      data: { historyId: String(historyId) }
    });

    console.log(`Successfully processed Gmail history for user ${userId}`);
  } catch (error) {
    console.error('Error processing Gmail history:', error.message);
    
    // Handle specific OAuth errors
    if (error.message?.includes('invalid_grant') || error.message?.includes('invalid_request')) {
      console.error('OAuth token issue for user:', userId, '- User may need to re-authenticate');
    }
    
    throw error;
  }
}

// Process new message with better error handling
async function processNewMessage(gmail, userId, message) {
  try {
    console.log(`Processing new message ${message.id} for user ${userId}`);

    // Get full message details
    const messageResponse = await gmail.users.messages.get({
      userId: 'me',
      id: message.id,
      format: 'metadata',
      metadataHeaders: ['From', 'To', 'Subject', 'Date']
    });

    const messageData = messageResponse.data;
    const headers = messageData.payload?.headers || [];

    const fromHeader = headers.find(h => h.name === 'From')?.value || '';
    const toHeader = headers.find(h => h.name === 'To')?.value || '';
    const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
    const dateHeader = headers.find(h => h.name === 'Date')?.value;
    const receivedAt = dateHeader ? new Date(dateHeader) : new Date();
    
    // Extract email addresses from headers
    const senderEmail = fromHeader.match(/<([^>]+)>/) ? fromHeader.match(/<([^>]+)>/)[1] : fromHeader;
    const recipientEmails = toHeader.split(',').map(email => {
      const match = email.trim().match(/<([^>]+)>/);
      return match ? match[1] : email.trim();
    });

    // Store email metadata in database
    try {
      const prismaClient = await ensurePrismaClient();
      
      // First, get or create the email provider for this user
      const emailProvider = await prismaClient.emailProvider.findFirst({
        where: {
          userId: userId,
          provider: 'gmail'
        }
      });

      if (!emailProvider) {
        console.error('No Gmail provider found for user:', userId);
        return;
      }

      // Use upsert to handle duplicates with correct field mapping
      await prismaClient.email.upsert({
        where: {
          providerId_externalId: {
            providerId: emailProvider.id,
            externalId: message.id
          }
        },
        create: {
          providerId: emailProvider.id,
          externalId: message.id,
          userId: userId,
          subject: subject,
          from: senderEmail,
          to: recipientEmails,
          receivedAt: receivedAt,
          threadId: messageData.threadId,
          labels: messageData.labelIds || [],
          isRead: !messageData.labelIds?.includes('UNREAD'),
          isStarred: messageData.labelIds?.includes('STARRED') || false
        },
        update: {
          labels: messageData.labelIds || [],
          isRead: !messageData.labelIds?.includes('UNREAD'),
          isStarred: messageData.labelIds?.includes('STARRED') || false,
          from: senderEmail,
          to: recipientEmails
        }
      });

      console.log(`Stored message ${message.id} in database`);
    } catch (dbError) {
      console.error('Error storing email in database:', dbError.message);
      return; // Don't broadcast if DB storage failed
    }

    // Broadcast real-time event
    await broadcastEmailEvent(userId, 'email:new', {
      id: message.id,
      externalId: message.id,
      subject,
      from: senderEmail,
      to: recipientEmails,
      receivedAt: receivedAt.toISOString(),
      isRead: !messageData.labelIds?.includes('UNREAD')
    });

    console.log(`Successfully processed new message ${message.id} for user ${userId}`);
  } catch (error) {
    console.error('Error processing new message:', error.message);
  }
}

// Process deleted message
async function processDeletedMessage(userId, messageId) {
  try {
    console.log(`Processing deleted message ${messageId} for user ${userId}`);

    // Remove from database
    const prismaClient = await ensurePrismaClient();
    await prismaClient.email.deleteMany({
      where: {
        gmailId: messageId,
        userId: userId
      }
    });

    // Broadcast real-time event
    await broadcastEmailEvent(userId, 'email:deleted', { emailId: messageId });

    console.log(`Processed deleted message ${messageId} for user ${userId}`);
  } catch (error) {
    console.error('Error processing deleted message:', error.message);
  }
}

// Process label changes with database operations
async function processLabelChanges(gmail, userId, historyRecord) {
  try {
    const changes = [];

    if (historyRecord.labelsAdded) {
      for (const labelAdded of historyRecord.labelsAdded) {
        changes.push({
          messageId: labelAdded.message.id,
          action: 'added',
          labelIds: labelAdded.labelIds
        });
      }
    }

    if (historyRecord.labelsRemoved) {
      for (const labelRemoved of historyRecord.labelsRemoved) {
        changes.push({
          messageId: labelRemoved.message.id,
          action: 'removed',
          labelIds: labelRemoved.labelIds
        });
      }
    }

    const prismaClient = await ensurePrismaClient();

    for (const change of changes) {
      try {
        // Get current email data
        const email = await prismaClient.email.findFirst({
          where: {
            gmailId: change.messageId,
            userId: userId
          },
          select: {
            labelIds: true,
            id: true
          }
        });

        if (email) {
          let updatedLabelIds = email.labelIds || [];

          if (change.action === 'added') {
            updatedLabelIds = [...new Set([...updatedLabelIds, ...change.labelIds])];
          } else {
            updatedLabelIds = updatedLabelIds.filter(id => !change.labelIds.includes(id));
          }

          // Update email in database
          await prismaClient.email.update({
            where: {
              id: email.id
            },
            data: {
              labelIds: updatedLabelIds,
              isRead: !updatedLabelIds.includes('UNREAD'),
              isStarred: updatedLabelIds.includes('STARRED')
            }
          });

          // Broadcast real-time event
          await broadcastEmailEvent(userId, 'email:updated', {
            id: email.id,
            gmailId: change.messageId,
            labelIds: updatedLabelIds,
            isRead: !updatedLabelIds.includes('UNREAD'),
            isStarred: updatedLabelIds.includes('STARRED')
          });
        }
      } catch (changeError) {
        console.error(`Error processing label change for message ${change.messageId}:`, changeError.message);
      }
    }

    console.log(`Processed label changes for user ${userId}`);
  } catch (error) {
    console.error('Error processing label changes:', error);
  }
}

// Broadcast real-time event with better error handling
async function broadcastEmailEvent(userId, eventType, data) {
  try {
    if (!pusher) {
      console.log('Pusher not initialized, skipping broadcast');
      return;
    }

    // Get user email for channel naming
    const prismaClient = await ensurePrismaClient();
    const user = await prismaClient.user.findUnique({
      where: { id: userId },
      select: { email: true }
    });
    
    if (!user?.email) {
      console.error('User email not found for userId:', userId);
      return;
    }
    
    // Use email-based channel naming to match frontend
    const channelName = `user-${user.email.replace(/@/g, '-').replace(/\./g, '-')}`;
    
    await pusher.trigger(channelName, eventType, data);
    console.log(`Broadcasted ${eventType} event for user ${userId} on channel ${channelName}`);
  } catch (error) {
    console.error('Error broadcasting event:', error.message);
  }
}

// Enhanced Pub/Sub message handler
app.post('/pubsub', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const message = req.body;
    
    if (!message || !message.message) {
      console.log('Invalid Pub/Sub message format');
      return res.status(200).send('OK');
    }

    // Decode the Pub/Sub message
    let data;
    try {
      const messageData = Buffer.from(message.message.data, 'base64').toString();
      console.log('Raw Pub/Sub message:', messageData);
      data = JSON.parse(messageData);
    } catch (parseError) {
      console.error('Failed to parse Pub/Sub message data:', parseError.message);
      return res.status(200).send('OK');
    }
    
    console.log('Received Pub/Sub message:', data);

    // Extract Gmail user ID and history ID
    const { emailAddress, historyId } = data;

    if (!emailAddress || !historyId) {
      console.log('Missing required fields in Pub/Sub message:', { emailAddress: !!emailAddress, historyId: !!historyId });
      return res.status(200).send('OK');
    }

    // Find user by email address
    const prismaClient = await ensurePrismaClient();
    const user = await prismaClient.user.findUnique({
      where: { email: emailAddress },
      select: { id: true, email: true }
    });

    if (!user) {
      console.log(`User not found for email: ${emailAddress}`);
      return res.status(200).send('OK');
    }

    console.log(`Processing Gmail notification for user ${user.id} (${user.email})`);

    // Process the Gmail history asynchronously to avoid timeout
    setImmediate(() => {
      processGmailHistory(user.id, historyId)
        .then(() => {
          const duration = Date.now() - startTime;
          console.log(`Gmail history processing completed for ${user.email} in ${duration}ms`);
        })
        .catch(error => {
          const duration = Date.now() - startTime;
          console.error(`Error processing Gmail history for ${user.email} after ${duration}ms:`, error.message);
          
          // Log specific OAuth errors for debugging
          if (error.message && error.message.includes('invalid_request')) {
            console.error('OAuth token refresh failed - user may need to re-authenticate');
          }
          if (error.message && error.message.includes('invalid_grant')) {
            console.error('OAuth grant invalid - refresh token may be expired');
          }
        });
    });

    // Always return 200 OK quickly to acknowledge the message
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error processing Pub/Sub message:', error.message);
    // Always return 200 to stop Pub/Sub retries
    res.status(200).send('OK');
  }
});

// Health check endpoint with comprehensive service validation
app.get('/health', async (req, res) => {
  const healthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: false,
      pusher: false,
      pubsub: false,
      oauth: false
    },
    environment: {
      nodeEnv: process.env.NODE_ENV,
      nextauthUrl: process.env.NEXTAUTH_URL,
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
    }
  };
  
  try {
    // Test database connection
    if (prisma) {
      await prisma.$queryRaw`SELECT 1`;
      healthStatus.services.database = true;
    }
    
    // Test Pusher configuration
    if (pusher) {
      healthStatus.services.pusher = true;
    }
    
    // Test Pub/Sub configuration
    if (process.env.GOOGLE_CLOUD_PROJECT_ID) {
      healthStatus.services.pubsub = true;
    }
    
    // Test OAuth configuration
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      healthStatus.services.oauth = true;
    }
    
    const allHealthy = Object.values(healthStatus.services).every(Boolean);
    if (!allHealthy) {
      healthStatus.status = 'degraded';
    }
    
    res.status(200).json(healthStatus);
  } catch (error) {
    console.error('Health check failed:', error.message);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  
  if (prisma) {
    await prisma.$disconnect();
  }
  
  process.exit(0);
});

// Start server
app.listen(port, () => {
  console.log(`Gmail Pub/Sub worker listening on port ${port}`);
  console.log('Environment check:');
  console.log('- DATABASE_URL:', !!process.env.DATABASE_URL);
  console.log('- GOOGLE_CLIENT_ID:', !!process.env.GOOGLE_CLIENT_ID);
  console.log('- GOOGLE_CLIENT_SECRET:', !!process.env.GOOGLE_CLIENT_SECRET);
  console.log('- PUSHER_APP_ID:', !!process.env.PUSHER_APP_ID);
  console.log('- ENCRYPTION_KEY:', !!process.env.ENCRYPTION_KEY);
});

module.exports = app;