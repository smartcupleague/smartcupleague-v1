import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './match.css';
import { MatchCard, BreakdownData } from './MatchCard';
import { Layout } from './Layout';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAccount, useApi } from '@gear-js/react-hooks';
import { web3Enable } from '@polkadot/extension-dapp';
import { Program, Service } from '@/hocs/lib';
import { HexString } from '@gear-js/api';
import { TEAM_FLAGS } from '@/utils/teams';
import { StyledWallet } from '@/components/wallet/Wallet';
import { decodeAddress } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';

const PROGRAM_ID = import.meta.env.VITE_BOLAOCOREPROGRAM as string;

function normalizeTeamKey(team: string) {
  return (team || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

function flagForTeam(teamName: string) {
  const key = normalizeTeamKey(teamName);
  return TEAM_FLAGS[key] || '/flags/default.png';
}

type ResultStatus = any;

type MatchInfo = {
  match_id: string;
  phase?: string;
  home: string;
  away: string;
  kick_off?: string;
  result?: ResultStatus;
  match_prize_pool?: string;
  total_pool?: string;
  pool_home?: string;
  pool_draw?: string;
  pool_away?: string;
  participants?: string[];
};

type IoBolaoState = {
  matches: MatchInfo[];
  final_prize_accumulated?: string | number | bigint;
  final_prize_accum?: string | number | bigint;
  user_points?: Array<[string, number]>;
};

const VARA_DECIMALS = 12;

function safeBigInt(input: unknown): bigint {
  try {
    if (typeof input === 'bigint') return input;
    if (typeof input === 'number') return BigInt(Math.trunc(input));
    if (typeof input === 'string') return BigInt((input || '0').trim());
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

function formatAddress(addr?: string, start = 4, end = 4) {
  if (!addr) return '—';
  if (addr.length <= start + end) return addr;
  return `${addr.slice(0, start)}…${addr.slice(-end)}`;
}


function formatVaraFromPlanck(planck: bigint) {
  const s = planck.toString().padStart(13, '0');
  const intPart = s.slice(0, -12);
  const frac = s.slice(-12).replace(/0+$/, '');
  return frac ? `${intPart || '0'}.${frac}` : intPart || '0';
}

function getCurrentScore(result?: ResultStatus): { home: number; away: number } {
  if (!result) return { home: 0, away: 0 };

  if (result.Finalized?.score)
    return { home: Number(result.Finalized.score.home ?? 0) || 0, away: Number(result.Finalized.score.away ?? 0) || 0 };
  if (result.Proposed?.score)
    return { home: Number(result.Proposed.score.home ?? 0) || 0, away: Number(result.Proposed.score.away ?? 0) || 0 };

  if (result.finalized?.score)
    return { home: Number(result.finalized.score.home ?? 0) || 0, away: Number(result.finalized.score.away ?? 0) || 0 };
  if (result.proposed?.score)
    return { home: Number(result.proposed.score.home ?? 0) || 0, away: Number(result.proposed.score.away ?? 0) || 0 };

  return { home: 0, away: 0 };
}

function Match() {
  // Support both /2026worldcup/match/:id and legacy /match/:id
  const { id: rawId } = useParams<{ id: string }>();
  const { api, isApiReady } = useApi();
  const { account } = useAccount();
  const navigate = useNavigate();

  const matchId = useMemo(() => String(rawId ?? '').trim(), [rawId]);

  const [state, setState] = useState<IoBolaoState | null>(null);
  const [loadingState, setLoadingState] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        await web3Enable('Vara Bolao Match Page');
      } catch { }
    })();
  }, []);

  const program = useMemo(() => {
    if (!api || !isApiReady) return null;
    if (!PROGRAM_ID) return null;
    return new Program(api, PROGRAM_ID as HexString);
  }, [api, isApiReady]);

  const fetchState = useCallback(async () => {
    if (!program) {
      setLoadingState(true);
      return;
    }

    setLoadingState(true);
    setError(null);

    try {
      const svc = new Service(program);
      const s = (await svc.queryState()) as any;

      const matches: MatchInfo[] = (Array.isArray(s?.matches) ? s.matches : []).map((m: any) => ({
        match_id: String(m?.match_id ?? '').trim(),
        phase: String(m?.phase ?? ''),
        home: String(m?.home ?? ''),
        away: String(m?.away ?? ''),
        kick_off: String(m?.kick_off ?? '0'),

        match_prize_pool: m?.match_prize_pool != null ? String(m.match_prize_pool) : undefined,
        total_pool: m?.total_pool != null ? String(m.total_pool) : undefined,
        pool_home: m?.pool_home != null ? String(m.pool_home) : '0',
        pool_draw: m?.pool_draw != null ? String(m.pool_draw) : '0',
        pool_away: m?.pool_away != null ? String(m.pool_away) : '0',
        participants: Array.isArray(m?.participants) ? m.participants.map(String) : [],
        result: m?.result ?? null,
      }));

      const user_points: Array<[string, number]> = Array.isArray(s?.user_points)
        ? s.user_points.map((it: any) => [String(it?.[0] ?? ''), Number(it?.[1] ?? 0)] as [string, number])
        : [];

      setState({
        matches,
        final_prize_accumulated: s?.final_prize_accumulated ?? undefined,
        final_prize_accum: s?.final_prize_accum ?? undefined,
        user_points,
      });
    } catch (e: any) {
      setState(null);
      setError(e?.message ? String(e.message) : 'Failed to load state');
    } finally {
      setLoadingState(false);
    }
  }, [program]);

  useEffect(() => {
    void fetchState();
  }, [fetchState]);

  const selectedMatch = useMemo(() => {
    if (!matchId || !state?.matches?.length) return null;
    const idNorm = String(matchId).trim();
    return state.matches.find((m) => String(m.match_id).trim() === idNorm) ?? null;
  }, [matchId, state?.matches]);

  const currentScore = useMemo(() => getCurrentScore(selectedMatch?.result), [selectedMatch?.result]);
  const currentScoreText = useMemo(
    () => `${currentScore.home ?? 0}-${currentScore.away ?? 0}`,
    [currentScore.home, currentScore.away],
  );

  const matchProps = useMemo(() => {
    if (!matchId) return null;

    if (selectedMatch) {
      return {
        id: String(selectedMatch.match_id),

        flag1: flagForTeam(selectedMatch.home),
        flag2: flagForTeam(selectedMatch.away),
        currentScoreText,
        currentScore,
      };
    }

    return null;
  }, [matchId, selectedMatch, currentScoreText, currentScore]);

  // User bets for this wallet
  const [userBets, setUserBets] = useState<any[]>([]);
  const [showMatchInfoModal, setShowMatchInfoModal] = useState(false);
  const [breakdown, setBreakdown] = useState<BreakdownData>({ show: false, matchPool: 0n, finalPrize: 0n, protocolFee: 0n });

  const myWalletHex = useMemo(() => {
    const addr = account?.decodedAddress ?? (account as any)?.address ?? null;
    if (!addr) return null;
    try {
      if (typeof addr === 'string' && addr.startsWith('0x')) return addr.toLowerCase();
      const u8a = decodeAddress(addr);
      return u8aToHex(u8a).toLowerCase();
    } catch { return null; }
  }, [account]);

  const fetchUserBets = useCallback(async () => {
    if (!program || !account) return;
    try {
      const svc = new Service(program);
      const bets = (await (svc as any).queryBetsByUser(account.decodedAddress)) as any[];
      setUserBets(Array.isArray(bets) ? bets : []);
    } catch { setUserBets([]); }
  }, [program, account]);

  useEffect(() => { void fetchUserBets(); }, [fetchUserBets]);

  // User rank & points from user_points
  const userRankInfo = useMemo(() => {
    if (!myWalletHex || !state?.user_points?.length) return { rank: null as number | null, points: 0 };
    const sorted = [...(state.user_points ?? [])].sort((a, b) => Number(b[1]) - Number(a[1]));
    const idx = sorted.findIndex(([w]) => w.toLowerCase() === myWalletHex);
    return { rank: idx >= 0 ? idx + 1 : null, points: idx >= 0 ? Number(sorted[idx][1]) : 0 };
  }, [state?.user_points, myWalletHex]);

  // Per-user stats from bets
  const userBetStats = useMemo(() => {
    if (!userBets.length || !state?.matches) return { matchesPredicted: 0, exactResults: 0, correctOutcomes: 0 };
    let exact = 0, outcome = 0;
    for (const b of userBets) {
      const mid = String(b?.match_id ?? '');
      const m = state.matches.find((x) => String(x.match_id) === mid);
      if (!m) continue;
      const fin = (m.result as any)?.Finalized ?? (m.result as any)?.finalized;
      if (!fin?.score) continue;
      const fs = { home: Number(fin.score.home ?? 0), away: Number(fin.score.away ?? 0) };
      const bs = { home: Number(b?.score?.home ?? 0), away: Number(b?.score?.away ?? 0) };
      if (bs.home === fs.home && bs.away === fs.away) { exact++; outcome++; continue; }
      const fOut = fs.home > fs.away ? 1 : fs.home < fs.away ? -1 : 0;
      const bOut = bs.home > bs.away ? 1 : bs.home < bs.away ? -1 : 0;
      if (fOut !== 0 && bOut === fOut) outcome++;
    }
    return { matchesPredicted: userBets.length, exactResults: exact, correctOutcomes: outcome };
  }, [userBets, state?.matches]);

  // User's bet for the current match
  const userBetForThisMatch = useMemo(() => {
    if (!matchId || !userBets.length) return null;
    return userBets.find((b) => String(b?.match_id) === String(matchId)) ?? null;
  }, [userBets, matchId]);

  // Pool percentages for bars
  const poolPercentages = useMemo(() => {
    if (!selectedMatch) return { home: 33, draw: 34, away: 33 };
    const h = Math.max(0, Number(selectedMatch.pool_home ?? 0));
    const d = Math.max(0, Number(selectedMatch.pool_draw ?? 0));
    const a = Math.max(0, Number(selectedMatch.pool_away ?? 0));
    const total = h + d + a;
    if (total <= 0) return { home: 33, draw: 34, away: 33 };
    return {
      home: Math.round((h / total) * 100),
      draw: Math.round((d / total) * 100),
      away: 100 - Math.round((h / total) * 100) - Math.round((d / total) * 100),
    };
  }, [selectedMatch]);

  const addressDisplay = formatAddress(account?.decodedAddress);

  const homeName = selectedMatch?.home ?? '—';
  const awayName = selectedMatch?.away ?? '—';

  return (
    <Layout>
      <div>
        <div className="arena__frame">
          <header className="arena__topbar">
            <div className="arena__topbarLeft">
              <button
                className="arena__backBtn"
                type="button"
                onClick={() => navigate(-1)}
                aria-label="Go back">
                ← Back
              </button>
              <button
                className="arena__logoBtn arena__logoBtn--sm"
                type="button"
                onClick={() => navigate('/progress')}
                aria-label="Home">
                <img className="logo-xs" src="/Logos.png" alt="SmartCup League" />
              </button>
            </div>

            <div className="arena__topbarRight">
              <div className="arena__walletGroup">
                <div className="arena__address dim">
                  {addressDisplay !== '—' ? addressDisplay : 'Not connected'}
                </div>
                <StyledWallet />
              </div>
            </div>
          </header>

          <div className="arena__grid">
            <aside className="left-column">
              <div className="sideCard">
                <div className="sideCard__title">YOUR TOURNAMENT STATS</div>
                <div className="sideRows">
                  <div className="sideRow">
                    <span className="dim">Position</span>
                    <b>{userRankInfo.rank ? `#${userRankInfo.rank}` : '—'}</b>
                  </div>
                  <div className="sideRow">
                    <span className="dim">Points</span>
                    <b>{account ? userRankInfo.points : '—'}</b>
                  </div>
                  <div className="sideRow">
                    <span className="dim">Matches Predicted</span>
                    <b>{account ? userBetStats.matchesPredicted : '—'}</b>
                  </div>
                  <div className="sideRow">
                    <span className="dim">Exact Results</span>
                    <b>{account ? userBetStats.exactResults : '—'}</b>
                  </div>
                  <div className="sideRow">
                    <span className="dim">Correct Outcomes</span>
                    <b>{account ? userBetStats.correctOutcomes : '—'}</b>
                  </div>
                  <div className="sideDivider" />
                  <div className="sideRow">
                    <span className="dim">Match Phase</span>
                    <b className="arena__phaseCenter">{(selectedMatch?.phase || '').replace(/_/g, ' ') || 'Group Stage'}</b>
                  </div>
                </div>
              </div>

              <div className="sideCard">
                <div className="sideCard__title">
                  CURRENT MATCH POOL
                  <button
                    className="arena__infoBtn"
                    type="button"
                    onClick={() => setShowMatchInfoModal(true)}
                    aria-label="Pool info"
                    title="How this pool works"
                  >ⓘ</button>
                </div>
                <div className="sideRow">
                  <span className="dim">Total</span>
                  <b>
                    {selectedMatch
                      ? `${formatToken(selectedMatch.match_prize_pool ?? selectedMatch.total_pool ?? '0')} VARA`
                      : `0 VARA`}
                  </b>
                </div>

                <div className="barGroup">
                  <div className="barRow">
                    <span>{homeName}</span>
                    <span className="dim">{poolPercentages.home}%</span>
                  </div>
                  <div className="bar">
                    <i style={{ width: `${poolPercentages.home}%` }} />
                  </div>

                  <div className="barRow">
                    <span>Draw</span>
                    <span className="dim">{poolPercentages.draw}%</span>
                  </div>
                  <div className="bar">
                    <i style={{ width: `${poolPercentages.draw}%` }} />
                  </div>

                  <div className="barRow">
                    <span>{awayName}</span>
                    <span className="dim">{poolPercentages.away}%</span>
                  </div>
                  <div className="bar">
                    <i style={{ width: `${poolPercentages.away}%` }} />
                  </div>
                </div>

                <div className="sideHint dim">Larger pool → lower payout per winner</div>

                {userBetForThisMatch && (
                  <div className="sideUserBet">
                    <div className="sideCard__title" style={{ marginTop: 12 }}>YOUR PREDICTION</div>
                    <div className="sideRow">
                      <span className="dim">Score pick</span>
                      <b>{userBetForThisMatch.score?.home ?? 0}-{userBetForThisMatch.score?.away ?? 0}</b>
                    </div>
                    <div className="sideRow">
                      <span className="dim">Stake</span>
                      <b>{formatToken(userBetForThisMatch.stake_in_match_pool ?? '0')} VARA</b>
                    </div>
                    <div className="sideRow">
                      <span className="dim">Status</span>
                      <b>{userBetForThisMatch.claimed ? 'Claimed ✓' : 'Pending'}</b>
                    </div>
                  </div>
                )}
              </div>

              {breakdown.show && (
                <div className="sideCard">
                  <div className="sideCard__title">PREDICTION $ DISTRIBUTION</div>
                  <div className="mcx__breakdown">
                    <div className="mcx__bdRow">
                      <span className="dim">Match pool (85%)</span>
                      <b>{formatVaraFromPlanck(breakdown.matchPool)} VARA</b>
                    </div>
                    <div className="mcx__bdRow">
                      <span className="dim">Final Prize Pool (10%)</span>
                      <b>{formatVaraFromPlanck(breakdown.finalPrize)} VARA</b>
                    </div>
                    <div className="mcx__bdRow">
                      <span className="dim">Protocol Fee (5%)</span>
                      <b>{formatVaraFromPlanck(breakdown.protocolFee)} VARA</b>
                    </div>
                  </div>
                </div>
              )}

              <div className="sideCard">
                <div className="sideCard__title">WHAT IF NO ONE IS CORRECT?</div>
                <div className="sideCallout">
                  If no one predicts correctly, the match pool goes to the Final Prize Pool.
                </div>
              </div>

              <div className="sideCard">
                <div className="sideCard__title">FAIR &amp; SAFE PREDICTIONS</div>
                <ul className="checkList">
                  <li>Non-custodial</li>
                  <li>Pari-mutuel (no house odds)</li>
                  <li>Oracle-verified results</li>
                  <li>DAO governed fees</li>
                </ul>
              </div>
            </aside>

            {showMatchInfoModal && (
              <div className="mcx__infoOverlay" role="dialog" aria-modal="true">
                <div className="mcx__infoPanel">
                  <button className="mcx__infoClose" onClick={() => setShowMatchInfoModal(false)} type="button">✕</button>
                  <h3 className="mcx__infoTitle">How Rewards Work</h3>
                  <p>SmartCup uses a <b>pari-mutuel pool system</b>, where players compete against each other — not against fixed odds.</p>
                  <p><b>When you place a prediction:</b></p>
                  <ul className="mcx__infoList">
                    <li>85% → Match winner pool</li>
                    <li>10% → Final Prize Pool</li>
                    <li>5% → Protocol Fee</li>
                  </ul>
                  <p><b>After the match ends:</b></p>
                  <ul className="mcx__infoList">
                    <li>The match pool is shared among all correct predictions</li>
                    <li>Your final reward depends on how many players predicted the same outcome</li>
                  </ul>
                  <p><b>Important:</b></p>
                  <ul className="mcx__infoList">
                    <li>Rewards are not fixed</li>
                    <li>The estimated reward updates as more players join</li>
                    <li>In crowded outcomes, rewards can be lower than your entry amount</li>
                  </ul>
                  <a href="/rules" target="_blank" rel="noopener noreferrer" className="mcx__infoLink">View full rules →</a>
                </div>
              </div>
            )}

            <section className="main-column">
              <div className="mainPanel mainPanel--fill">
                {matchProps ? (
                  <div className="matchCardWrap matchCardWrap--fill">
                    <MatchCard {...matchProps} currentScore={currentScore} currentScoreText={currentScoreText} onBreakdownChange={setBreakdown} />
                  </div>
                ) : (
                  <div className="mainPanel__empty">
                    <div className="mainPanel__kicker">Match not found</div>
                    <div className="dim">
                      {loadingState ? 'Loading match…' : `The selected match does not exist. (id: ${matchId || '—'})`}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>


          <footer className="match-footer">
            <span>© 2026 SmartCup League</span>
            <span className="match-footer__sep">·</span>
            <Link to="/terms-of-use" className="match-footer__link">Terms of Use</Link>
            <span className="match-footer__sep">·</span>
            <Link to="/dao-constitution" className="match-footer__link">DAO Constitution</Link>
          </footer>
        </div>
      </div>
    </Layout>
  );
}

export default Match;
