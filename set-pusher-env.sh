#!/bin/bash

# Set Pusher environment variables for Vercel
echo "Setting Pusher environment variables..."

# Remove existing variables (if any)
echo "Removing existing variables..."
vercel env rm NEXT_PUBLIC_PUSHER_KEY --yes || true
vercel env rm NEXT_PUBLIC_PUSHER_CLUSTER --yes || true
vercel env rm PUSHER_APP_ID --yes || true
vercel env rm PUSHER_KEY --yes || true
vercel env rm PUSHER_SECRET --yes || true
vercel env rm PUSHER_CLUSTER --yes || true

# Add new variables with correct values
echo "Adding new variables..."
echo "fc1597877650e530dfd2" | vercel env add NEXT_PUBLIC_PUSHER_KEY production preview development
echo "us3" | vercel env add NEXT_PUBLIC_PUSHER_CLUSTER production preview development
echo "2035618" | vercel env add PUSHER_APP_ID production preview development
echo "fc1597877650e530dfd2" | vercel env add PUSHER_KEY production preview development
echo "b93708809102c6ab52e4" | vercel env add PUSHER_SECRET production preview development
echo "us3" | vercel env add PUSHER_CLUSTER production preview development

echo "Done! Environment variables set."