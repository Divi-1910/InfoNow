# InfoNow

InfoNow is a multi-service pipeline that ingests news + YouTube content, transforms and enriches it, indexes it, and serves it through a web app and an AI assistant.

## Services

| Service | Path | Main role | Default port |
|---|---|---|---|
| Frontend | `frontend/` | React web UI | `5173` |
| Backend | `backend/` | API for auth, feed, search, trending, assistant proxy | `3000` |
| Ingestor | `ingestor/` | Fetches raw news/videos and publishes to Kafka | `7575` (API mode) |
| Transformer | `transformer/` | Cleans Kafka events, persists canonical data, writes outbox | - |
| News Enricher | `enrichers/news-enricher/` | Scrape + chunk + embed + summarize news | - |
| YouTube Enricher | `enrichers/yt-enricher/` | Transcript + chunk + embed + summarize videos | - |
| Infiya Agent | `agents/` | LangGraph + OpenAI assistant service | `8090` |
| Infra | `infra/` | Docker Compose for DB, Kafka, OpenSearch, observability | multiple |

## Data Flow

`ingestor` -> Kafka raw topics (`ingest.news.raw`, `ingest.yt.raw`) -> `transformer` -> Kafka clean topics (`process.news.clean`, `process.yt.clean`) -> `news-enricher` / `yt-enricher` -> PostgreSQL + OpenSearch -> `backend` -> `frontend` / `agents`.

## Quick Start (Docker)

```bash
# from repo root
make up-core      # postgres, redis, kafka, opensearch, dashboards
make up-app       # backend, frontend, ingestor, transformer, enrichers
# or everything in one shot:
make up
```

Useful targets:

```bash
make ps
make logs
make logs-app
make up-obs
make down
```

## Run Services on Host (common dev flow)

Start infra first (Docker): Postgres, Redis, Kafka, OpenSearch.

Then run apps on host, each in its own terminal:

```bash
# backend
cd backend && npm run dev

# frontend
cd frontend && npm run dev

# ingestor
cd ingestor && go run ./cmd/main.go run --all

# transformer
cd transformer && go run ./cmd/main.go

# news enricher
cd enrichers/news-enricher && python3 -m src.main

# yt enricher
cd enrichers/yt-enricher && python3 -m src.main

# infiya agent
cd agents && uvicorn app.main:app --host 0.0.0.0 --port 8090 --reload
```

## Observability

When `infra/docker-compose.yml` observability services are running:

- Grafana: `http://localhost:3001` (default `admin` / `admin`)
- OpenSearch Dashboards: `http://localhost:5601`
- Prometheus: `http://localhost:9090`
- Loki: `http://localhost:3100`

## Service Docs

- `backend/README.md`
- `frontend/README.md`
- `ingestor/README.md`
- `transformer/README.md`
- `enrichers/news-enricher/README.md`
- `enrichers/yt-enricher/README.md`
- `agents/README.md`
