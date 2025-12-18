# SmartCup League — Smart Contract Repo

SmartCup League is a simple, fair World Cup prediction game built on crypto.
Place one prediction position per match, earn points for good guesses, and compete for two prizes at once:

- Match prize: each game settles right after the final whistle.

- Final prize: a season-long pot that grows with every match and rewards the top scorers at the end.

No house edge, no hidden odds. Your stake goes into shared prize pools, outcomes are published on-chain, and winners claim their rewards themselves. If you win, you get paid. And if you win the final prize, you get MORE paid and even score a commemorative trophy NFT for bragging rights.

## How it works

 1. Pick your score for a match and place a USDC position ($3 minimum).

 2. Watch the game. If you nail the result or get close, you earn points; match winners share that match’s pool.

 3. Climb the leaderboard. Points also count toward the final prize pot. At the end, top players claim their share.

## Why it’s fair

 - Transparent by design: prediction position, results, and payouts are recorded on-chain.

 - Self-custody claims: winners claim directly—no middlemen.

 - Independent feeds: match results come from a dedicated oracle module.

 - Guardrails: key settings change only after a delay (timelocks), and emergency switches exist for safety.

 - 18+ only: a quick, privacy-preserving age check is required before playing.

## What you need

 - A crypto wallet and a little USDC.

 - A quick one-time age check (no personal data stored on-chain).

 - Your football instincts.

## Features

Per-match prediction position in USDC; settlement in scalable slices

 - Final prize via Merkle distributor (+ optional trophy mint)

 - Oracle module with health reporting & strict timestamp/chain/tournament checks

 - Governance behind 24h/48h timelocks; pause & rescue guards (never rescue USDC/LINK)

 - Lens helpers: pagination, timeToClose, oracleHealth, distributorClaimWindow
