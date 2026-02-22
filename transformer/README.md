# Transformer Service

Go service that consumes raw Kafka events, validates/transforms them, stores canonical records in Postgres, and writes clean events via outbox.

## What It Handles

- Consumes raw topics:
  - `ingest.news.raw`
  - `ingest.yt.raw`
- Produces clean topics:
  - `process.news.clean`
  - `process.yt.clean`
- DLQ support:
  - `transformer.news.dlq`
  - `transformer.yt.dlq`
- Outbox publishers:
  - Kafka outbox publisher
  - Mega OpenSearch publisher (`mega_index`)

## Prerequisites

- Go 1.24+
- PostgreSQL
- Kafka
- OpenSearch

## Environment

Start from `transformer/.env.example`, then extend as needed:

```env
KAFKA_BROKERS=localhost:9092
KAFKA_CONSUMER_GROUP=transformer-news
KAFKA_INPUT_TOPIC=ingest.news.raw
KAFKA_OUTPUT_TOPIC=process.news.clean

KAFKA_YT_CONSUMER_GROUP=transformer-yt
KAFKA_YT_INPUT_TOPIC=ingest.yt.raw
KAFKA_YT_OUTPUT_TOPIC=process.yt.clean

KAFKA_NEWS_DLQ_TOPIC=transformer.news.dlq
KAFKA_YT_DLQ_TOPIC=transformer.yt.dlq

DATABASE_URL=postgresql://...
OPENSEARCH_URL=http://localhost:9200

BATCH_SIZE=100
PROCESSING_WORKERS=10
PROCESSING_MAX_RETRIES=3

OUTBOX_POLL_INTERVAL=1s
OUTBOX_BATCH_SIZE=100
OUTBOX_MAX_RETRIES=3

LOG_LEVEL=info
LOG_FORMAT=json
```

## Run

```bash
cd transformer
go run ./cmd/main.go
```

## Notes

- Logs are structured (`json` by default).
- Service starts two pipelines (news + YouTube) and two outbox loops.
