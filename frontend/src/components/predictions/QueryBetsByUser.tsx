import React, { useState, useEffect, useCallback, useMemo } from 'react';
import './my-predictions.css';
import { useAccount, useAlert, useApi } from '@gear-js/react-hooks';
import { web3Enable, web3FromSource } from '@polkadot/extension-dapp';
import { Program, Service } from '@/hocs/lib';
import { TransactionBuilder } from 'sails-js';
import { TEAM_FLAGS } from '@/utils/teams';
import { Header } from '../layout';

const PROGRAM_ID = import.meta.env.VITE_BOLAOCOREPROGRAM;

type Score = { home: number; away: number };
type PenaltyWinner = 'Home' | 'Away' | undefined;

type PhaseConfig = {
  name: string;
  start_time: string;
  end_time: string;
  points_weight: number;
};

type ContractUserBetView = {
  match_id: number;
  score: Score;
  penalty_winner?: any;
  stake_in_match_pool: string | number | bigint;
  claimed: boolean;
};

type MatchInfo = {
  match_id: string;
  phase: string;
  home: string;
  away: string;
  kick_off: string;
  result: any;
  match_prize_pool: string;
  has_bets: boolean;

  total_claimed?: string;
  total_winner_stake?: string;
  settlement_prepared?: boolean;
  dust_swept?: boolean;
};

