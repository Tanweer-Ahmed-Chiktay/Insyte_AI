-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "session_token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verificationtokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "emails" (
    "id" TEXT NOT NULL,
    "gmail_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT[],
    "cc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bcc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "content" TEXT NOT NULL,
    "snippet" TEXT,
    "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "is_starred" BOOLEAN NOT NULL DEFAULT false,
    "is_important" BOOLEAN NOT NULL DEFAULT false,
    "is_spam" BOOLEAN NOT NULL DEFAULT false,
    "is_trash" BOOLEAN NOT NULL DEFAULT false,
    "is_draft" BOOLEAN NOT NULL DEFAULT false,
    "received_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_summaries" (
    "id" TEXT NOT NULL,
    "email_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "key_points" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "action_items" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sentiment" TEXT NOT NULL DEFAULT 'neutral',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "category" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "auto_summarize" BOOLEAN NOT NULL DEFAULT true,
    "theme" TEXT NOT NULL DEFAULT 'light',
    "emails_per_page" INTEGER NOT NULL DEFAULT 50,
    "notifications" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_emails" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "cc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bcc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT NOT NULL,
    "html_body" TEXT NOT NULL,
    "attachments" JSONB,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE UNIQUE INDEX "verificationtokens_token_key" ON "verificationtokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verificationtokens_identifier_token_key" ON "verificationtokens"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "emails_gmail_id_key" ON "emails"("gmail_id");

-- CreateIndex
CREATE INDEX "emails_user_id_gmail_id_idx" ON "emails"("user_id", "gmail_id");

-- CreateIndex
CREATE INDEX "emails_user_id_received_at_idx" ON "emails"("user_id", "received_at");

-- CreateIndex
CREATE INDEX "emails_user_id_is_read_idx" ON "emails"("user_id", "is_read");

-- CreateIndex
CREATE INDEX "email_summaries_user_id_idx" ON "email_summaries"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_summaries_email_id_user_id_key" ON "email_summaries"("email_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_user_id_key" ON "user_preferences"("user_id");

-- CreateIndex
CREATE INDEX "scheduled_emails_user_id_status_idx" ON "scheduled_emails"("user_id", "status");

-- CreateIndex
CREATE INDEX "scheduled_emails_scheduled_at_status_idx" ON "scheduled_emails"("scheduled_at", "status");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emails" ADD CONSTRAINT "emails_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_summaries" ADD CONSTRAINT "email_summaries_email_id_fkey" FOREIGN KEY ("email_id") REFERENCES "emails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_summaries" ADD CONSTRAINT "email_summaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_emails" ADD CONSTRAINT "scheduled_emails_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
