# Infiya Agent Service

FastAPI + LangGraph service for the InfoNow assistant.

## What It Handles

- Creates conversation threads
- Runs query workflow with tool-calling
- Streams assistant output over SSE
- Persists memory via Postgres checkpointer

## Tools Wired

- `hybrid_os_search`
- `keyword_os_search`
- `vector_os_search` (current fallback strategy)
- `search_web` (Tavily, optional)
- `get_full_content`
- `get_trending_content`

## Prerequisites

- Python 3.11+
- PostgreSQL
- OpenSearch
- OpenAI API key

## Setup

```bash
cd agents
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

## Important Environment Values

```env
AGENT_HOST=0.0.0.0
AGENT_PORT=8090
AGENT_OPENAI_API_KEY=...
AGENT_MODEL=gpt-4o-mini
AGENT_ENABLE_WEB_SEARCH=false
TAVILY_API_KEY=

DATABASE_URL=postgresql://...
OPENSEARCH_URL=http://localhost:9200
BACKEND_BASE_URL=http://localhost:3000
```

## Run

```bash
cd agents
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8090 --reload
```

## Endpoints

- `GET /health`
- `POST /threads`
- `POST /query`
- `POST /stream` (`text/event-stream`)

## Memory Model

- Create a thread via `POST /threads`
- Reuse returned `thread_id` as `conversation_id` in `/query` and `/stream`
- Conversation state is checkpointed in Postgres
