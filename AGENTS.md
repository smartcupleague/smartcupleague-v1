# SmartCup League Agent Guide

This document is a source-derived analysis of the refreshed repository as of 2026-04-22. The project tree in `/Users/rafaelmachtura/Projects/smartcupleague-v1` was replaced with the contents of `/Users/rafaelmachtura/Downloads/smartcupbet-v1-main` while preserving the existing `.git` directory.

Use this file to understand the system before making changes. If runtime behavior conflicts with this guide, trust the source and update this guide.

## Executive Summary

SmartCup League is a monorepo for a Vara Network football prediction game. The repository has four main runtime surfaces:

- `frontend/`: Vite + React + TypeScript SPA. It connects Vara wallets, reads and writes Gear/Sails smart-program state, shows match and leaderboard UI, reports best-effort analytics to the API, and now includes an admin fixtures screen backed by the oracle server.
- `api/`: FastAPI service backed by Supabase. It stores VARA price snapshots and frontend-reported prediction/claim analytics. It is not authoritative for bets, settlement, or payouts.
- `oracle-server/`: Express + TypeScript privileged service. It holds signing seeds, talks to football-data.org, feeds Oracle-Program, attempts to bridge finalized oracle results into BolaoCore, serves fixture/crest data to the frontend, and maintains local match ID mappings.
- `smart-programs/`: Gear/Sails Rust programs for on-chain logic: `BolaoCore-Program`, `Oracle-Program`, and `DAO-SmartCupLeague-Program`.

The source of truth remains on-chain. BolaoCore owns bets, points, prize pools, match rewards, podium picks, final prize accounting, admins, phases, matches, and result settlement. Oracle-Program owns feeder consensus over match results. The FastAPI/Supabase layer is a derived analytics/cache layer populated by best-effort frontend reports.

The refreshed repo has no top-level `README.md`. Documentation now lives mostly in subdirectories, especially `oracle-server/README.md` and `frontend/README.md`.

## Repository Map

```text
.
|-- AGENTS.md
|-- api/
|   |-- app/
|   |   |-- main.py
|   |   |-- api/
|   |   |-- core/
|   |   |-- repositories/
|   |   |-- schemas/
|   |   |-- services/
|   |   `-- supabase/schema.sql
|   `-- requirements.txt
|-- frontend/
|   |-- src/
|   |   |-- App.tsx
|   |   |-- main.tsx
|   |   |-- consts.ts
|   |   |-- hocs/
|   |   |   |-- lib.ts
|   |   |   |-- oracle.ts
|   |   |   `-- dao.ts
|   |   |-- hooks/
|   |   |   |-- useTeamCrests.ts
|   |   |   `-- useVaraPrice.ts
|   |   |-- pages/
|   |   |   |-- admin-fixtures/
|   |   |   |-- landing/
|   |   |   |-- matchs/
|   |   |   |-- simulator/
|   |   |   `-- legal/
|   |   |-- components/
|   |   `-- utils/
|   |-- public/
|   |-- dist/
|   |-- package.json
|   |-- vite.config.ts
|   |-- vite.config.js
|   |-- vercel.json
|   `-- yarn.lock
|-- oracle-server/
|   |-- src/
|   |   |-- server.ts
|   |   |-- oracle.ts
|   |   |-- bolao.ts
|   |   `-- types.d.ts
|   |-- data/
|   |   |-- match-mapping.json
|   |   `-- kick-off-map.json
|   |-- package.json
|   |-- tsconfig.json
|   |-- README.md
|   |-- vercel.json
|   |-- .render.yaml
|   `-- yarn.lock
`-- smart-programs/
    |-- BolaoCore-Program/
    |-- Oracle-Program/
    `-- DAO-SmartCupLeague-Program/
```

## System Boundaries and Sources of Truth

### On-chain authoritative state

BolaoCore is authoritative for:

- Registered phases and auto-incremented match IDs.
- User bets and one-bet-per-wallet-per-match enforcement.
- Minimum bet validation, close windows, score bounds, and penalty-winner rules.
- Fee split and prize accounting.
- Oracle result proposal, challenge-window cancellation, finalization, scoring, and settlement.
- Match reward eligibility and claims.
- Podium picks, podium finalization, and podium bonus points.
- Final prize pool finalization and claims.
- Admin membership and oracle authorization.

