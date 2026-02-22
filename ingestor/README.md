# Ingestor Service

Go service that ingests raw content from NewsAPI and YouTube, then publishes to Kafka raw topics.

## Modes

- CLI mode (`run`) for scheduled or manual ingestion
- API mode (`serve`) for remote-triggered ingestion jobs

## Prerequisites

- Go 1.24+
- Kafka reachable via `KAFKA_BROKERS`
- Redis
- Backend API (for topics/subtopics)

## Environment

Create `ingestor/.env` with at least:

```env
NEWSAPI_KEY_1=...
NEWSAPI_KEY_2=...
NEWSAPI_KEY_3=...
YOUTUBE_API_KEY=...
BACKEND_URL=http://localhost:3000

KAFKA_BROKERS=localhost:9092
REDIS_ADDR=localhost:6379
REDIS_PASSWORD=
REDIS_DB=0

SCHEDULED_INTERVAL_IN_HOURS=4
YOUTUBE_MAX_RESULTS=10
NEWS_MAX_PER_TOPIC=200
INGEST_OPERATION_TIMEOUT_SECONDS=5

# API mode
INGESTOR_PORT=7575
INGESTOR_API_KEY=change_me
INGESTOR_API_RATE_LIMIT_PER_MINUTE=30
INGESTOR_API_JOB_TIMEOUT_SECONDS=1800
```

## Run (CLI)

```bash
cd ingestor

# run one full cycle and exit
go run ./cmd/main.go run --all --once

# manual topic ingestion
go run ./cmd/main.go run --topic technology --source all --once

# manual source-specific ingestion
go run ./cmd/main.go run --topic technology --source news --once
go run ./cmd/main.go run --topic technology --source youtube --once

# scheduled mode (keeps running)
go run ./cmd/main.go run --all
```

## Run (API Server)

```bash
cd ingestor
go run ./cmd/main.go serve --port 7575
```

## API Endpoints (serve mode)

- `GET /health`
- `POST /ingestions`
- `GET /ingestions/:id`

Auth header for protected endpoints:

- `X-API-Key: <INGESTOR_API_KEY>`

Optional idempotency header:

- `Idempotency-Key: <unique-client-key>`

## Kafka Topics

Publishes raw events to:

- `ingest.news.raw`
- `ingest.yt.raw`
