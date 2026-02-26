import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './dashboard.css';
import { useAccount, useApi, useAlert } from '@gear-js/react-hooks';
import { web3Enable } from '@polkadot/extension-dapp';
import { decodeAddress } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';
import { HexString } from '@gear-js/api';
import { Program as CoreProgram, Service as CoreService } from '@/hocs/lib';
import { Program as DaoProgram, Service as DaoService } from '@/hocs/dao';
import { TEAM_FLAGS } from '@/utils/teams';
import { StyledWallet } from '@/components/wallet/Wallet';

const CORE_PROGRAM_ID = import.meta.env.VITE_BOLAOCOREPROGRAM as string;
const DAO_PROGRAM_ID = import.meta.env.VITE_DAOPROGRAM as string;

const VARA_DECIMALS = 12;

type CoreMatch = {
  match_id: number | string;
  phase: string;
  home: string;
  away: string;
  kick_off: number;
  result: any;
  total_pool: string | number | bigint;
  pool_home?: string | number | bigint;
  pool_draw?: string | number | bigint;
  pool_away?: string | number | bigint;
  has_bets: boolean;
  participants: string[];
};

type CoreState = {
  owner: string;
  kyc_contract: string;
  final_prize_distributor: string;
  fee_accum: string | number | bigint;
  final_prize_accum: string | number | bigint;
  matches: CoreMatch[];
  phases: Array<{ name: string; start_time: number; end_time: number }>;
  user_points: Array<[string, number]>;
};

type DaoProposal = {
  id: number;
  proposer: `0x${string}`;
  kind: Record<string, any>;
  description: string;
  start_time: number;
  end_time: number;
  yes: number;
  no: number;
  abstain: number;
  status: string;
  executed: boolean;
};

function normalizeTeamKey(team: string) {
  const raw = (team || '').trim();
  if (!raw) return '';
  const noDiacritics = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const spaced = noDiacritics.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return spaced.toUpperCase();
}

function flagForTeam(team: string) {
  const key = normalizeTeamKey(team);
  if (!key) return '/flags/default.png';
  if (TEAM_FLAGS[key]) return TEAM_FLAGS[key];
  const firstToken = key.split(' ')[0];
  if (TEAM_FLAGS[firstToken]) return TEAM_FLAGS[firstToken];
  return '/flags/default.png';
}

function shortHex(addr: string) {
  if (!addr) return '-';
  if (!addr.startsWith('0x') || addr.length < 16) return addr;
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

function toHexAddress(input?: string | null): `0x${string}` | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('0x')) return trimmed.toLowerCase() as `0x${string}`;
  try {
    const u8a = decodeAddress(trimmed);
    return u8aToHex(u8a).toLowerCase() as `0x${string}`;
  } catch {
    return null;
  }
}

function safeBigInt(input: unknown): bigint {
  try {
    if (typeof input === 'bigint') return input;
    if (typeof input === 'number') return BigInt(Math.trunc(input));
    if (typeof input === 'string') {
      const s = input.trim();
      if (!s) return 0n;
      return BigInt(s.replace(/,/g, ''));
    }
    return 0n;
  } catch {
    return 0n;
  }
}