Oracle-Program is authoritative for:

- Oracle feeder authorization.
- Registered oracle match IDs.
- Feeder submissions.
- Consensus threshold.
- Finalized oracle result records.

DAO-SmartCupLeague-Program is an on-chain governance program. It is still less integrated than BolaoCore and Oracle-Program. Verify end-to-end command compatibility before relying on DAO execution.

### Off-chain derived state

FastAPI and Supabase are supporting infrastructure:

- `vara_prices`: VARA/USD snapshots from CoinGecko.
- `prediction_events`: frontend-reported bet events.
- `claim_events`: frontend-reported claim events.
- SQL views derive leaderboard and pool UI data.

These tables can be incomplete or wrong if frontend reporting fails, if users block requests, if a transaction succeeds but the report request fails, or if clients submit misleading data. Do not treat Supabase as the settlement source of truth.

### Privileged off-chain bridge

`oracle-server` is operationally sensitive because it holds `GATEWAY_SEED` and may hold `OPERATOR_SEED`. It signs on-chain transactions for oracle admin, feeder, BolaoCore setup, bridge, and finalize flows. Treat it as privileged infrastructure, not as a public unauthenticated API.

## Important Drift in the Refreshed Repo

The TypeScript clients and oracle-server README appear ahead of the Rust program source in this checkout.

Observed drift:

- `frontend/src/hocs/lib.ts` and `oracle-server/src/bolao.ts` model BolaoCore fields/methods such as `operators`, `treasury`, `AddOperator`, `RemoveOperator`, `SetTreasury`, and a constructor with `(admin, treasury)`.
- `smart-programs/BolaoCore-Program/app/src/lib.rs` currently exposes constructor `new(admin)` only.
- `smart-programs/BolaoCore-Program/app/src/services/state.rs` currently exposes `IoSmartCupState` without `operators` or `treasury`.
- `smart-programs/BolaoCore-Program/app/src/services/service.rs` has admin methods but no operator or treasury methods.
- `frontend/src/hocs/oracle.ts` and `oracle-server/src/oracle.ts` model richer Oracle match metadata and operator methods (`RegisterMatch(match_id, phase, home, away, kick_off)`, `AddOperator`, `RemoveOperator`).
- `smart-programs/Oracle-Program/app/src/services/service.rs` currently exposes `register_match(match_id: u64)` only and has no operator model.
- `smart-programs/Oracle-Program/app/src/services/state.rs` currently exposes `IoOracleState` without `operators` and match result views without phase/home/away/kick_off metadata.

Treat any frontend or oracle-server path that depends on those extra methods or fields as unverified until the Rust programs, generated clients, and hand-maintained clients are brought back into agreement.

Another build risk: multiple frontend files import `styled-components`, but `frontend/package.json` does not list `styled-components` or `@types/styled-components`. Confirm local dependency state before assuming `yarn build` works from a clean install.

## End-to-End Flow

### Setup flow intended by the current app

1. Deploy BolaoCore and Oracle-Program.
2. Configure frontend with `VITE_NODE_ADDRESS`, `VITE_BOLAOCOREPROGRAM`, optional `VITE_DAOPROGRAM`, `VITE_API_URL`, and `VITE_ORACLE_URL`.
3. Configure oracle-server with Vara RPC, program IDs, signer seeds, sports API settings, and CORS.
4. Authorize the oracle gateway signer in Oracle-Program as feeder/admin as required by the deployed contract.
5. Authorize the Oracle-Program in BolaoCore through `set_oracle_authorized`.
6. Register phases and matches in BolaoCore.
7. Register matching IDs in Oracle-Program.
8. Populate `oracle-server/data/match-mapping.json` and `kick-off-map.json` if the server should auto-feed results from football-data.org.

Important: the oracle server's operator-signed setup endpoints currently assume contract methods that are not present in the inspected Rust source. Verify deployed contract IDLs before using `/setup/*` or `/match/register-both` in production.

### Betting flow

1. User opens the Vite frontend.
2. `frontend/src/App.tsx` waits for Gear API and account readiness.
3. The app creates hand-maintained Sails clients from `frontend/src/hocs/lib.ts`.
4. User signs `Service.PlaceBet` against BolaoCore.
5. BolaoCore validates match existence, close time, minimum bet, duplicate bet, score bounds, and penalty-winner rules.
6. BolaoCore splits attached VARA value into protocol fee, final-prize pool, and match-prize pool.
7. After a successful transaction, `frontend/src/utils/statsReporter.ts` sends best-effort `POST /api/v1/stats/record-bet` to FastAPI.

