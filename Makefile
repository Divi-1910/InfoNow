COMPOSE_FILE := infra/docker-compose.yml
DOCKER_COMPOSE := docker compose -f $(COMPOSE_FILE)

APP_SERVICES := ingestor transformer news-enricher yt-enricher backend frontend
OBS_SERVICES := loki promtail grafana
CORE_SERVICES := postgres pgbouncer redis broker opensearch opensearch_dashboards

.PHONY: help up up-build down restart ps logs logs-app up-app up-obs up-core

help:
	@echo "Targets:"
	@echo "  make up         - Start full stack (all services)"
	@echo "  make up-build   - Start full stack with build"
	@echo "  make down       - Stop and remove full stack"
	@echo "  make restart    - Restart full stack"
	@echo "  make ps         - Show running services"
	@echo "  make logs       - Follow logs for all services"
	@echo "  make logs-app   - Follow logs for app services only"
	@echo "  make up-core    - Start only core infra services"
	@echo "  make up-app     - Start only app services"
	@echo "  make up-obs     - Start only minimal observability services"

up:
	$(DOCKER_COMPOSE) up -d

up-build:
	$(DOCKER_COMPOSE) up -d --build

down:
	$(DOCKER_COMPOSE) down

restart: down up

ps:
	$(DOCKER_COMPOSE) ps

logs:
	$(DOCKER_COMPOSE) logs -f --tail=200

logs-app:
	$(DOCKER_COMPOSE) logs -f --tail=200 $(APP_SERVICES)

up-core:
	$(DOCKER_COMPOSE) up -d $(CORE_SERVICES)

up-app:
	$(DOCKER_COMPOSE) up -d $(APP_SERVICES)

up-obs:
	$(DOCKER_COMPOSE) up -d $(OBS_SERVICES)