function normalizeTeamKey(team: string) {
  return (team || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

function flagForTeam(team: string) {
  const key = normalizeTeamKey(team);
  return TEAM_FLAGS[key] || '/flags/default.png';
}

function kickOffToMs(kickOff: string): number {
  const n = Number(kickOff);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n < 10_000_000_000 ? n * 1000 : n;
}

function formatKickoff(kickOff: string) {
  const ms = kickOffToMs(kickOff);
  if (!ms) return '—';
  return new Date(ms).toLocaleString(undefined, {
    year: '2-digit',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAmount(val: string | number | bigint, decimals = 12) {
  if (val === null || val === undefined) return '—';
  const bn = typeof val === 'bigint' ? val : BigInt(val);
  const divisor = BigInt(10) ** BigInt(decimals);
  const intVal = bn / divisor;
  const frac = (bn % divisor).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${intVal.toString()}.${frac}` : intVal.toString();
}

function toBn(val: string | number | bigint): bigint {
  try {
    if (typeof val === 'bigint') return val;
    if (typeof val === 'number') return BigInt(Math.floor(val));
    const s = String(val ?? '0').trim();
    if (!s) return 0n;
    return BigInt(s);
  } catch {
    return 0n;
  }
}

function parsePenaltyWinner(v: any): PenaltyWinner {
  if (!v) return undefined;
  if (v === 'Home' || v === 'Away') return v;
  if (typeof v === 'string') {
    const s = v.trim();
    if (s === 'Home' || s === 'Away') return s as PenaltyWinner;
    return undefined;
  }
  if (typeof v === 'object') {
    const k = Object.keys(v)[0];
    if (k === 'Home' || k === 'Away') return k;
  }
  return undefined;
}

function getFinalizedResult(result?: any): { score?: Score; penaltyWinner?: PenaltyWinner } {
  if (!result) return {};
  const fin = result.Finalized ?? result.finalized;
  if (!fin) return {};
  const s = fin.score;
  const score: Score | undefined =
    s && typeof s === 'object' && 'home' in s && 'away' in s
      ? { home: Number((s as any).home ?? 0) || 0, away: Number((s as any).away ?? 0) || 0 }
      : undefined;
  const penaltyWinner = parsePenaltyWinner(fin.penalty_winner ?? fin.penaltyWinner);
  return { score, penaltyWinner };
}

function getPhaseWeight(phaseName: string, phases: PhaseConfig[]): number {
  const p = phases.find((x) => String(x.name) === String(phaseName));
  const w = Number(p?.points_weight ?? 1);
  return Number.isFinite(w) && w > 0 ? w : 1;
}

function isKnockout(phaseWeight: number) {
  return phaseWeight > 1;
}

function isMatchFinal(result?: any) {
  return !!(result?.Finalized || result?.finalized);
}

function getCurrentScore(result?: any): { home: number; away: number; tag: 'OPEN' | 'LIVE' | 'FINAL' } {
  if (!result) return { home: 0, away: 0, tag: 'OPEN' };

  if (result.Finalized?.score) {
    const s = result.Finalized.score;
    return { home: Number(s.home ?? 0) || 0, away: Number(s.away ?? 0) || 0, tag: 'FINAL' };
  }
  if (result.Proposed?.score) {
    const s = result.Proposed.score;
    return { home: Number(s.home ?? 0) || 0, away: Number(s.away ?? 0) || 0, tag: 'LIVE' };
  }

  if (result.finalized?.score) {
    const s = result.finalized.score;
    return { home: Number(s.home ?? 0) || 0, away: Number(s.away ?? 0) || 0, tag: 'FINAL' };
  }
  if (result.proposed?.score) {
    
    const s = result.proposed.score;
    return { home: Number(s.home ?? 0) || 0, away: Number(s.away ?? 0) || 0, tag: 'LIVE' };
  }

  return { home: 0, away: 0, tag: 'OPEN' };
}

function totalPoolVara(m?: MatchInfo) {
  if (!m) return '—';
  return `${formatAmount(m.match_prize_pool ?? '0', 12)} VARA`;
}

function computeDeterministicShareBn(
  stakeInMatchPool: bigint,
  matchPrizePool: bigint,
  totalWinnerStake: bigint,
): bigint {
  if (stakeInMatchPool <= 0n) return 0n;
  if (matchPrizePool <= 0n) return 0n;
  if (totalWinnerStake <= 0n) return 0n;
  return (stakeInMatchPool * matchPrizePool) / totalWinnerStake;
}

function outcomeOf(score: Score): -1 | 0 | 1 {
  if (score.home > score.away) return 1;
  if (score.home < score.away) return -1;
  return 0;
}

function isExactScore(betScore?: Score, finalScore?: Score) {
  return !!betScore && !!finalScore && betScore.home === finalScore.home && betScore.away === finalScore.away;
}


function advanceOutcome(score: Score, penaltyWinner: PenaltyWinner): -1 | 0 | 1 {
  const o = outcomeOf(score);
  if (o !== 0) return o;
  if (penaltyWinner === 'Home') return 1;
  if (penaltyWinner === 'Away') return -1;
  return 0;
}


function eligibleForPayout(
  betScore: Score | undefined,
  betPenalty: PenaltyWinner,
  finalScore: Score | undefined,
  finalPenalty: PenaltyWinner,
  phaseWeight: number,
) {
  if (!betScore || !finalScore) return false;

  const knockout = isKnockout(phaseWeight);
  const drawFinal = finalScore.home === finalScore.away;


  const exact = isExactScore(betScore, finalScore);
  if (exact) {
    if (knockout && drawFinal) {
      return !!betPenalty && !!finalPenalty && betPenalty === finalPenalty;
    }
    return true;
  }

  if (!knockout) {
    
    return outcomeOf(betScore) === outcomeOf(finalScore);
  }

 
  const finalAdv = advanceOutcome(finalScore, finalPenalty);
  if (finalAdv === 0) return false; 

 
  const betDraw = betScore.home === betScore.away;
  const betAdv = betDraw ? advanceOutcome(betScore, betPenalty) : outcomeOf(betScore);

  if (betAdv === 0) return false; 
  return betAdv === finalAdv;
}

export const QueryBetsByUserComponent: React.FC = () => {
  const { account } = useAccount();
  const alert = useAlert();
  const { api, isApiReady } = useApi();

  const [bets, setBets] = useState<ContractUserBetView[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const [matches, setMatches] = useState<MatchInfo[] | null>(null);
  const [phases, setPhases] = useState<PhaseConfig[]>([]);

  const [tab, setTab] = useState<'wc'>('wc');
  const [search, setSearch] = useState('');
  const [claimingByMatch, setClaimingByMatch] = useState<Record<number, boolean>>({});

  useEffect(() => {
    void web3Enable('Bolao Bets UI');
  }, []);

  const fetchState = useCallback(async () => {
    if (!api || !isApiReady) return;
    try {
      const svc = new Service(new Program(api, PROGRAM_ID));
      const state = (await (svc as any).queryState()) as any;

      const list: MatchInfo[] = Array.isArray(state?.matches)
        ? state.matches.map((m: any) => ({
            match_id: String(m?.match_id ?? ''),
            phase: String(m?.phase ?? ''),
            home: String(m?.home ?? ''),
            away: String(m?.away ?? ''),
            kick_off: String(m?.kick_off ?? '0'),
            result: m?.result ?? null,
            match_prize_pool: String(m?.match_prize_pool ?? '0'),
            has_bets: Boolean(m?.has_bets),

            total_claimed: m?.total_claimed != null ? String(m.total_claimed) : undefined,
            total_winner_stake: m?.total_winner_stake != null ? String(m.total_winner_stake) : undefined,
            settlement_prepared: m?.settlement_prepared != null ? Boolean(m.settlement_prepared) : undefined,
            dust_swept: m?.dust_swept != null ? Boolean(m.dust_swept) : undefined,
          }))
        : [];

      const phaseList: PhaseConfig[] = Array.isArray(state?.phases)
        ? state.phases.map((p: any) => ({
            name: String(p?.name ?? ''),
            start_time: String(p?.start_time ?? '0'),
            end_time: String(p?.end_time ?? '0'),
            points_weight: Number(p?.points_weight ?? 1),
          }))
        : [];

      setMatches(list);
      setPhases(phaseList);
    } catch (e) {
      console.error('Failed to fetch state context', e);
      setMatches([]);
      setPhases([]);
    }
  }, [api, isApiReady]);

  const fetchBets = useCallback(async () => {
    if (!api || !isApiReady || !account) return;

    setLoading(true);
    setErrMsg(null);

    try {
      const svc = new Service(new Program(api, PROGRAM_ID));
      const result = (await (svc as any).queryBetsByUser(account.decodedAddress)) as any[];

      const parsed: ContractUserBetView[] = (result ?? []).map((v: any) => ({
        match_id: Number(v?.match_id ?? 0),
        score: { home: Number(v?.score?.home ?? 0) || 0, away: Number(v?.score?.away ?? 0) || 0 },
        penalty_winner: v?.penalty_winner ?? null,
        stake_in_match_pool: v?.stake_in_match_pool ?? 0,
        claimed: !!v?.claimed,
      }));

      parsed.sort((a, b) => Number(b.match_id) - Number(a.match_id));
      setBets(parsed);
    } catch (err) {
      console.error('Failed to fetch Predictions:', err);
      setBets([]);
      setErrMsg('Failed to fetch your Predictions');
      alert.error('Failed to fetch your Predictions');
    } finally {
      setLoading(false);
    }
  }, [api, isApiReady, account, alert]);

  useEffect(() => {
    if (isApiReady) void fetchState();
  }, [isApiReady, fetchState]);

  useEffect(() => {
    if (account && isApiReady) void fetchBets();
  }, [account, isApiReady, fetchBets]);

  const connected = !!account;

  const matchById = useMemo(() => {
    const map = new Map<number, MatchInfo>();
    for (const m of matches ?? []) {
      const idNum = Number(m.match_id);
      if (Number.isFinite(idNum)) map.set(idNum, m);
    }
    return map;
  }, [matches]);

  const wcBets = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (bets ?? []) as ContractUserBetView[];
    if (!q) return list;

    return list.filter((b) => {
      const pick = `${b.score.home}-${b.score.away}`;
      const m = matchById.get(Number(b.match_id));
      const teams = m ? `${m.home} ${m.away}` : '';
      const s = `#${String(b.match_id)} ${teams} ${pick} ${b.claimed ? 'claimed' : 'pending'}`.toLowerCase();
      return s.includes(q);
    });
  }, [bets, search, matchById]);

  const claim = useCallback(
    async (matchId: number) => {
      if (!api || !isApiReady || !account) return;

      setClaimingByMatch((p) => ({ ...p, [matchId]: true }));
      try {
        const svc = new Service(new Program(api, PROGRAM_ID));
        const tx: TransactionBuilder<unknown> = (svc as any).claimMatchReward(matchId);

        const injector = await web3FromSource(account.meta.source);
        tx.withAccount(account.decodedAddress, { signer: injector.signer });

        await tx.calculateGas();
        const { blockHash, response } = await tx.signAndSend();

        alert.info(`Transaction included in block ${blockHash}`);
        await response();

        alert.success('Claim completed!');
        await fetchBets();
        await fetchState();
      } catch (e: any) {
        console.error('Claim failed', e);
        alert.error(e?.message ?? 'Claim failed');
      } finally {
        setClaimingByMatch((p) => ({ ...p, [matchId]: false }));
      }
    },
    [api, isApiReady, account, alert, fetchBets, fetchState],
  );

  return (
    <div className="mpShell">
      <div className="mpBg" aria-hidden="true" />

      <header className="mpTop">
        <div className="mpTop__row mpTop__row--walletSafe">
          <div className="mpTitle mpTitle--shrink">
            <h1>My Predictions</h1>
            <p>Potential Winnings is an estimate and becomes exact once the match is finalized + settled.</p>
          </div>
          <Header />
        </div>

        <div className="mpTabs">
          <button className={'mpTab ' + (tab === 'wc' ? 'is-active' : '')} onClick={() => setTab('wc')} type="button">
            World Cup 2026
          </button>

          <div className="mpSearch">
            <span className="mpSearch__icon" aria-hidden="true">
              ⌕
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search teams, match id, score (e.g. 2-1), status"
              aria-label="Search predictions"
            />
          </div>

          <div className="mpTools">
            <button
              className="mpIconBtn"
              title="Refresh predictions"
              onClick={() => (account && isApiReady ? fetchBets() : undefined)}
              type="button">
              ⟳
            </button>
            <button className="mpIconBtn" title="Refresh state" onClick={() => (isApiReady ? fetchState() : undefined)} type="button">
              ⛁
            </button>
          </div>
        </div>

        <div className="mpHintbar">
          <span className="mpPill">Bet closes 10m before kickoff</span>
          <span className="mpPill">75% Match / 20% Final / 5% DAO</span>
          <span className="mpPill">On-chain pools</span>
          <span className="mpPill mpPill--live">LIVE</span>
        </div>
      </header>

      <div className="mpSection">
        <div className="mpSection__title">
          <div className="mpSection__main">World Cup 2026</div>
          <div className="mpSection__sub">Knockout Stage</div>
        </div>

        {!connected ? (
          <div className="mpState mpState--error">Connect your wallet to see your predictions.</div>
        ) : loading ? (
          <div className="mpState">
            <span className="mpSpinner" aria-hidden="true" /> Loading predictions…
          </div>
        ) : errMsg ? (
          <div className="mpState mpState--error">{errMsg}</div>
        ) : (
          <section className="mpCard">
            <div className="mpCard__head">
              <div className="mpCard__left">
                <span className="mpCup">🏆</span>
                <div className="mpCard__ttl">
                  <div className="t">World Cup 2026</div>
                  <div className="s">Knockout Stage</div>
                </div>
              </div>

              <div className="mpCard__right">
                <span className="mpMini">{`Total bets: ${wcBets.length}`}</span>
              </div>
            </div>

            <div className="mpTable">
              <div className="mpTHead">
                <div>Match</div>
                <div className="num">Stake</div>
                <div className="center">Your Pick</div>
                <div className="num hideMd">Potential / Real</div>
                <div className="center">Status</div>
                <div className="center">Action</div>
              </div>

              <div className="mpTBody">
                {wcBets.length === 0 ? (
                  <div className="mpEmpty">No Predictions found for your account.</div>
                ) : (
                  wcBets.map((b, i) => {
                    const m = matchById.get(Number(b.match_id));

                    const stakeBn = toBn(b.stake_in_match_pool);
                    const stakeHuman = Number(formatAmount(stakeBn, 12));

                    const pickText = `${b.score.home}-${b.score.away}`;
                    const betPenalty = parsePenaltyWinner(b.penalty_winner);

                    const home = m?.home ?? `Home`;
                    const away = m?.away ?? `Away`;
                    const phase = m?.phase ?? '—';
                    const kickoff = m?.kick_off ? formatKickoff(m.kick_off) : '—';
                    const poolHuman = m ? totalPoolVara(m) : '—';

                    const current = m ? getCurrentScore(m.result) : { home: 0, away: 0, tag: 'OPEN' as const };
                    const matchFinal = m ? isMatchFinal(m.result) : false;

                    const settlementPrepared = !!m?.settlement_prepared;
                    const matchPoolBn = toBn(m?.match_prize_pool ?? 0);
                    const totalWinnerStakeBn = toBn(m?.total_winner_stake ?? 0);

                    const phaseWeight = m ? getPhaseWeight(m.phase, phases) : 1;
                    const { score: finalScore, penaltyWinner: finalPenalty } = m ? getFinalizedResult(m.result) : {};

                    const eligible = matchFinal
                      ? eligibleForPayout(b.score, betPenalty, finalScore, finalPenalty, phaseWeight)
                      : false;

                    const realBn =
                      matchFinal && settlementPrepared && eligible
                        ? computeDeterministicShareBn(stakeBn, matchPoolBn, totalWinnerStakeBn)
                        : 0n;

                    const realHuman = Number(formatAmount(realBn, 12));
                    const potentialBefore = matchPoolBn > 0n ? matchPoolBn : 0n;
                    const potentialText = potentialBefore > 0n ? `${formatAmount(potentialBefore, 12)}` : '—';

                    const displayValue =
                      settlementPrepared && matchFinal ? (eligible ? realHuman.toFixed(4) : '0.0000') : potentialText;

                    const exactHit = matchFinal ? isExactScore(b.score, finalScore) : false;

                    const displaySub =
                      settlementPrepared && matchFinal
                        ? eligible
                          ? exactHit
                            ? 'Real (claimable • exact)'
                            : 'Real (claimable • outcome)'
                          : 'Not eligible'
                        : 'Potential (max pool)';

                    const claimed = !!b.claimed;
                    const canClaim = matchFinal && settlementPrepared && eligible && !claimed && realBn > 0n;

                    const statusLabelText = claimed ? 'Claimed' : matchFinal ? 'Finalized' : 'Pending';
                    const statusTone = claimed ? 'ok' : matchFinal ? 'final' : 'muted';

                    const isClaiming = !!claimingByMatch[Number(b.match_id)];

                    const claimTitle = claimed
                      ? 'Already claimed'
                      : !matchFinal
                        ? 'Match not finalized yet'
                        : !settlementPrepared
                          ? 'Settlement not prepared yet'
                          : !eligible
                            ? 'Not eligible'
                            : isClaiming
                              ? 'Claiming...'
                              : 'Claim your winnings';

                    return (
                      <div className="mpRow" key={`wc-${String(b.match_id)}-${i}`}>
                        <div className="mpMatch">
                          <div className="mpIdx">{i + 1}</div>

                          <div className="mpMatch__main">
                            <div className="mpTeams" title={`${home} vs ${away}`}>
                              <span className="mpTeam">
                                <img className="mpFlag" src={flagForTeam(home)} alt={`${home} flag`} />
                                <span className="mpName">{home}</span>
                              </span>

                              <span className="mpVs">vs</span>

                              <span className="mpTeam mpTeam--right">
                                <span className="mpName">{away}</span>
                                <img className="mpFlag" src={flagForTeam(away)} alt={`${away} flag`} />
                              </span>

                              <span className={'mpTag mpTag--' + current.tag.toLowerCase()}>{current.tag}</span>
                            </div>

                            <div className="mpMeta">
                              <span className="mpChip">#{String(b.match_id)}</span>
                              <span className="mpChip">{phase}</span>
                              <span className="mpChip">Kickoff: {kickoff}</span>
                              <span className="mpChip">Pool: {poolHuman}</span>
                              <span className="mpChip">
                                Current: <b>{current.home}-{current.away}</b>
                              </span>

                              {betPenalty ? <span className="mpChip">Penalty pick: {betPenalty}</span> : null}

                              {matchFinal ? (
                                <>
                                  {finalPenalty ? <span className="mpChip">Final pens: {finalPenalty}</span> : null}

                                  <span className={'mpChip ' + (eligible ? 'is-good' : 'is-bad')}>
                                    Eligibility:{' '}
                                    <b>{eligible ? (exactHit ? 'Eligible (exact)' : 'Eligible (outcome)') : 'Not eligible'}</b>
                                  </span>

                                  <span className={'mpChip ' + (settlementPrepared ? 'is-good' : '')}>
                                    Settlement: <b>{settlementPrepared ? 'Ready' : 'Not prepared'}</b>
                                  </span>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div className="mpNum">
                          <div className="mpNum__main">
                            {Number.isFinite(stakeHuman) ? stakeHuman.toFixed(4) : '0.0000'}
                          </div>
                          <div className="mpNum__sub">VARA</div>
                        </div>

                        <div className="mpPick">
                          <div className="mpPick__label">YOUR PICK</div>
                          <div className="mpPick__score">{pickText}</div>
                          <div className="mpPick__hint">Score / outcome</div>
                        </div>

                        <div className="mpWin hideMd">
                          <div className="mpWin__main">{displayValue}</div>
                          <div className="mpWin__sub">{displaySub}</div>
                        </div>

                        <div className="mpCenter">
                          <span className={'mpStatus mpStatus--' + statusTone}>{statusLabelText}</span>
                        </div>

                        <div className="mpCenter">
                          <button
                            className={'mpClaim ' + (canClaim ? 'is-ready' : '')}
                            disabled={!canClaim || isClaiming}
                            title={claimTitle}
                            onClick={() => claim(Number(b.match_id))}
                            type="button">
                            <span className="mpClaim__dot" aria-hidden="true" />
                            {isClaiming ? 'Claiming…' : claimed ? 'Claimed' : 'Claim'}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="mpCard__foot">
              <span className="mpMini">Tip: In knockout, “outcome” means who advances. In draws, penalties decide it.</span>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};