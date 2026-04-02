# SmartCup Oracle Server

Node.js/TypeScript service that acts as the trusted **oracle feeder** for SmartCup League on Vara Network. It holds a single **gateway signer** account (the authorized feeder), polls match results from a public sports API, and submits them on-chain to the **Oracle-Program** smart contract via a clean REST interface.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
  - [Health](#health)
  - [Oracle Queries](#oracle-queries)
  - [Oracle Admin](#oracle-admin)
  - [Oracle Feeder](#oracle-feeder)
  - [Sports API Bridge](#sports-api-bridge)
- [Auto-Feeder](#auto-feeder)
- [Sports API Integration](#sports-api-integration)
- [Oracle-Program Contract](#oracle-program-contract)
- [Address Formats](#address-formats)
- [Security](#security)
- [Deployment](#deployment)
- [Scripts](#scripts)

---

## Overview

The Oracle Server solves the off-chain data problem: the BolaoCore smart contract needs verified football match results to settle user predictions. This server:

1. **Feeds results** — polls [football-data.org](https://www.football-data.org/) for finished matches and calls `submitResult()` on Oracle-Program.
2. **Manages the oracle** — exposes admin endpoints (`registerMatch`, `setFeederAuthorized`, `forceFinalizeResult`, etc.).
3. **Serves queries** — HTTP read layer on top of Oracle-Program state queries (no wallet required from clients).
4. **Auto-feeds** — a background scheduler continuously pushes results for any pending oracle matches.

```
football-data.org (public sports API)
          │
          │  HTTP (fetch)
          ▼
  smartcup-oracle-server
          │
          │  Gear Protocol (WebSocket RPC)
          ▼
    Vara Network
    └── Oracle-Program   →  consensus result store
              │
              │  cross-program message
              ▼
         BolaoCore-Program  →  prediction settlement
```

---

## Architecture

```
src/
├── server.ts     Express app, all route handlers, auto-feed scheduler, Gear API singleton
├── oracle.ts     Oracle-Program sails-js client (generated) + all types
└── types.d.ts    Ambient type declarations
```

**Key design decisions:**

- **Lazy GearApi singleton** — connects on first inbound request, reused across all calls.
- **Single gateway signer** — all transactions signed by `GATEWAY_SEED`; this account must be an authorized feeder in Oracle-Program.
- **Stateless HTTP layer** — no local database; all truth lives on-chain.
- **Auto-feeder** — `setInterval` loop that reads `queryPendingMatches()` from Oracle-Program and feeds any that have a finished result in the sports API.
- **Manual override** — admin endpoints allow force-finalizing or canceling any result directly.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js ≥ 18 |
| Framework | Express 5 |
| Language | TypeScript 5.8 |
| Blockchain SDK | @gear-js/api 0.42 (Gear Protocol) |
| Polkadot Layer | @polkadot/api 16 · @polkadot/keyring |
| Contract Client | sails-js 0.4 |
| Sports API | football-data.org v4 (public, free tier) |
| Security Headers | helmet 7 |
| Build | `tsc` → `dist/` |
| Dev Server | ts-node-dev (hot reload) |

---

## Prerequisites

- Node.js ≥ 18
- Yarn 1.x
- A funded Vara account (`GATEWAY_SEED`) that is authorized as a feeder in Oracle-Program
- Deployed Oracle-Program address (`ORACLE_PROGRAM_ID`)
- A football-data.org API key (free at [football-data.org/client/register](https://www.football-data.org/client/register))

---

## Getting Started

```bash
# Install dependencies
yarn install

# Configure environment
cp .env.txt .env
# Fill in VARA_WS, ORACLE_PROGRAM_ID, GATEWAY_SEED, SPORTS_API_KEY

# Start development server (hot reload)
yarn dev

# Build for production
yarn build

# Start production server
yarn start
```

The server starts on `http://localhost:3001` (configurable via `PORT`).  
`GET /health` confirms RPC connectivity and the signer's live VARA balance.

---

## Environment Variables

```bash
# Server
PORT=3001

# Vara Network
VARA_WS=wss://testnet.vara.network          # WebSocket RPC endpoint

# Smart Contracts
ORACLE_PROGRAM_ID=0x<64 hex chars>          # Oracle-Program on-chain address

# Gateway Signer (must be an authorized feeder in Oracle-Program)
GATEWAY_SEED=0x<hex seed>                   # Sr25519 private seed — never commit this

# Sports API (football-data.org)
# Free tier: https://www.football-data.org/client/register
# Omit to use anonymous access (very limited rate)
SPORTS_API_KEY=<your-api-key>
SPORTS_COMPETITION_CODE=WC                  # WC = FIFA World Cup 2026

# Auto-feeder scheduler (ms between polls, 0 = disabled)
AUTO_FEED_INTERVAL_MS=120000                # default: 2 minutes

# CORS
ALLOWED_ORIGINS=*                           # comma-separated allowed origins
```

> **Security:** `GATEWAY_SEED` is the private key that signs every oracle transaction. Store it as a secret environment variable. Never hardcode or commit it.

---

## Project Structure

```
oracle-server/
├── src/
│   ├── server.ts         App, routes, auto-feed scheduler
│   ├── oracle.ts         Oracle-Program sails-js client + types
│   └── types.d.ts        Ambient declarations
├── .env.txt              Environment variable template
├── .render.yaml          Render.com deployment manifest
├── vercel.json           Vercel deployment config
├── tsconfig.json
├── package.json
└── yarn.lock
```

---

## API Reference

All responses are JSON. On error every handler returns:
```json
{ "ok": false, "error": "<human-readable message>" }
```

---

### Health

#### `GET /health`

Returns server status, oracle program address, sports API config, and the signer's current VARA balance.

**Response:**
```json
{
  "ok": true,
  "time": "2026-04-02T12:00:00.000Z",
  "rpc": "wss://testnet.vara.network",
  "oracleProgram": "0x1a2b3c...",
  "sportsCompetition": "WC",
  "autoFeedIntervalMs": 120000,
  "signer": {
    "ss58": "kGgXx...",
    "hex": "0x...",
    "nativeBalance": "42.5"
  }
}
```

---

### Oracle Queries

Read-only. No gas. No wallet required.

#### `GET /oracle/state`

Full snapshot of Oracle-Program state: admin, feeders, consensus threshold, all match results.

**Response:**
```json
{
  "ok": true,
  "state": {
    "admin": "0x...",
    "consensus_threshold": 2,
    "bolao_program_id": "0x...",
    "authorized_feeders": ["0x..."],
    "match_results": [
      {
        "match_id": 492451,
        "status": "Finalized",
        "final_result": {
          "score": { "home": 2, "away": 1 },
          "penalty_winner": null,
          "finalized_at": "1743600000"
        },
        "submissions": 2
      }
    ],
    "pending_admin": null
  }
}
```

---

#### `GET /oracle/results`

All match entries (both `Pending` and `Finalized`).

**Response:**
```json
{
  "ok": true,
  "results": [ ...IoMatchResult[] ]
}
```

---

#### `GET /oracle/result/:matchId`

Single finalized result for a match. Returns `null` if not yet finalized.

**Response:**
```json
{
  "ok": true,
  "match_id": 492451,
  "result": {
    "score": { "home": 3, "away": 0 },
    "penalty_winner": null,
    "finalized_at": "1743600000"
  }
}
```

---

#### `GET /oracle/pending`

Match IDs currently registered in Oracle-Program but not yet finalized.

**Response:**
```json
{ "ok": true, "pending": [492451, 492452] }
```

---

### Oracle Admin

All admin endpoints are signed by `GATEWAY_SEED`. The signer must be the current admin in Oracle-Program.

---

#### `POST /oracle/register-match`

Pre-registers a match ID so feeders can submit results for it. Must be called before any `submitResult`.

**Body:**
```json
{ "match_id": 492451 }
```

**Response:**
```json
{ "ok": true, "match_id": 492451, "result": { ... } }
```

---

#### `POST /oracle/force-finalize`

Admin override: locks a result immediately, bypassing consensus. Use when automated feeders fail or a manual correction is needed.

**Body:**
```json
{
  "match_id": 492451,
  "home": 2,
  "away": 1,
  "penalty_winner": null
}
```

| Field | Type | Notes |
|---|---|---|
| `match_id` | `number` | 0 – 10000 |
| `home` | `number` | 0 – 255 |
| `away` | `number` | 0 – 255 |
| `penalty_winner` | `"Home" \| "Away" \| null` | Only for drawn knockout matches |

---

#### `POST /oracle/cancel-result`

Resets a pending match, clearing all submissions. The match remains registered and can receive new submissions.

**Body:**
```json
{ "match_id": 492451 }
```

---

#### `POST /oracle/set-feeder`

Authorize or revoke a feeder account. Maximum 20 active feeders at once.

**Body:**
```json
{ "feeder": "SS58 or 0x...", "authorized": true }
```

---

#### `POST /oracle/set-threshold`

Set the number of matching feeder votes required to auto-finalize a result (1–20).

**Body:**
```json
{ "threshold": 2 }
```

---

#### `POST /oracle/set-bolao-program`

Register the BolaoCore program address so Oracle-Program can notify it when a result finalizes.

**Body:**
```json
{ "program_id": "SS58 or 0x..." }
```

---

#### `POST /oracle/propose-admin`

Step 1 of 2-step admin transfer. Proposes a new admin; the proposed address must call `accept-admin` to confirm.

**Body:**
```json
{ "new_admin": "SS58 or 0x..." }
```

---

#### `POST /oracle/accept-admin`

Step 2 of admin transfer. The `GATEWAY_SEED` signer accepts the admin role (must be the pending admin).

No body required.

---

### Oracle Feeder

Signed by `GATEWAY_SEED`. The signer must be an authorized feeder in Oracle-Program.

#### `POST /oracle/submit-result`

Manually submit a match result. Once enough feeders agree (≥ consensus threshold), the result finalizes automatically.

**Body:**
```json
{
  "match_id": 492451,
  "home": 2,
  "away": 1,
  "penalty_winner": null
}
```

**Response:**
```json
{
  "ok": true,
  "match_id": 492451,
  "home": 2,
  "away": 1,
  "penalty_winner": null,
  "result": { ... }
}
```

---

### Sports API Bridge

These endpoints talk to football-data.org. No on-chain transactions.

---

#### `GET /sports/match/:id`

Fetches raw match data from football-data.org by numeric match ID.

**Response:**
```json
{
  "ok": true,
  "match": {
    "id": 492451,
    "status": "FINISHED",
    "score": {
      "winner": "HOME_TEAM",
      "fullTime": { "home": 2, "away": 1 },
      "penalties": { "home": null, "away": null }
    }
  }
}
```

---

#### `GET /sports/finished`

Lists all finished matches for the configured competition (`SPORTS_COMPETITION_CODE`).

**Response:**
```json
{
  "ok": true,
  "competition": "WC",
  "count": 12,
  "matches": [ ...SportMatch[] ]
}
```

---

#### `POST /oracle/feed-match/:matchId`

Fetches the match result from football-data.org and submits it directly to Oracle-Program in one step. The match must already be registered (`POST /oracle/register-match`).

Returns `422` if the match is not finished yet.

**Response:**
```json
{
  "ok": true,
  "match_id": 492451,
  "home": 2,
  "away": 1,
  "penalty_winner": null,
  "result": { ... }
}
```

---

## Auto-Feeder

A background `setInterval` (configurable via `AUTO_FEED_INTERVAL_MS`, default 2 minutes) runs the following loop:

```
1. oracle.service.queryPendingMatches()
        │
        ▼ [match_id, ...]
2. For each pending match:
   → fetchSportMatch(match_id)  from football-data.org
   → if status === "FINISHED":
       → oracle.service.submitResult(match_id, home, away, penalty_winner)
   → else: skip (log and retry next cycle)
```

If consensus threshold is 1, every auto-feed submission immediately finalizes the result. With threshold 2+, multiple authorized feeders (or a second server instance) are needed to reach consensus.

To disable: set `AUTO_FEED_INTERVAL_MS=0`.

---

## Sports API Integration

The server uses [football-data.org](https://www.football-data.org/) v4 API.

| Config | Value |
|---|---|
| Base URL | `https://api.football-data.org/v4` |
| Auth header | `X-Auth-Token: <SPORTS_API_KEY>` |
| Free tier | 10 requests/minute, covers World Cup 2026 |
| Competition code | `WC` (FIFA World Cup), `PL` (Premier League), `CL` (Champions League), etc. |

**Penalty winner mapping:**

If `score.penalties.home` and `score.penalties.away` are both non-null, the match went to a shootout.  
`penalty_winner = penalties.home > penalties.away ? "Home" : "Away"`

---

## Oracle-Program Contract

The Oracle-Program (`oracle.ts` client) implements a **consensus-based result store**:

| Concept | Value |
|---|---|
| Max match ID | 10,000 |
| Max feeders | 20 |
| Default consensus threshold | 2 |
| Result lifecycle | `Pending` → `Finalized` |

**Workflow:**

1. Admin calls `registerMatch(match_id)` — opens the match for submissions.
2. Authorized feeders call `submitResult(match_id, home, away, penalty_winner)`.
3. Once N feeders submit the same result (N = `consensus_threshold`), `ConsensusReached` is emitted and the result is locked.
4. BolaoCore reads the finalized result via `queryMatchResult(match_id)` to settle predictions.

---

## Address Formats

All address parameters accept both SS58 and `0x` hex formats. The server normalizes to hex before any chain call.

| Format | Example |
|---|---|
| SS58 | `kGgXx...` (Base58) |
| `0x` hex | `0x` + 64 hex chars (32 bytes) |

---

## Security

| Layer | Mechanism |
|---|---|
| Security headers | `helmet` on every response |
| CORS | `Origin` validated against `ALLOWED_ORIGINS` |
| Body size | JSON capped at 2 MB |
| Input validation | `match_id` range, score range, address format checked before any chain call |
| Auth | No HTTP auth layer — deploy behind an internal network or API gateway in production |
| Gateway seed | Store as a secret env var (Render, Vercel, Railway). Never hardcode. |

---

## Deployment

### Render.com (Recommended)

The auto-feeder requires a **persistent long-lived process**. Render Web Service (not serverless) is the correct target.

1. Push `.render.yaml` to your repository.
2. In Render dashboard → **New → Web Service** → connect your repo.
3. Render detects `.render.yaml` automatically.
4. On the **Environment** tab, set secret variables:
   - `VARA_WS`
   - `ORACLE_PROGRAM_ID`
   - `GATEWAY_SEED`
   - `SPORTS_API_KEY`
   - `SPORTS_COMPETITION_CODE`
   - `ALLOWED_ORIGINS`
5. Click **Save Changes** → first deploy triggers.
6. Verify: `curl https://<your-service>.onrender.com/health`

### Vercel (Alternative — Serverless)

Configured via `vercel.json`. Works for query endpoints but **the auto-feeder will not run** in a serverless environment (invocations are stateless and short-lived). Use Render or a VPS if you need the background scheduler.

---

## Scripts

```bash
yarn dev      # Dev server with hot reload (ts-node-dev)
yarn build    # Compile TypeScript → dist/
yarn start    # Run compiled server
```