function formatToken(val: string | number | bigint, decimals = VARA_DECIMALS) {
  const bn = safeBigInt(val);
  const divisor = BigInt(10) ** BigInt(decimals);
  const intVal = bn / divisor;
  const frac = (bn % divisor).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${intVal.toString()}.${frac}` : intVal.toString();
}

function formatTokenCompact(val: string | number | bigint, decimals = VARA_DECIMALS) {
  const raw = formatToken(val, decimals);
  const [i, f] = raw.split('.');
  const withCommas = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (!f) return withCommas;
  return `${withCommas}.${f.slice(0, 2)}`;
}

function kickOffToMs(input: number) {
  if (!input || !Number.isFinite(input)) return 0;
  return input < 10_000_000_000 ? input * 1000 : input;
}

function formatDate(msLike: number) {
  const ms = kickOffToMs(msLike);
  if (!ms) return '-';
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatTime(msLike: number) {
  const ms = kickOffToMs(msLike);
  if (!ms) return '-';
  const d = new Date(ms);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(msLike: number) {
  const ms = kickOffToMs(msLike);
  if (!ms) return '-';
  const d = new Date(ms);
  return (
    d.toLocaleDateString(undefined, { year: '2-digit', month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}

function timeFromNow(msLike: number) {
  const ms = kickOffToMs(msLike);
  if (!ms) return '—';
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const sec = Math.floor(abs / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  const label = day > 0 ? `${day}d` : hr > 0 ? `${hr}h` : min > 0 ? `${min}m` : `${sec}s`;
  return diff >= 0 ? `in ${label}` : `${label} ago`;
}

function toHMS(msLike: number) {
  const ms = kickOffToMs(msLike);
  if (!ms) return '—';
  const diff = Math.max(0, ms - Date.now());
  const s = Math.floor(diff / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function isFinalized(m: CoreMatch) {
  return !!((m.result as any)?.finalized || (m.result as any)?.Finalized);
}

function matchPool(m: CoreMatch): bigint {
  const tp = safeBigInt((m as any)?.total_pool);
  if (tp > 0n) return tp;
  const legacy =
    safeBigInt((m as any)?.pool_home) + safeBigInt((m as any)?.pool_draw) + safeBigInt((m as any)?.pool_away);
  return legacy;
}

function sumAllMatchPools(matches: CoreMatch[]) {
  return matches.reduce((acc, m) => acc + matchPool(m), 0n);
}

function TeamFlag({ team }: { team: string }) {
  return (
    <img
      className="h-flag"
      src={flagForTeam(team)}
      alt={`${team} flag`}
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).src = '/flags/default.png';
      }}
      loading="lazy"
    />
  );
}

export default function Home() {
  const { api, isApiReady } = useApi();
  const alert = useAlert();
  const { account } = useAccount();

  const myWalletHex = useMemo(() => {
    const addr = account?.decodedAddress ?? (account as any)?.address ?? null;
    return toHexAddress(addr);
  }, [account]);

  const [coreState, setCoreState] = useState<CoreState | null>(null);
  const [daoProposals, setDaoProposals] = useState<DaoProposal[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        await web3Enable('SmartCup Home');
      } catch {}
    })();
  }, []);

  const coreProgram = useMemo(() => {
    if (!api || !isApiReady) return null;
    if (!CORE_PROGRAM_ID) return null;
    return new CoreProgram(api, CORE_PROGRAM_ID as HexString);
  }, [api, isApiReady]);

  const daoProgram = useMemo(() => {
    if (!api || !isApiReady) return null;
    if (!DAO_PROGRAM_ID) return null;
    return new DaoProgram(api, DAO_PROGRAM_ID as HexString);
  }, [api, isApiReady]);

  const fetchCoreState = useCallback(async () => {
    if (!coreProgram) return;
    const svc = new CoreService(coreProgram);
    const s = (await svc.queryState()) as any;

    const matches: CoreMatch[] = (s?.matches ?? []).map((m: any) => ({
      match_id: m?.match_id ?? '',
      phase: String(m?.phase ?? ''),
      home: String(m?.home ?? ''),
      away: String(m?.away ?? ''),
      kick_off: Number(m?.kick_off ?? 0),
      result: m?.result ?? { unresolved: null },
      total_pool: m?.total_pool ?? m?.pool ?? m?.pool_total ?? '0',
      pool_home: m?.pool_home ?? '0',
      pool_draw: m?.pool_draw ?? '0',
      pool_away: m?.pool_away ?? '0',
      has_bets: Boolean(m?.has_bets),
      participants: Array.isArray(m?.participants) ? m.participants.map(String) : [],
    }));

    const user_points: Array<[string, number]> = Array.isArray(s?.user_points)
      ? s.user_points.map((it: any) => [String(it?.[0] ?? ''), Number(it?.[1] ?? 0)] as [string, number])
      : [];

    setCoreState({
      owner: String(s?.owner ?? ''),
      kyc_contract: String(s?.kyc_contract ?? ''),
      final_prize_distributor: String(s?.final_prize_distributor ?? ''),
      fee_accum: s?.fee_accum ?? '0',
      final_prize_accum: s?.final_prize_accum ?? '0',
      matches,
      phases: Array.isArray(s?.phases)
        ? s.phases.map((p: any) => ({
            name: String(p?.name ?? ''),
            start_time: Number(p?.start_time ?? 0),
            end_time: Number(p?.end_time ?? 0),
          }))
        : [],
      user_points,
    });
  }, [coreProgram]);

  const fetchDaoProposals = useCallback(async () => {
    if (!daoProgram) return;
    const svc = new DaoService(daoProgram);

    const ps = (await (svc as any).queryProposals()) as any[];
    const normalized: DaoProposal[] = Array.isArray(ps)
      ? ps.map((p: any) => ({
          id: Number(p?.id ?? 0),
          proposer: String(p?.proposer ?? '0x') as `0x${string}`,
          kind: (p?.kind ?? {}) as Record<string, any>,
          description: String(p?.description ?? ''),
          start_time: Number(p?.start_time ?? 0),
          end_time: Number(p?.end_time ?? 0),
          yes: Number(p?.yes ?? 0),
          no: Number(p?.no ?? 0),
          abstain: Number(p?.abstain ?? 0),
          status: String(p?.status ?? ''),
          executed: Boolean(p?.executed),
        }))
      : [];

    setDaoProposals(normalized);
  }, [daoProgram]);

  const fetchAll = useCallback(async () => {
    if (!isApiReady) return;
    setLoading(true);
    try {
      await Promise.all([fetchCoreState(), fetchDaoProposals()]);
    } catch (e) {
      console.error(e);
      alert.error('Failed to load home data');
    } finally {
      setLoading(false);
    }
  }, [isApiReady, fetchCoreState, fetchDaoProposals, alert]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const tournamentName = 'World Cup 2026';

  const sortedLeaderboard = useMemo(() => {
    const up = coreState?.user_points ?? [];
    return [...up]
      .map(([wallet, points]) => ({ wallet: String(wallet), points: Number(points ?? 0) }))
      .sort((a, b) => (b.points !== a.points ? b.points - a.points : a.wallet.localeCompare(b.wallet)));
  }, [coreState]);

  const myRankInfo = useMemo(() => {
    const totalPlayers = sortedLeaderboard.length;
    if (!myWalletHex) return { rank: null as number | null, points: 0, totalPlayers };
    const idx = sortedLeaderboard.findIndex((x) => x.wallet.toLowerCase() === myWalletHex.toLowerCase());
    return { rank: idx >= 0 ? idx + 1 : null, points: idx >= 0 ? sortedLeaderboard[idx].points : 0, totalPlayers };
  }, [sortedLeaderboard, myWalletHex]);

  const distanceToNext = useMemo(() => {
    if (!myWalletHex || !myRankInfo.rank) return null as null | { targetRank: number; targetAddr: string; gap: number };
    const idx = myRankInfo.rank - 1;
    const above = sortedLeaderboard[idx - 1];
    if (!above) return null;
    const gap = Math.max(0, (above.points ?? 0) - (myRankInfo.points ?? 0));
    return { targetRank: idx, targetAddr: above.wallet, gap };
  }, [sortedLeaderboard, myWalletHex, myRankInfo.rank, myRankInfo.points]);

  const poolsInfo = useMemo(() => {
    const matches = coreState?.matches ?? [];
    const allPoolsBn = matches.length ? sumAllMatchPools(matches) : 0n;
    const finalPrizeBn = safeBigInt(coreState?.final_prize_accum ?? 0);
    const feeBn = safeBigInt(coreState?.fee_accum ?? 0);
    const withBets = matches.filter((m) => m.has_bets).length;

    return {
      allPoolsText: formatTokenCompact(allPoolsBn),
      finalPrizeText: formatTokenCompact(finalPrizeBn),
      feeText: formatTokenCompact(feeBn),
      matchesWithBets: withBets,
      totalMatches: matches.length,
    };
  }, [coreState]);

  const finalizedMatches = useMemo(() => {
    const matches = coreState?.matches ?? [];
    return matches
      .filter((m) => isFinalized(m))
      .sort((a, b) => kickOffToMs(Number(b.kick_off)) - kickOffToMs(Number(a.kick_off)));
  }, [coreState]);

  const lastMatchPointsLine = useMemo(() => {
    const last = finalizedMatches[0];
    if (!last) return '—';
    const phase = (last.phase || '').replace(/_/g, ' ');
    const date = formatDate(Number(last.kick_off));
    const outcome = (last.result as any)?.finalized?.outcome ?? (last.result as any)?.Finalized?.outcome ?? null;
    const pointsStub = '+3 points';
    return `${last.home} vs ${last.away} • ${phase} • ${date}${outcome ? ` • ${outcome}` : ''} • ${pointsStub}`;
  }, [finalizedMatches]);

  const upcoming = useMemo(() => {
    const matches = coreState?.matches ?? [];
    return matches
      .filter((m) => !isFinalized(m))
      .sort((a, b) => kickOffToMs(Number(a.kick_off)) - kickOffToMs(Number(b.kick_off)));
  }, [coreState]);

  const nextMatch = upcoming[0] ?? null;

  const predictedProgress = useMemo(() => {
    const total = poolsInfo.totalMatches || 0;
    const predicted = total ? finalizedMatches.length : 0;
    const pct = total ? Math.round((predicted / total) * 100) : 0;
    return { predicted, total, pct };
  }, [poolsInfo.totalMatches, finalizedMatches.length]);

  const bonus = useMemo(() => {
    const deadline = nextMatch ? kickOffToMs(Number(nextMatch.kick_off)) : 0;
    const countdown = deadline ? toHMS(deadline) : '—';
    const qualifies = predictedProgress.total ? predictedProgress.pct >= 50 : false;
    return { qualifies, countdown };
  }, [nextMatch, predictedProgress.total, predictedProgress.pct]);

  const governance = useMemo(() => {
    const active = daoProposals.filter((p) => (p.status ?? '').toLowerCase() === 'active');
    const last = [...daoProposals].sort((a, b) => b.id - a.id)[0] ?? null;
    return { activeCount: active.length, last };
  }, [daoProposals]);

  const leaderboardTop3 = useMemo(() => {
    const rows = sortedLeaderboard.slice(0, 3);
    return rows.map((r, idx) => ({
      rank: idx + 1,
      full: r.wallet,
      addr: shortHex(r.wallet),
      points: r.points,
    }));
  }, [sortedLeaderboard]);

  const phaseWeight = useMemo(() => {
    const p = (nextMatch?.phase ?? '').toLowerCase();
    if (!p) return '—';
    if (p.includes('final')) return 'x5';
    if (p.includes('semi')) return 'x4';
    if (p.includes('quarter')) return 'x3';
    if (p.includes('round')) return 'x2';
    return 'x1';
  }, [nextMatch?.phase]);

  const usdcLabel = 'VARA';

  return (
    <div className="h-dash">
      <div className="h-bg" aria-hidden="true" />

      <header className="h-topbar">
        <div className="h-tabs">
          <button className="h-tab h-tab--active" type="button">
            <span className="h-tab__dot">🏆</span>
            {tournamentName}
            <span className="h-tab__sub">{loading ? 'Syncing…' : 'On-chain'}</span>
          </button>

          <button className="h-tab h-tab--ghost" aria-label="Refresh" type="button" onClick={fetchAll} title="Refresh">
            ⟳
          </button>
        </div>

        <div className="h-user">
          <StyledWallet />
        </div>
      </header>

      {/* MAIN GRID */}
      <main className="h-grid">
        {/* Your SmartCup Status */}
        <section className="h-card h-card--status">
          <div className="h-card__head">
            <h3>Your SmartCup Status</h3>
          </div>

          <div className="h-status h-status--compact">
            <div className="h-status__top">
              <div className="h-status__tournament">{tournamentName}</div>

              <div className="h-rank">
                <div className="h-rank__main">
                  <span className="h-rank__no">{myRankInfo.rank ? `#${myRankInfo.rank}` : '—'}</span>
                  <span className="h-rank__all">/ {coreState ? myRankInfo.totalPlayers : '—'}</span>
                </div>
                <div className="h-rank__hint">Rank from CORE</div>
              </div>
            </div>

            <div className="h-status__mid">
              <div className="h-badge">
                <span className="h-badge__icon">🏅</span>
              </div>

              <div className="h-points">
                <div className="h-points__value">{myRankInfo.points}</div>
                <div className="h-points__label">match points</div>
              </div>

              <div className="h-wallet">
                <div className="h-wallet__label">Wallet</div>
                <div className="h-wallet__value mono">{myWalletHex ? shortHex(myWalletHex) : '—'}</div>
              </div>
            </div>

            <div className="h-kv">
              <div className="h-kv__row">
                <span className="muted">Last match points accumulated</span>
                <span className="h-kv__value">{lastMatchPointsLine}</span>
              </div>

              <div className="h-kv__row">
                <span className="muted">Matches predicted</span>
                <span className="h-kv__value">
                  {predictedProgress.predicted} / {predictedProgress.total} • {predictedProgress.pct}%
                </span>
              </div>

              <div className="h-kv__row">
                <span className="muted">Participation in Tournament Bonus</span>
                <span className="h-kv__value">
                  {bonus.qualifies ? 'Yes' : 'No'} • deadline {bonus.countdown}
                </span>
              </div>

              <div className="h-kv__row">
                <span className="muted">Distance to next rank</span>
                <span className="h-kv__value">
                  {distanceToNext
                    ? `You are ${distanceToNext.gap} points to reach #${distanceToNext.targetRank} • ${shortHex(
                        distanceToNext.targetAddr,
                      )}`
                    : '—'}
                </span>
              </div>
            </div>

            <div className="h-card__foot">
              <button className="h-btn h-btn--soft" type="button">
                View full Leaderboard →
              </button>
            </div>
          </div>
        </section>

        {/* Your Betting Performance */}
        <section className="h-card h-card--perf">
          <div className="h-card__head">
            <h3>Your Betting Performance</h3>
          </div>

          <div className="h-perf h-perf--compact">
            <div className="h-perf__kpis">
              <div className="h-kpi h-kpi--wide">
                <div className="h-kpi__label">Total Pool (all matches)</div>
                <div className="h-kpi__value">
                  {coreState ? poolsInfo.allPoolsText : '—'} <span className="muted">{usdcLabel}</span>
                </div>
              </div>

              <div className="h-kpi">
                <div className="h-kpi__label">Matches w/ Bets</div>
                <div className="h-kpi__value">{coreState ? `${poolsInfo.matchesWithBets} matches` : '—'}</div>
              </div>

              <div className="h-kpi">
                <div className="h-kpi__label">Fee Accum</div>
                <div className="h-kpi__value">
                  {coreState ? poolsInfo.feeText : '—'} <span className="muted">{usdcLabel}</span>
                </div>
              </div>
            </div>

            <div className="h-perf__bar">
              <div className="h-pill mono">Owner: {coreState ? shortHex(coreState.owner) : '—'}</div>
              <div className="h-pill mono">KYC: {coreState ? shortHex(coreState.kyc_contract) : '—'}</div>
              <button className="h-btn h-btn--primary" type="button">
                Place Bet
              </button>
            </div>

            <div className="h-card__foot">
              <button className="h-btn h-btn--ghost" type="button">
                View full matches →
              </button>
            </div>
          </div>
        </section>

        {/* Final Prize Pool */}
        <section className="h-card h-card--prize">
          <div className="h-card__head">
            <h3>Final Prize Pool</h3>
          </div>

          <div className="h-prize">
            <div className="h-prize__big">
              <div className="h-prize__value">{coreState ? poolsInfo.finalPrizeText : '—'}</div>
              <div className="h-prize__unit">{usdcLabel}</div>
            </div>

            <div className="h-prize__rows">
              <div className="h-row">
                <span className="muted">Number of predictions made</span>
                <span>{coreState ? poolsInfo.matchesWithBets : '—'}</span>
              </div>
              <div className="h-row">
                <span className="muted">Accumulated value with match bets</span>
                <span>{coreState ? `${poolsInfo.allPoolsText} ${usdcLabel}` : '—'}</span>
              </div>
              <div className="h-row">
                <span className="muted">Accumulated value with dust</span>
                <span>—</span>
              </div>
            </div>

            <div className="h-prize__note muted">Top 5% players will win after the final match</div>

            <div className="h-split">
              <div className="h-split__label muted">Distribution</div>
              <div className="h-split__bar" aria-label="Distribution 45 25 20 10 5">
                <span style={{ width: '45%' }} />
                <span style={{ width: '25%' }} />
                <span style={{ width: '20%' }} />
                <span style={{ width: '10%' }} />
                <span style={{ width: '5%' }} />
              </div>
              <div className="h-split__legend mono">
                <span>45%</span>
                <span>25%</span>
                <span>20%</span>
                <span>10%</span>
                <span>5%</span>
              </div>
            </div>

            <div className="h-prize__cta">
              <button className="h-btn h-btn--soft h-btn--block" type="button" onClick={fetchAll}>
                Refresh on-chain state
              </button>
              <button className="h-btn h-btn--primary h-btn--block" type="button">
                Claim prize
              </button>
            </div>

            <div className="h-prize__trophy" aria-hidden="true">
              🏆
            </div>
          </div>
        </section>

        {/* Extras */}
        <section className="h-card h-card--leader">
          <div className="h-card__head">
            <h3>{tournamentName} Leaderboard</h3>
          </div>

          <div className="h-table">
            {leaderboardTop3.map((r) => (
              <div className="h-trow" key={r.rank}>
                <div className="h-tcell h-tcell--rank">#{r.rank}</div>
                <div className="h-tcell mono" title={r.full}>
                  {r.addr}
                </div>
                <div className="h-tcell h-tcell--points">
                  <span className="h-pts">{r.points}</span>
                  <span className="muted">Points</span>
                </div>
              </div>
            ))}

            {!leaderboardTop3.length ? (
              <div className="h-trow">
                <div className="h-tcell muted">No data</div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="h-card h-card--activity">
          <div className="h-card__head">
            <h3>Protocol Activity</h3>
          </div>

          <div className="h-activity">
            <div className="h-ok">
              <span className="h-ok__dot" />
              <span>{loading ? 'Syncing on-chain…' : 'All systems operational'}</span>
            </div>

            <div className="h-activity__list">
              <div className="h-alist">
                <span className="h-alist__ico">🗓️</span>
                <div>
                  <div className="h-alist__title">
                    Next kickoff <span className="muted">• {nextMatch ? timeFromNow(Number(nextMatch.kick_off)) : '—'}</span>
                  </div>
                  <div className="h-alist__sub muted">{nextMatch ? formatDateTime(Number(nextMatch.kick_off)) : '—'}</div>
                </div>
              </div>

              <div className="h-alist">
                <span className="h-alist__ico">🗳️</span>
                <div>
                  <div className="h-alist__title">
                    Governance <span className="muted">• {governance.activeCount} active</span>
                  </div>
                  <div className="h-alist__sub muted">
                    {governance.last ? `Latest proposal #${governance.last.id} • ${governance.last.description}` : 'No proposals yet'}
                  </div>
                </div>
              </div>

              <div className="h-alist">
                <span className="h-alist__ico">💧</span>
                <div>
                  <div className="h-alist__title">
                    Total Pool <span className="muted">• {coreState ? `${poolsInfo.allPoolsText} ${usdcLabel}` : '—'}</span>
                  </div>
                  <div className="h-alist__sub muted">Sum of pools across all matches.</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="h-card h-card--matches">
          <div className="h-card__head">
            <h3>Next match to predict</h3>
          </div>

          <div className="h-matches">
            {upcoming.slice(0, 4).map((m) => (
              <div className="h-match" key={String(m.match_id)}>
                <div className="h-match__main">
                  <div className="h-match__teams">
                    <span className="h-team">
                      <TeamFlag team={m.home} />
                      <span className="h-team__name">{m.home}</span>
                    </span>
                    <span className="h-vs">vs</span>
                    <span className="h-team">
                      <TeamFlag team={m.away} />
                      <span className="h-team__name">{m.away}</span>
                    </span>
                  </div>
                  <div className="h-match__meta muted">
                    {(m.phase || '').replace(/_/g, ' ')} <span className="h-dot">•</span> {formatDateTime(Number(m.kick_off))}
                  </div>
                </div>

                <button className="h-btn h-btn--soft" type="button">
                  Predict Now
                </button>
              </div>
            ))}

            {!upcoming.length ? <div className="muted">No upcoming matches</div> : null}
          </div>
        </section>
      </main>

      <div className="muted tiny" style={{ padding: '10px 0', textAlign: 'center' }}>
        {!CORE_PROGRAM_ID ? 'Missing env: VITE_BOLAOCOREPROGRAM' : null}
        {!DAO_PROGRAM_ID ? (CORE_PROGRAM_ID ? 'Missing env: VITE_DAOPROGRAM' : ' • Missing env: VITE_DAOPROGRAM') : null}
      </div>
    </div>
  );
}