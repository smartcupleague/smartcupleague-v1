import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount, useApi } from '@gear-js/react-hooks';
import { web3Enable, web3FromSource } from '@polkadot/extension-dapp';
import { Program, Service } from '@/hocs/lib';
import { TransactionBuilder } from 'sails-js';
import { useToast } from '@/hooks/useToast';
import './matchcard.css';
import { HexString } from '@gear-js/api';

const PROGRAM_ID = import.meta.env.VITE_BOLAOCOREPROGRAM as string;

type Score = { home: number; away: number };
type ResultStatus = any;

type MatchInfo = {
  match_id: string;
  phase: string;
  home: string;
  away: string;
  kick_off: string;
  result: ResultStatus;
  match_prize_pool?: string;
  total_winner_stake?: string;
  settlement_prepared?: boolean;
  pool_home?: string;
  pool_draw?: string;
  pool_away?: string;

  has_bets: boolean;
  participants: string[];
};

type IoBolaoState = {
  matches: MatchInfo[];
};

export interface MatchCardProps {
  id: string;
  flag1?: string;
  flag2?: string;
  currentScore?: { home: number; away: number };
  currentScoreText?: string;
}

type BetCurrency = 'VARA' | 'wUSDC' | 'wUSDT';

const VARA_DECIMALS = 12n;
const VARA_PLANCK = 10n ** VARA_DECIMALS;

const TEAM_FLAGS: Record<string, string> = {
  MEXICO: '/flags/mexico.jpg',
  'SOUTH AFRICA': '/flags/South_Africa.png',
  ARGENTINA: '/flags/flag_argentina.jpg',
  JAPAN: '/flags/flag_japan.jpg',
};

function normalizeTeamKey(team: string) {
  return (team || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

function flagForTeam(teamName: string) {
  const key = normalizeTeamKey(teamName);
  return TEAM_FLAGS[key] || '/flags/default.png';
}

function resolveFlagFromPropsOrTeam(flagProp: string | undefined, teamName: string): string {
  const raw = (flagProp || '').trim();
  if (raw) return raw;
  return flagForTeam(teamName);
}

function kickOffToMs(kickOff: string): number {
  const n = Number(kickOff);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n < 10_000_000_000 ? n * 1000 : n;
}

function formatKickoffMs(kickOffString: string) {
  const ms = kickOffToMs(kickOffString);
  if (!ms) return '—';
  return new Date(ms).toLocaleString(undefined, {
    year: '2-digit',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isFinalizedResult(result: any): boolean {
  return !!(result?.Finalized || result?.finalized);
}

function getResultDetails(result: any): {
  home: number;
  away: number;
  tag: 'OPEN' | 'LIVE' | 'FINAL';
  penaltyWinner: string | null;
} {
  if (!result) return { home: 0, away: 0, tag: 'OPEN', penaltyWinner: null };

  if (result.Finalized?.score) {
    const s = result.Finalized.score;
    return { home: Number(s.home ?? 0) || 0, away: Number(s.away ?? 0) || 0, tag: 'FINAL', penaltyWinner: null };
  }
  if (result.Proposed?.score) {
    const s = result.Proposed.score;
    return { home: Number(s.home ?? 0) || 0, away: Number(s.away ?? 0) || 0, tag: 'LIVE', penaltyWinner: null };
  }
  if (result.finalized?.score) {
    const s = result.finalized.score;
    return {
      home: Number(s.home ?? 0) || 0,
      away: Number(s.away ?? 0) || 0,
      tag: 'FINAL',
      penaltyWinner: result.finalized?.penalty_winner ?? null,
    };
  }
  if (result.proposed?.score) {
    const s = result.proposed.score;
    return { home: Number(s.home ?? 0) || 0, away: Number(s.away ?? 0) || 0, tag: 'LIVE', penaltyWinner: null };
  }

  if (result.Unresolved || result.unresolved) return { home: 0, away: 0, tag: 'OPEN', penaltyWinner: null };
  return { home: 0, away: 0, tag: 'OPEN', penaltyWinner: null };
}

function statusLabel(result: any) {
  const r = getResultDetails(result);
  if (r.tag === 'OPEN') return 'Open';
  if (r.tag === 'LIVE') return `Live (${r.home}-${r.away})`;
  return `Final (${r.home}-${r.away})`;
}

function totalPoolPlanck(m: MatchInfo): bigint {
  if (m.match_prize_pool != null) {
    try {
      return BigInt(String(m.match_prize_pool));
    } catch {
      /* ignore */
    }
  }
  try {
    const h = BigInt(String(m.pool_home ?? '0'));
    const d = BigInt(String(m.pool_draw ?? '0'));
    const a = BigInt(String(m.pool_away ?? '0'));
    return h + d + a;
  } catch {
    return 0n;
  }
}

function planckToVaraHuman(planck: bigint): number {
  return Number(planck) / 1_000_000_000_000;
}

function toPlanck(amount: number): bigint {
  const fixed = amount.toFixed(12);
  const [i, f = ''] = fixed.split('.');
  const frac = (f + '0'.repeat(12)).slice(0, 12);
  return BigInt(i || '0') * VARA_PLANCK + BigInt(frac || '0');
}

function clampScore(n: unknown) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(20, Math.trunc(v)));
}

function clampPenalties(n: unknown) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(10, Math.trunc(v)));
}

type ScoreText = { home: string; away: string };

function normalizeCurrentScore(
  currentScore?: { home: number; away: number },
  currentScoreText?: string,
): { home: number; away: number; text: string } {
  if (currentScore && Number.isFinite(currentScore.home) && Number.isFinite(currentScore.away)) {
    const h = Number(currentScore.home) || 0;
    const a = Number(currentScore.away) || 0;
    return { home: h, away: a, text: `${h}-${a}` };
  }

  if (typeof currentScoreText === 'string' && currentScoreText.trim()) {
    const m = currentScoreText.trim().match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) return { home: Number(m[1]), away: Number(m[2]), text: `${Number(m[1])}-${Number(m[2])}` };
    return { home: 0, away: 0, text: currentScoreText.trim() };
  }

  return { home: 0, away: 0, text: '0-0' };
}

