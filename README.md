# Chirp

Lightweight telemetry service for counting events in developer tools. Send an event name with up to 4 string dimensions, Chirp counts them and shows aggregate data via API and a public dashboard.

Built with [Perry](https://perryts.com) (TypeScript compiled to a native binary) and MySQL.

**Live instance:** [api.chirp247.com](https://api.chirp247.com)

## Features

- **Event ingestion** — single or batch (up to 50), with optional HMAC signature verification
- **Up to 4 dimensions** per event for slicing data (e.g. platform, version, region)
- **Daily rollup aggregation** — automatic at 03:00 UTC with configurable raw event retention
- **Time-series queries** — filter by event, date range, and period
- **Dimension breakdowns** — group by any dimension key
- **SVG badges** — shields.io-style, embeddable in READMEs
- **Interactive dashboard** — self-contained HTML page per project, no external dependencies
- **Rate limiting** — per IP, per project, per client ID
- **Single binary** — ~4MB native executable, no runtime dependencies

## Quick Start

### 1. Set up MySQL

```sql
CREATE DATABASE chirp;
CREATE USER 'chirp'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL ON chirp.* TO 'chirp'@'localhost';
```

Create the tables from [src/schema.ts](src/schema.ts) or let the migration run on first start.

### 2. Configure

```bash
cp .env.example .env
# Edit .env with your MySQL credentials
```

### 3. Build & Run

```bash
perry compile src/main.ts -o chirp
./chirp
```

### 4. Create a project

```bash
./chirp project create --name myapp --display "My App"
# Outputs: API Key and HMAC Secret
```

### 5. Send events

```bash
curl -X POST https://api.chirp247.com/api/v1/event \
  -H "Content-Type: application/json" \
  -H "X-Chirp-Key: YOUR_API_KEY" \
  -d '{"event":"install","dims":{"platform":"macos","version":"1.2.0"}}'
```

### 6. Query data

```bash
# Time series
curl "https://api.chirp247.com/api/v1/query?project=myapp&event=install&period=30d"

# Breakdown by dimension
curl "https://api.chirp247.com/api/v1/query?project=myapp&event=install&group_by=platform"
```

## API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/api/v1/event` | Ingest single event |
| `POST` | `/api/v1/events` | Ingest batch (max 50) |
| `GET` | `/api/v1/query` | Query time series or dimension breakdown |
| `GET` | `/api/v1/project/:name` | Project metadata and event list |
| `GET` | `/badge/:project/:event` | SVG badge |
| `GET` | `/p/:project` | Interactive dashboard |

Full reference with request/response examples: [API.md](API.md)

## CLI Administration

```bash
chirp project create --name <n> [--display <d>]   # Create project
chirp project list                                  # List projects
chirp project rotate-key --name <n>                 # Rotate API keys
chirp rollup run [YYYY-MM-DD]                       # Run rollup manually
chirp prune --older-than <N>d                       # Prune old events
```

## Architecture

```
src/
├── main.ts                 # Entry point, CLI commands, route registration
├── config.ts               # Environment configuration
├── db.ts                   # MySQL connection pool
├── schema.ts               # Table definitions
├── types.ts                # Shared interfaces
├── routes/
│   ├── ingest.ts           # POST /api/v1/event, /api/v1/events
│   ├── query.ts            # GET /api/v1/query
│   ├── project.ts          # GET /api/v1/project/:name
│   ├── badge.ts            # GET /badge/:project/:event
│   └── dashboard.ts        # GET /p/:project
└── services/
    ├── auth.ts             # API key lookup + HMAC verification
    ├── ratelimit.ts        # In-memory rate limiting
    ├── rollup.ts           # Daily aggregation + event pruning
    ├── validation.ts       # Event payload validation
    └── badge-render.ts     # SVG badge generation
```

## Badge Example

Embed in your README:

```markdown
![Events](https://api.chirp247.com/badge/YOUR_PROJECT/YOUR_EVENT?period=30d)
```

## License

MIT
