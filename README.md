# PiShock Discord Activity (PostgreSQL Rework)

Self-hosted Node.js + React Discord Activity for PiShock, replacing the Cloudflare Workers + KV stack with **Hono**, **Prisma**, and **PostgreSQL**.

## Stack

- **API**: Hono on Node (`server/`)
- **DB**: Prisma + PostgreSQL (Docker); reference `old-activity/` for the original Workers implementation
- **Frontend**: React 18 + Vite + Tailwind (`web/`)
- **Login**: WebSocket relay to `wss://relay.pishock.com/{guid}` via `/api/login-relay/:guid`

## Quick start (local)

### 1. Prerequisites

- Node.js 20+
- PostgreSQL 16 (or use Docker Compose for Postgres only)

### 2. Environment

```bash
cp .env.example .env
# Edit .env — set DISCORD_*, ENCRYPTION_KEY (openssl rand -hex 32), DATABASE_URL
```

### 3. Database

```bash
# Start Postgres only
docker compose up -d postgres

# Apply schema
npm install
npx prisma migrate deploy
```

### 4. Run dev

```bash
npm run dev
```

- Vite UI: http://localhost:3000
- API + WS relay: http://localhost:3001
- Vite proxies `/api` and WebSocket upgrades to the API server

## Docker (full stack)

```bash
cp .env.example .env
# Fill in secrets in .env

docker compose up --build
```

App serves on http://localhost:3000 (API + static build + login relay WS).

## API paths

Same as `old-activity`:

| Route | Description |
|-------|-------------|
| `POST /api/auth/discord` | Discord OAuth code exchange |
| `POST /api/token/refresh` | Manual token refresh |
| `GET /api/verify-instance` | Discord activity instance verification |
| `GET/PUT/DELETE /api/users/:id/pishock-settings` | PiShock credentials (AES-256-GCM at rest) |
| `GET /api/users/:id/pishock-status` | Connection status |
| `POST /api/users/:id/pishock-test` | Test beep |
| `POST /api/users/:id/pishock-execute` | Execute shock/vibrate/beep |
| `GET/PUT /api/instances/:id/data` | Instance sync |
| `GET/POST /api/activity-log` | Activity log |
| `GET /api/monetization/*` | Entitlements, SKUs, warning acks |
| `GET/POST/DELETE /api/admin/*` | Admin tools |
| `WS /api/login-relay/:guid` | PiShock login relay |

Embedded Discord mode uses `/.proxy/api`; dev uses `/api`.

## PiShock login flow

1. UI generates a UUID channel id
2. Opens `https://login.pishock.com/?proto=socket&channel={guid}` (via `openExternalLink` in Discord)
3. WebSocket connects to relay (direct in dev, proxied in embedded)
4. Credentials (`UserId`, `Token`) arrive over WS → saved via `PUT /api/users/:id/pishock-settings`

See `docs/references/login.pishock.com.har` for the Discord OAuth sequence on login.pishock.com.

## Project layout

```
web/           React Discord Activity + dashboard UI
server/        Hono API + WS proxy + static serve (production)
prisma/        Schema and migrations
docs/references/  PiShock.html, login HAR
old-activity/  Read-only Cloudflare reference (do not modify)
```

## Security notes

- PiShock credentials encrypted with **AES-256-GCM** (`ENCRYPTION_KEY`)
- Execute path is server-side only
- Instance/session rows expire after 6 hours
