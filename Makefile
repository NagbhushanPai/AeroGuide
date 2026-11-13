# AeroGuide developer commands. Every target has a matching root `pnpm` script for Windows
# shells without make (see docs/deployment/local-development.md).
.PHONY: help install up down dev-web dev-api migrate lint fmt typecheck test test-integration build

help: ## List targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-18s %s\n", $$1, $$2}'

install: ## Install web and API dependencies
	pnpm install
	cd apps/api && uv sync

up: ## Start Postgres+PostGIS and Redis
	docker compose up -d --wait

down: ## Stop local services
	docker compose down

dev-web: ## Run the Next.js dev server (http://localhost:3000)
	pnpm dev:web

dev-api: ## Run the FastAPI dev server (http://localhost:8000/api/v1/docs)
	pnpm dev:api

migrate: ## Apply database migrations
	pnpm migrate

lint: ## Lint web and API
	pnpm lint

fmt: ## Format web and API
	pnpm fmt

typecheck: ## Type-check web and API
	pnpm typecheck

test: ## Unit tests (web + API)
	pnpm test

test-integration: up migrate ## API tests against local Postgres+PostGIS and Redis
	pnpm test:api:integration

build: ## Production build of the web app
	pnpm build:web
