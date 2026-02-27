import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './leaderboards.css';
import { useAccount, useApi, useAlert } from '@gear-js/react-hooks';
import { web3Enable } from '@polkadot/extension-dapp';
import { decodeAddress } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';
import { Program, Service } from '@/hocs/lib';
import { StyledWallet } from '../wallet/Wallet';

const PROGRAM_ID = import.meta.env.VITE_BOLAOCOREPROGRAM as `0x${string}`;

type LbRow = {
  rank: number;
  wallet: string;
  totalPoints: number;
  matchPoints: number;
  tournamentBonus: number;
  exactPicks: number;
  delta?: number;
};

type BonusPick = { left: string; right: string };

type EarningRow = { rank: number; wallet: string; usdc: number; roi: number };

const bonusPicks: BonusPick[] = [
  { left: 'Argentina', right: 'France' },
  { left: 'Argentina', right: 'Brazil' },
  { left: 'Brazil', right: 'England' },
];

const topEarnings: EarningRow[] = [
  { rank: 1, wallet: '0x83…410', usdc: 1027, roi: 717 },
  { rank: 2, wallet: 'Moonpatterns', usdc: 978, roi: 689 },
  { rank: 3, wallet: '0x82…746', usdc: 835, roi: 609 },
];

const tabs = ['Overall Leaderboard', 'Match Performance', 'R32 Bonus (Picks)', 'Earnings / ROI'] as const;
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

type QueryStateResponse = { user_points?: Array<[string, number]> };

export default function Leaderboards() {
  const [activeTab, setActiveTab] = useState<Tab>('Overall Leaderboard');
  const [query, setQuery] = useState('');

  const { api, isApiReady } = useApi();
  const alert = useAlert();
  const { account } = useAccount();

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<LbRow[]>([]);

  const listRef = useRef<HTMLDivElement | null>(null);

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

      const mapped: LbRow[] = points
        .map(([wallet, totalPoints]) => ({
          rank: 0,
          wallet: String(wallet),
          totalPoints: Number(totalPoints ?? 0),
          matchPoints: Number(totalPoints ?? 0),
          tournamentBonus: 0,
          exactPicks: 0,
        }))
        .filter((r) => r.wallet);

      mapped.sort((a, b) => {
        if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
        return a.wallet.localeCompare(b.wallet);
      });

      setRows(mapped.map((r, idx) => ({ ...r, rank: idx + 1 })));
    } catch (e: any) {
      console.error(e);
      setRows([]);
      alert.error('Failed to fetch leaderboard (queryState)');
    } finally {
      setLoading(false);
    }
  }, [api, isApiReady, alert]);

  useEffect(() => {
    void fetchLeaderboard();
  }, [fetchLeaderboard]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.wallet.toLowerCase().includes(q));
  }, [query, rows]);

  const myRow = useMemo(() => {
    if (!myWalletHex) return null;
    const target = myWalletHex.toLowerCase();
    return rows.find((r) => r.wallet.toLowerCase() === target) ?? null;
  }, [rows, myWalletHex]);

  const myRank = myRow?.rank ?? null;
  const myPts = myRow?.totalPoints ?? 0;

  const handleJumpToMe = () => {
    if (!myWalletHex) return;
    const el = document.getElementById(`lb-row-${myWalletHex.toLowerCase()}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const showComingSoon = activeTab !== 'Overall Leaderboard';

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
          <div className="lbTitle__main">Leaderboard</div>
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
            <div className="lbTHead">
              <div>Rank</div>
              <div>Wallet</div>
              <div className="lbTH--num">Total</div>
              <div className="lbTH--num">Match</div>
              <div className="lbTH--num">Bonus</div>
              <div className="lbTH--num">Exact</div>
            </div>

            <div className="lbTBody">
              {showComingSoon ? (
                <div className="lbTable__foot muted tiny">Coming soon.</div>
              ) : loading ? (
                <div className="lbTable__foot muted tiny">Loading on-chain leaderboard…</div>
              ) : filtered.length === 0 ? (
                <div className="lbTable__foot muted tiny">No wallets found.</div>
              ) : (
                filtered.map((r) => {
                  const isMe = !!myWalletHex && r.wallet.toLowerCase() === myWalletHex.toLowerCase();
                  const medal = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : '•';

                  return (
                    <div
                      key={`${r.rank}-${r.wallet}`}
                      id={`lb-row-${r.wallet.toLowerCase()}`}
                      className={'lbTRow ' + (isMe ? 'lbTRow--me' : '')}>
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
                      </div>

                      <div className="lbNum">
                        <span className="lbNum__main">{r.totalPoints}</span>
                      </div>

                      <div className="lbNum">
                        <span className="lbNum__main">{r.matchPoints}</span>
                      </div>

                      <div className="lbNum">
                        <span className="lbNum__main">{r.tournamentBonus}</span>
                      </div>

                      <div className="lbNum">
                        <span className="lbNum__main">{r.exactPicks}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        <aside className="lbRight">
          <section className="lbCard">
            <div className="lbCard__head">
              <div className="lbCard__title">Tournament Bonus: R32 Picks</div>
              <div className="lbCard__sub muted tiny">Preview</div>
            </div>

            <div className="lbPickList">
              {bonusPicks.map((p, i) => (
                <div className="lbPick" key={i}>
                  <span className="lbPick__icon" aria-hidden="true">
                    🔥
                  </span>
                  <div className="lbPick__teams">
                    <div className="lbPick__team">{p.left}</div>
                    <div className="lbPick__vs muted tiny">vs</div>
                    <div className="lbPick__team">{p.right}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="lbCard__foot">
              <button className="lbBtn lbBtn--soft wfull" type="button">
                View all R32 picks
              </button>
            </div>
          </section>

          <section className="lbCard">
            <div className="lbCard__head">
              <div className="lbCard__title">Top Earnings</div>
              <div className="lbCard__sub muted tiny">World Cup</div>
            </div>

            <div className="lbEarnings">
              {topEarnings.map((e) => (
                <div className="lbEarnRow" key={e.rank}>
                  <div className="lbEarnRank">#{e.rank}</div>
                  <div className="lbEarnWallet">{e.wallet}</div>
                  <div className="lbEarnNum mono">{e.usdc} USDC</div>
                  <div className="lbEarnRoi">+{e.roi}%</div>
                </div>
              ))}
            </div>

            <div className="lbCard__foot">
              <button className="lbBtn lbBtn--ghost wfull" type="button">
                View all earnings →
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