### Result flow

1. `oracle-server` polls football-data.org or receives a manual feed request.
2. It maps sports results to `{ home, away, penalty_winner }`.
3. It signs `Oracle-Program.Service.SubmitResult` as `GATEWAY_SEED`.
4. Oracle-Program records feeder submissions.
5. When enough currently authorized feeders agree, Oracle-Program finalizes and emits `ConsensusReached`.
6. `oracle-server` subscribes to `ConsensusReached` and calls BolaoCore `Service.ProposeFromOracle(matchId, ORACLE_PROGRAM_ID)`.
7. BolaoCore cross-program queries Oracle-Program for the finalized result and stores it as `Proposed`.
8. During `CHALLENGE_WINDOW_MS`, an admin can cancel the proposed result.
9. After the challenge window, anyone can call `finalize_result`.
10. BolaoCore finalization awards points and prepares settlement in the same pass.
11. The current oracle server also schedules auto-finalization after `CHALLENGE_WINDOW_MS + FINALIZE_BUFFER_MS` and scans periodically for stuck proposed matches.

### Claim flow

1. Users query bets and matches through the frontend.
2. Eligible users call `claim_match_reward`.
3. BolaoCore calculates a pro-rata share using `stake_in_match_pool`, the match prize pool, and `total_winner_stake`.
4. After a successful claim, the frontend reports best-effort `POST /api/v1/stats/record-claim`.
5. Match dust can be swept to the final prize pool after all winners claim or after the claim deadline.
6. After all matches are finalized, settled, dust-swept, and podium finalized, admin finalizes the final prize pool.
7. Eligible top leaderboard users claim final-prize allocations directly from BolaoCore.

## Frontend Analysis

### Stack

- React 18.
- Vite 6.
- TypeScript 5.7.
- React Router 6.
- `@gear-js/react-hooks`, `@gear-js/api`, `@polkadot/*`, and `sails-js` for chain integration.
- TanStack Query is configured, but most contract reads are direct hook/callback state.
- Yarn 4 with package manager metadata in `frontend/package.json`.

### Entry points and providers

- `frontend/src/main.tsx` renders `App` inside `StrictMode` and `ToastProvider`.
- `frontend/src/App.tsx` gates rendering on Gear API/account readiness.
- `frontend/src/hocs/index.tsx` wraps routes with BrowserRouter, Gear alert provider, Gear API provider, account provider, and React Query provider.
- `frontend/src/consts.ts` reads only `VITE_NODE_ADDRESS`.

### Routing

Routes are defined in `frontend/src/pages/index.tsx`.

Public routes:

- `/`
- `/2026worldcup/match/:id`
- `/leagues/match/:id`
- `/match/:id`
- `/terms-of-use`
- `/dao-constitution`
- `/rules`
- `/admin/fixtures`

Routes under `AppLayout`:

- `/progress`
- `/home`
- `/my-predictions`
- `/all-matches`
- `/all-predictions`
- `/leaderboard`
- `/leaderboards`
- `/dao`
- `/simulator`
- `/predictions/:wallet`

### Contract client strategy

The frontend uses hand-maintained Sails clients:

- `frontend/src/hocs/lib.ts` for BolaoCore.
- `frontend/src/hocs/oracle.ts` for Oracle-Program.
- `frontend/src/hocs/dao.ts` for DAO.

These are sensitive to smart-program drift. If Rust public types or method names change, the frontend can compile but decode or send invalid payloads at runtime. Regenerate or audit these clients after every smart-program interface change.

### API and oracle-server integration

The frontend uses:

- `VITE_API_URL`, defaulting to `http://localhost:8000`, for VARA price, stats reporting, pool stats, and derived leaderboard stats.
- `VITE_ORACLE_URL`, defaulting to `http://localhost:3001`, for admin fixtures, sports fixtures, team crests, and oracle state.

`useVaraPrice` falls back directly to CoinGecko if FastAPI is unavailable. Stats reporting intentionally swallows errors.

`useTeamCrests` merges:

- `GET /sports/crests`
- `GET /sports/match-crests`

