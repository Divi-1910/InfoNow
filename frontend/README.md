# Frontend Service

React + TypeScript + Vite UI for InfoNow.

## What It Handles

- Feed and trending experience
- Search and saved items
- Infiya assistant workspace UI
- Auth-aware user flows

## Prerequisites

- Node.js 20+

## Setup

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```env
VITE_BACKEND_URL=http://localhost:3000
VITE_GOOGLE_CLIENT_ID=your_google_client_id
```

## Run

```bash
# dev server
npm run dev

# build
npm run build

# preview build
npm run preview
```

Default local URL: `http://localhost:5173`
