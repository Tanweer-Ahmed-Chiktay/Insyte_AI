#!/bin/bash

# InSyte AI Email Assistant - Deployment Script
# This script helps automate the deployment process

echo "🚀 InSyte AI Email Assistant - Deployment Helper"
echo "================================================"

# Check if required tools are installed
command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required but not installed. Aborting." >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "❌ npm is required but not installed. Aborting." >&2; exit 1; }

echo "✅ Node.js and npm are installed"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed successfully"

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npm run db:generate

if [ $? -ne 0 ]; then
    echo "❌ Failed to generate Prisma client"
    exit 1
fi

echo "✅ Prisma client generated successfully"

# Build the application
echo "🏗️  Building application..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

echo "✅ Application built successfully"

echo ""
echo "🎉 Deployment preparation complete!"
echo ""
echo "Next steps:"
echo "1. Set up your Supabase database (see DEPLOYMENT.md)"
echo "2. Configure environment variables in Vercel/Render"
echo "3. Deploy to your chosen platform"
echo ""
echo "For detailed instructions, see DEPLOYMENT.md"
echo "================================================"