`TeamFlag` prefers oracle-server crest URLs, then local flag assets from `frontend/src/utils/teams.ts`, then initials fallback.

### Admin fixtures page

`frontend/src/pages/admin-fixtures/AdminFixtures.tsx` is a large styled React screen for:

- Fetching WC scheduled/live/finished fixtures.
- Fetching selected league fixtures: Serie A, La Liga, Liga Portugal, Bundesliga, Ligue 1.
- Fetching friendlies/upcoming matches.
- Reading BolaoCore state.
- Reading Oracle-Program state through the oracle server.
- Registering matches in BolaoCore, Oracle, or both through oracle-server endpoints.
- Triggering feed actions and tournament sync.

Because it calls privileged oracle-server mutation endpoints, do not expose it against a publicly reachable oracle server without authentication and network controls.

### Environment variables

Known source usage:

- `VITE_NODE_ADDRESS`
- `VITE_BOLAOCOREPROGRAM`
- `VITE_DAOPROGRAM`
- `VITE_API_URL`
- `VITE_ORACLE_URL`

`frontend/.env.txt` still contains only `VITE_NODE_ADDRESS` and `VITE_PROGRAM_ID`. A copied `.env` from this template will not configure the current app fully. Update the template before onboarding new environments.

## FastAPI API Analysis

### Stack

- FastAPI 0.115.
- Uvicorn.
- Pydantic settings.
- HTTPX.
- Supabase Python client.

### Startup lifecycle

`api/app/main.py` creates the app and uses a lifespan handler to:

1. Load settings.
2. Create the Supabase client.
3. Create `PriceRepository` and `PriceService`.
4. Warm up VARA price cache from CoinGecko.
5. Create `LeaderboardRepository` and `LeaderboardService`.
6. Override route dependencies so endpoints receive app-state singletons.

Endpoint modules intentionally define placeholder dependencies that are overridden in `main.py`.

### Configuration

Required:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional/defaulted:

- `APP_NAME`
- `APP_VERSION`
- `DEBUG`
- `ALLOWED_ORIGINS`
- `COINGECKO_API_KEY`
- `COINGECKO_BASE_URL`
- `VARA_TOKEN_ID`
- `PRICE_CACHE_TTL_SECONDS`

There is no API `.env.txt` template in the refreshed repository.

### Routes

All routes are under `/api/v1`.

- `GET /api/v1/health/`
- `GET /api/v1/prices/vara`
- `GET /api/v1/prices/vara/history`
- `POST /api/v1/stats/record-bet`
- `POST /api/v1/stats/record-claim`
- `GET /api/v1/stats/pools`
- `GET /api/v1/stats/pools/{match_id}`
- `GET /api/v1/leaderboard`

### Price service behavior

`PriceService.get_vara_price()` attempts:

1. Fresh in-memory cache.
2. Live CoinGecko fetch.
3. Latest Supabase record.
4. Expired in-memory cache.
5. `PriceUnavailableError`.

Database write errors for price snapshots are logged but do not fail user requests.

### Supabase schema

`api/app/supabase/schema.sql` defines:

- `vara_prices`
- `prediction_events`
- `claim_events`
- `latest_vara_price` view
- `user_leaderboard_stats` view
- `match_pool_stats` view
- `cleanup_old_prices()` function

RLS is disabled on all three tables. This is only acceptable if all direct access remains server-side with the Supabase service role key. Never expose service role credentials to the browser.

## Oracle Server Analysis

### Stack

- Node.js >= 18.
- Express 5.
- TypeScript 5.8.
- `@gear-js/api`, `@polkadot/keyring`, and `sails-js`.
- football-data.org v4.
- Yarn 1.
- `helmet`, `cors`, `jsonwebtoken`, and `zod` are dependencies, but route-level auth is not implemented in the inspected `server.ts`.

### Runtime role

`oracle-server/src/server.ts` is a combined:

- HTTP API.
- Gear API singleton manager.
- Gateway signer holder.
- Optional operator signer holder.
- Sports API bridge and cache.
- Team crest proxy.
- Oracle admin tool.
- Oracle feeder.
- BolaoCore admin/setup tool.
- Oracle-to-BolaoCore event bridge.
- Background auto-feeder scheduler.
- Auto-finalization and recovery scanner.

### Required environment

Required by source:

