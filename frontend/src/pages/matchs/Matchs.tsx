import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './match.css';

import { MatchCard } from './MatchCard';
import { InfoCard } from './InfoCard';
import { Layout } from './Layout';

import { Wallet } from '@gear-js/wallet-connect';
import { useNavigate, useParams } from 'react-router-dom';

import { useApi } from '@gear-js/react-hooks';
import { web3Enable } from '@polkadot/extension-dapp';
import { Program, Service } from '@/hocs/lib';
import { HexString } from '@gear-js/api';

const PROGRAM_ID = import.meta.env.VITE_BOLAOCOREPROGRAM as string;

export const matchCardPropsById = {
  '1': { id: '1', flag1: '/flags/qatar.jpg', flag2: '/flags/ecuador.jpg' },
  '2': { id: '2', flag1: '/flags/usa.jpg', flag2: '/flags/ghana.jpg' },
  '3': { id: '3', flag1: '/flags/mexico.jpg', flag2: '/flags/netherlands.jpg' },
  '4': { id: '4', flag1: '/flags/england.jpg', flag2: '/flags/canada.png' },
  '5': { id: '5', flag1: '/flags/argentina.jpg', flag2: '/flags/poland.jpg' },
  '6': { id: '6', flag1: '/flags/morocco.jpg', flag2: '/flags/korea_republic.jpg' },
  '7': { id: '7', flag1: '/flags/usa.jpg', flag2: '/flags/netherlands.jpg' },
  '8': { id: '8', flag1: '/flags/mexico.jpg', flag2: '/flags/ghana.jpg' },
  '9': { id: '9', flag1: '/flags/england.jpg', flag2: '/flags/japan.jpg' },
  '10': { id: '10', flag1: '/flags/argentina.jpg', flag2: '/flags/morocco.jpg' },
} as const;

type MatchId = keyof typeof matchCardPropsById;

type MatchInfo = {
  match_id: string;
  pool_home: string;
  pool_draw: string;
  pool_away: string;
};

type IoBolaoState = {
  matches: MatchInfo[];
  final_prize_accum: string | number | bigint;
};

const VARA_DECIMALS = 12;

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

function sumAllMatchPools(matches: MatchInfo[]) {
  let total = 0n;
  for (const m of matches) {
    total += safeBigInt(m.pool_home);
    total += safeBigInt(m.pool_draw);
    total += safeBigInt(m.pool_away);
  }
  return total;
}

type BetCurrency = 'VARA' | 'wUSDC' | 'wUSDT';

