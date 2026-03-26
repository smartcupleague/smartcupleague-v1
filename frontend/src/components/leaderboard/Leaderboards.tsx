import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './leaderboards.css';
import { useAccount, useApi } from '@gear-js/react-hooks';
import { useToast } from '@/hooks/useToast';
import { web3Enable } from '@polkadot/extension-dapp';
import { decodeAddress } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';
import { Program, Service } from '@/hocs/lib';
import { StyledWallet } from '../wallet/Wallet';
import { useNavigate } from 'react-router-dom';

const PROGRAM_ID = import.meta.env.VITE_BOLAOCOREPROGRAM as `0x${string}`;
const MY_LB_KEY = 'scl_my_leaderboard_v1';

type LbRow = {
  rank: number;
  wallet: string;
  totalPoints: number;
  // TODO: matches, exact, outcome counts require per-user detailed data from contract
  matches: number;
  exact: number;
  outcome: number;
};

type EarningRow = { rank: number; wallet: string; points: number };

// Tabs — removed Match Performance, R32 Bonus (Picks), Earnings/ROI per spec
const tabs = ['Global Leaderboard', 'My Leaderboard'] as const;
type Tab = (typeof tabs)[number];

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

function kickOffToMs(input: number) {
  if (!input || !Number.isFinite(input)) return 0;
  return input < 10_000_000_000 ? input * 1000 : input;
}

