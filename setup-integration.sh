#!/bin/bash

# Gmail Pub/Sub to Cloud Run Integration Setup Script
# This script sets up the complete Gmail → Pub/Sub → Cloud Run → Neon → Vercel architecture

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"
SERVICE_NAME="gmail-pubsub-worker"
TOPIC_NAME="gmail-notifications"
SUBSCRIPTION_NAME="gmail-notifications-sub"
SECRET_NAME="gmail-worker-secrets"

echo -e "${BLUE}=== Gmail Pub/Sub Integration Setup ===${NC}"
echo -e "Project ID: ${GREEN}$PROJECT_ID${NC}"
echo -e "Region: ${GREEN}$REGION${NC}"
echo ""

# Function to check if billing is enabled
check_billing() {
    echo -e "${YELLOW}Checking billing status...${NC}"
    
    if gcloud services enable run.googleapis.com --quiet 2>/dev/null; then
        echo -e "${GREEN}✓ Billing is enabled${NC}"
        return 0
    else
        echo -e "${RED}✗ Billing is not enabled${NC}"
        echo -e "${YELLOW}Please enable billing for your project:${NC}"
        echo "1. Go to https://console.cloud.google.com/billing"
        echo "2. Select your project: $PROJECT_ID"
        echo "3. Link a billing account"
        echo "4. Re-run this script"
        echo ""
        return 1
    fi
}

# Function to enable required APIs
enable_apis() {
    echo -e "${YELLOW}Enabling required APIs...${NC}"
    
    apis=(
        "gmail.googleapis.com"
        "pubsub.googleapis.com"
        "run.googleapis.com"
        "cloudbuild.googleapis.com"
        "secretmanager.googleapis.com"
        "artifactregistry.googleapis.com"
    )
    
    for api in "${apis[@]}"; do
        echo "Enabling $api..."
        gcloud services enable "$api" --quiet
    done
    
    echo -e "${GREEN}✓ All APIs enabled${NC}"
}

# Function to create Pub/Sub topic and subscription
setup_pubsub() {
    echo -e "${YELLOW}Setting up Pub/Sub...${NC}"
    
    # Create topic
    if gcloud pubsub topics describe "$TOPIC_NAME" >/dev/null 2>&1; then
        echo "Topic $TOPIC_NAME already exists"
    else
        gcloud pubsub topics create "$TOPIC_NAME"
        echo -e "${GREEN}✓ Created topic: $TOPIC_NAME${NC}"
    fi
    
    # We'll create the subscription after deploying Cloud Run to get the endpoint URL
}

# Function to create secrets
setup_secrets() {
    echo -e "${YELLOW}Setting up secrets...${NC}"
    
    # Check if secret exists
    if gcloud secrets describe "$SECRET_NAME" >/dev/null 2>&1; then
        echo "Secret $SECRET_NAME already exists"
    else
        # Create empty secret first
        echo "{}" | gcloud secrets create "$SECRET_NAME" --data-file=-
        echo -e "${GREEN}✓ Created secret: $SECRET_NAME${NC}"
    fi
    
    echo -e "${YELLOW}Please update the secret with your environment variables:${NC}"
    echo "gcloud secrets versions add $SECRET_NAME --data-file=.env.production"
    echo ""
}

# Function to build and deploy Cloud Run service
deploy_cloud_run() {
    echo -e "${YELLOW}Deploying Cloud Run service...${NC}"
    
    cd cloud-run/gmail-pubsub-worker
    
    # Build and deploy
    gcloud run deploy "$SERVICE_NAME" \
        --source . \
        --region="$REGION" \
        --allow-unauthenticated \
        --set-env-vars="GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID" \
        --set-secrets="/secrets/env=$SECRET_NAME:latest" \
        --memory="1Gi" \
        --cpu="1" \
        --min-instances="0" \
        --max-instances="10" \
        --timeout="300" \
        --quiet
    
    # Get service URL
    SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format="value(status.url)")
    echo -e "${GREEN}✓ Cloud Run service deployed: $SERVICE_URL${NC}"
    
    cd ../..
    
    # Create Pub/Sub subscription with push endpoint
    echo -e "${YELLOW}Creating Pub/Sub subscription...${NC}"
    
    if gcloud pubsub subscriptions describe "$SUBSCRIPTION_NAME" >/dev/null 2>&1; then
        echo "Subscription $SUBSCRIPTION_NAME already exists"
    else
        gcloud pubsub subscriptions create "$SUBSCRIPTION_NAME" \
            --topic="$TOPIC_NAME" \
            --push-endpoint="$SERVICE_URL/pubsub" \
            --ack-deadline=600
        echo -e "${GREEN}✓ Created subscription: $SUBSCRIPTION_NAME${NC}"
    fi
}

