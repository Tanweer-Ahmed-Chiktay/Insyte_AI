# Gmail Pub/Sub Setup Guide

To enable real-time Gmail synchronization, you need to set up Google Cloud Pub/Sub.

## Prerequisites

1. Google Cloud Project (Project ID: `insyte-467414`)
2. Gmail API enabled
3. Pub/Sub API enabled
4. Domain with HTTPS for webhook endpoint (for production)

## Setup Steps

### 1. Enable Required APIs

```bash
gcloud services enable pubsub.googleapis.com
gcloud services enable gmail.googleapis.com
```

### 2. Create Pub/Sub Topic

```bash
gcloud pubsub topics create MyTopic
```

### 3. Create Subscription (Optional)

```bash
gcloud pubsub subscriptions create MySub --topic=MyTopic
```

### 4. Set Permissions

Grant Gmail service account permission to publish to your topic:

```bash
gcloud pubsub topics add-iam-policy-binding MyTopic \
    --member=serviceAccount:gmail-api-push@system.gserviceaccount.com \
    --role=roles/pubsub.publisher
```

### 5. Verify Setup

Check if the topic exists:

```bash
gcloud pubsub topics list
```

## Environment Configuration

Ensure your `.env` file contains:

```
GOOGLE_CLOUD_PROJECT_ID=insyte-467414
GMAIL_PUBSUB_TOPIC=projects/insyte-467414/topics/MyTopic
GMAIL_WEBHOOK_URL=https://your-domain.com/api/gmail/webhook
```

**For Development:**
- Use ngrok or similar tool to expose localhost
- Update `GMAIL_WEBHOOK_URL` to your ngrok URL

**For Production:**
- Use your actual domain with HTTPS
- Ensure `/api/gmail/webhook` endpoint is accessible

## Troubleshooting

- **400 Bad Request**: Usually means the Pub/Sub topic doesn't exist or lacks proper permissions
- **403 Forbidden**: Check if Pub/Sub API is enabled and permissions are set correctly
- **Topic not found**: Verify the topic name matches exactly: `MyTopic`

## Testing

After setup, try the "Setup Gmail Watch" button in the application. It should succeed without errors.