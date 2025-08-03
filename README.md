# Email AI Summarizing App

A modern email AI summarizing application built with Next.js, featuring AI-powered email summaries, voice assistant, and smart email management.

## Features

- 🤖 **AI Email Summaries** - Powered by Groq Claude 3 Haiku
- 🎤 **Voice Assistant** - Text-to-speech using ElevenLabs
- 🔍 **Web Search** - Real-time web search powered by SerpAPI
- 📧 **Gmail Integration** - Full Gmail API support
- 🔐 **Google OAuth** - Secure authentication
- 🎨 **Modern UI** - Built with Tailwind CSS, ShadCN, and Framer Motion
- 📱 **Responsive Design** - Works on all devices
- 🌙 **Dark Mode** - Theme switching support

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **UI Components**: ShadCN UI, Radix UI, Framer Motion
- **Authentication**: NextAuth.js with Google OAuth
- **Database**: PostgreSQL with Prisma ORM
- **AI**: Groq API (Claude 3 Haiku)
- **Voice**: ElevenLabs Text-to-Speech
- **Web Search**: SerpAPI (Google Search)
- **Email**: Gmail API

## Setup Instructions

### 1. Environment Variables

Copy `.env.local` and fill in your API keys:

```bash
# NextAuth Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-nextauth-secret-here

# Google OAuth (Get from Google Cloud Console)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Database
DATABASE_URL="postgresql://username:password@localhost:5432/email_ai_app"

# AI Services
GROQ_API_KEY=your-groq-api-key
GEMINI_API_KEY=your-gemini-api-key

# Web Search (SerpAPI)
SERPAPI_API_KEY=your-serpapi-key-here

# ElevenLabs (Voice Assistant)
ELEVENLABS_API_KEY=your-elevenlabs-api-key
```

### 2. Database Setup

```bash
# Install dependencies
npm install

# Setup PostgreSQL database
# Make sure PostgreSQL is running and create a database named 'email_ai_app'

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma db push
```

### 3. Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Gmail API and Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://yourdomain.com/api/auth/callback/google` (for production)

### 4. API Keys

- **Groq API**: Get from [Groq Console](https://console.groq.com/)
- **ElevenLabs**: Get from [ElevenLabs](https://elevenlabs.io/)
- **Gemini** (optional): Get from [Google AI Studio](https://makersuite.google.com/)

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
├── app/
│   ├── api/          # API routes
│   ├── globals.css   # Global styles
│   ├── layout.tsx    # Root layout
│   ├── page.tsx      # Home page
│   └── providers.tsx # Context providers
├── components/
│   ├── email-dashboard.tsx # Main dashboard
│   └── ui/           # Reusable UI components
├── lib/
│   └── utils.ts      # Utility functions
├── prisma/
│   └── schema.prisma # Database schema
└── ...
```

## Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Connect repository to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

### Render

1. Create new Web Service
2. Connect GitHub repository
3. Add environment variables
4. Deploy

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details.