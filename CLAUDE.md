# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Chirp is a lightweight telemetry service for counting events in developer tools. It ingests events, aggregates them into daily rollups, and serves queries, badges, and an interactive dashboard. Built with Fastify + MySQL, compiled to a native binary via Perry.

## Commands

- **Dev server:** `npm run dev` (runs ts-node src/main.ts)
- **Build:** `npm run build` (tsc to dist/)
- **Start compiled:** `npm run start` (node dist/main.js)
- **No test or lint tooling is configured.**

### CLI commands (run via the binary or `npm run dev --`)

- `chirp project create --name <n> [--display <d>]`
- `chirp project list`
- `chirp project rotate-key --name <n>`
- `chirp rollup run [YYYY-MM-DD]`
- `chirp prune --older-than <N>d`

## Architecture

Layered design: **Routes → Services → DB (MySQL pool)**

### Data flow

1. **Ingestion** (`routes/ingest.ts`) — POST /api/v1/event or /events (batch). Validates payload, authenticates via X-Chirp-Key, checks rate limits, inserts into `events` table.
2. **Rollup** (`services/rollup.ts`) — Scheduled daily at 03:00 UTC. Aggregates raw events into `rollups` table by day, prunes old events beyond retention period.
3. **Query** (`routes/query.ts`) — GET /api/v1/query. Reads from pre-aggregated `rollups` for time-series or dimension breakdowns.
4. **Dashboard** (`routes/dashboard.ts`) — GET /p/:project. Self-contained HTML page with inline JS that fetches and renders charts client-side.
5. **Badge** (`routes/badge.ts`) — GET /badge/:project/:event. Shields.io-style SVG, 5-minute cache.

### Database schema (3 tables, defined in `schema.ts`)

- **projects** — metadata, API keys, HMAC secrets
- **events** — raw ingested events with dim1-dim4 key/value columns
- **rollups** — pre-aggregated daily counts and unique client counts

### Key patterns

- **Perry compatibility** — Avoids features that don't compile natively (no Object.keys(), no large template literals; uses string concatenation for HTML and direct property access for dimensions).
- **Dimension normalization** — Arbitrary dimensions are mapped to fixed columns dim1–dim4 based on a predefined key list.
- **Silent rate limiting** — Rate-limited requests return 202 Accepted but silently drop the event.
- **In-memory rate limiting** — Sliding window buckets per IP, project, and client (not persisted).

## Configuration

Environment variables loaded via dotenv (see `.env.example`). Key settings: PORT, LOG_LEVEL, MySQL connection params, rate limit thresholds, event retention days.