- `VARA_WS`
- `ORACLE_PROGRAM_ID`
- `GATEWAY_SEED`

Optional/defaulted:

- `PORT`, default `3001`
- `BOLAO_PROGRAM_ID`, required for BolaoCore bridge and Bolao endpoints
- `OPERATOR_SEED`, required for `/setup/*` and `/match/register-both`
- `SPORTS_API_KEY`
- `SPORTS_COMPETITION_CODE`, default `WC`
- `FRIENDLIES_COMPETITION_CODES`
- `AUTO_FEED_INTERVAL_MS`, default `120000`
- `AUTO_FEED_BATCH_SIZE`, default `8`
- `CHALLENGE_WINDOW_MS`, default `120000`
- `FINALIZE_BUFFER_MS`, default `15000`
- `ALLOWED_ORIGINS`, default `*`

`oracle-server/.env.txt` does not currently list all variables used by source. It is missing at least `BOLAO_PROGRAM_ID`, `OPERATOR_SEED`, `FRIENDLIES_COMPETITION_CODES`, `AUTO_FEED_BATCH_SIZE`, `CHALLENGE_WINDOW_MS`, and `FINALIZE_BUFFER_MS`.

### Public routes

Read/health:

- `GET /health`
- `GET /oracle/state`
- `GET /oracle/results`
- `GET /oracle/result/:matchId`
- `GET /oracle/pending`
- `GET /sports/match/:id`
- `GET /sports/finished`
- `GET /sports/matches`
- `GET /wc/fixtures`
- `GET /wc/standings`
- `GET /wc/friendlies`
- `GET /wc/upcoming-15d`
- `GET /sports/competition/:code/matches`
- `GET /sports/crests`
- `GET /sports/match-crests`
- `GET /wc/teams`
- `GET /setup/match-mapping`

Mutations:

- `POST /oracle/register-match`
- `POST /oracle/force-finalize`
- `POST /oracle/cancel-result`
- `POST /oracle/set-feeder`
- `POST /oracle/set-threshold`
- `POST /oracle/set-bolao-program`
- `POST /oracle/propose-admin`
- `POST /oracle/accept-admin`
- `POST /oracle/add-operator`
- `POST /oracle/remove-operator`
- `POST /oracle/submit-result`
- `POST /oracle/feed-match/:matchId`
- `POST /wc/sync`
- `POST /test/submit-result`
- `POST /bolao/register-phase`
- `POST /bolao/register-match`
- `POST /bolao/cancel-proposed-result`
- `POST /bolao/finalize-result`
- `POST /bolao/propose-from-oracle`
- `POST /bolao/add-admin`
- `POST /bolao/remove-admin`
- `POST /bolao/add-operator`
- `POST /bolao/remove-operator`
- `POST /bolao/set-treasury`
- `POST /setup/register-phase`
- `POST /setup/register-match`
- `POST /match/register-both`
- `POST /setup/sync-tournament`

Security nuance: mutation routes are not authenticated at the HTTP layer. If this service is exposed publicly, any caller can cause the server to sign transactions permitted by its seeds. Add authentication, network allow-listing, or split public read routes from internal admin routes before production exposure.

### Sports API mapping

The server uses football-data.org v4:

- `/matches/:id`
- `/competitions/:code/matches`
- `/competitions/WC/matches`
- `/competitions/WC/standings`
- `/competitions/WC/teams`

`mapMatchToOracle` only accepts `status === "FINISHED"` and requires full-time scores. If penalty scores exist for a drawn full-time result, it maps the higher penalty score to `Home` or `Away`.

### Match ID mapping

The server stores local mapping files:

- `oracle-server/data/match-mapping.json`: sequential Bolao/Oracle match ID to football-data.org match ID.
- `oracle-server/data/kick-off-map.json`: sequential Bolao/Oracle match ID to kickoff timestamp in milliseconds.

The auto-feeder only processes pending oracle matches that have a known kickoff in `kickOffMap` and whose kickoff has passed. If a match was registered before these files existed, it may be skipped until the mapping is restored.

These data files are runtime state. Be deliberate before committing, deleting, or overwriting them.

### Auto feeder and bridge

On boot:

- Loads persistent match ID and kickoff mappings.
- Warms up Gear API.
- If `BOLAO_PROGRAM_ID` is set, subscribes to Oracle `ConsensusReached`.
- On consensus, calls BolaoCore `ProposeFromOracle`.
- Schedules `FinalizeResult` after the configured challenge window plus buffer.
- Scans BolaoCore on boot and every 10 minutes for proposed matches that need finalization.
- Starts auto-feed polling if `AUTO_FEED_INTERVAL_MS > 0`.

The bridge remains best-effort. Manual retries are exposed by `/bolao/propose-from-oracle` and `/bolao/finalize-result`.

### Build/deployment status

`oracle-server/package.json` now uses:

```json
"build": "tsc",
"start": "node dist/server.js"
```

This fixes the older `dist/server.ts` start-path issue. The service has long-lived WebSocket, event subscription, and interval behavior, so it is better suited to a persistent host such as Render than a serverless request handler.

## Smart Programs Analysis

### Shared Gear/Sails pattern

The Rust programs use Sails services and Gear static/state patterns. BolaoCore and Oracle-Program use Sails/Gear-era generated client artifacts under each program's `client/` and `wasm/` directories. DAO uses an older Sails/Gear setup.

Generated artifacts and hand-maintained TypeScript clients can drift. Verify IDL/client generation before changing public smart-program interfaces.

### BolaoCore-Program

BolaoCore is the central prediction game contract.

Main files:

- `app/src/lib.rs`
- `app/src/services/service.rs`
- `app/src/services/state.rs`
- `app/src/services/types.rs`
- `app/src/services/constants.rs`
- `app/src/services/utils.rs`
- `tests/test.rs`

Key constants:

- `PROTOCOL_FEE_BPS = 500` (5%).
- `FINAL_PRIZE_BPS = 1000` (10%).
- Match-prize pool receives the remaining 85%.
- `MIN_BET_PLANCK = 3_000_000_000_000` (3 VARA).
- `BET_CLOSE_WINDOW_SECONDS = 600`.
- `FINAL_PRIZE_TOP5_BPS = [4500, 2500, 1500, 1000, 500]`.
- `MAX_PHASE_NAME_LEN = 64`.
- `MAX_POINTS_WEIGHT = 20`.
- `MAX_TEAM_NAME_LEN = 50`.
- `CHALLENGE_WINDOW_MS = 120_000`.
- `CLAIM_DEADLINE_MS = 240_000`.

Timing nuance: comments still mention production-like windows such as 24 hours and 72 hours, but current constants are 2 minutes and 4 minutes. Treat these as demo/test values unless deliberately changed for production.

Current source state model:

- `admins: Vec<ActorId>`
- `authorized_oracles: HashMap<ActorId, bool>`
- `matches: HashMap<u64, Match>`
- `phases: HashMap<String, PhaseConfig>`
- `bets: HashMap<(ActorId, u64), Bet>`
- `user_bets: HashMap<ActorId, Vec<UserBetRecord>>`
- `user_points: HashMap<ActorId, u32>`
- `next_match_id`
- `podium_picks`
- `podium_result`
- `final_prize_allocations`
- `final_prize_claimed`
- prize accounting fields

Admin and oracle authorization:

- Any current admin can authorize or revoke oracles.
- Any current admin can add another admin.
- Any current admin can remove an admin, but the last admin cannot be removed.
- `only_admin()` panics if caller is not in `admins`.
- `only_oracle()` panics if caller is not active in `authorized_oracles`.

Betting rules:

- Match must exist.
- Attached value must be at least 3 VARA.
- Betting closes 10 minutes before kickoff.
- One bet per user per match.
- Scores above 20 are rejected.
- Group-stage bets cannot include `penalty_winner`.
- Knockout draw predictions must include `penalty_winner`.
- Knockout non-draw predictions must not include `penalty_winner`.

Scoring:

- Exact score gives `3 * phase_weight`.
- Correct outcome gives `phase_weight`.
- In knockout draws, penalty winner affects exactness and payout eligibility.

Settlement:

- `finalize_result` is permissionless after challenge window.
- It converts `Proposed` to `Finalized`, awards points, computes `total_winner_stake`, and marks settlement prepared.
- If no winners exist, the full match-prize pool moves to the final-prize pool and the match is dust-swept.
- `claim_match_reward` pays eligible users pro-rata.
- `sweep_match_dust_to_final_prize` is permissionless after all winners claim or after the claim deadline.

Final prize:

