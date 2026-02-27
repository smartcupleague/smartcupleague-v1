import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './match.css';
import { MatchCard } from './MatchCard';
import { Layout } from './Layout';
import { Wallet } from '@gear-js/wallet-connect';
import { useParams } from 'react-router-dom';
import { useAccount, useApi } from '@gear-js/react-hooks';
import { web3Enable } from '@polkadot/extension-dapp';
import { Program, Service } from '@/hocs/lib';
import { HexString } from '@gear-js/api';
import { TEAM_FLAGS } from '@/utils/teams';
import { StyledWallet } from '@/components/wallet/Wallet';
import { Header } from '@/components';

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
};

type IoBolaoState = {
  matches: MatchInfo[];
  final_prize_accumulated?: string | number | bigint;
  final_prize_accum?: string | number | bigint;
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

function sumAllMatchPools(matches: MatchInfo[]) {
  let total = 0n;
  for (const m of matches) {
    total += safeBigInt(m.match_prize_pool ?? m.total_pool ?? '0');
  }
  return total;
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

type BetCurrency = 'VARA' | 'wUSDC' | 'wUSDT';

type PredictionInput = {
  home: string;
  away: string;
  pensHome: string;
  pensAway: string;
};

function Match() {
  const { id: rawId } = useParams<{ id: string }>();
  const { api, isApiReady } = useApi();
  const { account } = useAccount();

  const matchId = useMemo(() => String(rawId ?? '').trim(), [rawId]);

  const [state, setState] = useState<IoBolaoState | null>(null);
  const [loadingState, setLoadingState] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [betAmount, setBetAmount] = useState<string>('10');
  const [betCurrency, setBetCurrency] = useState<BetCurrency>('VARA');

  const [pred, setPred] = useState<PredictionInput>({
    home: '',
    away: '',
    pensHome: '',
    pensAway: '',
  });

  const betAmountNumber = useMemo(() => {
    const n = Number(String(betAmount).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }, [betAmount]);

  useEffect(() => {
    void (async () => {
      try {
        await web3Enable('Vara Bolao Match Page');
      } catch {}
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

        result: m?.result ?? null,
      }));

      setState({
        matches,

        final_prize_accumulated: s?.final_prize_accumulated ?? undefined,

        final_prize_accum: s?.final_prize_accum ?? undefined,
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

  const grandPrizeBn = useMemo(() => {
    const v = state?.final_prize_accumulated ?? state?.final_prize_accum ?? 0;
    return safeBigInt(v);
  }, [state?.final_prize_accumulated, state?.final_prize_accum]);

  const allPoolsBn = useMemo(() => {
    if (!state?.matches?.length) return 0n;
    return sumAllMatchPools(state.matches);
  }, [state?.matches]);

  const grandPrizeText = useMemo(() => formatToken(grandPrizeBn), [grandPrizeBn]);
  const allPoolsText = useMemo(() => formatToken(allPoolsBn), [allPoolsBn]);

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

  const addressMock = formatAddress(account?.decodedAddress);
  const positionMock = '#10';
  const pointsMock = '55';

  const homeName = selectedMatch?.home ?? '—';
  const awayName = selectedMatch?.away ?? '—';

  const isTiePrediction = useMemo(() => {
    const h = pred.home === '' ? null : Number(pred.home);
    const a = pred.away === '' ? null : Number(pred.away);
    if (h === null || a === null) return false;
    return Number.isFinite(h) && Number.isFinite(a) && h === a;
  }, [pred.home, pred.away]);

  const prizeTopRight = useMemo(() => {
    if (!PROGRAM_ID) return 'Grand Prize: —';
    if (!isApiReady) return 'Grand Prize: Connecting…';
    if (loadingState) return 'Grand Prize: Loading…';
    if (error) return 'Grand Prize: Error';
    return `Grand Prize: ${grandPrizeText} VARA`;
  }, [isApiReady, loadingState, error, grandPrizeText]);

  return (
    <Layout>
      <div className="arena">
        <div className="arena__frame">
          <header className="arena__topbar">
            <div className="arena__topbarLeft">
              <div className="arena__crumb">MATCH</div>
              <div className="arena__address">
                Your Address: <span className="dim">{addressMock}</span>
              </div>
            </div>
            <div className="logo-small">
              <img className="logo-small" src="/Logos.png" alt="Soccer fans celebrating" />
            </div>

            <div className="arena__topbarRight">
              <div className="arena__statPill">{prizeTopRight}</div>
              <div className="arena__statPill">
                Pos: <b>{positionMock}</b> · Points: <b>{pointsMock}</b>
              </div>

              <Header />
            </div>
          </header>

          <div className="arena__grid">
            <aside className="left-column">
              <div className="sideCard">
                <div className="sideCard__title">YOUR TOURNAMENT STATS</div>
                <div className="sideRows">
                  <div className="sideRow">
                    <span className="dim">Matches Predicted</span>
                    <b>12/30</b>
                  </div>
                  <div className="sideRow">
                    <span className="dim">Correct: exact</span>
                    <b>7</b>
                  </div>
                  <div className="sideRow">
                    <span className="dim">Correct outcomes</span>
                    <b>3</b>
                  </div>
                  <div className="sideDivider" />
                  <div className="sideRow">
                    <span className="dim">Match Weight</span>
                    <b>x1 (Group Stage)</b>
                  </div>
                </div>
              </div>

              <div className="sideCard">
                <div className="sideCard__title">CURRENT MATCH POOL</div>
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
                    <span className="dim">—</span>
                  </div>
                  <div className="bar">
                    <i style={{ width: '33%' }} />
                  </div>

                  <div className="barRow">
                    <span>Draw</span>
                    <span className="dim">—</span>
                  </div>
                  <div className="bar">
                    <i style={{ width: '33%' }} />
                  </div>

                  <div className="barRow">
                    <span>{awayName}</span>
                    <span className="dim">—</span>
                  </div>
                  <div className="bar">
                    <i style={{ width: '33%' }} />
                  </div>
                </div>

                <div className="sideHint dim">Larger pool → lower payout per winner</div>
              </div>

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

              <div className="sideCard">
                <div className="sideCard__title">GRAND PRIZE</div>
                <div className="sideRows">
                  <div className="sideRow">
                    <span className="dim">Total Grand Prize</span>
                    <b>{loadingState ? 'Loading…' : `${grandPrizeText} VARA`}</b>
                  </div>
                  <div className="sideRow">
                    <span className="dim">Total Pool</span>
                    <b>{loadingState ? 'Loading…' : `${allPoolsText} VARA`}</b>
                  </div>
                  {error ? (
                    <div className="sideRow">
                      <span className="dim">Status</span>
                      <b>{error}</b>
                    </div>
                  ) : null}
                </div>
              </div>
            </aside>

            <section className="main-column">
              <div className="mainPanel mainPanel--fill">
                {matchProps ? (
                  <div className="matchCardWrap matchCardWrap--fill">
                    <MatchCard {...matchProps} currentScore={currentScore} currentScoreText={currentScoreText} />
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

          <footer className="match-footer">COPYRIGHTS 2025, SMART CUP LEAGUE</footer>
        </div>
      </div>
    </Layout>
  );
}

export default Match;
