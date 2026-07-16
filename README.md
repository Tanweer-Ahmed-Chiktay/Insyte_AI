# InSyte AI — Intelligent Email Client

A production-grade AI email client built on Next.js 14 that reimagines how people interact with their inbox. Designed and engineered end-to-end — from the interaction model to the real-time sync architecture.

<img width="1470" height="797" alt="InSyte AI Dashboard" src="https://github.com/user-attachments/assets/a91028ef-a256-4adf-959a-cf6a528adee8" />

<img width="1470" height="797" alt="InSyte AI Email View" src="https://github.com/user-attachments/assets/35fc5c61-3421-4253-a1c4-50264cd67ff6" />

---

## Why I built this

Most AI email tools bolt features onto a bad interface. I wanted to explore what an email client looks like when you design the AI interaction from scratch — where summaries, voice, and search feel native rather than tacked on. This is the result.

---

## What it does

**AI Summarization** — Every email is summarized on open using Groq (Llama 3). Long threads collapse to the key ask, decision, or update in one sentence.

**Voice Assistant** — Hands-free mode powered by ElevenLabs TTS + browser speech recognition. Ask "what needs a reply today?" and get a spoken answer.

**Smart Compose** — AI-assisted drafting that pulls context from the thread so you're not starting from a blank box.

**Real-time Inbox Sync** — Gmail push notifications via Google Pub/Sub + Pusher. New emails appear instantly without polling.

**Full Gmail Integration** — Read, reply, forward, archive, label, and search — all through the Gmail API with proper OAuth scopes.

**Calendar & Contacts** — Unified sidebar pulling Google Calendar events and contacts so context lives next to the email.

**Scheduled Send** — Queue emails to send later, handled by a background job queue with retry logic.

---

## Technical decisions worth noting

**Provider-agnostic email layer** — `lib/providers/` abstracts Gmail behind an interface (`base-email-provider.ts`) so Outlook can be swapped in without touching the UI. Outlook provider is stubbed and ready.

**Cache hierarchy** — Three-layer cache: in-memory → IndexedDB → API. Implemented in `lib/cache/cache-manager.ts`. Email list feels instant on repeat visits.

**Background sync worker** — `lib/background-sync.ts` runs a service worker (`public/sw.js`) that pre-fetches likely-to-be-opened emails based on a lightweight user behaviour model (`lib/user-behavior-model.ts`).

**Cloud Run worker** — `cloud-run/gmail-pubsub-worker/` is a separate Node service that handles Gmail Pub/Sub webhook delivery, decoupled from the Next.js app so webhook processing doesn't block the main thread.

**CSRF + rate limiting** — Every mutating API route goes through `lib/utils/csrf.ts` and `lib/utils/rate-limit.ts`. Not an afterthought.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 App Router |
| Language | TypeScript |
| Styling | Tailwind CSS + custom design tokens |
| UI Components | ShadCN UI, Radix UI primitives |
| Animation | Framer Motion |
| Auth | NextAuth.js — Google OAuth |
| Database | PostgreSQL via Prisma |
| AI | Groq API (Llama 3) |
| Voice | ElevenLabs TTS |
| Real-time | Pusher + Google Pub/Sub |
| Deployment | Vercel (app) + Cloud Run (worker) |

---

## Project structure

```
app/
  api/              # 25+ API routes — auth, email, AI, voice, calendar
  page.tsx          # Entry point
components/
  email-dashboard.tsx          # Main shell
  ai-assistant.tsx             # Floating AI panel
  voice-overlay.tsx            # Voice mode UI
  advanced-rich-text-editor.tsx
  pane-manager.tsx             # Resizable multi-pane layout
lib/
  providers/        # Email + calendar provider abstraction
  cache/            # Multi-layer cache
  gmail-batch-processor.ts
  user-behavior-model.ts
  background-sync.ts
hooks/              # 10 custom hooks — polling, websocket, optimistic updates
cloud-run/          # Standalone Gmail Pub/Sub worker
prisma/
  schema.prisma
  migrations/
```

---

## Local setup

```bash
# 1. Install dependencies
npm install

# 2. Copy env template and fill in keys
cp .env.example .env.local

# 3. Push database schema
npx prisma db push

# 4. Run dev server
npm run dev
```

**Required keys:** Google OAuth credentials (Cloud Console), Groq API key, ElevenLabs API key, Pusher app credentials, PostgreSQL connection string.

---

## About me

I care about both sides of the product — the interaction quality users feel and the system reliability that makes it possible. This project is an example of that: real-time infra, a clean abstraction layer, and a UI that doesn't feel like a developer built it.

Open to Design Engineer, Product Engineer, and full-stack roles where both matter.
