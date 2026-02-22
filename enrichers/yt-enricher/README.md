# YouTube Enricher Service

Python service that enriches cleaned YouTube events by fetching transcripts, chunking content, generating embeddings, generating summaries, and publishing enrichment outputs.

## Pipeline

1. Consume from Kafka topic `process.yt.clean`
2. Fetch transcript (`youtube-transcript-api`)
3. Chunk transcript
4. Generate embeddings
5. Generate summary
6. Save to Postgres and queue outbox events
7. Outbox publisher indexes into OpenSearch (`yt_index`) and `mega_index`

## Prerequisites

- Python 3.11+
- Kafka
- PostgreSQL
- OpenSearch
- Ollama running with embed + summary models

## Setup

```bash
cd enrichers/yt-enricher
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create `enrichers/yt-enricher/.env`:

```env
KAFKA_BROKERS=localhost:9092
KAFKA_CONSUMER_GROUP=enricher-yt
KAFKA_INPUT_TOPIC=process.yt.clean

DATABASE_URL=postgresql://...

OPENSEARCH_URL=http://localhost:9200
OPENSEARCH_INDEX=yt_index

OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=nomic-embed-text
OLLAMA_SUMMARY_MODEL=llama3.2

MAX_CHUNK_TOKENS=512
BATCH_SIZE=10
TRANSCRIPT_LANGUAGES=en,en-US
```

## Run

```bash
cd enrichers/yt-enricher
source .venv/bin/activate
python -m src.main
```

## Health Notes

- If transcript retrieval fails, video processing may be terminally failed and committed.
- Ensure `KAFKA_INPUT_TOPIC` matches your transformer output topic (`process.yt.clean`).