# Function to setup Gmail push notifications
setup_gmail_push() {
    echo -e "${YELLOW}Setting up Gmail push notifications...${NC}"
    echo -e "${BLUE}Manual steps required:${NC}"
    echo "1. Go to Google Cloud Console > APIs & Services > Credentials"
    echo "2. Create OAuth 2.0 Client ID for web application"
    echo "3. Add your domain to authorized origins"
    echo "4. Update your .env.production with the credentials"
    echo "5. In your application, call the Gmail watch API:"
    echo "   POST https://gmail.googleapis.com/gmail/v1/users/me/watch"
    echo "   Body: { \"topicName\": \"projects/$PROJECT_ID/topics/$TOPIC_NAME\" }"
    echo ""
}

# Function to setup Neon database
setup_neon() {
    echo -e "${YELLOW}Setting up Neon database...${NC}"
    echo -e "${BLUE}Manual steps required:${NC}"
    echo "1. Go to https://neon.tech and create an account"
    echo "2. Create a new database"
    echo "3. Copy the connection string"
    echo "4. Apply the schema from cloud-run/gmail-pubsub-worker/schema.sql"
    echo "5. Update your .env.production with NEON_DATABASE_URL"
    echo ""
}

# Function to setup Pusher
setup_pusher() {
    echo -e "${YELLOW}Setting up Pusher for real-time notifications...${NC}"
    echo -e "${BLUE}Manual steps required:${NC}"
    echo "1. Go to https://pusher.com and create an account"
    echo "2. Create a new app"
    echo "3. Copy the app credentials"
    echo "4. Update your .env.production with Pusher credentials"
    echo "5. Deploy the Pusher integration from examples/pusher-integration.js"
    echo ""
}

# Function to create environment file template
create_env_template() {
    echo -e "${YELLOW}Creating environment template...${NC}"
    
    cat > .env.production.template << EOF
# Google Cloud Configuration
GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_SERVICE_ACCOUNT_KEY=your_service_account_key_json

# NextAuth Configuration
NEXTAUTH_URL=https://your-app.vercel.app
NEXTAUTH_SECRET=your_nextauth_secret

# Database Configuration
NEON_DATABASE_URL=postgresql://user:password@host:5432/database

# Real-time Notifications (choose one)
# Pusher
PUSHER_APP_ID=your_pusher_app_id
PUSHER_KEY=your_pusher_key
PUSHER_SECRET=your_pusher_secret
PUSHER_CLUSTER=your_pusher_cluster

# Supabase (alternative)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Encryption
ENCRYPTION_KEY=your_32_character_encryption_key
EOF
    
    echo -e "${GREEN}✓ Created .env.production.template${NC}"
    echo -e "${YELLOW}Please copy this to .env.production and fill in your values${NC}"
}

# Function to test the setup
test_setup() {
    echo -e "${YELLOW}Testing setup...${NC}"
    
    # Test Cloud Run service
    if curl -s "$SERVICE_URL/health" >/dev/null; then
        echo -e "${GREEN}✓ Cloud Run service is responding${NC}"
    else
        echo -e "${RED}✗ Cloud Run service is not responding${NC}"
    fi
    
    # Test Pub/Sub
    if gcloud pubsub topics describe "$TOPIC_NAME" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Pub/Sub topic exists${NC}"
    else
        echo -e "${RED}✗ Pub/Sub topic not found${NC}"
    fi
}

# Main execution
main() {
    echo -e "${BLUE}Starting Gmail Pub/Sub integration setup...${NC}"
    echo ""
    
    # Check billing first
    if ! check_billing; then
        echo -e "${RED}Setup cannot continue without billing enabled${NC}"
        exit 1
    fi
    
    # Enable APIs
    enable_apis
    
    # Setup Pub/Sub
    setup_pubsub
    
    # Setup secrets
    setup_secrets
    
    # Create environment template
    create_env_template
    
    echo -e "${YELLOW}Before deploying Cloud Run, please:${NC}"
    echo "1. Copy .env.production.template to .env.production"
    echo "2. Fill in all the required values"
    echo "3. Run: gcloud secrets versions add $SECRET_NAME --data-file=.env.production"
    echo ""
    
    read -p "Press Enter when you've completed the above steps..."
    
    # Deploy Cloud Run
    deploy_cloud_run
    
    # Setup additional services
    setup_gmail_push
    setup_neon
    setup_pusher
    
    # Test setup
    test_setup
    
    echo -e "${GREEN}=== Setup Complete! ===${NC}"
    echo -e "${BLUE}Next steps:${NC}"
    echo "1. Configure Gmail push notifications in your app"
    echo "2. Set up your Neon database with the provided schema"
    echo "3. Configure Pusher for real-time notifications"
    echo "4. Deploy your Vercel application"
    echo "5. Test the end-to-end flow"
    echo ""
    echo -e "${YELLOW}Service URL: $SERVICE_URL${NC}"
    echo -e "${YELLOW}Pub/Sub Topic: projects/$PROJECT_ID/topics/$TOPIC_NAME${NC}"
}

# Run main function
main "$@"