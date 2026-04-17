# SmartCup League - BolaoCore Program

SmartCup League is a simple, fair World Cup prediction game built on crypto.
This program powers the on-chain prediction-market bolao for tournament competitions:
participants place one bet per match, earn points based on prediction accuracy, and compete for both per-match prizes and a season-long final prize.

- Match prize: each game settles right after the final whistle.
- Final prize: a season-long pot that grows with every match and rewards the top scorers at the end.
- No house edge: protocol fees cover operations; the rest flows back to players.

No hidden odds, no custodial payouts. Bets, results, and claims are recorded on-chain, and winners claim rewards directly.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Fee Model](#fee-model)
- [Design Patterns](#design-patterns)
- [Tournament Lifecycle](#tournament-lifecycle)
- [Match State Machine](#match-state-machine)
- [Module Reference](#module-reference)
- [Function Reference](#function-reference)
- [Getting Started](#getting-started)
- [Deployment Scripts](#deployment-scripts)
- [Frontend](#frontend)
- [Security Properties](#security-properties)
- [Deployment](#deployment)
- [License](#license)
- [Contact](#contact)

---

## Overview

- **One bet per match per wallet**: place your predicted score before the betting window closes (10 minutes before kick-off).
- **Points system**: exact score = 3x phase weight; correct outcome = 1x phase weight.
- **Knockout bonus**: penalty winner prediction is required for drawn knockout matches.
- **Podium picks**: pre-tournament champion, runner-up, and third-place prediction earns bonus points (20/10/5).
- **Final prize**: a pool that grows throughout the tournament and is distributed to the top 5 leaderboard finishers.
- **Transparent and self-custodial**: bets, results, and payouts are on-chain, and winners claim directly.
- **Guardrails**: timelocks, pause controls, and oracle checks protect critical operations.
- **18+ only**: an adult KYC pass is required before betting.

---

## Architecture

```text
app/src/
├── lib.rs                  Entry point - seeds state, exposes Service
└── services/
    ├── mod.rs              Module declarations
    ├── constants.rs        Compile-time configuration constants
    ├── types.rs            Domain structs and enums
    ├── events.rs           SmartCupEvent enum (all on-chain events)
    ├── state.rs            Global state + IoSmartCupState query projection
    ├── utils.rs            Pure helper functions (scoring, leaderboard)
    └── service.rs          Service - all exported contract functions
```

The contract uses Gear Protocol's static mutable state pattern (`static mut SMARTCUP_STATE`). All monetary values are `u128` in planck (1 VARA = 10^12 planck).

---

## Fee Model

Every bet is split into three portions at the moment it is placed:

| Destination      | Share | Constant           |
|------------------|-------|--------------------|
| Protocol fees    | 5%    | `PROTOCOL_FEE_BPS` |
| Final prize pool | 10%   | `FINAL_PRIZE_BPS`  |
| Match prize pool | 85%   | (remainder)        |

**Match prize pool** is distributed proportionally to winners based on their stake. Unclaimed remainder is swept to the final prize pool after all winners claim or after the claim deadline expires.

**Final prize distribution**: top 5 by points at tournament end (ties share equally):

| Position | Share |
|----------|-------|
| 1st      | 45%   |
| 2nd      | 25%   |
| 3rd      | 15%   |
| 4th      | 10%   |
| 5th      | 5%    |

Rounding dust from integer division is automatically swept to admin when `finalize_final_prize_pool` is called.

---

## Design Patterns

### 1. Optimistic Execution with Challenge Window

Oracle result proposals are not applied immediately. Instead, they enter a challenge window during which the admin can cancel an incorrect proposal. After the window expires, `finalize_result()` becomes permissionless.

```text
Oracle proposes result
        |
        v
  [Proposed state]
  challenge_expires_at = proposed_at + CHALLENGE_WINDOW_MS
        |
        |- Admin calls cancel_proposed_result() -> back to Unresolved
        |
        \- Anyone calls finalize_result() -> Finalized after the challenge window
```

This removes the admin as a liveness dependency while preserving a safety window for incorrect oracle data.

---

### 2. Fused Finalization + Settlement

`finalize_result()` performs two operations in a single transaction and a single O(n) loop over participants:

1. Awards points based on prediction accuracy.
2. Calculates `total_winner_stake` and marks the match ready for claims.

There is no separate `prepare_match_settlement()` call anymore. Winners can claim their rewards immediately after finalization.

---

### 3. Permissionless Sweep with Claim Deadline

`sweep_match_dust_to_final_prize()` is permissionless. It enforces a claim window after finalization:

- Before the deadline: sweep requires all eligible winners to have claimed first.
- After the deadline: sweep executes unconditionally and the remainder flows to the final prize pool.

This guarantees tournament completion even if some winners stay inactive.

---

## Tournament Lifecycle

```text
1.  register_phase()                   [admin]      Define phases (Group Stage, R16, QF, SF, Final...)
2.  register_match()                   [admin]      Assign matches to phases with kick-off times
3.  place_bet()                        [user]       Open until 10 min before kick-off
4.  submit_podium_pick()               [user]       Open until first R32 kick-off
5.  propose_result()                   [oracle]     After match ends - starts challenge window
6.  propose_from_oracle()              [oracle]     Optional async oracle-program route
7.  cancel_proposed_result()           [admin]      Optional - only within challenge window
8.  finalize_result()                  [anyone]     After challenge window - awards points + settles match
9.  claim_match_reward()               [winner]     Claim proportional share of match pool
10. sweep_match_dust_to_final_prize()  [anyone]     After all winners claim or after deadline
11. finalize_podium()                  [admin]      Set official podium; award bonus points
12. finalize_final_prize_pool()        [admin]      Lock pool; allocate shares to top 5
13. claim_final_prize()                [user]       Claim individual final prize allocation
```

---

## Match State Machine

```text
Unresolved
    |
    \- propose_result() / propose_from_oracle() [oracle]
            |
            v
        Proposed { score, penalty_winner, oracle, proposed_at }
            |
            |- cancel_proposed_result() [admin, within challenge window] -> Unresolved
            |
            \- finalize_result() [anyone, after challenge window]
                    |
                    v
                Finalized { score, penalty_winner }
                    |
                    |- claim_match_reward() [winner]
                    \- sweep_match_dust_to_final_prize() [anyone]
                        |- before deadline: requires all winners claimed
                        \- after deadline: unconditional sweep
```

---

## Module Reference

### `constants.rs`

| Constant                   | Value                           | Purpose                                              |
|----------------------------|---------------------------------|------------------------------------------------------|
| `PROTOCOL_FEE_BPS`         | 500 (5%)                        | Protocol fee slice of every bet                      |
| `FINAL_PRIZE_BPS`          | 1,000 (10%)                     | Final prize pool slice of every bet                  |
| `BPS_DENOMINATOR`          | 10,000                          | Basis points denominator                             |
| `BET_CLOSE_WINDOW_SECONDS` | 600 (10 min)                    | Betting closes this many seconds before kick-off     |
| `FINAL_PRIZE_TOP5_BPS`     | [4500, 2500, 1500, 1000, 500]   | Final prize shares for positions 1-5                 |
| `MIN_BET_PLANCK`           | 3 x 10^12 (3 VARA)              | Minimum bet; prevents zero-fee rounding attacks      |
| `MAX_PHASE_NAME_LEN`       | 64 bytes                        | Maximum phase name string length                     |
| `MAX_POINTS_WEIGHT`        | 20                              | Maximum `points_weight` per phase                    |
| `MAX_TEAM_NAME_LEN`        | 50 bytes                        | Maximum team / podium pick name string length        |
| `CHALLENGE_WINDOW_MS`      | 120,000 ms in current branch    | Optimistic execution challenge window                |
| `CLAIM_DEADLINE_MS`        | 240,000 ms in current branch    | Claim deadline; after this, sweep is unconditional   |

### `types.rs`

| Type | Description |
|------|-------------|
| `Score` | `{ home: u8, away: u8 }` - goals capped at 20 in validation |
| `PenaltyWinner` | `Home \| Away` - required only for knockout draws |
| `ResultStatus` | `Unresolved \| Proposed { score, penalty_winner, oracle, proposed_at } \| Finalized { score, penalty_winner }` |
| `Match` | Full match record including prize pool accounting fields and `finalized_at` for deadline tracking |
| `Bet` | Per-user bet; `stake_in_match_pool` is the 85% slice |
| `PhaseConfig` | `{ name, start_time, end_time, points_weight }` - `points_weight > 1` means knockout |
| `PodiumPick` | User's pre-tournament champion/runner_up/third_place prediction |
| `PodiumResult` | Official final podium set by admin |
| `WalletClaimStatus` | Query response: claimable amount across all matches |
| `FinalPrizeClaimStatus` | Query response: final prize eligibility and claim state |

### `events.rs`

| Event | Emitted by |
|-------|------------|
| `PhaseRegistered(name)` | `register_phase` |
| `MatchRegistered(id, phase, home, away, kick_off)` | `register_match` |
| `OracleAuthorized(oracle, bool)` | `set_oracle_authorized` |
| `BetAccepted(user, match_id, score, pen, stake)` | `place_bet` |
| `ResultProposed(match_id, score, pen, oracle, challenge_expires_at)` | `propose_result`, `propose_from_oracle` |
| `ResultProposalCancelled(match_id, oracle)` | `cancel_proposed_result` |
| `ResultFinalized(match_id, score, pen)` | `finalize_result` |
| `PointsAwarded(user, match_id, points)` | `finalize_result` (per qualifying bet) |
| `SettlementPrepared(match_id, total_winner_stake)` | `finalize_result` (fused) |
| `MatchRewardClaimed(match_id, user, amount)` | `claim_match_reward` |
| `MatchDustSwept(match_id, dust)` | `sweep_match_dust_to_final_prize` |
| `PodiumPickSubmitted(user, c, ru, tp)` | `submit_podium_pick` |
| `PodiumFinalized(c, ru, tp)` | `finalize_podium` |
| `PodiumBonusAwarded(user, bonus)` | `finalize_podium` (per matching pick) |
| `FinalPrizePoolFinalized(allocated, dust)` | `finalize_final_prize_pool` |
| `FinalPrizeClaimed(user, amount)` | `claim_final_prize` |
| `FinalPrizeRoundingDustWithdrawn(amount, to)` | `finalize_final_prize_pool` (auto-sweep) |
| `ProtocolFeesWithdrawn(amount, to)` | `withdraw_protocol_fees` |
| `AdminProposed(old, new)` | `change_admin` |
| `AdminChanged(old, new)` | `accept_admin` |

### `state.rs`

`SmartCupState` fields:

| Field | Type | Description |
|-------|------|-------------|
| `admin` | `ActorId` | Current admin |
| `pending_admin` | `Option<ActorId>` | Proposed admin awaiting confirmation |
| `authorized_oracles` | `HashMap<ActorId, bool>` | Oracle access list |
| `protocol_fee_accumulated` | `u128` | Withdrawable protocol fees |
| `final_prize_accumulated` | `u128` | Growing final prize pool |
| `matches` | `HashMap<u64, Match>` | All matches keyed by ID |
| `phases` | `HashMap<String, PhaseConfig>` | All phases keyed by name |
| `user_points` | `HashMap<ActorId, u32>` | Leaderboard points |
| `bets` | `HashMap<(ActorId, u64), Bet>` | One bet per (user, match) pair |
| `user_bets` | `HashMap<ActorId, Vec<UserBetRecord>>` | Per-user bet index for queries |
| `podium_picks` | `HashMap<ActorId, PodiumPick>` | Pre-tournament podium picks |
| `podium_result` | `Option<PodiumResult>` | Official final podium |
| `podium_finalized` | `bool` | Podium lock flag |
| `r32_lock_time` | `Option<u64>` | Earliest R32 kick-off (podium pick deadline) |
| `final_prize_finalized` | `bool` | Final prize lock flag |
| `final_prize_allocations` | `HashMap<ActorId, u128>` | Per-wallet final prize share |
| `final_prize_claimed` | `HashMap<ActorId, bool>` | Per-wallet claim tracking |
| `final_prize_claimable_total` | `u128` | Remaining unclaimed final prize |
| `final_prize_rounding_dust` | `u128` | Always 0 after finalization (dust is auto-swept) |

---

## Function Reference

### Admin

| Function | Description |
|----------|-------------|
| `set_oracle_authorized(oracle, bool)` | Grants or revokes oracle rights |
| `register_phase(name, start, end, weight)` | Defines a tournament phase |
| `register_match(phase, home, away, kick_off)` | Registers a match in a phase |
| `cancel_proposed_result(match_id)` | Reverts an oracle proposal - only within the challenge window |
| `finalize_podium(champion, runner_up, third)` | Sets official podium; awards bonus points |
| `finalize_final_prize_pool()` | Locks final prize; distributes allocations to top 5 |
| `withdraw_protocol_fees()` | Withdraws accumulated protocol fees to admin wallet |
| `withdraw_final_prize_rounding_dust()` | Withdraws rounding dust (normally 0 after finalization) |
| `change_admin(new_admin)` | Step 1: proposes a new admin address |

### Oracle

| Function | Description |
|----------|-------------|
| `propose_result(match_id, score, pen)` | Proposes the final result; starts the challenge window |
| `propose_from_oracle(match_id, oracle_program_id)` | Cross-program async query to Oracle-Program; starts the challenge window |

### User

| Function | Description |
|----------|-------------|
| `place_bet(match_id, score, pen)` | Places a bet; requires >= 3 VARA attached as `msg::value` |
| `submit_podium_pick(champion, runner_up, third)` | Submits a podium prediction before the R32 lock |
| `accept_admin()` | Step 2: pending admin confirms ownership transfer |
| `claim_match_reward(match_id)` | Claims proportional share of the match prize pool |
| `claim_final_prize()` | Claims allocated final prize share |

### Anyone (permissionless)

| Function | Description |
|----------|-------------|
| `finalize_result(match_id)` | Finalizes result + settles match in one call after the challenge window |
| `sweep_match_dust_to_final_prize(match_id)` | Sweeps remaining pool to final prize after all claims, or after the deadline |

### Queries (read-only)

| Function | Returns |
|----------|---------|
| `query_state()` | `IoSmartCupState` - full contract state snapshot |
| `query_match(match_id)` | `Option<Match>` |
| `query_matches_by_phase(phase)` | `Vec<Match>` |
| `query_user_points(user)` | `u32` |
| `query_bets_by_user(user)` | `Vec<UserBetView>` |
| `query_wallet_claim_status(wallet)` | `WalletClaimStatus` - claimable amount across all matches |
| `query_final_prize_claim_status(wallet)` | `FinalPrizeClaimStatus` |

---

## Getting Started

```bash
# Requirements: Node 18+, pnpm
corepack enable
pnpm i

# Contracts workspace
pnpm -F contracts i
pnpm --filter contracts exec hardhat compile
pnpm --filter contracts exec hardhat test
```

### Repo Report

Run the compliance script (compiles, tests, and scans):

```bash
pnpm -C contracts run report
# Expect: [repo-report] PASS - all required checks satisfied.
```

---

## Deployment Scripts

- `contracts/scripts/deploy-bolao.ts`: deploys core, oracle, and timelocks, including queued/executed changes.
- `contracts/scripts/deploy-kyc.ts`: deploys and wires the adult KYC registry.

Example:

```bash
pnpm --filter contracts exec hardhat run scripts/deploy-bolao.ts --network <net>
pnpm --filter contracts exec hardhat run scripts/deploy-kyc.ts --network <net>
```

---

## Frontend

A minimal Vite app is under `frontend/`:

```bash
pnpm -C frontend i
pnpm -C frontend dev
```

It consumes Lens for `timeToClose`, `oracleHealth`, participant and match pagination, and maps custom errors to friendly messages.

---

## Security Properties

### Access control

- `only_admin()` guard on privileged operations.
- `only_oracle()` guard on result proposals.
- Admin transfer is a two-step process (`change_admin` -> `accept_admin`), preventing permanent lockout from a typo or wrong address.
- `cancel_proposed_result()` is limited to the challenge window.

### CEI pattern (Checks-Effects-Interactions)

All state mutations happen before any `msg::send*` call, preventing reentrancy:

- `claim_match_reward()` sets `bet.claimed = true` before sending funds.
- `claim_final_prize()` sets `final_prize_claimed[caller] = true` before sending funds.
- `finalize_final_prize_pool()` zeroes `final_prize_accumulated` before auto-sweeping dust.

### Arithmetic safety

- All additions and multiplications use `saturating_*`.
- All divisions use `checked_div` with explicit panics on zero denominator.

### Input validation

- Minimum bet: 3 VARA, ensuring protocol fee and final prize cut are never rounded to zero.
- String lengths: phase names <= 64 bytes, team/pick names <= 50 bytes, preventing storage bloat.
- Score values: home and away goals capped at 20.
- `points_weight` capped at 20, preventing `u32` overflow in leaderboard accumulation.
- `kick_off` must be strictly in the future at match registration time.
- Penalty winner is required for knockout draws and forbidden otherwise.

### Sweep guard

`sweep_match_dust_to_final_prize()` verifies no eligible unclaimed bets remain before sweeping, unless the claim deadline has passed.

### No-winner path

If `finalize_result()` finds zero winner stake, the entire match pool is redirected to the final prize pool in the same flow.

### Leaderboard

Only wallets that placed at least one bet with non-zero stake qualify for final prize distribution. Sorting is `O(n log n)`.

### Operational controls

- Timelocks: 24h for module, parameter, and role changes; 48h for final prize root and window changes.
- Guards: max oracle age, dispute window, and anti-delay kick-off protection after bets.
- Rescues: paused-only; never USDC (core) and never LINK (oracle module).
- KYC: on-chain boolean via soulbound pass, enforced on bet.

---

## Deployment

The contract is built with `cargo build --release` targeting `wasm32-unknown-unknown` and deployed via Gear CLI or the [Gear IDEA](https://idea.gear-tech.io) interface. The `new()` constructor takes the admin `ActorId` as its argument.

```bash
# Build
cargo build --release

# Deploy via gear CLI (example)
gear program upload \
  --code target/wasm32-unknown-unknown/release/bolao_core_program.opt.wasm \
  --payload <admin_actor_id_hex>
```

**Frontend environment variable:**

| Variable                | Description                          |
|-------------------------|--------------------------------------|
| `VITE_BOLAOCOREPROGRAM` | On-chain program ID of this contract |

---

## License

UNLICENSED (audit-friendly).

## Contact

Rafael Machtura - rafael.machtura@gmail.com
