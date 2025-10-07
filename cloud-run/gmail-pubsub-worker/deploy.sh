#!/bin/bash

# Gmail Pub/Sub Worker Deployment Script
# This script builds and deploys the Cloud Run service

set -e

# Configuration
PROJECT_ID="${GOOGLE_CLOUD_PROJECT_ID}"
SERVICE_NAME="gmail-pubsub-worker"
REGION="us-central1"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting deployment of Gmail Pub/Sub Worker...${NC}"

# Check if required environment variables are set
if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Error: GOOGLE_CLOUD_PROJECT_ID environment variable is not set${NC}"
    exit 1
fi

# Authenticate with Google Cloud (if not already authenticated)
echo -e "${YELLOW}Checking Google Cloud authentication...${NC}"
gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -n1
if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Not authenticated with Google Cloud. Run 'gcloud auth login'${NC}"
    exit 1
fi

# Set the project
echo -e "${YELLOW}Setting Google Cloud project to ${PROJECT_ID}...${NC}"
gcloud config set project $PROJECT_ID

# Enable required APIs
echo -e "${YELLOW}Enabling required Google Cloud APIs...${NC}"
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable pubsub.googleapis.com

# Build the Docker image
echo -e "${YELLOW}Building Docker image...${NC}"
gcloud builds submit --tag $IMAGE_NAME .

# Create secrets if they don't exist
echo -e "${YELLOW}Creating/updating secrets...${NC}"

# Function to create or update secret
create_or_update_secret() {
    local secret_name=$1
    local secret_value=$2
    
    if gcloud secrets describe $secret_name >/dev/null 2>&1; then
        echo "Updating secret: $secret_name"
        echo -n "$secret_value" | gcloud secrets versions add $secret_name --data-file=-
    else
        echo "Creating secret: $secret_name"
        echo -n "$secret_value" | gcloud secrets create $secret_name --data-file=-
    fi
}

# Create secrets (you'll need to set these values)
if [ ! -z "$GOOGLE_CLIENT_ID" ]; then
    create_or_update_secret "gmail-worker-google-client-id" "$GOOGLE_CLIENT_ID"
fi

if [ ! -z "$GOOGLE_CLIENT_SECRET" ]; then
    create_or_update_secret "gmail-worker-google-client-secret" "$GOOGLE_CLIENT_SECRET"
fi

if [ ! -z "$NEXTAUTH_URL" ]; then
    create_or_update_secret "gmail-worker-nextauth-url" "$NEXTAUTH_URL"
fi

if [ ! -z "$SUPABASE_URL" ]; then
    create_or_update_secret "gmail-worker-supabase-url" "$SUPABASE_URL"
fi

if [ ! -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    create_or_update_secret "gmail-worker-supabase-key" "$SUPABASE_SERVICE_ROLE_KEY"
fi

if [ ! -z "$ENCRYPTION_KEY" ]; then
    create_or_update_secret "gmail-worker-encryption-key" "$ENCRYPTION_KEY"
fi

# Deploy to Cloud Run
echo -e "${YELLOW}Deploying to Cloud Run...${NC}"
gcloud run deploy $SERVICE_NAME \
    --image $IMAGE_NAME \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --memory 1Gi \
    --cpu 1 \
    --concurrency 1000 \
    --timeout 300 \
    --min-instances 0 \
    --max-instances 100 \
    --set-env-vars="GOOGLE_CLOUD_PROJECT_ID=${PROJECT_ID}" \
    --set-secrets="GOOGLE_CLIENT_ID=gmail-worker-google-client-id:latest,GOOGLE_CLIENT_SECRET=gmail-worker-google-client-secret:latest,NEXTAUTH_URL=gmail-worker-nextauth-url:latest,SUPABASE_URL=gmail-worker-supabase-url:latest,SUPABASE_SERVICE_ROLE_KEY=gmail-worker-supabase-key:latest,ENCRYPTION_KEY=gmail-worker-encryption-key:latest"

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --platform managed --region $REGION --format 'value(status.url)')

echo -e "${GREEN}Deployment completed successfully!${NC}"
echo -e "${GREEN}Service URL: ${SERVICE_URL}${NC}"
echo -e "${GREEN}Pub/Sub endpoint: ${SERVICE_URL}/pubsub${NC}"

# Create Pub/Sub topic and subscription if they don't exist
echo -e "${YELLOW}Setting up Pub/Sub topic and subscription...${NC}"

TOPIC_NAME="gmail-notifications"
SUBSCRIPTION_NAME="gmail-notifications-sub"

# Create topic if it doesn't exist
if ! gcloud pubsub topics describe $TOPIC_NAME >/dev/null 2>&1; then
    echo "Creating Pub/Sub topic: $TOPIC_NAME"
    gcloud pubsub topics create $TOPIC_NAME
else
    echo "Pub/Sub topic $TOPIC_NAME already exists"
fi

# Create subscription if it doesn't exist
if ! gcloud pubsub subscriptions describe $SUBSCRIPTION_NAME >/dev/null 2>&1; then
    echo "Creating Pub/Sub subscription: $SUBSCRIPTION_NAME"
    gcloud pubsub subscriptions create $SUBSCRIPTION_NAME \
        --topic $TOPIC_NAME \
        --push-endpoint "${SERVICE_URL}/pubsub" \
        --ack-deadline 600
else
    echo "Pub/Sub subscription $SUBSCRIPTION_NAME already exists"
    # Update the push endpoint
    gcloud pubsub subscriptions modify-push-config $SUBSCRIPTION_NAME \
        --push-endpoint "${SERVICE_URL}/pubsub"
fi

echo -e "${GREEN}Setup completed!${NC}"
echo -e "${YELLOW}Next steps:${NC}"
echo -e "1. Configure Gmail watch notifications to use topic: projects/${PROJECT_ID}/topics/${TOPIC_NAME}"
echo -e "2. Update your Vercel environment variables with the Pub/Sub topic name"
echo -e "3. Test the setup by triggering a Gmail notification"