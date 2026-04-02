import "dotenv/config.js";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { GearApi } from "@gear-js/api";
import { Keyring } from "@polkadot/keyring";
import { decodeAddress, encodeAddress } from "@polkadot/util-crypto";
import { u8aToHex } from "@polkadot/util";

import { Program as OracleProgram, PenaltyWinner } from "./oracle.ts";

/* ============================================================
   ENV
   ============================================================ */
const PORT = intEnv("PORT", 3001);
const VARA_WS = mustEnv("VARA_WS");
const ORACLE_PROGRAM_ID = mustEnv("ORACLE_PROGRAM_ID") as `0x${string}`;
const GATEWAY_SEED = mustEnv("GATEWAY_SEED");
const SPORTS_API_KEY = process.env.SPORTS_API_KEY ?? "";
const SPORTS_COMPETITION_CODE = process.env.SPORTS_COMPETITION_CODE ?? "WC";
const AUTO_FEED_INTERVAL_MS = intEnv("AUTO_FEED_INTERVAL_MS", 120_000);
const NATIVE_DECIMALS = 12;

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/* ============================================================
   SPORTS API (football-data.org)
   Docs: https://www.football-data.org/documentation/quickstart
   Free tier: 10 req/min, covers World Cup 2026 (code = "WC")
   ============================================================ */
const SPORTS_BASE_URL = "https://api.football-data.org/v4";

interface SportScore {
  home: number | null;
  away: number | null;
}

interface SportMatch {
  id: number;
  status: string;
  score: {
    winner: string | null;
    fullTime: SportScore;
    penalties: SportScore;
  };
}