- Requires podium finalized.
- Requires every match finalized, settlement prepared, and dust swept.
- Allocates final pool across top 5 positions, with ties sharing the affected positions' combined share.
- Rounding dust is sent to the admin caller during finalization; `final_prize_rounding_dust` is set to zero in that path.

Cross-program oracle:

- `propose_from_oracle(match_id, oracle_program_id)` requires the `oracle_program_id` to be authorized in BolaoCore.
- BolaoCore queries Oracle-Program directly for the finalized result.
- It stores a `Proposed` result and starts the challenge window.

### Oracle-Program

Oracle-Program stores feeder consensus for match results.

Main files:

- `app/src/lib.rs`
- `app/src/services/service.rs`
- `app/src/services/state.rs`
- `app/src/services/types.rs`
- `app/src/services/errors.rs`
- `app/src/services/events.rs`
- `app/src/services/utils.rs`
- `tests/test.rs`

Key constants:

- `DEFAULT_CONSENSUS_THRESHOLD = 2`.
- `MAX_FEEDERS = 20`.
- `MAX_MATCH_ID = 10_000`.

Current source state model:

- `admin`
- `pending_admin`
- `authorized_feeders`
- `consensus_threshold`
- `bolao_program_id`
- `match_results`

Admin functions:

- `register_match(match_id)`
- `set_feeder_authorized`
- `set_consensus_threshold`
- `set_bolao_program`
- `force_finalize_result`
- `cancel_result`
- `propose_admin`
- `accept_admin`

Feeder function:

- `submit_result`

Query functions:

- `query_state`
- `query_match_result`
- `query_pending_matches`
- `query_all_results`
- `query_feeder_submissions`

Consensus rules:

- Feeders cannot submit to unregistered match IDs.
- Feeders can submit once per match.
- Consensus counts only currently authorized feeders.
- Revoked feeders' past submissions are excluded from future consensus checks.
- Finalized results cannot be changed or cancelled.
- Admin can force-finalize a result.

### DAO-SmartCupLeague-Program

DAO implements a simple proposal and vote system.

Main file:

- `app/src/services/service.rs`

State model:

- `owner`
- `market_contract`
- `kyc_contract`
- `quorum_bps`
- `voting_period`
- `proposal_count`
- `proposals`
- `votes`

Proposal kinds:

- `SetFeeBps`
- `SetFinalPrizeBps`
- `SetMaxPayoutChunk`
- `AddPhase`
- `AddMatch`
- `SetQuorum`
- `SetVotingPeriod`

Integration risk:

- DAO dispatches `MarketDaoCommand` to `market_contract`.
- BolaoCore compatibility with these command messages is not evident from the inspected source.
- Prove local end-to-end execution before relying on DAO for production governance.

## Configuration Inventory

### Frontend

Source uses:

- `VITE_NODE_ADDRESS`
- `VITE_BOLAOCOREPROGRAM`
- `VITE_DAOPROGRAM`
- `VITE_API_URL`
- `VITE_ORACLE_URL`

Template mismatch:

- `frontend/.env.txt` defines `VITE_PROGRAM_ID`, not `VITE_BOLAOCOREPROGRAM`.

### API

Required:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:

- `APP_NAME`
- `APP_VERSION`
- `DEBUG`
- `ALLOWED_ORIGINS`
- `COINGECKO_API_KEY`
- `COINGECKO_BASE_URL`
- `VARA_TOKEN_ID`
- `PRICE_CACHE_TTL_SECONDS`

### Oracle server

Required:

- `VARA_WS`
- `ORACLE_PROGRAM_ID`
- `GATEWAY_SEED`

Optional/source-used:

- `PORT`
- `BOLAO_PROGRAM_ID`
- `OPERATOR_SEED`
- `SPORTS_API_KEY`
- `SPORTS_COMPETITION_CODE`
- `FRIENDLIES_COMPETITION_CODES`
- `AUTO_FEED_INTERVAL_MS`
- `AUTO_FEED_BATCH_SIZE`
- `CHALLENGE_WINDOW_MS`
- `FINALIZE_BUFFER_MS`
- `ALLOWED_ORIGINS`

Template mismatch:

- `oracle-server/.env.txt` omits several source-used variables. Update it before onboarding new deployments.

## Build and Test Commands

### Frontend

