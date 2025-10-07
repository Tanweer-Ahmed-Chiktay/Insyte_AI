#!/bin/bash

# Update Vercel environment variables for Pusher
echo "Updating NEXT_PUBLIC_PUSHER_CLUSTER to us3..."
echo "us3" | vercel env add NEXT_PUBLIC_PUSHER_CLUSTER production --force 2>/dev/null || echo "Variable already exists, removing first..."

# Remove existing variable if it exists
echo "y" | vercel env rm NEXT_PUBLIC_PUSHER_CLUSTER production 2>/dev/null

# Add the correct value
echo "us3" | vercel env add NEXT_PUBLIC_PUSHER_CLUSTER production

echo "Environment variable updated successfully!"