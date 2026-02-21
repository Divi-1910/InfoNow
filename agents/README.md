# Infiya Agents Service

FastAPI + LangGraph service for assistant workflows.

## Endpoints

- `GET /health` - service health
- `POST /threads` - create a persistent conversation thread id
- `POST /query` - non-streaming response
- `POST /stream` - SSE stream (`text/event-stream`)

## Run

```bash
cd agents
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 8090 --reload
```

## Current Workflow Shape

The graph follows:

`LLM Node -> Tools Node -> LLM Node` (capped loops)

Tools currently wired:

- `hybrid_os_search`
- `keyword_os_search`
- `vector_os_search`
- `search_web`
- `get_full_content`
- `get_trending_content`

`search_web` is gated by `AGENT_ENABLE_WEB_SEARCH`.
When enabled, it uses Tavily (`TAVILY_API_KEY` required).

## Memory

- Conversation memory is persisted via LangGraph Postgres checkpointer.
- Create a thread once using `POST /threads`.
- Pass the returned `thread_id` as `conversation_id` in `/query` and `/stream`.

## Model Provider

This service is configured for OpenAI chat models via:

- `AGENT_OPENAI_API_KEY`
- `AGENT_MODEL` (default `gpt-4o-mini`)
- optional `AGENT_OPENAI_BASE_URL`
