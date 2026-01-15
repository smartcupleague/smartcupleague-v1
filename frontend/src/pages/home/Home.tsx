import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './dashboard.css';
import { Wallet } from '@gear-js/wallet-connect';
import { useAccount, useApi, useAlert } from '@gear-js/react-hooks';
import { web3Enable } from '@polkadot/extension-dapp';
import { decodeAddress } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';
import { HexString } from '@gear-js/api';
import { Program as CoreProgram, Service as CoreService } from '@/hocs/lib';
import { Program as DaoProgram, Service as DaoService } from '@/hocs/dao';

const CORE_PROGRAM_ID = import.meta.env.VITE_BOLAOCOREPROGRAM as string;
const DAO_PROGRAM_ID = import.meta.env.VITE_DAOPROGRAM as string;

type CoreMatch = {
  match_id: number | string;
  phase: string;
  home: string;
  away: string;
  kick_off: number; // ms
  result: { finalized?: { outcome: string } } | { unresolved?: null };
  pool_home: string | number | bigint;
  pool_draw: string | number | bigint;
  pool_away: string | number | bigint;
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
  start_time: number; // ms
  end_time: number; // ms
  yes: number;
  no: number;
  abstain: number;
  status: string;
  executed: boolean;
};

const VARA_DECIMALS = 12;

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
    if (typeof input === 'string') return BigInt(input || '0');
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

