import React, { useEffect, useState, useCallback, useMemo } from 'react';
import './all-matchs.css';
import { useApi, useAccount } from '@gear-js/react-hooks';
import { web3Enable, web3FromSource } from '@polkadot/extension-dapp';
import { Program, Service } from '@/hocs/lib';
import { useNavigate } from 'react-router-dom';
import { TransactionBuilder } from 'sails-js';
import { useToast } from '@/hooks/useToast';
import { HexString } from '@gear-js/api';
import { TEAM_FLAGS } from '@/utils/teams';

const PROGRAM_ID = import.meta.env.VITE_BOLAOCOREPROGRAM as string;

function normalizeTeamKey(team: string) {
  return (team || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

function flagForTeam(teamName: string) {
  const key = normalizeTeamKey(teamName);
  return TEAM_FLAGS[key] || '/flags/default.png';
}

type MatchInfo = {
  match_id: string;
  phase: string;
  home: string;
  away: string;
  kick_off: string;
  result: any;
  match_prize_pool: string;
  has_bets: boolean;
  total_winner_stake?: string;
  total_claimed?: string;
  settlement_prepared?: boolean;
  dust_swept?: boolean;
};

function getResultDetails(result: any): {
  label: 'OPEN' | 'LIVE' | 'FINAL';
  home: number;
  away: number;
  penaltyWinner: string | null;
} {
  try {
    if (result?.Finalized?.score) {
      const s = result.Finalized.score;
      return { label: 'FINAL', home: Number(s.home ?? 0) || 0, away: Number(s.away ?? 0) || 0, penaltyWinner: null };
    }
    if (result?.Proposed?.score) {
      const s = result.Proposed.score;
      return { label: 'LIVE', home: Number(s.home ?? 0) || 0, away: Number(s.away ?? 0) || 0, penaltyWinner: null };
    }

    if (result?.finalized?.score) {
      const s = result.finalized.score;
      return {
        label: 'FINAL',
        home: Number(s.home ?? 0) || 0,
        away: Number(s.away ?? 0) || 0,
        penaltyWinner: result.finalized?.penalty_winner ?? null,
      };
    }
    if (result?.proposed?.score) {
      const s = result.proposed.score;
      return { label: 'LIVE', home: Number(s.home ?? 0) || 0, away: Number(s.away ?? 0) || 0, penaltyWinner: null };
    }

    return { label: 'OPEN', home: 0, away: 0, penaltyWinner: null };
  } catch {
    return { label: 'OPEN', home: 0, away: 0, penaltyWinner: null };
  }
}

function formatDatetime(kickOff: string) {
  const n = Number(kickOff);
  if (!Number.isFinite(n) || n <= 0) return '-';
  const ms = n < 10_000_000_000 ? n * 1000 : n;
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    year: '2-digit',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function closesLabel(kickOff: string) {
  const n = Number(kickOff);
  if (!Number.isFinite(n) || n <= 0) return '—';

  const ms = n < 10_000_000_000 ? n * 1000 : n;
  const closesAt = ms - 10 * 60 * 1000;
  const diff = closesAt - Date.now();
  if (diff <= 0) return 'Closed';

  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `Closes in ${mins}m`;

  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `Closes in ${hrs}h ${rem}m`;
}

function formatAmount(val: unknown, decimals = 12) {
  if (val === null || val === undefined) return '—';

  if (typeof val === 'string') {
    const s = val.trim();
    if (!s || s === '—' || s === '-') return '—';
    const cleaned = s.replace(/,/g, '');
    if (!/^-?\d+$/.test(cleaned)) return '—';
    val = cleaned;
  }

  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return '—';
    val = Math.trunc(val);
  }

  try {
    const bn = typeof val === 'bigint' ? val : BigInt(val as any);
    const divisor = BigInt(10) ** BigInt(decimals);
    const intVal = bn / divisor;
    const frac = (bn % divisor).toString().padStart(decimals, '0').replace(/0+$/, '');
    return frac ? `${intVal.toString()}.${frac}` : intVal.toString();
  } catch {
    return '—';
  }
}

export const MatchesTableComponent: React.FC = () => {
  const { api, isApiReady } = useApi();
  const { account } = useAccount();
  const toast = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<MatchInfo[] | null>(null);

  const [tab, setTab] = useState<'wc'>('wc');
  const [headerSearch, setHeaderSearch] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  const [claimLoadingId, setClaimLoadingId] = useState<string | null>(null);

  useEffect(() => {
    void web3Enable('Bolao Matches UI');
  }, []);

  const fetchMatches = useCallback(async () => {
    if (!api || !isApiReady) return;
    setLoading(true);

    try {
      const svc = new Service(new Program(api, PROGRAM_ID as HexString));
      const state = await (svc as any).queryState();
      const list = (state as any)?.matches ?? [];

      const normalized: MatchInfo[] = (Array.isArray(list) ? list : []).map((m: any) => ({
        match_id: String(m?.match_id ?? ''),
        phase: String(m?.phase ?? ''),
        home: String(m?.home ?? ''),
        away: String(m?.away ?? ''),
        kick_off: String(m?.kick_off ?? '0'),
        result: m?.result ?? null,
        match_prize_pool: String(m?.match_prize_pool ?? '0'),
        has_bets: Boolean(m?.has_bets),

        total_winner_stake: m?.total_winner_stake != null ? String(m.total_winner_stake) : undefined,
        total_claimed: m?.total_claimed != null ? String(m.total_claimed) : undefined,
        settlement_prepared: m?.settlement_prepared != null ? Boolean(m.settlement_prepared) : undefined,
        dust_swept: m?.dust_swept != null ? Boolean(m.dust_swept) : undefined,
      }));

      setMatches(normalized);
    } catch (e) {
      console.error('fetchMatches error', e);
      setMatches(null);
    } finally {
      setLoading(false);
    }
  }, [api, isApiReady]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  const filteredMatches = useMemo(() => {
    const q = (filterSearch || headerSearch).trim().toLowerCase();
    if (!q) return matches ?? [];
    return (matches ?? []).filter((m) => {
      const s = `${m.home} ${m.away} ${m.match_id} ${m.phase}`.toLowerCase();
      return s.includes(q);
    });
  }, [matches, filterSearch, headerSearch]);

  const handleClaim = useCallback(
    async (matchId: string) => {
      if (!api || !isApiReady) {
        toast.error('Node API is not ready');
        return;
      }
      if (!account) {
        toast.error('Please connect your wallet');
        return;
      }

      try {
        setClaimLoadingId(matchId);
        const svc = new Service(new Program(api, PROGRAM_ID as HexString));

        const tx: TransactionBuilder<unknown> = (svc as any).claimPrize(BigInt(matchId));

        const { signer } = await web3FromSource(account.meta.source);
        tx.withAccount(account.decodedAddress, { signer }).withValue(0n);

        await tx.calculateGas();
        const { blockHash, response } = await tx.signAndSend();
        toast.info(`Claim included in block ${blockHash}`);
        await response();
        toast.success('Reward claimed ✅');

        setTimeout(fetchMatches, 900);
      } catch (e) {
        console.error(e);
        toast.error('Claim failed');
      } finally {
        setClaimLoadingId(null);
      }
    },
    [api, isApiReady, account, toast, fetchMatches],
  );

  return (
    <div className="mxShell">
      <header className="mxTop">
        <div className="mxTop__row">
          <div className="mxTitle">
            <h1>Matches</h1>
            <p>Browse markets, live scores, pools, and predict outcomes.</p>
          </div>

          <div className="mxTop__right">
            <div className="mxSearch" role="search">
              <span className="mxSearch__icon" aria-hidden="true">
                ⌕
              </span>
              <input
                value={headerSearch}
                onChange={(e) => setHeaderSearch(e.target.value)}
                placeholder="Search teams, match ID, phase..."
                aria-label="Search teams, match ID, phase"
              />
            </div>

            <div className="mxShortcuts">
              <button className="mxBtn mxBtn--soft" onClick={() => navigate('/my-predictions')} type="button">
                My Predictions
              </button>
              <button className="mxBtn mxBtn--soft" onClick={() => navigate('/leaderboards')} type="button">
                Leaderboard
              </button>
              <button className="mxBtn mxBtn--soft" onClick={() => navigate('/final-prizes')} type="button">
                Final Prize
              </button>
            </div>
          </div>
        </div>

        <div className="mxTabs" role="tablist" aria-label="Tournament tabs">
          <button
            className={'mxTab ' + (tab === 'wc' ? 'is-active' : '')}
            onClick={() => setTab('wc')}
            type="button"
            role="tab">
            World Cup 2026
          </button>
        </div>

        <div className="mxInfo">
          <div className="mxInfo__left">
            <span className="mxPill">Bet closes 10m before kickoff</span>
            <span className="mxPill">75% Match / 20% Final / 5% DAO</span>
            <span className="mxPill">On-chain pools</span>
            <span className="mxPill mxPill--live">LIVE</span>
          </div>
          <div className="mxInfo__right">
            <button className="mxBtn mxBtn--ghost" type="button" onClick={fetchMatches}>
              Refresh
            </button>
          </div>
        </div>
      </header>

      <div className="mxSection">
        <div className="mxSection__title">
          <div className="mxSection__main">World Cup 2026</div>
          <div className="mxSection__sub">All phases</div>
        </div>

        {loading ? (
          <div className="mxLoading">
            <span className="mxSpinner" aria-hidden="true" /> Loading matches…
          </div>
        ) : filteredMatches.length > 0 ? (
          <div className="mxList">
            {filteredMatches.map((m) => {
              const r = getResultDetails(m.result);
              const totalPoolHuman = formatAmount(m.match_prize_pool, 12);

              const statusText =
                r.label === 'FINAL'
                  ? `Final score ${r.home}-${r.away}.`
                  : r.label === 'LIVE'
                    ? `Live now ${r.home}-${r.away} (proposed).`
                    : `Open for predictions • ${closesLabel(m.kick_off)}.`;

              return (
                <article className="mxCard" key={m.match_id}>
                  <div className="mxCard__top">
                    <div className="mxTeams" title={`${m.home} vs ${m.away}`}>
                      <div className="mxTeam">
                        <img className="mxFlag" src={flagForTeam(m.home)} alt={`${m.home} flag`} loading="lazy" />
                        <span className="mxTeam__name">{m.home}</span>
                      </div>

                      <span className="mxVs">vs</span>

                      <div className="mxTeam mxTeam--right">
                        <span className="mxTeam__name">{m.away}</span>
                        <img className="mxFlag" src={flagForTeam(m.away)} alt={`${m.away} flag`} loading="lazy" />
                      </div>

                      <span className={'mxStatus mxStatus--' + r.label.toLowerCase()}>
                        {r.label === 'OPEN' ? 'OPEN' : r.label === 'LIVE' ? 'LIVE' : 'FINAL'}
                      </span>
                    </div>

                    <div className="mxCard__topRight">
                      {r.label !== 'FINAL' ? <span className="mxPill">{closesLabel(m.kick_off)}</span> : null}

                      {r.label === 'FINAL' ? (
                        <button
                          className="mxBtn mxBtn--claim"
                          onClick={() => handleClaim(m.match_id)}
                          disabled={claimLoadingId === m.match_id}
                          type="button">
                          {claimLoadingId === m.match_id ? 'Claiming…' : 'Claim'}
                        </button>
                      ) : (
                        <button
                          className="mxBtn mxBtn--primary"
                          onClick={() => navigate(`/match/${m.match_id}`)}
                          type="button">
                          Predict
                        </button>
                      )}
                    </div>

                    <div className="mxStatusLine">{statusText}</div>
                  </div>

                  <div className="mxCard__mid">
                    <div className="mxMeta">
                      <span className="mxMeta__chip">#{m.match_id}</span>
                      <span className="mxMeta__chip">{m.phase}</span>
                      <span className="mxMeta__chip">{formatDatetime(m.kick_off)}</span>
                      <span className="mxMeta__chip">{m.has_bets ? 'Has bets ✓' : 'No bets'}</span>
                      <span className="mxMeta__chip">Pool: {totalPoolHuman} VARA</span>
                    </div>

                    <div className="mxScore">
                      <div className="mxScore__label">
                        {r.label === 'OPEN' ? 'OPEN' : r.label === 'LIVE' ? 'LIVE SCORE' : 'FINAL SCORE'}
                      </div>
                      <div className="mxScore__value">
                        {r.home}-{r.away}
                      </div>
                      <div className="mxScore__sub">
                        {r.label === 'FINAL' ? 'On-chain finalized result' : 'On-chain proposed score'}
                      </div>
                    </div>

                    <div className="mxPools">
                      <div className="mxPool">
                        <div className="mxPool__k">Match Prize Pool</div>
                        <div className="mxPool__v">{totalPoolHuman} VARA</div>
                      </div>

                      <div className="mxActions">
                        <button
                          className="mxBtn mxBtn--soft"
                          onClick={() => navigate(`/match/${m.match_id}`)}
                          type="button">
                          Details
                        </button>
                        <button
                          className="mxBtn mxBtn--ghost"
                          onClick={() => navigate(`/match/${m.match_id}`)}
                          type="button">
                          View
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mxEmpty">No matches registered.</div>
        )}
      </div>
    </div>
  );
};
