# Backend Service

Node.js + TypeScript API for InfoNow.

## What It Handles

- Auth and user APIs
- Topics/subtopics APIs
- Feed, search, saved, and trending APIs
- Assistant APIs (thread/message persistence + proxy to agent service)

Base route prefix: `/api`

## Prerequisites

- Node.js 20+
- PostgreSQL (direct + pooled URLs)
- OpenSearch

## Setup

```bash
cd backend
npm install
```

Create `backend/.env` with at least:

```env
PORT=3000
DIRECT_DATABASE_URL=postgresql://...
POOLED_DATABASE_URL=postgresql://...
ACCESS_TOKEN_SECRET=...
REFRESH_TOKEN_SECRET=...
GOOGLE_CLIENT_ID=...
OPENSEARCH_URL=http://localhost:9200
AGENT_SERVICE_URL=http://localhost:8090
ADMIN_USER_IDS=
```

Run migrations (first time / after schema changes):

```bash
npx prisma migrate deploy
```

## Run

```bash
# dev
npm run dev

# production build + run
npm run build
npm run start
```

## Health Check

- `GET /healthy`

## Main API Groups

- `/api/auth`
- `/api/user`
- `/api/topics`
- `/api/feed`
- `/api/search`
- `/api/saved`
- `/api/trending`
- `/api/admin`
- `/api/assistant`

## Assistant Integration

This service stores assistant threads/messages in Postgres and forwards assistant queries/streaming calls to `AGENT_SERVICE_URL`.
