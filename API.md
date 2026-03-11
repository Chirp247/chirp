# Chirp API Reference

Chirp is a lightweight telemetry service for counting events in developer tools. It provides event ingestion, daily rollup aggregation, time-series queries, dimension breakdowns, SVG badges, and a public dashboard.

**Base URL:** `https://api.chirp247.com`

---

## Authentication

All write endpoints require an API key. Read endpoints require a key only for private projects.

| Header | Description |
|---|---|
| `X-Chirp-Key` | Project API key (required for ingestion, required for private project queries) |
| `X-Chirp-Signature` | HMAC-SHA256 hex digest of the raw JSON body, signed with the project's HMAC secret (optional) |
| `X-Chirp-Client` | Arbitrary client identifier string for unique-client counting (optional) |

---

## Endpoints

### Health Check

```
GET /health
```

**Response:**

```json
{"status": "healthy", "mysql": "connected", "timestamp": "2026-03-11T08:52:11.098Z"}
```

---

### Ingest Single Event

```
POST /api/v1/event
```

**Headers:** `Content-Type: application/json`, `X-Chirp-Key: <api_key>`

**Request body:**

```json
{
  "event": "compile",
  "dims": {
    "platform": "linux",
    "arch": "x86_64"
  }
}
```

**Field constraints:**

| Field | Type | Constraints |
|---|---|---|
| `event` | string | Required. 1-100 chars. Pattern: `^[a-zA-Z0-9_-]+$` |
| `dims` | object | Optional. Max 4 key-value pairs. Keys: 1-50 chars. Values: string, max 200 chars. |

**Response:** `202`

```json
{"accepted": true}
```

**Error responses:**

- `400` — validation error: `{"error": "event must be a string"}`
- `401` — invalid API key: `{"error": "Unauthorized"}`

**curl example:**

```bash
curl -X POST https://api.chirp247.com/api/v1/event \
  -H "Content-Type: application/json" \
  -H "X-Chirp-Key: YOUR_API_KEY" \
  -d '{"event":"install","dims":{"platform":"macos","version":"1.2.0"}}'
```

---

### Ingest Batch Events

```
POST /api/v1/events
```

**Headers:** `Content-Type: application/json`, `X-Chirp-Key: <api_key>`

**Request body:**

```json
{
  "events": [
    {"event": "compile", "dims": {"platform": "linux"}},
    {"event": "install", "dims": {"os": "macos"}},
    {"event": "compile", "dims": {"platform": "windows"}}
  ]
}
```

**Constraints:** Max 50 events per batch. Each event follows the same rules as single ingestion. Invalid events are silently skipped.

**Response:** `202`

```json
{"accepted": true, "count": 3}
```

`count` reflects the number of valid events inserted.

**curl example:**

```bash
curl -X POST https://api.chirp247.com/api/v1/events \
  -H "Content-Type: application/json" \
  -H "X-Chirp-Key: YOUR_API_KEY" \
  -d '{"events":[{"event":"build","dims":{"target":"release"}},{"event":"build","dims":{"target":"debug"}}]}'
```

---

### Query Time Series

```
GET /api/v1/query?project=<name>&event=<event>&period=<period>
```

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `project` | string | (required) | Project name |
| `event` | string | (all events) | Filter to a specific event name |
| `period` | string | `30d` | One of: `7d`, `30d`, `90d`, `12m`, `all` |
| `from` | string | (computed from period) | Start date `YYYY-MM-DD` |
| `to` | string | (today) | End date `YYYY-MM-DD` |
| `group_by` | string | (none) | Dimension key to group by (returns breakdown instead of series) |

**Response (time series):**

```json
{
  "total": 142,
  "uniqueClients": 38,
  "series": [
    {"date": "2026-03-09", "count": 45, "unique": 12},
    {"date": "2026-03-10", "count": 52, "unique": 15},
    {"date": "2026-03-11", "count": 45, "unique": 11}
  ]
}
```

**Response (with `group_by`):**

```json
{
  "total": 142,
  "uniqueClients": 0,
  "breakdown": [
    {"dimension": "platform", "value": "linux", "count": 78, "unique": 20},
    {"dimension": "platform", "value": "macos", "count": 45, "unique": 12},
    {"dimension": "platform", "value": "windows", "count": 19, "unique": 6}
  ]
}
```

**curl examples:**

```bash
# Time series for the last 7 days
curl "https://api.chirp247.com/api/v1/query?project=perry&event=compile&period=7d"

# Breakdown by platform dimension
curl "https://api.chirp247.com/api/v1/query?project=perry&event=compile&group_by=platform&period=30d"

# Custom date range
curl "https://api.chirp247.com/api/v1/query?project=perry&event=install&from=2026-03-01&to=2026-03-11"
```

---

### Project Info

```
GET /api/v1/project/<name>
```

Returns metadata about a project: tracked events, their dimensions, and aggregate counts.

**Response:**

```json
{
  "name": "perry",
  "displayName": "Perry Compiler",
  "events": [
    {"name": "compile", "dimensions": ["platform", "arch"], "totalCount": 1024},
    {"name": "install", "dimensions": ["os"], "totalCount": 512}
  ],
  "firstEvent": "2026-03-01",
  "totalCount": 1536
}
```

Private projects require `X-Chirp-Key` header.

---

### SVG Badge

```
GET /badge/<project>/<event>?period=<period>
```

