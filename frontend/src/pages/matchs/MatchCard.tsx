import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount, useApi } from '@gear-js/react-hooks';
import { web3Enable, web3FromSource } from '@polkadot/extension-dapp';
import { Program, Service } from '@/hocs/lib';
import { TransactionBuilder } from 'sails-js';
import { useToast } from '@/hooks/useToast';
import './styles.css';

const PROGRAM_ID = import.meta.env.VITE_BOLAOCOREPROGRAM;

type Outcome = 'Home' | 'Draw' | 'Away';

type ResultStatus =
  | { Unresolved: null }
  | { Proposed: { outcome: Outcome; oracle: string } }
  | { Finalized: { outcome: Outcome } };

type MatchInfo = {
  match_id: string;
  phase: string;
  home: string;
  away: string;
  kick_off: string; // ms
  result: ResultStatus;
  pool_home: string;
  pool_draw: string;
  pool_away: string;
  has_bets: boolean;
  participants: string[];
};

type IoBolaoState = {
  matches: MatchInfo[];
};

type OddRow = {
  result: string;
  odd: number | string;
  payout: number | string;
};

export interface MatchCardProps {
  id: string;
  flag1: string;
  flag2: string;
}

function formatKickoffMs(msString: string) {
  const ms = Number(msString);
  if (!ms || Number.isNaN(ms)) return '—';
  return new Date(ms).toLocaleString(undefined, {
    year: '2-digit',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(result: ResultStatus) {
  if ('Unresolved' in result) return 'Open';
  if ('Proposed' in result) return `Proposed (${result.Proposed.outcome})`;
  if ('Finalized' in result) return `Finalized (${result.Finalized.outcome})`;
  return 'Unknown';
}

function totalPool(m: MatchInfo) {
  return Number(m.pool_home) + Number(m.pool_draw) + Number(m.pool_away);
}

function safeDiv(n: number, d: number) {
  return d === 0 ? 0 : n / d;
}

function buildOddsFromPools(m: MatchInfo): OddRow[] {
  const t = totalPool(m);
  const homeOdd = m.pool_home === '0' ? 0 : safeDiv(t, Number(m.pool_home));
  const drawOdd = m.pool_draw === '0' ? 0 : safeDiv(t, Number(m.pool_draw));
  const awayOdd = m.pool_away === '0' ? 0 : safeDiv(t, Number(m.pool_away));

  return [
    { result: m.home, odd: Number(homeOdd.toFixed(2)), payout: Number(homeOdd.toFixed(2)) },
    { result: 'Draw', odd: Number(drawOdd.toFixed(2)), payout: Number(drawOdd.toFixed(2)) },
    { result: m.away, odd: Number(awayOdd.toFixed(2)), payout: Number(awayOdd.toFixed(2)) },
  ];
}

const FLAG_MAP: Record<string, string> = {
  qatar: '/images/flag_qatar.jpg',
  ecuador: '/images/flag_ecuador.jpg',
  england: '/images/flag_england.jpg',
  iran: '/images/flag_iran.jpg',
  argentina: '/images/flag_argentina.jpg',
  saudi_arabia: '/images/flag_saudi_arabia.jpg',
};

function resolveFlag(flag: string): string {
  const raw = (flag || '').trim();
  if (!raw) return '';
  const key = raw.toLowerCase();

  if (
    key.startsWith('http://') ||
    key.startsWith('https://') ||
    key.startsWith('/') ||
    key.includes('.png') ||
    key.includes('.jpg') ||
    key.includes('.jpeg') ||
    key.includes('.webp')
  ) {
    return raw;
  }

  return FLAG_MAP[key] || '';
}

const OddsTable: React.FC<{
  rows: OddRow[];
  selected: Outcome | null;
  onPick: (o: Outcome) => void;
  disabled: boolean;
}> = ({ rows, selected, onPick, disabled }) => {
  const outcomes: Outcome[] = ['Home', 'Draw', 'Away'];

  return (
    <div className="odds-table">
      <div className="odds-table__header">
        <div>Result</div>
        <div style={{ textAlign: 'center' }}>Estimated Odds</div>
        <div style={{ textAlign: 'right' }}>Pick</div>
      </div>

      {rows.map((r, idx) => {
        const outcome = outcomes[idx];
        const isSel = selected === outcome;

        return (
          <div className="odds-table__row" key={`${r.result}-${idx}`}>
            <div className="odds-table__result">{r.result}</div>
            <div style={{ textAlign: 'center', fontWeight: 700 }}>{r.odd}</div>
            <div style={{ textAlign: 'right' }}>
              <button
                className="bet-button"
                disabled={disabled}
                onClick={() => onPick(outcome)}
                style={{
                  background: isSel ? 'var(--maroon-light)' : 'var(--accent)',
                  opacity: disabled ? 0.55 : 1,
                }}>
                {isSel ? 'Selected' : 'Choose'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const MatchCard: React.FC<MatchCardProps> = ({ id, flag1, flag2 }) => {
  const navigate = useNavigate();
  const { account } = useAccount();
  const toast = useToast();
  const { api, isApiReady } = useApi();

  const [state, setState] = useState<IoBolaoState | null>(null);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<Outcome | null>(null);
  const [txLoading, setTxLoading] = useState(false);

  const leftFlagSrc = useMemo(() => resolveFlag(flag1), [flag1]);
  const rightFlagSrc = useMemo(() => resolveFlag(flag2), [flag2]);

  useEffect(() => {
    void web3Enable('Vara Bolao MatchCard');
  }, []);

  const fetchState = useCallback(async () => {
    if (!api || !isApiReady) return;
    setLoading(true);
    try {
      const svc = new Service(new Program(api, PROGRAM_ID));
      const s = (await svc.queryState()) as IoBolaoState;
      setState(s);
    } catch {
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [api, isApiReady]);

  useEffect(() => {
    void fetchState();
  }, [fetchState]);

  const match = useMemo(() => {
    if (!state?.matches || !id) return null;
    return state.matches.find((m) => String(m.match_id) === String(id)) || null;
  }, [state, id]);

  const oddsRows = useMemo(() => (match ? buildOddsFromPools(match) : []), [match]);

  const isBeforeKickoff = useMemo(() => {
    if (!match) return false;
    return Number(match.kick_off) > Date.now(); // ms
  }, [match]);

  const handleBet = useCallback(async () => {
    if (!match) return;

    if (!selected) {
      toast.error('Please select a result');
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

    try {
      setTxLoading(true);

      const svc = new Service(new Program(api, PROGRAM_ID));
      const tx: TransactionBuilder<unknown> = svc.bet(BigInt(match.match_id), selected);

      const { signer } = await web3FromSource(account.meta.source);
      tx.withAccount(account.decodedAddress, { signer }).withValue(BigInt(10000000000000));

      await tx.calculateGas();
      const { blockHash, response } = await tx.signAndSend();

      toast.info(`Transaction included in block ${blockHash}`);
      await response();
      toast.success('Prediction placed successfully ✅');

      setSelected(null);
      setTimeout(fetchState, 900);
    } catch {
      toast.error('Prediction failed');
    } finally {
      setTxLoading(false);
    }
  }, [match, selected, account, api, isApiReady, isBeforeKickoff, toast, fetchState]);

  const betAmount = 10;
  const disabledPick = txLoading || !isBeforeKickoff;

  /* ---------- UI states ---------- */

  if (loading) {
    return (
      <section className="match-card">
        <div className="match-card__header">
          <span className="match-tag">Loading match…</span>
        </div>
        <div className="match-card__content" style={{ opacity: 0.9, fontSize: 13 }}>
          Fetching contract state…
        </div>
      </section>
    );
  }

  if (!id) {
    return (
      <section className="match-card">
        <div className="match-card__header">
          <span className="match-tag">Invalid match id</span>
        </div>
        <div className="match-card__content">
          <div style={{ fontSize: 13, opacity: 0.9 }}>Missing match id.</div>
          <div className="match-card__footer">
            <button className="back-button" onClick={() => navigate(-1)}>
              Back
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (!match) {
    return (
      <section className="match-card">
        <div className="match-card__header">
          <span className="match-tag">Match not found</span>
        </div>
        <div className="match-card__content">
          <div style={{ fontSize: 13, opacity: 0.9 }}>No match exists with id: {id}</div>
          <div className="match-card__footer">
            <button className="back-button" onClick={() => navigate(-1)}>
              Back
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="match-card">
      <div className="match-card__header">
        <span className="match-tag">
          Match #{match.match_id} · {match.phase} · {statusLabel(match.result)}
        </span>
      </div>

      <div className="match-card__content">
        {/* Teams */}
        <div className="teams-row">
          <div className="team">
            <div className="team-flag">🏟️</div>
            <div className="team-name">{match.home}</div>
            {leftFlagSrc ? <img className="logo-small" src={leftFlagSrc} alt={`${match.home} flag`} /> : null}
          </div>

          <div className="result-column">
            <span className="result-label">KICK-OFF</span>
            <div className="result-scores">
              <span className="score-badge" style={{ fontSize: 12 }}>
                {formatKickoffMs(match.kick_off)}
              </span>
            </div>
          </div>

          <div className="team">
            <div className="team-flag">🏟️</div>
            <div className="team-name">{match.away}</div>
            {rightFlagSrc ? <img className="logo-small" src={rightFlagSrc} alt={`${match.away} flag`} /> : null}
          </div>
        </div>

        {/* Odds + picks */}
        <OddsTable rows={oddsRows} selected={selected} onPick={setSelected} disabled={disabledPick} />

        {/* Footer */}
        <div className="match-card__footer" style={{ gap: 10 }}>
          <div style={{ marginRight: 'auto', fontSize: 12, opacity: 0.9 }}>
            Prize Pool: <b>{totalPool(match) / 1000000000000} VARA</b>
            {' · '}Has predictions: <b>{match.has_bets ? 'Yes' : 'No'}</b>
          </div>

          <button className="back-button" onClick={() => navigate(-1)} disabled={txLoading}>
            Back
          </button>

          <button
            className="bet-button"
            onClick={handleBet}
            disabled={txLoading || !selected || !isBeforeKickoff}
            style={{ opacity: !isBeforeKickoff ? 0.55 : 1 }}>
            {txLoading ? 'Sending…' : `Bet ${betAmount.toFixed(2)} VARA`}
          </button>
        </div>

        {!isBeforeKickoff && (
          <div style={{ marginTop: 12, fontSize: 12, opacity: 0.85 }}>
            Betting is closed (kick-off time has passed).
          </div>
        )}
      </div>
    </section>
  );
};
