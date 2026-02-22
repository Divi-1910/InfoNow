# News Enricher Service

Python service that enriches cleaned news events by scraping full content, chunking text, generating embeddings, generating summaries, and persisting enrichment outputs.

## Pipeline

1. Consume from Kafka topic `process.news.clean`
2. Scrape article URL
3. Chunk article content
4. Generate embeddings
5. Generate summary
6. Save to Postgres and queue outbox events
7. Outbox publisher indexes into OpenSearch (`news_index`) and `mega_index`

## Prerequisites

- Python 3.11+
- Kafka
- PostgreSQL
- OpenSearch
- Ollama running with embed + summary models

## Setup

```bash
cd enrichers/news-enricher
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

## Important Environment Values

```env
KAFKA_BROKERS=localhost:9092
KAFKA_CONSUMER_GROUP=enricher-news
KAFKA_INPUT_TOPIC=process.news.clean

DATABASE_URL=postgresql://...

OPENSEARCH_URL=http://localhost:9200
OPENSEARCH_INDEX=news_index

OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=nomic-embed-text
OLLAMA_SUMMARY_MODEL=llama3.2

MAX_CHUNK_TOKENS=512
SCRAPER_WORKERS=10
SCRAPER_TIMEOUT_SECONDS=10
SCRAPER_MAX_RETRIES=2
SCRAPER_BACKOFF_SECONDS=0.75
SCRAPER_MIN_CONTENT_CHARS=100
BATCH_SIZE=10
```

## Run

```bash
cd enrichers/news-enricher
source .venv/bin/activate
python -m src.main
```

## Health Notes

- If you see repeated scrape failures on consent pages, review:
  - `SCRAPER_BLOCKED_DOMAINS`
  - `SCRAPER_BLOCKED_PATH_KEYWORDS`
- Summary and embedding latency depends on your Ollama model/hardware.