```bash
cd frontend
yarn install
yarn start
yarn build
yarn lint
yarn preview
```

Frontend uses Yarn 4. `dist/` is checked in and can drift from `src`.

### API

```bash
cd api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

No API test suite was present during this inspection.

### Oracle server

```bash
cd oracle-server
yarn install
yarn dev
yarn build
yarn start
```

Oracle server uses Yarn 1. `yarn start` points to `dist/server.js`.

### Smart programs

```bash
cd smart-programs/BolaoCore-Program
cargo check
cargo test
cargo build

cd ../Oracle-Program
cargo check
cargo test
cargo build

cd ../DAO-SmartCupLeague-Program
cargo check
cargo build
```

BolaoCore and Oracle-Program specify Rust toolchain files. Ensure the expected Rust target and WASM tooling are installed before building artifacts.

## Deployment Notes

### Frontend

`frontend/vercel.json` rewrites all routes to `index.html`, which is appropriate for a browser-router SPA.

### API

No deployment manifest is present for the FastAPI service. It needs a host that injects Supabase and CoinGecko environment variables. CORS defaults to localhost origins.

### Oracle server

The repo includes `oracle-server/vercel.json` and `.render.yaml`, but this service has long-lived behavior:

- WebSocket Gear API singleton.
- Event subscription.
- Background auto-feed interval.
- Background recovery scan.
- Runtime mapping files under `oracle-server/data`.

This shape is better suited to a long-running service than to serverless handlers.

## High-Risk Areas

1. TypeScript/Rust contract drift.

   The refreshed TypeScript clients and oracle-server endpoints reference operator/treasury/richer Oracle metadata methods that are absent from the inspected Rust program source. Verify IDLs and deployed contracts before relying on those paths.

2. Privileged unauthenticated oracle-server mutations.

   The oracle server exposes many mutation routes that cause server-held seeds to sign on-chain transactions. Add authentication or isolate it before exposing it to public networks.

3. Frontend clean-install build risk.

   Several frontend files import `styled-components`, but it is not listed in `frontend/package.json`. A clean install may fail until the dependency is added or imports are removed.

4. Environment templates are incomplete.

   `frontend/.env.txt` and `oracle-server/.env.txt` do not list all variables used by source.

5. FastAPI analytics are not authoritative.

   Leaderboard and pool views are derived from frontend reports, not indexed chain events.

6. Demo timing constants in BolaoCore.

   Challenge and claim windows are 2 minutes and 4 minutes, despite production-like comments.

7. Oracle server local mapping state.

   Auto-feed depends on `oracle-server/data/match-mapping.json` and `kick-off-map.json`. Missing or stale mappings can skip matches or feed wrong sports IDs.

8. DAO integration needs verification.

   DAO market commands may not be accepted by BolaoCore as currently inspected.

9. Supabase RLS is disabled.

   Only safe when the service role key remains server-only.

10. Checked-in generated output.

   `frontend/dist` is committed and may become stale relative to `frontend/src`.

## Practical Change Guidance

- Treat `smart-programs/BolaoCore-Program` as settlement authority. If UI/API behavior conflicts with BolaoCore, fix UI/API unless the smart program is intentionally changing.
- Before changing smart-program public types, regenerate/audit clients in `frontend/src/hocs` and `oracle-server/src`.
- Do not expand oracle-server public surface without auth. Keep admin/setup endpoints internal.
- Keep frontend stats reporting best-effort. Do not block user transaction flows on FastAPI availability.
- For leaderboard changes, explicitly choose between on-chain `user_points` and Supabase-derived stats. They answer different questions.
- For price display changes, preserve cache and CoinGecko fallback behavior unless deliberately changing UX.
- For setup automation, prove the deployed contract supports the exact TypeScript client methods before using `/setup/*` in production.
- Update `.env.txt` templates whenever adding or relying on a new runtime variable.
- Be careful with `oracle-server/data/*`; those files encode operational match mapping state.
- For production timing, review `CHALLENGE_WINDOW_MS` and `CLAIM_DEADLINE_MS` in BolaoCore and align oracle-server `CHALLENGE_WINDOW_MS`.

## Verification Status

This guide was produced by source inspection after syncing the refreshed repository. No builds or tests were run while rewriting it. The most important unverified area is compatibility between the refreshed TypeScript clients/oracle-server routes and the Rust smart-program source in this checkout.
