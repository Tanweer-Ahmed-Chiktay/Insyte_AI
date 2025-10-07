-- Gmail Pub/Sub Worker Database Schema
-- This schema defines the tables needed for the Cloud Run worker
-- to store user credentials and email data

-- Users table (extends NextAuth users)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    image TEXT,
    email_verified TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Accounts table (NextAuth OAuth accounts)
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(255) NOT NULL,
    provider VARCHAR(255) NOT NULL,
    provider_account_id VARCHAR(255) NOT NULL,
    refresh_token TEXT,
    access_token TEXT,
    expires_at BIGINT,
    token_type VARCHAR(255),
    scope TEXT,
    id_token TEXT,
    session_state TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(provider, provider_account_id)
);

-- Sessions table (NextAuth sessions)
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_token VARCHAR(255) UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Gmail credentials table (encrypted OAuth tokens)
CREATE TABLE IF NOT EXISTS gmail_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    encrypted_refresh_token TEXT NOT NULL,
    encrypted_access_token TEXT,
    token_expires_at TIMESTAMPTZ,
    scope TEXT,
    watch_expiration TIMESTAMPTZ,
    history_id VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, email)
);

-- Gmail messages table
CREATE TABLE IF NOT EXISTS gmail_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gmail_id VARCHAR(255) NOT NULL,
    thread_id VARCHAR(255) NOT NULL,
    subject TEXT,
    snippet TEXT,
    sender_name VARCHAR(255),
    sender_email VARCHAR(255),
    recipient_emails TEXT[], -- Array of recipient emails
    date_received TIMESTAMPTZ,
    is_read BOOLEAN DEFAULT false,
    is_starred BOOLEAN DEFAULT false,
    is_important BOOLEAN DEFAULT false,
    is_deleted BOOLEAN DEFAULT false,
    labels TEXT[], -- Array of Gmail labels
    has_attachments BOOLEAN DEFAULT false,
    body_text TEXT,
    body_html TEXT,
    raw_headers JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, gmail_id)
);

-- Gmail threads table
CREATE TABLE IF NOT EXISTS gmail_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gmail_thread_id VARCHAR(255) NOT NULL,
    subject TEXT,
    snippet TEXT,
    message_count INTEGER DEFAULT 1,
    unread_count INTEGER DEFAULT 0,
    last_message_date TIMESTAMPTZ,
    participants TEXT[], -- Array of participant emails
    labels TEXT[], -- Array of Gmail labels
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, gmail_thread_id)
);

-- Gmail attachments table
CREATE TABLE IF NOT EXISTS gmail_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES gmail_messages(id) ON DELETE CASCADE,
    gmail_attachment_id VARCHAR(255) NOT NULL,
    filename VARCHAR(255),
    mime_type VARCHAR(255),
    size_bytes BIGINT,
    content_id VARCHAR(255),
    is_inline BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(message_id, gmail_attachment_id)
);

-- Gmail sync status table
CREATE TABLE IF NOT EXISTS gmail_sync_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    last_sync_at TIMESTAMPTZ,
    last_history_id VARCHAR(255),
    sync_status VARCHAR(50) DEFAULT 'pending', -- pending, syncing, completed, error
    error_message TEXT,
    total_messages INTEGER DEFAULT 0,
    synced_messages INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, email)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_provider ON accounts(provider, provider_account_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_gmail_credentials_user_id ON gmail_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_gmail_credentials_email ON gmail_credentials(email);
CREATE INDEX IF NOT EXISTS idx_gmail_messages_user_id ON gmail_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_gmail_messages_gmail_id ON gmail_messages(gmail_id);
CREATE INDEX IF NOT EXISTS idx_gmail_messages_thread_id ON gmail_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_gmail_messages_date ON gmail_messages(date_received DESC);
CREATE INDEX IF NOT EXISTS idx_gmail_messages_read ON gmail_messages(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_gmail_messages_starred ON gmail_messages(user_id, is_starred);
CREATE INDEX IF NOT EXISTS idx_gmail_threads_user_id ON gmail_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_gmail_threads_gmail_id ON gmail_threads(gmail_thread_id);
CREATE INDEX IF NOT EXISTS idx_gmail_threads_date ON gmail_threads(last_message_date DESC);
CREATE INDEX IF NOT EXISTS idx_gmail_attachments_message_id ON gmail_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_gmail_sync_status_user_id ON gmail_sync_status(user_id);

-- RLS (Row Level Security) policies for Supabase
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_sync_status ENABLE ROW LEVEL SECURITY;

-- RLS Policies (users can only access their own data)
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can view own accounts" ON accounts
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own sessions" ON sessions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own gmail credentials" ON gmail_credentials
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own gmail messages" ON gmail_messages
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own gmail threads" ON gmail_threads
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own gmail attachments" ON gmail_attachments
    FOR SELECT USING (
        auth.uid() = (
            SELECT user_id FROM gmail_messages 
            WHERE id = gmail_attachments.message_id
        )
    );

CREATE POLICY "Users can view own sync status" ON gmail_sync_status
    FOR ALL USING (auth.uid() = user_id);

-- Service role policies (for Cloud Run worker)
CREATE POLICY "Service role can manage all data" ON users
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can manage accounts" ON accounts
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can manage sessions" ON sessions
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can manage gmail credentials" ON gmail_credentials
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can manage gmail messages" ON gmail_messages
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can manage gmail threads" ON gmail_threads
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can manage gmail attachments" ON gmail_attachments
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can manage sync status" ON gmail_sync_status
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Functions for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for automatic timestamp updates
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_gmail_credentials_updated_at BEFORE UPDATE ON gmail_credentials
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_gmail_messages_updated_at BEFORE UPDATE ON gmail_messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_gmail_threads_updated_at BEFORE UPDATE ON gmail_threads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_gmail_sync_status_updated_at BEFORE UPDATE ON gmail_sync_status
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Realtime subscriptions (for Supabase Realtime)
ALTER PUBLICATION supabase_realtime ADD TABLE gmail_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE gmail_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE gmail_sync_status;

-- Comments for documentation
COMMENT ON TABLE users IS 'User accounts from NextAuth';
COMMENT ON TABLE accounts IS 'OAuth provider accounts from NextAuth';
COMMENT ON TABLE sessions IS 'User sessions from NextAuth';
COMMENT ON TABLE gmail_credentials IS 'Encrypted Gmail OAuth tokens for each user';
COMMENT ON TABLE gmail_messages IS 'Individual Gmail messages with metadata';
COMMENT ON TABLE gmail_threads IS 'Gmail conversation threads';
COMMENT ON TABLE gmail_attachments IS 'File attachments from Gmail messages';
COMMENT ON TABLE gmail_sync_status IS 'Sync status and progress for each user Gmail account';

COMMENT ON COLUMN gmail_credentials.encrypted_refresh_token IS 'AES-256 encrypted refresh token';
COMMENT ON COLUMN gmail_credentials.encrypted_access_token IS 'AES-256 encrypted access token';
COMMENT ON COLUMN gmail_credentials.history_id IS 'Gmail history ID for incremental sync';
COMMENT ON COLUMN gmail_messages.raw_headers IS 'Complete email headers as JSON';
COMMENT ON COLUMN gmail_messages.labels IS 'Array of Gmail label names';
COMMENT ON COLUMN gmail_threads.participants IS 'Array of all email addresses in the thread';