async function fetchSportMatch(matchId: number): Promise<SportMatch> {
  const res = await fetch(`${SPORTS_BASE_URL}/matches/${matchId}`, {
    headers: buildSportsHeaders(),
  });
  if (!res.ok) {
    throw new Error(`sports-api /matches/${matchId} → ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as SportMatch;
}

async function fetchFinishedMatchesForCompetition(): Promise<SportMatch[]> {
  const res = await fetch(
    `${SPORTS_BASE_URL}/competitions/${SPORTS_COMPETITION_CODE}/matches?status=FINISHED`,
    { headers: buildSportsHeaders() },
  );
  if (!res.ok) {
    throw new Error(
      `sports-api /competitions/${SPORTS_COMPETITION_CODE}/matches → ${res.status} ${res.statusText}`,
    );
  }
  const body = (await res.json()) as { matches: SportMatch[] };
  return body.matches ?? [];
}

function buildSportsHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (SPORTS_API_KEY) headers["X-Auth-Token"] = SPORTS_API_KEY;
  return headers;
}

/**
 * Map a SportMatch to Oracle-Program inputs.
 * Returns null if the match is not finished / scores are missing.
 */
function mapMatchToOracle(
  m: SportMatch,
): { home: number; away: number; penalty_winner: PenaltyWinner | null } | null {
  if (m.status !== "FINISHED") return null;
  if (m.score.fullTime.home == null || m.score.fullTime.away == null) return null;

  const home = m.score.fullTime.home;
  const away = m.score.fullTime.away;

  let penalty_winner: PenaltyWinner | null = null;
  if (m.score.penalties.home != null && m.score.penalties.away != null) {
    penalty_winner = m.score.penalties.home > m.score.penalties.away ? "Home" : "Away";
  }

  return { home, away, penalty_winner };
}

/* ============================================================
   VARA / GearApi
   ============================================================ */
let gearApi: GearApi | null = null;

async function getApi(): Promise<GearApi> {
  if (gearApi) return gearApi;
  gearApi = await GearApi.create({ providerAddress: VARA_WS });
  gearApi?.provider?.on?.("error", (e: any) => console.error("[GearApi] error:", e));
  gearApi?.provider?.on?.("disconnected", () => console.warn("[GearApi] disconnected"));
  gearApi?.provider?.on?.("connected", () => console.log("[GearApi] connected"));
  return gearApi;
}

function getGatewaySigner() {
  const keyring = new Keyring({ type: "sr25519" });
  return keyring.addFromUri(GATEWAY_SEED);
}

function getOracle(api: GearApi): OracleProgram {
  return new OracleProgram(api, ORACLE_PROGRAM_ID);
}

function ss58PrefixFromApi(api: GearApi): number | undefined {
  const p = (api as any)?.registry?.chainSS58;
  return typeof p === "number" ? p : undefined;
}

function toHexAddress(addrSs58OrHex: string): `0x${string}` {
  if (addrSs58OrHex.startsWith("0x") && addrSs58OrHex.length === 66) {
    return addrSs58OrHex as `0x${string}`;
  }
  return u8aToHex(decodeAddress(addrSs58OrHex)) as `0x${string}`;
}

function asActorId(x: unknown, field: string): `0x${string}` {
  const s = String(x ?? "").trim();
  if (!s) throw new Error(`${field} is required`);
  return toHexAddress(s);
}

function asMatchId(x: unknown, field: string): bigint {
  const n = Number(x);
  if (!Number.isInteger(n) || n < 0 || n > 10_000) {
    throw new Error(`${field} must be an integer between 0 and 10000`);
  }
  return BigInt(n);
}

function asPenaltyWinner(x: unknown): PenaltyWinner | null {
  if (x == null || x === "") return null;
  if (x === "Home" || x === "Away") return x;
  throw new Error('penalty_winner must be "Home", "Away", or null');
}

async function getNativeFreeBalanceRaw(api: GearApi, ss58: string): Promise<bigint> {
  const info = await (api as any).query.system.account(ss58);
  return BigInt(info.data.free.toString());
}

function formatBalance(raw: bigint): string {
  const base = 10n ** BigInt(NATIVE_DECIMALS);
  const whole = raw / base;
  const frac = (raw % base).toString().padStart(NATIVE_DECIMALS, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

async function sendTx(tx: any, signer: any, label: string): Promise<any> {
  if (!tx) throw new Error(`[${label}] invalid TransactionBuilder`);
  if (typeof tx.withAccount !== "function") throw new Error(`[${label}] no withAccount()`);
  tx.withAccount(signer);
  if (typeof tx.calculateGas === "function") {
    try {
      await tx.calculateGas();
    } catch (e) {
      console.warn(`[${label}] calculateGas failed, proceeding:`, (e as any)?.message);
    }
  }
  if (typeof tx.signAndSend !== "function") throw new Error(`[${label}] no signAndSend()`);
  return tx.signAndSend();
}

/* ============================================================
   EXPRESS
   ============================================================ */
const app = express();
app.use(helmet());
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error("CORS: origin not allowed"));
      }
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));

/* ============================================================
   HEALTH
   ============================================================ */
app.get("/health", async (_req, res) => {
  try {
    const api = await getApi();
    const signer = getGatewaySigner();
    const prefix = ss58PrefixFromApi(api);
    const ss58 = prefix != null ? encodeAddress(decodeAddress(signer.address), prefix) : signer.address;
    const hex = toHexAddress(signer.address);
    const balRaw = await getNativeFreeBalanceRaw(api, ss58);

    return res.json({
      ok: true,
      time: new Date().toISOString(),
      rpc: VARA_WS,
      oracleProgram: ORACLE_PROGRAM_ID,
      sportsCompetition: SPORTS_COMPETITION_CODE,
      autoFeedIntervalMs: AUTO_FEED_INTERVAL_MS,
      signer: { ss58, hex, nativeBalance: formatBalance(balRaw) },
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message });
  }
});

/* ============================================================
   ORACLE — QUERIES (read-only, no gas)
   ============================================================ */

/** GET /oracle/state — full oracle state snapshot */
app.get("/oracle/state", async (_req, res) => {
  try {
    const api = await getApi();
    const oracle = getOracle(api);
    const state = await oracle.service.queryState();
    return res.json({ ok: true, state });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message });
  }
});

/** GET /oracle/results — all match results */
app.get("/oracle/results", async (_req, res) => {
  try {
    const api = await getApi();
    const oracle = getOracle(api);
    const results = await oracle.service.queryAllResults();
    return res.json({ ok: true, results });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message });
  }
});

/** GET /oracle/result/:matchId — single finalized result */
app.get("/oracle/result/:matchId", async (req, res) => {
  try {
    const matchId = asMatchId(req.params.matchId, "matchId");
    const api = await getApi();
    const oracle = getOracle(api);
    const result = await oracle.service.queryMatchResult(matchId);
    return res.json({ ok: true, match_id: Number(matchId), result: result ?? null });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/** GET /oracle/pending — match IDs with no finalized result yet */
app.get("/oracle/pending", async (_req, res) => {
  try {
    const api = await getApi();
    const oracle = getOracle(api);
    const pending = await oracle.service.queryPendingMatches();
    return res.json({ ok: true, pending });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message });
  }
});

/* ============================================================
   ORACLE — ADMIN MUTATIONS
   ============================================================ */

/**
 * POST /oracle/register-match
 * Body: { match_id: number }
 * Registers a match ID in Oracle-Program so feeders can submit results.
 */
app.post("/oracle/register-match", async (req, res) => {
  try {
    const matchId = asMatchId(req.body?.match_id, "match_id");
    const api = await getApi();
    const signer = getGatewaySigner();
    const oracle = getOracle(api);
    const tx = oracle.service.registerMatch(matchId);
    const result = await sendTx(tx, signer, "registerMatch");
    return res.json({ ok: true, match_id: Number(matchId), result });
  } catch (e: any) {
    console.error("[/oracle/register-match]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/**
 * POST /oracle/force-finalize
 * Body: { match_id: number, home: number, away: number, penalty_winner?: "Home"|"Away"|null }
 * Admin override: locks result bypassing consensus.
 */
app.post("/oracle/force-finalize", async (req, res) => {
  try {
    const matchId = asMatchId(req.body?.match_id, "match_id");
    const home = Number(req.body?.home);
    const away = Number(req.body?.away);
    if (!Number.isInteger(home) || home < 0 || home > 255) throw new Error("home must be 0–255");
    if (!Number.isInteger(away) || away < 0 || away > 255) throw new Error("away must be 0–255");
    const penaltyWinner = asPenaltyWinner(req.body?.penalty_winner ?? null);

    const api = await getApi();
    const signer = getGatewaySigner();
    const oracle = getOracle(api);
    const tx = oracle.service.forceFinalizeResult(matchId, home, away, penaltyWinner);
    const result = await sendTx(tx, signer, "forceFinalizeResult");
    return res.json({ ok: true, match_id: Number(matchId), result });
  } catch (e: any) {
    console.error("[/oracle/force-finalize]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/**
 * POST /oracle/cancel-result
 * Body: { match_id: number }
 * Resets a pending match, clearing all submissions.
 */
app.post("/oracle/cancel-result", async (req, res) => {
  try {
    const matchId = asMatchId(req.body?.match_id, "match_id");
    const api = await getApi();
    const signer = getGatewaySigner();
    const oracle = getOracle(api);
    const tx = oracle.service.cancelResult(matchId);
    const result = await sendTx(tx, signer, "cancelResult");
    return res.json({ ok: true, match_id: Number(matchId), result });
  } catch (e: any) {
    console.error("[/oracle/cancel-result]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/**
 * POST /oracle/set-feeder
 * Body: { feeder: "SS58 or 0x...", authorized: boolean }
 */
app.post("/oracle/set-feeder", async (req, res) => {
  try {
    const feeder = asActorId(req.body?.feeder, "feeder");
    if (typeof req.body?.authorized !== "boolean") throw new Error("authorized must be boolean");
    const authorized: boolean = req.body.authorized;

    const api = await getApi();
    const signer = getGatewaySigner();
    const oracle = getOracle(api);
    const tx = oracle.service.setFeederAuthorized(feeder, authorized);
    const result = await sendTx(tx, signer, "setFeederAuthorized");
    return res.json({ ok: true, feeder, authorized, result });
  } catch (e: any) {
    console.error("[/oracle/set-feeder]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/**
 * POST /oracle/set-threshold
 * Body: { threshold: number }  — 1 to 20
 */
app.post("/oracle/set-threshold", async (req, res) => {
  try {
    const threshold = Number(req.body?.threshold);
    if (!Number.isInteger(threshold) || threshold < 1 || threshold > 20) {
      throw new Error("threshold must be an integer 1–20");
    }
    const api = await getApi();
    const signer = getGatewaySigner();
    const oracle = getOracle(api);
    const tx = oracle.service.setConsensusThreshold(threshold);
    const result = await sendTx(tx, signer, "setConsensusThreshold");
    return res.json({ ok: true, threshold, result });
  } catch (e: any) {
    console.error("[/oracle/set-threshold]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/**
 * POST /oracle/set-bolao-program
 * Body: { program_id: "SS58 or 0x..." }
 */
app.post("/oracle/set-bolao-program", async (req, res) => {
  try {
    const programId = asActorId(req.body?.program_id, "program_id");
    const api = await getApi();
    const signer = getGatewaySigner();
    const oracle = getOracle(api);
    const tx = oracle.service.setBolaoProgram(programId);
    const result = await sendTx(tx, signer, "setBolaoProgram");
    return res.json({ ok: true, program_id: programId, result });
  } catch (e: any) {
    console.error("[/oracle/set-bolao-program]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/**
 * POST /oracle/propose-admin
 * Body: { new_admin: "SS58 or 0x..." }
 */
app.post("/oracle/propose-admin", async (req, res) => {
  try {
    const newAdmin = asActorId(req.body?.new_admin, "new_admin");
    const api = await getApi();
    const signer = getGatewaySigner();
    const oracle = getOracle(api);
    const tx = oracle.service.proposeAdmin(newAdmin);
    const result = await sendTx(tx, signer, "proposeAdmin");
    return res.json({ ok: true, new_admin: newAdmin, result });
  } catch (e: any) {
    console.error("[/oracle/propose-admin]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/**
 * POST /oracle/accept-admin
 * No body needed — the signer of GATEWAY_SEED accepts the admin role.
 */
app.post("/oracle/accept-admin", async (_req, res) => {
  try {
    const api = await getApi();
    const signer = getGatewaySigner();
    const oracle = getOracle(api);
    const tx = oracle.service.acceptAdmin();
    const result = await sendTx(tx, signer, "acceptAdmin");
    return res.json({ ok: true, result });
  } catch (e: any) {
    console.error("[/oracle/accept-admin]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/* ============================================================
   ORACLE — FEEDER MUTATION
   ============================================================ */

/**
 * POST /oracle/submit-result
 * Body: { match_id: number, home: number, away: number, penalty_winner?: "Home"|"Away"|null }
 * Submits a result as the GATEWAY_SEED feeder account.
 */
app.post("/oracle/submit-result", async (req, res) => {
  try {
    const matchId = asMatchId(req.body?.match_id, "match_id");
    const home = Number(req.body?.home);
    const away = Number(req.body?.away);
    if (!Number.isInteger(home) || home < 0 || home > 255) throw new Error("home must be 0–255");
    if (!Number.isInteger(away) || away < 0 || away > 255) throw new Error("away must be 0–255");
    const penaltyWinner = asPenaltyWinner(req.body?.penalty_winner ?? null);

    const api = await getApi();
    const signer = getGatewaySigner();
    const oracle = getOracle(api);
    const tx = oracle.service.submitResult(matchId, home, away, penaltyWinner);
    const result = await sendTx(tx, signer, "submitResult");
    return res.json({ ok: true, match_id: Number(matchId), home, away, penalty_winner: penaltyWinner, result });
  } catch (e: any) {
    console.error("[/oracle/submit-result]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/* ============================================================
   SPORTS API BRIDGE
   ============================================================ */

/**
 * GET /sports/match/:id
 * Fetches match data from football-data.org.
 * No side effects — read only.
 */
app.get("/sports/match/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("id must be a positive integer");
    const match = await fetchSportMatch(id);
    return res.json({ ok: true, match });
  } catch (e: any) {
    console.error("[/sports/match/:id]", e?.message);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/**
 * GET /sports/finished
 * Lists finished matches for the configured competition (default: WC).
 */
app.get("/sports/finished", async (_req, res) => {
  try {
    const matches = await fetchFinishedMatchesForCompetition();
    return res.json({ ok: true, competition: SPORTS_COMPETITION_CODE, count: matches.length, matches });
  } catch (e: any) {
    console.error("[/sports/finished]", e?.message);
    return res.status(500).json({ ok: false, error: e?.message });
  }
});

/**
 * POST /oracle/feed-match/:matchId
 * Fetches the match from football-data.org and submits it to Oracle-Program.
 * The match must already be registered in Oracle-Program (POST /oracle/register-match).
 */
app.post("/oracle/feed-match/:matchId", async (req, res) => {
  try {
    const matchId = asMatchId(req.params.matchId, "matchId");
    const sportMatch = await fetchSportMatch(Number(matchId));
    const mapped = mapMatchToOracle(sportMatch);

    if (!mapped) {
      return res.status(422).json({
        ok: false,
        error: `Match ${matchId} is not FINISHED or scores are missing (status: ${sportMatch.status})`,
      });
    }

    const api = await getApi();
    const signer = getGatewaySigner();
    const oracle = getOracle(api);
    const tx = oracle.service.submitResult(matchId, mapped.home, mapped.away, mapped.penalty_winner);
    const result = await sendTx(tx, signer, "feedMatch");

    return res.json({
      ok: true,
      match_id: Number(matchId),
      home: mapped.home,
      away: mapped.away,
      penalty_winner: mapped.penalty_winner,
      result,
    });
  } catch (e: any) {
    console.error("[/oracle/feed-match]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/* ============================================================
   AUTO-FEEDER (background scheduler)
   Polls pending oracle matches, fetches results from sports API,
   and submits them automatically.
   ============================================================ */
async function runAutoFeed(): Promise<void> {
  try {
    const api = await getApi();
    const oracle = getOracle(api);
    const signer = getGatewaySigner();

    const pending = await oracle.service.queryPendingMatches();
    if (pending.length === 0) return;

    console.log(`[auto-feed] ${pending.length} pending match(es):`, pending.map(Number));

    for (const rawId of pending) {
      const matchId = BigInt(rawId as any);
      const numId = Number(matchId);

      try {
        const sportMatch = await fetchSportMatch(numId);
        const mapped = mapMatchToOracle(sportMatch);

        if (!mapped) {
          console.log(`[auto-feed] match ${numId} not finished yet (${sportMatch.status})`);
          continue;
        }

        console.log(`[auto-feed] submitting match ${numId}: ${mapped.home}–${mapped.away}${mapped.penalty_winner ? ` pen:${mapped.penalty_winner}` : ""}`);
        const tx = oracle.service.submitResult(matchId, mapped.home, mapped.away, mapped.penalty_winner);
        await sendTx(tx, signer, `auto-feed:${numId}`);
        console.log(`[auto-feed] ✓ match ${numId} submitted`);
      } catch (e: any) {
        console.warn(`[auto-feed] match ${numId} failed:`, e?.message);
      }
    }
  } catch (e: any) {
    console.error("[auto-feed] cycle error:", e?.message);
  }
}

/* ============================================================
   SERVER BOOT
   ============================================================ */
const server = app.listen(PORT, () => {
  console.log(`smartcup-oracle-server listening on :${PORT}`);
  console.log(`  Oracle Program : ${ORACLE_PROGRAM_ID}`);
  console.log(`  Vara RPC       : ${VARA_WS}`);
  console.log(`  Sports API     : football-data.org / competition=${SPORTS_COMPETITION_CODE}`);
  console.log(`  Auto-feed      : every ${AUTO_FEED_INTERVAL_MS / 1000}s`);

  // Warm up GearApi connection
  getApi().catch((e) => console.error("[boot] GearApi init failed:", e?.message));

  // Start auto-feed scheduler
  if (AUTO_FEED_INTERVAL_MS > 0) {
    setInterval(() => {
      runAutoFeed().catch((e) => console.error("[auto-feed] unhandled:", e?.message));
    }, AUTO_FEED_INTERVAL_MS);
  }
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
  console.log("Shutting down oracle server...");
  server.close(() => {
    console.log("HTTP server closed.");
    gearApi?.disconnect?.();
    process.exit(0);
  });
}

/* ============================================================
   HELPERS
   ============================================================ */
function mustEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing environment variable: ${key}`);
  return v;
}

function intEnv(key: string, def: number): number {
  const v = process.env[key];
  if (!v) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
