# Bolão Copa 2026 — Smart Contracts & Toolkit

Bolão Copa 2026 is a simple, fair World Cup prediction game built on crypto.
Place one fixed bet per match, earn points for good guesses, and compete for two prizes at once:

- Match prize: each game settles right after the final whistle.

- Final prize: a season-long pot that grows with every match and rewards the top scorers at the end.

No house edge, no hidden odds. Your stake goes into shared prize pools, outcomes are published on-chain, and winners claim their rewards themselves. If you win, you get paid. And if you win the final prize, you get MORE paid and even score a commemorative trophy NFT for bragging rights.

## How it works

 1. Pick your score for a match and place a USDC bet ($3 minimum).

 2. Watch the game. If you nail the result or get close, you earn points; match winners share that match’s pool.

 3. Climb the leaderboard. Points also count toward the final prize pot. At the end, top players claim their share.

## Why it’s fair

 - Transparent by design: bets, results, and payouts are recorded on-chain.

 - Self-custody claims: winners claim directly—no middlemen.

 - Independent feeds: match results come from a dedicated oracle module.

 - Guardrails: key settings change only after a delay (timelocks), and emergency switches exist for safety.

 - 18+ only: a quick, privacy-preserving age check is required before betting.

## What you need

 - A crypto wallet and a little USDC.

 - A quick one-time age check (no personal data stored on-chain).

 - Your football instincts.

# Features

Per-match betting in USDC; settlement in scalable slices

 - Final prize via Merkle distributor (+ optional trophy mint)

 - Oracle module with health reporting & strict timestamp/chain/tournament checks

 - Governance behind 24h/48h timelocks; pause & rescue guards (never rescue USDC/LINK)

 - Adult KYC: soulbound pass minted with provider signature (bettor pays gas)

 - Lens helpers: pagination, timeToClose, oracleHealth, distributorClaimWindow

# Contracts (high level)

 - BolaoCopa2026.sol — Core pools, settlement, dispute/finalize, ops cap

 - BolaoOracleModule.sol — Oracle config & fulfill; oracleHealth() view

 - FinalWinnersDistributor.sol — Merkle claims + claim window, pause/recover

 - Trophy.sol — Minimal ERC721, MINTER_ROLE to distributor

 - BolaoLens.sol — Read helpers and pagination for FE

 - AdultKYCRegistry.sol — Soulbound adult pass (mintWithSig), revoke/unrevoke

 - Interfaces, mocks, and a timelock harness included

# Getting Started 

```
# Requirements: Node 18+, pnpm
corepack enable
pnpm i

# Contracts workspace
pnpm -F contracts i
pnpm --filter contracts exec hardhat compile
pnpm --filter contracts exec hardhat test
```
# Repo Report (checks)

Run the compliance script (compiles, tests, and scans):

```
pnpm -C contracts run report
# Expect: [repo-report] PASS – all required checks satisfied.
```
# Deployment (scripts)

contracts/scripts/deploy-bolao.ts — Core + Oracle + Timelocks (queues/executes changes)

contracts/scripts/deploy-kyc.ts — Adult KYC registry deploy/wire

Example:

```
pnpm --filter contracts exec hardhat run scripts/deploy-bolao.ts --network <net>
pnpm --filter contracts exec hardhat run scripts/deploy-kyc.ts   --network <net>
```
# Frontend (scaffold)

A minimal Vite app is under frontend/:

```
pnpm -C frontend i
pnpm -C frontend dev
```
It consumes Lens for timeToClose, oracleHealth, participants/matches pages, and maps custom errors to friendly messages.

# Security & Governance

 - Timelocks: 24h for module/params/roles; 48h for final prize root+window

 - Guards: max oracle age, dispute window, anti-delay kickoff after bets

 - Rescues: paused-only; never USDC (core) / never LINK (oracle module)

 - KYC: on-chain boolean via soulbound pass; enforced on bet

# License

UNLICENSED (audit-friendly).

# Contact 

Rafael Machtura - rafael.machtura@gmail.com