function formatDateTime(ms: number) {
  if (!ms) return '-';
  const d = new Date(ms);
  return (
    d.toLocaleDateString(undefined, { year: '2-digit', month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}

function timeFromNow(ms: number) {
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const min = Math.floor(abs / 60000);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);

  const label = day > 0 ? `${day}d` : hr > 0 ? `${hr}h` : min > 0 ? `${min}m` : 'now';
  return diff >= 0 ? `in ${label}` : `${label} ago`;
}

function isFinalized(m: CoreMatch) {
  return !!(m.result as any)?.finalized;
}

function sumAllMatchPools(matches: CoreMatch[]) {
  let total = 0n;
  for (const m of matches) {
    total += safeBigInt(m.pool_home);
    total += safeBigInt(m.pool_draw);
    total += safeBigInt(m.pool_away);
  }
  return total;
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

  const leaderboardTop3 = useMemo(() => {
    const up = coreState?.user_points ?? [];
    const rows = up
      .map(([wallet, points]) => ({ wallet: String(wallet), points: Number(points ?? 0) }))
      .sort((a, b) => (b.points !== a.points ? b.points - a.points : a.wallet.localeCompare(b.wallet)))
      .slice(0, 3);

    return rows.map((r, idx) => ({
      rank: idx + 1,
      addr: shortHex(r.wallet),
      full: r.wallet,
      points: r.points,
      tag: 'On-chain',
      time: '—',
      delta: '—',
    }));
  }, [coreState]);

  const myRankInfo = useMemo(() => {
    const up = coreState?.user_points ?? [];
    if (!myWalletHex) return { rank: null as number | null, points: 0, totalPlayers: up.length };

    const sorted = [...up]
      .map(([wallet, points]) => ({ wallet: String(wallet), points: Number(points ?? 0) }))
      .sort((a, b) => (b.points !== a.points ? b.points - a.points : a.wallet.localeCompare(b.wallet)));

    const idx = sorted.findIndex((x) => x.wallet.toLowerCase() === myWalletHex.toLowerCase());
    return {
      rank: idx >= 0 ? idx + 1 : null,
      points: idx >= 0 ? sorted[idx].points : 0,
      totalPlayers: sorted.length,
    };
  }, [coreState, myWalletHex]);

  const poolsInfo = useMemo(() => {
    const matches = coreState?.matches ?? [];
    const allPoolsBn = matches.length ? sumAllMatchPools(matches) : 0n;
    const grandPrizeBn = safeBigInt(coreState?.final_prize_accum ?? 0);
    const feeBn = safeBigInt(coreState?.fee_accum ?? 0);

    const withBets = matches.filter((m) => m.has_bets).length;

    return {
      allPoolsText: formatToken(allPoolsBn),
      grandPrizeText: formatToken(grandPrizeBn),
      feeText: formatToken(feeBn),
      matchesWithBets: withBets,
      totalMatches: matches.length,
    };
  }, [coreState]);

  const upcoming = useMemo(() => {
    const matches = coreState?.matches ?? [];
    return matches
      .filter((m) => !isFinalized(m))
      .sort((a, b) => Number(a.kick_off) - Number(b.kick_off))
      .slice(0, 6)
      .map((m) => ({
        id: String(m.match_id),
        left: m.home,
        right: m.away,
        meta: m.phase.replace(/_/g, ' '),
        league: `Kickoff ${timeFromNow(Number(m.kick_off))}`,
      }));
  }, [coreState]);

  const matchesLeft = upcoming.slice(0, 3);
  const matchesRight = upcoming.slice(3, 6);

  const governance = useMemo(() => {
    const active = daoProposals.filter((p) => (p.status ?? '').toLowerCase() === 'active');
    const last = [...daoProposals].sort((a, b) => b.id - a.id)[0] ?? null;
    return { activeCount: active.length, last };
  }, [daoProposals]);

  const recentFinalized = useMemo(() => {
    const matches = coreState?.matches ?? [];
    return matches
      .filter((m) => isFinalized(m))
      .sort((a, b) => Number(b.kick_off) - Number(a.kick_off))
      .slice(0, 2)
      .map((m) => {
        const outcome = (m.result as any).finalized?.outcome ?? 'Finalized';
        return {
          title: `${m.home} vs ${m.away} finalized`,
          sub: `Outcome: ${outcome} • ${formatDateTime(Number(m.kick_off))}`,
        };
      });
  }, [coreState]);

  return (
    <div className="dash dash--full">
      <div className="dash__bg" aria-hidden="true" />

      <header className="topbar topbar--full">
        <div className="tabs">
          <button className="tab tab--active" type="button">
            <span className="tab__dot">🏆</span> World Cup 2026
            <span className="tab__sub">{loading ? 'Syncing…' : 'On-chain'}</span>
          </button>

          <button className="tab tab--ghost" aria-label="More" type="button">
            ⋯
          </button>
        </div>

        <div className="userchip">
          <Wallet />
        </div>
      </header>

      <main className="grid grid--full">
        {/* Row 1 */}
        <section className="card card--status">
          <div className="card__head">
            <h3>Your SmartCup Status</h3>
          </div>

          <div className="status">
            <div className="status__left">
              <div className="status__title">World Cup 2026</div>
              <div className="status__big">
                <span className="status__badge">🏅</span>
                <span className="status__points">{myRankInfo.points}</span>
              </div>
              <div className="status__meta">
                <span>On-chain points</span>
                <span className="dot">•</span>
                <span>{coreState ? `${myRankInfo.totalPlayers} players` : '—'}</span>
                <span className="dot">•</span>
                <span>{coreState ? `${poolsInfo.totalMatches} matches` : '—'}</span>
              </div>
            </div>

            <div className="status__right">
              <div className="status__rank">
                <div className="status__rankTop">
                  <span className="status__rankNo">{myRankInfo.rank ? `#${myRankInfo.rank}` : '—'}</span>
                  <span className="status__rankAll">/ {coreState ? myRankInfo.totalPlayers : '—'}</span>
                </div>
                <div className="status__rankHint">
                  {myWalletHex ? 'Rank from CORE user_points' : 'Connect wallet to compute rank'}
                </div>
              </div>

              <div className="status__addr">
                <span className="mono">{myWalletHex ? shortHex(myWalletHex) : '—'}</span>
                <button className="pill pill--soft" type="button" onClick={fetchAll} title="Refresh">
                  ↻
                </button>
              </div>
            </div>
          </div>

          <div className="card__foot">
            <button className="btn btn--soft" type="button">
              View full leaderboard →
            </button>
          </div>
        </section>

        <section className="card card--perf">
          <div className="card__head">
            <h3>Your Betting Performance</h3>
          </div>

          <div className="kpis">
            <div className="kpi">
              <div className="kpi__label">Total Pool (all matches)</div>
              <div className="kpi__value">
                {coreState ? poolsInfo.allPoolsText : '—'} <span className="muted">VARA</span>
              </div>
            </div>
            <div className="kpi">
              <div className="kpi__label">Matches w/ Bets</div>
              <div className="kpi__value">
                {coreState ? poolsInfo.matchesWithBets : '—'} <span className="muted">matches</span>
              </div>
            </div>
            <div className="kpi kpi--good">
              <div className="kpi__label">Fee Accum</div>
              <div className="kpi__value">
                {coreState ? poolsInfo.feeText : '—'} <span className="muted">VARA</span>
              </div>
            </div>
          </div>

          <div className="perf__bar">
            <div className="pill mono">Owner: {coreState ? shortHex(coreState.owner) : '—'}</div>
            <div className="pill mono">KYC: {coreState ? shortHex(coreState.kyc_contract) : '—'}</div>
            <button className="btn btn--primary" type="button">
              Place Bet
            </button>
          </div>

          <div className="card__foot">
            <button className="btn btn--ghost" type="button">
              View full matches →
            </button>
          </div>
        </section>

        <section className="card card--prize">
          <div className="card__head">
            <h3>Final Prize Pool</h3>
          </div>

          <div className="prize">
            <div className="prize__big">
              <div className="prize__value">{coreState ? poolsInfo.grandPrizeText : '—'}</div>
              <div className="prize__unit">VARA</div>
            </div>

            <div className="prize__rows">
              <div className="row">
                <span className="muted">Fee Accum</span>
                <span>{coreState ? `${poolsInfo.feeText} VARA` : '—'}</span>
              </div>
              <div className="row">
                <span className="muted">Total Pool</span>
                <span>{coreState ? `${poolsInfo.allPoolsText} VARA` : '—'}</span>
              </div>
            </div>

            <button className="btn btn--soft wfull" type="button" onClick={fetchAll}>
              Refresh on-chain state
            </button>

            <div className="prize__trophy" aria-hidden="true">
              🏆
            </div>
          </div>
        </section>

        {/* Row 2 */}
        <section className="card card--leader">
          <div className="card__head">
            <h3>World Cup 2026 Leaderboard</h3>
          </div>

          <div className="table">
            {leaderboardTop3.map((r) => (
              <div className="trow" key={r.rank}>
                <div className="tcell rank">#{r.rank}</div>
                <div className="tcell addr mono" title={r.full}>
                  {r.addr}
                </div>
                <div className="tcell points">
                  <span className="points__num">{r.points}</span>
                  <span className="muted">Points</span>
                </div>
                <div className="tcell tag">
                  <span className="pill pill--soft">✅ {r.tag}</span>
                </div>
                <div className="tcell time mono">{r.time}</div>
                <div className="tcell delta mono">{r.delta}</div>
              </div>
            ))}

            {!leaderboardTop3.length ? (
              <div className="trow">
                <div className="tcell addr muted">No data</div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="card card--activity">
          <div className="card__head">
            <h3>Protocol Activity</h3>
          </div>

          <div className="activity">
            <div className="activity__ok">
              <span className="dotok" />
              <span>{loading ? 'Syncing on-chain…' : 'All systems operational'}</span>
            </div>

            <div className="activity__list">
              <div className="alist">
                <span>🏆</span>
                <div>
                  <div className="alist__title">
                    World Cup 2026 <span className="muted">• {coreState?.phases?.[0]?.name ?? 'phase'}</span>
                  </div>
                  <div className="alist__sub muted">
                    {coreState?.phases?.[0]
                      ? `Phase window • ${formatDateTime(coreState.phases[0].start_time)} → ${formatDateTime(
                          coreState.phases[0].end_time,
                        )}`
                      : 'No phase data'}
                  </div>
                </div>
              </div>

              {recentFinalized.map((x, i) => (
                <div className="alist" key={i}>
                  <span>✅</span>
                  <div>
                    <div className="alist__title">{x.title}</div>
                    <div className="alist__sub muted">{x.sub}</div>
                  </div>
                </div>
              ))}

              <div className="alist">
                <span>💰</span>
                <div>
                  <div className="alist__title">
                    Final Prize Pool{' '}
                    <span className="muted">• {coreState ? `${poolsInfo.grandPrizeText} VARA` : '—'}</span>
                  </div>
                </div>
              </div>

              <div className="alist">
                <span>🗳️</span>
                <div>
                  <div className="alist__title">
                    Governance <span className="muted">• {governance.activeCount} active</span>
                  </div>
                  <div className="alist__sub muted">
                    {governance.last
                      ? `Latest DAO proposal #${governance.last.id} • ${governance.last.description}`
                      : 'No proposals yet'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Row 3 */}
        <section className="card card--matches">
          <div className="card__head">
            <h3>Upcoming Matches</h3>
          </div>

          <div className="matches">
            <div className="matches__col">
              {matchesLeft.map((m) => (
                <div className="match" key={m.id}>
                  <div className="match__main">
                    <div className="match__teams">
                      <span className="team">{m.left}</span>
                      <span className="vs">~</span>
                      <span className="team">{m.right}</span>
                    </div>
                    <div className="match__meta muted">
                      {m.meta} <span className="dot">•</span> {m.league}
                    </div>
                  </div>
                  <button className="btn btn--soft" type="button">
                    Place Bet
                  </button>
                </div>
              ))}

              {!matchesLeft.length ? (
                <div className="match">
                  <div className="match__main">
                    <div className="match__teams">
                      <span className="team muted">No upcoming matches</span>
                    </div>
                    <div className="match__meta muted">Source: CORE queryState.matches</div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="matches__col">
              {matchesRight.map((m) => (
                <div className="match" key={m.id}>
                  <div className="match__main">
                    <div className="match__teams">
                      <span className="team">{m.left}</span>
                      <span className="vs">~</span>
                      <span className="team">{m.right}</span>
                    </div>
                    <div className="match__meta muted">
                      {m.meta} <span className="dot">•</span> {m.league}
                    </div>
                  </div>
                  <button className="btn btn--soft" type="button">
                    Place Bet
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <div className="muted tiny" style={{ padding: '10px 0', textAlign: 'center' }}>
        {!CORE_PROGRAM_ID ? 'Missing env: VITE_BOLAOCOREPROGRAM' : null}
        {!DAO_PROGRAM_ID
          ? CORE_PROGRAM_ID
            ? 'Missing env: VITE_DAOPROGRAM'
            : ' • Missing env: VITE_DAOPROGRAM'
          : null}
      </div>
    </div>
  );
}