function formatDateTime(ms: number) {
  if (!ms) return '—';
  const d = new Date(ms);
  return (
    d.toLocaleDateString(undefined, { year: '2-digit', month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}

type QueryStateResponse = {
  user_points?: Array<[string, number]>;
  matches?: any[];
};

export default function Leaderboards() {
  const [activeTab, setActiveTab] = useState<Tab>('Global Leaderboard');
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const { api, isApiReady } = useApi();
  const toast = useToast();
  const { account } = useAccount();

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<LbRow[]>([]);
  const [upcomingMatches, setUpcomingMatches] = useState<any[]>([]);

  const listRef = useRef<HTMLDivElement | null>(null);

  // "My Leaderboard" — list of followed wallet addresses (localStorage)
  const [followedWallets, setFollowedWallets] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(MY_LB_KEY) ?? '[]');
    } catch {
      return [];
    }
  });

  const toggleFollow = (wallet: string) => {
    setFollowedWallets((prev) => {
      const next = prev.includes(wallet) ? prev.filter((w) => w !== wallet) : [...prev, wallet];
      try {
        localStorage.setItem(MY_LB_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const myWalletHex = useMemo(() => {
    const addr = account?.decodedAddress ?? (account as any)?.address ?? null;
    return toHexAddress(addr);
  }, [account]);

  useEffect(() => {
    void web3Enable('Leaderboards dApp');
  }, []);

  const fetchLeaderboard = useCallback(async () => {
    if (!api || !isApiReady) return;

    setLoading(true);
    try {
      const svc = new Service(new Program(api, PROGRAM_ID));
      const state = (await (svc as any).queryState()) as QueryStateResponse;

      const points = Array.isArray(state?.user_points) ? state.user_points : [];

      // Build a map of wallet → points
      const pointsMap = new Map<string, number>();
      for (const [wallet, pts] of points) {
        if (wallet) pointsMap.set(String(wallet).toLowerCase(), Number(pts ?? 0));
      }

      // Collect all participants from matches (users with predictions but possibly 0 points)
      if (Array.isArray(state?.matches)) {
        for (const m of state.matches as any[]) {
          if (Array.isArray(m?.participants)) {
            for (const p of m.participants) {
              const hw = String(p ?? '').toLowerCase();
              if (hw && !pointsMap.has(hw)) pointsMap.set(hw, 0);
            }
          }
        }
      }

      const mapped: LbRow[] = Array.from(pointsMap.entries())
        .map(([wallet, totalPoints]) => ({
          rank: 0,
          wallet,
          totalPoints,
          matches: 0,
          exact: 0,
          outcome: 0,
        }))
        .filter((r) => !!r.wallet);

      mapped.sort((a, b) => {
        if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
        return a.wallet.localeCompare(b.wallet);
      });

      setRows(mapped.map((r, idx) => ({ ...r, rank: idx + 1 })));

      // Extract upcoming matches for sidebar widget
      if (Array.isArray(state?.matches)) {
        const now = Date.now();
        const upcoming = state.matches
          .filter((m: any) => {
            const ko = Number(m?.kick_off ?? 0);
            const ms = ko < 10_000_000_000 ? ko * 1000 : ko;
            const isFinalized = !!(m?.result?.Finalized || m?.result?.finalized);
            return !isFinalized && ms > now;
          })
          .sort((a: any, b: any) => {
            const aMs = kickOffToMs(Number(a.kick_off));
            const bMs = kickOffToMs(Number(b.kick_off));
            return aMs - bMs;
          })
          .slice(0, 3);
        setUpcomingMatches(upcoming);
      }
    } catch (e: any) {
      console.error(e);
      setRows([]);
      toast.error('Failed to fetch leaderboard (queryState)');
    } finally {
      setLoading(false);
    }
  }, [api, isApiReady, toast]);

  useEffect(() => {
    void fetchLeaderboard();
  }, [fetchLeaderboard]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.wallet.toLowerCase().includes(q));
  }, [query, rows]);

  const topEarnings = useMemo<EarningRow[]>(() => {
    return rows
      .filter((r) => r.totalPoints > 0)
      .slice(0, 3)
      .map((r) => ({ rank: r.rank, wallet: shortHex(r.wallet), points: r.totalPoints }));
  }, [rows]);

  const myRow = useMemo(() => {
    if (!myWalletHex) return null;
    const target = myWalletHex.toLowerCase();
    return rows.find((r) => r.wallet.toLowerCase() === target) ?? null;
  }, [rows, myWalletHex]);

  const myRank = myRow?.rank ?? null;
  const myPts = myRow?.totalPoints ?? 0;
  // TODO: myExact and myOutcome from contract per-user data
  const myExact = 0;
  const myOutcome = 0;

  const myLbRows = useMemo(() => {
    if (!followedWallets.length) return [];
    return rows.filter((r) => followedWallets.includes(r.wallet.toLowerCase()));
  }, [rows, followedWallets]);

  const handleJumpToMe = () => {
    if (!myWalletHex) return;
    const el = document.getElementById(`lb-row-${myWalletHex.toLowerCase()}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const displayRows = activeTab === 'My Leaderboard' ? myLbRows : filtered;

  return (
    <div className="lb lb--full">
      <div className="lb__bg" aria-hidden="true" />

      <header className="lbTop">
        <div className="lbTop__left">
          <button className="lbChip lbChip--active" type="button">
            <span className="lbChip__dot">🏆</span>
            World Cup 2026
            <span className="lbChip__sub">{loading ? 'Syncing…' : 'On-chain'}</span>
          </button>

          <button
            className="lbChip lbChip--ghost"
            aria-label="Refresh"
            type="button"
            onClick={fetchLeaderboard}
            title="Refresh">
            ⟳
          </button>
        </div>

        <div className="lbTop__right">
          <StyledWallet />
        </div>
      </header>

      <section className="lbSubnav">
        <div className="lbTabs" role="tablist" aria-label="Leaderboards tabs">
          {tabs.map((t) => (
            <button
              key={t}
              className={'lbTab ' + (activeTab === t ? 'lbTab--active' : '')}
              onClick={() => setActiveTab(t)}
              type="button"
              role="tab"
              aria-selected={activeTab === t}>
              {t}
            </button>
          ))}
        </div>

        <div className="lbSearch" role="search">
          <span className="lbSearch__icon" aria-hidden="true">
            ⌕
          </span>
          <input
            className="lbSearch__input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by address"
            aria-label="Search by address"
          />
        </div>
      </section>

      <section className="lbHeaderRow">
        <div className="lbTitle">
          <div className="lbTitle__main">{activeTab}</div>
          <div className="lbTitle__sub muted">World Cup 2026 • On-chain</div>
        </div>

        <div className="lbPager">
          <span className="muted tiny">{loading ? 'Loading…' : `Players: ${rows.length}`}</span>
          <button className="lbPage" type="button" onClick={fetchLeaderboard}>
            Refresh
          </button>
          <button className="lbPage lbPage--ghost" type="button" onClick={handleJumpToMe} disabled={!myWalletHex}>
            Jump to me
          </button>
        </div>
      </section>

      <main className="lbGrid">
        <section className="lbCard lbCard--table" aria-label="Leaderboard table">
          <div className="lbTable" ref={listRef}>
            {/* Table header */}
            <div className="lbTHead lbTHead--6col">
              <div>Pos.</div>
              <div>Wallet</div>
              <div className="lbTH--num">Matches</div>
              <div className="lbTH--num">Exact</div>
              <div className="lbTH--num">Outcome</div>
              <div className="lbTH--num lbTH--points">Points</div>
            </div>

            <div className="lbTBody">
              {activeTab === 'My Leaderboard' && !followedWallets.length ? (
                <div className="lbTable__foot muted tiny">
                  No wallets followed yet. Click <b>+</b> next to any player in Global Leaderboard to add them.
                </div>
              ) : loading ? (
                <div className="lbTable__foot muted tiny">Loading on-chain leaderboard…</div>
              ) : displayRows.length === 0 ? (
                <div className="lbTable__foot muted tiny">No wallets found.</div>
              ) : (
                displayRows.map((r) => {
                  const isMe = !!myWalletHex && r.wallet.toLowerCase() === myWalletHex.toLowerCase();
                  const medal = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : '•';
                  const isFollowed = followedWallets.includes(r.wallet.toLowerCase());

                  return (
                    <div
                      key={`${r.rank}-${r.wallet}`}
                      id={`lb-row-${r.wallet.toLowerCase()}`}
                      className={'lbTRow lbTRow--6col ' + (isMe ? 'lbTRow--me' : '')}>
                      <div className="lbRank">
                        <span className="lbMedal" aria-hidden="true">
                          {medal}
                        </span>
                        <span className="lbRank__no">#{r.rank}</span>
                      </div>

                      <div className="lbWalletCell mono" title={r.wallet}>
                        <span className="lbAvatar" aria-hidden="true" />
                        <span className="lbWalletCell__text">{shortHex(r.wallet)}</span>
                        {isMe ? <span className="lbMe">YOU</span> : null}
                        {/* Add to My Leaderboard button */}
                        <button
                          className={'lbFollowBtn ' + (isFollowed ? 'lbFollowBtn--active' : '')}
                          type="button"
                          title={isFollowed ? 'Remove from My Leaderboard' : 'Add to My Leaderboard'}
                          aria-label={isFollowed ? 'Remove from My Leaderboard' : 'Add to My Leaderboard'}
                          onClick={() => toggleFollow(r.wallet.toLowerCase())}>
                          {isFollowed ? '✓' : '+'}
                        </button>
                      </div>

                      {/* TODO: matches/exact/outcome from contract per-user data */}
                      <div className="lbNum lbNum--right">
                        <span className="lbNum__main lbNum__muted">—</span>
                      </div>
                      <div className="lbNum lbNum--right">
                        <span className="lbNum__main lbNum__muted">—</span>
                      </div>
                      <div className="lbNum lbNum--right">
                        <span className="lbNum__main lbNum__muted">—</span>
                      </div>

                      <div className="lbNum lbNum--right lbNum--points">
                        <span className="lbNum__main">{r.totalPoints}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        <aside className="lbRight">
          {/* Top Earnings — moved up per spec */}
          <section className="lbCard">
            <div className="lbCard__head">
              <div className="lbCard__title">Top Earnings</div>
              <div className="lbCard__sub muted tiny">World Cup</div>
            </div>

            <div className="lbEarnings">
              {loading ? (
                <div className="muted tiny" style={{ padding: '8px 0' }}>Loading…</div>
              ) : topEarnings.length === 0 ? (
                <div className="muted tiny" style={{ padding: '8px 0' }}>No data yet.</div>
              ) : (
                topEarnings.map((e) => (
                  <div className="lbEarnRow" key={e.rank}>
                    <div className="lbEarnRank">#{e.rank}</div>
                    <div className="lbEarnWallet">{e.wallet}</div>
                    <div className="lbEarnNum mono">{e.points} pts</div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Upcoming Matches — replaces R32 Bonus widget */}
          <section className="lbCard">
            <div className="lbCard__head">
              <div className="lbCard__title">Upcoming Matches</div>
              <div className="lbCard__sub muted tiny">Next to predict</div>
            </div>

            <div className="lbUpcoming">
              {upcomingMatches.length === 0 ? (
                <div className="muted tiny" style={{ padding: '8px 0' }}>No upcoming matches loaded.</div>
              ) : (
                upcomingMatches.map((m: any, i: number) => (
                  <div className="lbUpMatch" key={i}>
                    <div className="lbUpMatch__teams">
                      {m.home} vs {m.away}
                    </div>
                    <div className="lbUpMatch__meta muted tiny">
                      {(m.phase || '').replace(/_/g, ' ')} · {formatDateTime(kickOffToMs(Number(m.kick_off)))}
                    </div>
                    <button
                      className="lbBtn lbBtn--soft lbBtn--sm"
                      type="button"
                      onClick={() => navigate(`/2026worldcup/match/${m.match_id}`)}>
                      Predict
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="lbCard__foot">
              <button className="lbBtn lbBtn--ghost wfull" type="button" onClick={() => navigate('/all-matches')}>
                View all matches →
              </button>
            </div>
          </section>
        </aside>
      </main>

      <footer className="lbBottom" aria-label="Your rank sticky bar">
        <div className="lbBottom__left">
          <div className="lbBottom__label muted tiny">Your Rank</div>
          <div className="lbBottom__value">
            <span className="lbBottom__rank">{myRank ? `#${myRank}` : '—'}</span>
            <span className="dot">•</span>
            <span className="lbBottom__pts">{myPts}</span>
            <span className="lbBottom__ptsLabel muted tiny"> points</span>
            {myExact > 0 || myOutcome > 0 ? (
              <>
                <span className="dot">•</span>
                <span className="lbBottom__detail muted tiny">{myExact} exact · {myOutcome} outcomes</span>
              </>
            ) : null}
          </div>
          <div className="lbBottom__hint muted tiny">
            {myWalletHex ? `Wallet: ${shortHex(myWalletHex)}` : 'Connect wallet to see your rank'}
          </div>
        </div>

        <div className="lbBottom__right">
          <button className="lbBtn lbBtn--primary" type="button" onClick={handleJumpToMe} disabled={!myWalletHex}>
            Jump to me
          </button>
        </div>
      </footer>
    </div>
  );
}
