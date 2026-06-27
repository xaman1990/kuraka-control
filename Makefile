.PHONY: install dev build test lint typecheck format start check

install:
	npm install

# Full gate: lint + typecheck + test (the Phase-4 "green" definition — LL-014).
# `make test` alone does NOT type-check (vitest transpiles per-file), so a type
# error can ride green; always run `make check` before declaring a story done.
check: lint typecheck test

dev:
	npm run dev

build:
	npm run build

test:
	npm run test

lint:
	npm run lint

typecheck:
	npm run typecheck

format:
	npm -w backend run format && npm -w frontend run format

# Serve the built SPA from Express (v1 "production" = localhost single process).
start: build
	npm -w backend run start
