# Infra Stack

Docker Compose definitions for InfoNow infrastructure and optional observability.

## Main Components

- PostgreSQL (`5432`)
- PgBouncer (`6432`)
- Redis (`6379`)
- Kafka broker (`9092`)
- OpenSearch (`9200`)
- OpenSearch Dashboards (`5601`)

## Observability Components

- Loki (`3100`)
- Prometheus (`9090`)
- Grafana (`3001`)
- Tempo (`3200`)
- OTEL Collector (`8889`, `4319`, `4320`)

## Run from Repo Root

```bash
make up-core   # core infra only
make up-obs    # observability only
make up        # full stack
make down
```

Compose file path:

- `infra/docker-compose.yml`