Returns an SVG badge image (shields.io style) showing the event count.

**Query parameters:**

| Param | Default | Options |
|---|---|---|
| `period` | `30d` | `7d`, `30d`, `90d`, `12m`, `all` |

**Response:** `image/svg+xml` with `Cache-Control: public, max-age=300`

**Embed in markdown:**

```markdown
![Compile count](https://api.chirp247.com/badge/perry/compile?period=30d)
```

---

### Dashboard

```
GET /p/<project>
```

Returns a self-contained HTML page with an interactive dashboard showing event timelines, stat cards, and dimension breakdowns. No external dependencies.

**Example:** `https://api.chirp247.com/p/perry`

---

## Rate Limiting

Rate limits are enforced silently. When rate-limited, the API still returns `202` but drops the event.

| Scope | Limit | Window |
|---|---|---|
| Per IP | 200 requests | 1 hour |
| Per project | 100,000 events | 1 day |
| Per client ID | 500 requests | 1 hour |

---

## Data Model

### Events

Events are the raw data points ingested. Each event has a name and up to 4 string-typed dimensions.

Dimension keys from the ingestion payload are mapped to 4 fixed columns (`dim1Key`/`dim1Val` through `dim4Key`/`dim4Val`). The mapping is positional based on the order of keys in the payload.

### Rollups

A daily aggregation job runs at 03:00 UTC. It computes per-day counts and unique client counts, grouped by project, event, and each dimension key/value pair. Query endpoints read from rollups, not raw events.

Raw events older than the configured retention period (default 90 days) are pruned after rollup.

---

## CLI Administration

The chirp binary doubles as a CLI admin tool:

```bash
# Create a project (generates API key + HMAC secret)
chirp project create --name myapp --display "My Application"

# List all projects
chirp project list

# Rotate API keys
chirp project rotate-key --name myapp

# Run rollup manually for a specific date
chirp rollup run 2026-03-10

# Prune old events
chirp prune --older-than 90d
```

---

## HMAC Signature Verification

For secure ingestion, compute an HMAC-SHA256 signature of the raw JSON body using the project's HMAC secret, and pass it as `X-Chirp-Signature`:

```bash
BODY='{"event":"compile","dims":{"platform":"linux"}}'
SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "YOUR_HMAC_SECRET" | awk '{print $2}')

curl -X POST https://api.chirp247.com/api/v1/event \
  -H "Content-Type: application/json" \
  -H "X-Chirp-Key: YOUR_API_KEY" \
  -H "X-Chirp-Signature: $SIG" \
  -d "$BODY"
```

When the signature header is present, Chirp verifies it against the project's HMAC secret. If the signature is invalid, the request is rejected with `401`.

---

## Database Schema

```sql
CREATE TABLE projects (
  id           VARCHAR(36) PRIMARY KEY,
  name         VARCHAR(100) NOT NULL UNIQUE,
  displayName  VARCHAR(200),
  apiKey       VARCHAR(64) NOT NULL UNIQUE,
  hmacSecret   VARCHAR(64) NOT NULL,
  public       BOOLEAN DEFAULT TRUE,
  createdAt    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE events (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  projectId   VARCHAR(36) NOT NULL,
  event       VARCHAR(100) NOT NULL,
  dim1Key     VARCHAR(50),
  dim1Val     VARCHAR(200),
  dim2Key     VARCHAR(50),
  dim2Val     VARCHAR(200),
  dim3Key     VARCHAR(50),
  dim3Val     VARCHAR(200),
  dim4Key     VARCHAR(50),
  dim4Val     VARCHAR(200),
  clientId    VARCHAR(64),
  timestamp   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (projectId, event, timestamp),
  INDEX (projectId, timestamp),
  FOREIGN KEY (projectId) REFERENCES projects(id)
);

CREATE TABLE rollups (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  projectId      VARCHAR(36) NOT NULL,
  event          VARCHAR(100) NOT NULL,
  dimKey         VARCHAR(50),
  dimVal         VARCHAR(200),
  day            DATE NOT NULL,
  count          INT NOT NULL DEFAULT 0,
  uniqueClients  INT NOT NULL DEFAULT 0,
  UNIQUE INDEX (projectId, event, dimKey, dimVal, day),
  FOREIGN KEY (projectId) REFERENCES projects(id)
);
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server listen port |
| `LOG_LEVEL` | `info` | Fastify log level |
| `MYSQL_HOST` | `localhost` | MySQL host |
| `MYSQL_PORT` | `3306` | MySQL port |
| `MYSQL_DATABASE` | `chirp` | Database name |
| `MYSQL_USER` | `root` | MySQL user |
| `MYSQL_PASSWORD` | `password` | MySQL password |
| `RATE_LIMIT_IP_PER_HOUR` | `200` | Max requests per IP per hour |
| `RATE_LIMIT_PROJECT_PER_DAY` | `100000` | Max events per project per day |
| `RATE_LIMIT_CLIENT_PER_HOUR` | `500` | Max requests per client ID per hour |
| `RETENTION_DAYS` | `90` | Days to keep raw events before pruning |

---

## Building

Chirp is compiled to a native binary using [Perry](https://perryts.com) (TypeScript to native compiler):

```bash
perry compile src/main.ts -o chirp
```

The resulting binary (~4MB) has no runtime dependencies and includes an embedded HTTP server and MySQL client.
