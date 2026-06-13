.PHONY: install dev build test lint typecheck format start

install:
	npm install

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