function Match() {
  const { id: rawId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { api, isApiReady } = useApi();

  const matchId: MatchId | null = useMemo(() => {
    if (!rawId) return null;
    return Object.prototype.hasOwnProperty.call(matchCardPropsById, rawId) ? (rawId as MatchId) : null;
  }, [rawId]);

  const matchProps = matchId ? matchCardPropsById[matchId] : null;

  const [state, setState] = useState<IoBolaoState | null>(null);
  const [loadingState, setLoadingState] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [betAmount, setBetAmount] = useState<string>('10');
  const [betCurrency, setBetCurrency] = useState<BetCurrency>('VARA');

  const betAmountNumber = useMemo(() => {
    const n = Number(String(betAmount).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }, [betAmount]);

  const betDisabled = !betAmount || betAmountNumber <= 0;

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
    if (!program) return;
    setLoadingState(true);
    setError(null);

    try {
      const svc = new Service(program);
      const s = (await svc.queryState()) as any;

      const matches: MatchInfo[] = (s?.matches ?? []).map((m: any) => ({
        match_id: String(m?.match_id ?? ''),
        pool_home: String(m?.pool_home ?? '0'),
        pool_draw: String(m?.pool_draw ?? '0'),
        pool_away: String(m?.pool_away ?? '0'),
      }));

      setState({
        matches,
        final_prize_accum: s?.final_prize_accum ?? '0',
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

  const grandPrizeBn = useMemo(() => safeBigInt(state?.final_prize_accum ?? 0), [state?.final_prize_accum]);

  const allPoolsBn = useMemo(() => {
    if (!state?.matches?.length) return 0n;
    return sumAllMatchPools(state.matches);
  }, [state?.matches]);

  const grandPrizeText = useMemo(() => formatToken(grandPrizeBn), [grandPrizeBn]);
  const allPoolsText = useMemo(() => formatToken(allPoolsBn), [allPoolsBn]);

  const selectedMatchPools = useMemo(() => {
    if (!matchId || !state?.matches?.length) return null;
    return state.matches.find((m) => String(m.match_id) === String(matchId)) ?? null;
  }, [matchId, state?.matches]);

  const prizeHighlight = useMemo(() => {
    if (!PROGRAM_ID) return 'Missing env: VITE_BOLAOCOREPROGRAM';
    if (!isApiReady) return 'Connecting…';
    if (loadingState) return 'Loading…';
    if (error) return 'Error';
    return `${grandPrizeText} VARA`;
  }, [PROGRAM_ID, isApiReady, loadingState, error, grandPrizeText]);

  const addressMock = '0x5al3…2';
  const positionMock = '#10';
  const pointsMock = '55';

  return (
    <Layout>
      <div className="match-screen">
        <div className="match-page__topbar">
          <div className="brand">
            <div className="brand__logo">smartcupLeague</div>
          </div>

          <button className="btn-back" onClick={() => navigate(-1)}>
            BACK
          </button>
        </div>

        <div className="match-page">
          <aside className="left-column">
            <InfoCard title="Until now you win" highlight="+US$50.00" />

            <InfoCard title="Grand Prize" highlight={prizeHighlight}>
              <ul className="info-list">
                <li>
                  Total Grand Prize: <b>{loadingState ? 'Loading…' : `${grandPrizeText} VARA`}</b>
                </li>
                <li>
                  Total Pool: <b>{loadingState ? 'Loading…' : `${allPoolsText} VARA`}</b>
                </li>
                {error ? (
                  <li>
                    Status: <b>{error}</b>
                  </li>
                ) : null}
              </ul>
            </InfoCard>

            <InfoCard title="Matches Participation">
              <p className="dim">50% (32/64) games</p>
              <p>
                <b>CONGRATS</b>
              </p>
              <p className="dim">you are a eligible to win the Grand Prize</p>

              {selectedMatchPools ? (
                <div className="mini-section">
                  <div className="mini-section__title">Selected match pools</div>
                  <ul className="info-list">
                    <li>
                      Home: <b>{formatToken(selectedMatchPools.pool_home)} VARA</b>
                    </li>
                    <li>
                      Draw: <b>{formatToken(selectedMatchPools.pool_draw)} VARA</b>
                    </li>
                    <li>
                      Away: <b>{formatToken(selectedMatchPools.pool_away)} VARA</b>
                    </li>
                  </ul>
                </div>
              ) : null}
            </InfoCard>

            <InfoCard title="Points Calculation">
              <p className="dim">Match n# 1 : win 2 pts.</p>
              <p className="dim">Match n# 2 : win 1 pts.</p>
              <p className="dim">Match n# 3 : win 2 pts.</p>
              <p className="dim">Match n# 4 : win 1 pts.</p>
              <p className="dim">Match n# 5 : win 2 pts.</p>
              <p className="dim">Match n# 6 : win 1 pts.</p>
              <p className="dim">Match n# 7 : win 2 pts.</p>
              <p className="dim">Match n# 8 : win 1 pts.</p>
            </InfoCard>
          </aside>

          <section className="main-column">
            <header className="top-summary">
              <div className="top-summary__left">
                <div className="top-summary__row">
                  Your Address: <span className="dim">{addressMock}</span>
                </div>
                <div className="top-summary__row">
                  Total Grand Prize: <b>{loadingState ? 'Loading…' : `${grandPrizeText} VARA`}</b>
                </div>
              </div>

              <div className="top-summary__right">
                <div className="top-summary__row">
                  GrandPrize Pos: <b>{positionMock}</b>
                </div>
                <div className="top-summary__row">
                  Points: <b>{pointsMock}</b>
                </div>
              </div>

              <div className="top-summary__wallet">
                <Wallet />
              </div>
            </header>

            {matchProps ? (
              <div className="match-panel">
                <div className="match-panel__pill">Partida n#: {matchId}</div>

                <div className="match-panel__body">
                  <MatchCard {...matchProps} />
                </div>
              </div>
            ) : (
              <div className="info-card">
                <h3 className="info-card__title">Match not found</h3>
                <div className="info-card__body">The selected match does not exist.</div>
              </div>
            )}

            <div className="status-strip">
              {!PROGRAM_ID ? <div className="dim">Missing env: VITE_BOLAOCOREPROGRAM</div> : null}
              {error ? <div className="dim">State: {error}</div> : null}
            </div>
          </section>
        </div>

        <footer className="match-footer">COPYRIGHTS 2025, SMART CUP LEAGUE</footer>
      </div>
    </Layout>
  );
}

export default Match;