function toBnSafe(v: any): bigint {
  try {
    if (typeof v === 'bigint') return v;
    return BigInt(String(v ?? '0'));
  } catch {
    return 0n;
  }
}

function computeShareBn(stake: bigint, matchPrizePool: bigint, totalWinnerStake: bigint): bigint {
  if (stake <= 0n || matchPrizePool <= 0n || totalWinnerStake <= 0n) return 0n;
  return (stake * matchPrizePool) / totalWinnerStake;
}

function formatVaraFromPlanck(planck: bigint) {
  const s = planck.toString().padStart(13, '0');
  const intPart = s.slice(0, -12);
  const frac = s.slice(-12).replace(/0+$/, '');
  return frac ? `${intPart}.${frac}` : intPart;
}

export const MatchCard: React.FC<MatchCardProps> = ({ id, flag1, flag2, currentScore, currentScoreText }) => {
  const navigate = useNavigate();
  const { account } = useAccount();
  const toast = useToast();
  const { api, isApiReady } = useApi();

  const [state, setState] = useState<IoBolaoState | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedScore, setSelectedScore] = useState<Score>({ home: 0, away: 0 });
  const [penalties, setPenalties] = useState<Score>({ home: 0, away: 0 });

  const [selectedScoreTextState, setSelectedScoreTextState] = useState<ScoreText>({ home: '0', away: '0' });
  const [penaltiesTextState, setPenaltiesTextState] = useState<ScoreText>({ home: '0', away: '0' });

  const [txLoadingBet, setTxLoadingBet] = useState(false);
  const [txLoadingClaim, setTxLoadingClaim] = useState(false);

  const [betAmount, setBetAmount] = useState<string>('10');
  const [betCurrency, setBetCurrency] = useState<BetCurrency>('VARA');

  const [userStakeBn, setUserStakeBn] = useState<bigint>(0n);
  const [userClaimed, setUserClaimed] = useState<boolean>(false);
  const [loadingUserBet, setLoadingUserBet] = useState<boolean>(false);

  const matchId = useMemo(() => String(id ?? '').trim(), [id]);

  const betAmountNumber = useMemo(() => {
    const n = Number(String(betAmount).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }, [betAmount]);

  const betDisabledByAmount = betAmountNumber <= 0;

  const shownScore = useMemo(
    () => normalizeCurrentScore(currentScore, currentScoreText),
    [currentScore, currentScoreText],
  );

  useEffect(() => {
    void web3Enable('Vara Bolao MatchCard');
  }, []);

  const fetchState = useCallback(async () => {
    if (!api || !isApiReady) {
      setLoading(true);
      return;
    }

    setLoading(true);
    try {
      const svc = new Service(new Program(api, PROGRAM_ID as HexString));
      const s = (await (svc as any).queryState()) as any;

      const normalized: IoBolaoState = {
        matches: Array.isArray(s?.matches)
          ? s.matches.map((m: any) => ({
              match_id: String(m?.match_id ?? ''),
              phase: String(m?.phase ?? ''),
              home: String(m?.home ?? ''),
              away: String(m?.away ?? ''),
              kick_off: String(m?.kick_off ?? '0'),

              match_prize_pool: m?.match_prize_pool != null ? String(m.match_prize_pool) : undefined,
              total_winner_stake: m?.total_winner_stake != null ? String(m.total_winner_stake) : undefined,
              settlement_prepared: m?.settlement_prepared != null ? Boolean(m.settlement_prepared) : undefined,

              pool_home: m?.pool_home != null ? String(m.pool_home) : '0',
              pool_draw: m?.pool_draw != null ? String(m.pool_draw) : '0',
              pool_away: m?.pool_away != null ? String(m.pool_away) : '0',

              has_bets: Boolean(m?.has_bets),
              participants: Array.isArray(m?.participants) ? m.participants : [],
              result: m?.result ?? null,
            }))
          : [],
      };

      setState(normalized);
    } catch (e) {
      console.error('fetchState error', e);
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [api, isApiReady]);

  useEffect(() => {
    void fetchState();
  }, [fetchState]);

  const match = useMemo(() => {
    if (!state?.matches || !matchId) return null;
    const idNorm = String(matchId).trim();
    return state.matches.find((m) => String(m.match_id).trim() === idNorm) || null;
  }, [state, matchId]);

  const isBeforeKickoff = useMemo(() => {
    if (!match) return false;
    return kickOffToMs(match.kick_off) > Date.now();
  }, [match]);

  const chainResult = useMemo(() => getResultDetails(match?.result), [match?.result]);

  const isFinalized = useMemo(() => {
    if (!match?.result) return false;
    return isFinalizedResult(match.result);
  }, [match?.result]);

  const fetchUserBetForMatch = useCallback(async () => {
    if (!api || !isApiReady || !account || !matchId) return;

    setLoadingUserBet(true);
    try {
      const svc = new Service(new Program(api, PROGRAM_ID as HexString));
      const bets = (await (svc as any).queryBetsByUser(account.decodedAddress)) as any[];

      const b = Array.isArray(bets) ? bets.find((x) => String(x?.match_id) === String(matchId)) : null;

      if (!b) {
        setUserStakeBn(0n);
        setUserClaimed(false);
        return;
      }

      const stake = toBnSafe(b?.stake_in_match_pool ?? 0);
      const claimed = typeof b?.claimed === 'boolean' ? b.claimed : false;

      setUserStakeBn(stake);
      setUserClaimed(claimed);
    } catch (e) {
      console.error('fetchUserBetForMatch error', e);
      setUserStakeBn(0n);
      setUserClaimed(false);
    } finally {
      setLoadingUserBet(false);
    }
  }, [api, isApiReady, account, matchId]);

  useEffect(() => {
    void fetchUserBetForMatch();
  }, [fetchUserBetForMatch]);

  const isDraw = selectedScore.home === selectedScore.away;

  useEffect(() => {
    if (!isDraw) {
      setPenalties({ home: 0, away: 0 });
      setPenaltiesTextState({ home: '0', away: '0' });
    }
  }, [isDraw]);

  const onFocusZeroToBlank = (getter: () => string, setter: (v: string) => void) => {
    const v = getter();
    if (v === '0') setter('');
  };

  const onBlurBlankToZero = (getter: () => string, setter: (v: string) => void) => {
    const v = getter().trim();
    if (v === '') setter('0');
  };

  const canBet = useMemo(() => {
    if (!match) return false;
    if (isFinalized) return false;
    if (!isBeforeKickoff) return false;
    if (betDisabledByAmount) return false;
    if (isDraw && penalties.home === penalties.away) return false;
    return true;
  }, [match, isFinalized, isBeforeKickoff, betDisabledByAmount, isDraw, penalties.home, penalties.away]);

  const settlementPrepared = !!match?.settlement_prepared;
  const matchPrizePoolBn = useMemo(() => toBnSafe(match?.match_prize_pool ?? 0), [match?.match_prize_pool]);
  const totalWinnerStakeBn = useMemo(() => toBnSafe(match?.total_winner_stake ?? 0), [match?.total_winner_stake]);

  const claimableBn = useMemo(() => {
    if (!match) return 0n;
    if (!isFinalized) return 0n;
    if (!settlementPrepared) return 0n;
    if (userClaimed) return 0n;

    return computeShareBn(userStakeBn, matchPrizePoolBn, totalWinnerStakeBn);
  }, [match, isFinalized, settlementPrepared, userClaimed, userStakeBn, matchPrizePoolBn, totalWinnerStakeBn]);

  const showClaimButton = useMemo(() => {
    if (!account) return false;
    if (!match) return false;
    if (!isFinalized) return false;
    if (!settlementPrepared) return false;
    if (loadingUserBet) return false;
    return claimableBn > 0n;
  }, [account, match, isFinalized, settlementPrepared, loadingUserBet, claimableBn]);

  const handlePlaceBet = useCallback(async () => {
    if (!match) return;

    if (isFinalized) {
      toast.error(`This match has ended. Final score: ${chainResult.home}-${chainResult.away}`);
      return;
    }

    if (!account) {
      toast.error('Please connect your wallet');
      return;
    }
    if (!api || !isApiReady) {
      toast.error('Node API is not ready');
      return;
    }
    if (!isBeforeKickoff) {
      toast.error('Betting is closed (kick-off time has passed)');
      return;
    }
    if (betAmountNumber <= 0) {
      toast.error('Enter a valid bet amount');
      return;
    }

    const h = clampScore(selectedScore.home);
    const a = clampScore(selectedScore.away);

    if (h === a) {
      const ph = clampPenalties(penalties.home);
      const pa = clampPenalties(penalties.away);
      if (ph === pa) {
        toast.error('In penalties there must be a winner (no tie).');
        return;
      }
    }

    try {
      setTxLoadingBet(true);

      const svc = new Service(new Program(api, PROGRAM_ID as HexString));
      const tx: TransactionBuilder<unknown> = (svc as any).placeBet(BigInt(match.match_id), { home: h, away: a });

      const { signer } = await web3FromSource(account.meta.source);

      if (betCurrency === 'VARA') {
        tx.withAccount(account.decodedAddress, { signer }).withValue(toPlanck(betAmountNumber));
      } else {
        tx.withAccount(account.decodedAddress, { signer }).withValue(0n);
        toast.info(`Selected ${betCurrency}. You may need an ERC20-like approve/transfer flow.`);
      }

      await tx.calculateGas();
      const { blockHash, response } = await tx.signAndSend();

      toast.info(`Bet included in block ${blockHash}`);
      await response();
      toast.success('Bet placed successfully ✅');

      setTimeout(() => {
        void fetchState();
        void fetchUserBetForMatch();
      }, 900);
    } catch (e) {
      console.error(e);
      toast.error('Bet failed');
    } finally {
      setTxLoadingBet(false);
    }
  }, [
    match,
    isFinalized,
    chainResult.home,
    chainResult.away,
    account,
    api,
    isApiReady,
    isBeforeKickoff,
    betAmountNumber,
    betCurrency,
    selectedScore.home,
    selectedScore.away,
    penalties.home,
    penalties.away,
    toast,
    fetchState,
    fetchUserBetForMatch,
  ]);

  const handleClaim = useCallback(async () => {
    if (!match) return;

    if (!account) {
      toast.error('Please connect your wallet');
      return;
    }
    if (!api || !isApiReady) {
      toast.error('Node API is not ready');
      return;
    }
    if (!isFinalizedResult(match.result)) {
      toast.error('Match is not finalized yet');
      return;
    }
    if (!match.settlement_prepared) {
      toast.error('Settlement not prepared yet');
      return;
    }
    if (claimableBn <= 0n) {
      toast.error('No claimable balance for this match');
      return;
    }

    try {
      setTxLoadingClaim(true);

      const svc = new Service(new Program(api, PROGRAM_ID as HexString));

      const tx: TransactionBuilder<unknown> = (svc as any).claimMatchReward(BigInt(match.match_id));

      const { signer } = await web3FromSource(account.meta.source);
      tx.withAccount(account.decodedAddress, { signer }).withValue(0n);

      await tx.calculateGas();
      const { blockHash, response } = await tx.signAndSend();

      toast.info(`Claim included in block ${blockHash}`);
      await response();
      toast.success('Reward claimed ✅');

      setTimeout(() => {
        void fetchState();
        void fetchUserBetForMatch();
      }, 900);
    } catch (e) {
      console.error(e);
      toast.error('Claim failed');
    } finally {
      setTxLoadingClaim(false);
    }
  }, [match, account, api, isApiReady, toast, fetchState, fetchUserBetForMatch, claimableBn]);

  const sincePredictedTop = useMemo(() => {
    if (!match) return 'Since predicted: —';
    return `Since predicted: ${match.home.toUpperCase()} ${selectedScore.home} - ${selectedScore.away} ${match.away.toUpperCase()}`;
  }, [match, selectedScore.home, selectedScore.away]);

  const resultLine = useMemo(() => {
    if (!match) return '—';
    if (!isDraw)
      return `${match.home.toUpperCase()} ${selectedScore.home} - ${selectedScore.away} ${match.away.toUpperCase()}`;
    const winner = penalties.home > penalties.away ? match.home : penalties.away > penalties.home ? match.away : '—';
    if (winner === '—')
      return `${match.home.toUpperCase()} ${selectedScore.home} - ${selectedScore.away} ${match.away.toUpperCase()}`;
    return `${match.home.toUpperCase()} ${selectedScore.home} - ${selectedScore.away} ${match.away.toUpperCase()} (${winner} wins on penalties)`;
  }, [match, isDraw, selectedScore.home, selectedScore.away, penalties.home, penalties.away]);

  const finalizedMessage = useMemo(() => {
    if (!match || !isFinalized) return '';
    const base = `This match has ended. Final score: ${chainResult.home}-${chainResult.away}.`;
    if (chainResult.penaltyWinner) return `${base} Penalty winner: ${chainResult.penaltyWinner}.`;
    return base;
  }, [match, isFinalized, chainResult.home, chainResult.away, chainResult.penaltyWinner]);

  const leftFlagSrc = useMemo(
    () => (match ? resolveFlagFromPropsOrTeam(flag1, match.home) : (flag1 || '').trim()),
    [flag1, match],
  );
  const rightFlagSrc = useMemo(
    () => (match ? resolveFlagFromPropsOrTeam(flag2, match.away) : (flag2 || '').trim()),
    [flag2, match],
  );

  if (loading) {
    return (
      <section className="mcx">
        <div className="mcx__header">
          <div className="mcx__phase">Loading…</div>
        </div>
        <div className="mcx__body dim">Fetching contract state…</div>
      </section>
    );
  }

  if (!matchId || !match) {
    return (
      <section className="mcx">
        <div className="mcx__header">
          <div className="mcx__phase">Match not found</div>
        </div>
        <div className="mcx__body dim">
          The selected match does not exist. (id: <b>{matchId || '—'}</b>)
          <div style={{ marginTop: 12 }}>
            <button className="mcx__ghostBtn" onClick={() => navigate(-1)}>
              Back
            </button>
          </div>
        </div>
      </section>
    );
  }

  const poolVara = planckToVaraHuman(totalPoolPlanck(match));

  const topScoreHome = isFinalized ? chainResult.home : shownScore.home;
  const topScoreAway = isFinalized ? chainResult.away : shownScore.away;

  return (
    <section className="mcx">
      <img className="mcx__trophy" src="/images/WorldCupTrophy_PNG.png" alt="World Cup Trophy" />

      <div className="mcx__header">
        <div className="mcx__phase">{match.phase || 'Group Stage'}</div>
      </div>

      <div className="mcx__scoreTop">
        <div className="mcx__side">
          {leftFlagSrc ? <img className="mcx__flagLg" src={leftFlagSrc} alt={`${match.home} flag`} /> : null}
          <div className="mcx__teamLbl">{match.home.toUpperCase()}</div>
        </div>

        <div className="mcx__midScore">
          <div className="mcx__bigN">{topScoreHome}</div>
          <div className="mcx__vs">VS</div>
          <div className="mcx__bigN">{topScoreAway}</div>
        </div>

        <div className="mcx__side">
          {rightFlagSrc ? <img className="mcx__flagLg" src={rightFlagSrc} alt={`${match.away} flag`} /> : null}
          <div className="mcx__teamLbl">{match.away.toUpperCase()}</div>
        </div>
      </div>

      <div className="mcx__since dim">{sincePredictedTop}</div>

      <div className="mcx__miniBadge">
        <div className="mcx__miniTeam">
          {leftFlagSrc ? <img className="mcx__flagSm" src={leftFlagSrc} alt="" /> : null}
          <div className="mcx__miniN">{selectedScore.home}</div>
        </div>
        <div className="mcx__miniVS">vs</div>
        <div className="mcx__miniTeam">
          <div className="mcx__miniN">{selectedScore.away}</div>
          {rightFlagSrc ? <img className="mcx__flagSm" src={rightFlagSrc} alt="" /> : null}
        </div>
      </div>

      <div className="mcx__resultLine">{resultLine}</div>

      {isFinalized && <div className="mcx__closed dim">{finalizedMessage}</div>}

      {showClaimButton ? (
        <>
          <button className="mcx__claimBtn is-ready" onClick={handleClaim} disabled={txLoadingClaim}>
            {txLoadingClaim ? 'Claiming…' : `Claim ${formatVaraFromPlanck(claimableBn)} VARA`}
          </button>

          <div className="mcx__claimSub dim">
            You have <b>{formatVaraFromPlanck(claimableBn)} VARA</b> available for this match.
          </div>
        </>
      ) : null}

      <div className="mcx__bottom">
        <button className="mcx__viewAll" onClick={() => navigate('/all-predictions')}>
          View All Matches <span className="mcx__arrow">→</span>
        </button>
      </div>

      <details className="mcx__details">
        <summary className="mcx__summary">Place Prediction</summary>

        {isFinalized ? (
          <div className="mcx__body dim" style={{ padding: 12 }}>
            <b>{finalizedMessage}</b>
            <div style={{ marginTop: 8, opacity: 0.85 }}>
              You can’t place predictions on a finalized match. Please go back to the matches list.
            </div>
          </div>
        ) : (
          <>
            <div className="mcx__formGrid">
              <div className="mcx__formCol">
                <div className="mcx__label dim">{match.home}</div>
                <input
                  className="mcx__inp"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={20}
                  disabled={txLoadingBet || !isBeforeKickoff}
                  value={selectedScoreTextState.home}
                  onFocus={() =>
                    onFocusZeroToBlank(
                      () => selectedScoreTextState.home,
                      (v) => setSelectedScoreTextState((s) => ({ ...s, home: v })),
                    )
                  }
                  onBlur={() => {
                    onBlurBlankToZero(
                      () => selectedScoreTextState.home,
                      (v) => setSelectedScoreTextState((s) => ({ ...s, home: v })),
                    );
                    const v = selectedScoreTextState.home.trim();
                    setSelectedScore((s) => ({ ...s, home: v === '' ? 0 : clampScore(v) }));
                  }}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setSelectedScoreTextState((s) => ({ ...s, home: raw }));
                    setSelectedScore((s) => ({ ...s, home: raw === '' ? 0 : clampScore(raw) }));
                  }}
                />
              </div>

              <div className="mcx__formCol">
                <div className="mcx__label dim">{match.away}</div>
                <input
                  className="mcx__inp"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={20}
                  disabled={txLoadingBet || !isBeforeKickoff}
                  value={selectedScoreTextState.away}
                  onFocus={() =>
                    onFocusZeroToBlank(
                      () => selectedScoreTextState.away,
                      (v) => setSelectedScoreTextState((s) => ({ ...s, away: v })),
                    )
                  }
                  onBlur={() => {
                    onBlurBlankToZero(
                      () => selectedScoreTextState.away,
                      (v) => setSelectedScoreTextState((s) => ({ ...s, away: v })),
                    );
                    const v = selectedScoreTextState.away.trim();
                    setSelectedScore((s) => ({ ...s, away: v === '' ? 0 : clampScore(v) }));
                  }}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setSelectedScoreTextState((s) => ({ ...s, away: raw }));
                    setSelectedScore((s) => ({ ...s, away: raw === '' ? 0 : clampScore(raw) }));
                  }}
                />
              </div>
            </div>

            {selectedScore.home === selectedScore.away && (
              <div className="mcx__penBox">
                <div className="mcx__penTitle">Penalties (choose a winner)</div>

                <div className="mcx__formGrid">
                  <div className="mcx__formCol">
                    <div className="mcx__label dim">{match.home}</div>
                    <input
                      className="mcx__inp"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={10}
                      disabled={txLoadingBet || !isBeforeKickoff}
                      value={penaltiesTextState.home}
                      onFocus={() =>
                        onFocusZeroToBlank(
                          () => penaltiesTextState.home,
                          (v) => setPenaltiesTextState((p) => ({ ...p, home: v })),
                        )
                      }
                      onBlur={() => {
                        onBlurBlankToZero(
                          () => penaltiesTextState.home,
                          (v) => setPenaltiesTextState((p) => ({ ...p, home: v })),
                        );
                        const v = penaltiesTextState.home.trim();
                        setPenalties((p) => ({ ...p, home: v === '' ? 0 : clampPenalties(v) }));
                      }}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setPenaltiesTextState((p) => ({ ...p, home: raw }));
                        setPenalties((p) => ({ ...p, home: raw === '' ? 0 : clampPenalties(raw) }));
                      }}
                    />
                  </div>

                  <div className="mcx__formCol">
                    <div className="mcx__label dim">{match.away}</div>
                    <input
                      className="mcx__inp"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={10}
                      disabled={txLoadingBet || !isBeforeKickoff}
                      value={penaltiesTextState.away}
                      onFocus={() =>
                        onFocusZeroToBlank(
                          () => penaltiesTextState.away,
                          (v) => setPenaltiesTextState((p) => ({ ...p, away: v })),
                        )
                      }
                      onBlur={() => {
                        onBlurBlankToZero(
                          () => penaltiesTextState.away,
                          (v) => setPenaltiesTextState((p) => ({ ...p, away: v })),
                        );
                        const v = penaltiesTextState.away.trim();
                        setPenalties((p) => ({ ...p, away: v === '' ? 0 : clampPenalties(v) }));
                      }}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setPenaltiesTextState((p) => ({ ...p, away: raw }));
                        setPenalties((p) => ({ ...p, away: raw === '' ? 0 : clampPenalties(raw) }));
                      }}
                    />
                  </div>
                </div>

                <div className="dim" style={{ marginTop: 8 }}>
                  If you predict a draw, you must decide the winner on penalties.
                </div>
                {penalties.home === penalties.away && <div className="mcx__warn">Penalties can’t end in a tie.</div>}
              </div>
            )}

            <div className="mcx__formGrid" style={{ marginTop: 12 }}>
              <div className="mcx__formCol">
                <div className="mcx__label dim">Bet amount</div>
                <input
                  className="mcx__inp"
                  inputMode="decimal"
                  value={betAmount}
                  onChange={(e) => setBetAmount(e.target.value)}
                />
              </div>

              <div className="mcx__formCol">
                <div className="mcx__label dim">Currency</div>
                <select
                  className="mcx__sel"
                  value={betCurrency}
                  onChange={(e) => setBetCurrency(e.target.value as BetCurrency)}>
                  <option value="VARA">VARA</option>
                </select>
              </div>
            </div>

            <div className="mcx__meta dim">
              Prize Pool: <b>{poolVara} VARA</b> · Has predictions: <b>{match.has_bets ? 'Yes' : 'No'}</b>
              <br />
              KICK-OFF: <b>{formatKickoffMs(match.kick_off)}</b> · Status: <b>{statusLabel(match.result)}</b>
            </div>

            <button
              className="mcx__betBtn mcx__betBtn--wine"
              onClick={handlePlaceBet}
              disabled={txLoadingBet || !canBet}>
              {txLoadingBet ? 'Sending Bet…' : `Send Prediction (${betAmountNumber || 0} ${betCurrency})`}
            </button>
          </>
        )}
      </details>

      {!isFinalized && !isBeforeKickoff && (
        <div className="mcx__closed dim">Prediction is closed (kick-off time has passed).</div>
      )}
    </section>
  );
};
