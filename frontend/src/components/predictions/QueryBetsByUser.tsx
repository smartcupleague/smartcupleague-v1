import React, { useState, useEffect, useCallback, useMemo } from 'react';
import styled, { keyframes } from 'styled-components';
import { useAccount, useAlert, useApi } from '@gear-js/react-hooks';
import { web3Enable, web3FromSource } from '@polkadot/extension-dapp';
import { Program, Service } from '@/hocs/lib';
import { Wallet } from '@gear-js/wallet-connect';
import { TransactionBuilder } from 'sails-js';
import { TEAM_FLAGS } from '@/utils/teams';

const PROGRAM_ID = import.meta.env.VITE_BOLAOCOREPROGRAM;

type Score = { home: number; away: number };
type Outcome = 'Home' | 'Draw' | 'Away';

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

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const shimmer = keyframes`
  0% { transform: translateX(-120%) skewX(-20deg); opacity: .0; }
  25% { opacity: .85; }
  60% { opacity: .55; }
  100% { transform: translateX(120%) skewX(-20deg); opacity: .0; }
`;

const pulse = keyframes`
  0%, 100% { transform: translateY(0); filter: brightness(1); }
  50% { transform: translateY(-1px); filter: brightness(1.05); }
`;

const Shell = styled.div`
  position: relative;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const TopHeader = styled.header`
  width: 100%;
  border-radius: calc(var(--r) + 8px);
  border: 1px solid var(--stroke2);
  background:
    radial-gradient(900px 260px at 18% 0%, rgba(255, 0, 110, 0.14), transparent 60%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05));
  backdrop-filter: var(--blur);
  box-shadow: var(--shadow);
  padding: 14px 14px 12px;
`;

const HeaderRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;

  @media (max-width: 980px) {
    flex-direction: column;
  }
`;

const TitleBlock = styled.div`
  min-width: 0;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 22px;
  font-weight: 900;
  letter-spacing: 0.2px;
  color: rgba(255, 255, 255, 0.94);
`;

const Subtitle = styled.div`
  margin-top: 6px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
`;

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;

  @media (max-width: 980px) {
    width: 100%;
    justify-content: space-between;
    flex-wrap: wrap;
  }
`;

const SearchPill = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  min-width: 360px;

  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.12);
  backdrop-filter: var(--blur);

  @media (max-width: 980px) {
    min-width: 0;
    width: 100%;
  }
`;

const SearchIcon = styled.span`
  opacity: 0.8;
`;

const SearchInput = styled.input`
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  color: rgba(255, 255, 255, 0.92);
  font-size: 13px;

  &::placeholder {
    color: rgba(255, 255, 255, 0.55);
  }
`;

const Chips = styled.div`
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
`;

const Chip = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.12);
  color: rgba(255, 255, 255, 0.88);
`;

const ChipBadge = styled.span`
  width: 26px;
  height: 26px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background:
    radial-gradient(circle at 30% 20%, rgba(255, 79, 156, 0.4), transparent 60%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.05));
  border: 1px solid rgba(255, 255, 255, 0.12);
`;

const TabsRow = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 12px;
`;

const Tab = styled.button<{ $active?: boolean }>`
  border: 1px solid ${({ $active }) => ($active ? 'rgba(255,0,110,.45)' : 'rgba(255,255,255,.12)')};
  background: ${({ $active }) =>
    $active
      ? 'radial-gradient(520px 140px at 20% 20%, rgba(255,0,110,.20), transparent 62%), rgba(0,0,0,.10)'
      : 'rgba(0,0,0,.10)'};
  color: rgba(255, 255, 255, 0.88);
  padding: 10px 12px;
  border-radius: 14px;
  cursor: pointer;
  font-weight: 800;
  font-size: 13px;
  transition:
    transform 0.15s ease,
    background 0.15s ease,
    border-color 0.15s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.08);
  }
`;

const SectionTitle = styled.div`
  margin-top: 6px;
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 0 2px;

  .main {
    font-weight: 950;
    font-size: 18px;
    color: rgba(255, 255, 255, 0.92);
  }
  .sub {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.68);
  }
`;

const CupCard = styled.section`
  width: 100%;
  border-radius: calc(var(--r) + 8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: radial-gradient(900px 260px at 18% 0%, rgba(255, 0, 110, 0.12), transparent 60%), rgba(0, 0, 0, 0.1);
  backdrop-filter: var(--blur);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.35);
  overflow: hidden;
`;

const CupHead = styled.div`
  padding: 12px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
`;

const CupLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
`;

const CupIcon = styled.div`
  width: 30px;
  height: 30px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
`;

const CupTitle = styled.div`
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 10px;

  .t {
    font-weight: 950;
    color: rgba(255, 255, 255, 0.92);
  }
  .s {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.68);
  }
`;

const CupTools = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const ToolBtn = styled.button`
  width: 34px;
  height: 34px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.1);
  color: rgba(255, 255, 255, 0.84);
  cursor: pointer;
  transition:
    transform 0.15s ease,
    background 0.15s ease,
    border-color 0.15s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.08);
  }
`;

const CupTableHead = styled.div`
  padding: 10px 14px 8px;
  display: grid;
  grid-template-columns: 1.6fr 140px 190px 190px 140px 160px;
  gap: 10px;
  color: rgba(255, 255, 255, 0.65);
  font-size: 12px;

  @media (max-width: 980px) {
    grid-template-columns: 1fr 140px 140px;
    .colHide {
      display: none;
    }
  }
`;

const CupRows = styled.div`
  display: grid;
  gap: 8px;
  padding: 0 14px 12px;
`;

const Row = styled.div`
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.1);
  padding: 10px 12px;

  display: grid;
  grid-template-columns: 1.6fr 140px 190px 190px 140px 160px;
  gap: 10px;
  align-items: center;

  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    transform 0.15s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(255, 0, 110, 0.35);
    background: rgba(255, 255, 255, 0.06);
  }

  @media (max-width: 980px) {
    grid-template-columns: 1fr 140px 140px;
    .colHide {
      display: none;
    }
  }
`;

const MatchCell = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
`;

const MatchBadge = styled.span`
  width: 26px;
  height: 26px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.85);
  font-weight: 900;
  font-size: 12px;
`;

const MatchText = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const TeamsLine = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
`;

const TeamBlock = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
`;

const TeamName = styled.span`
  font-weight: 950;
  color: rgba(255, 255, 255, 0.92);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
`;

const Vs = styled.span`
  font-size: 12px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.55);
`;

const SmallFlag = styled.img`
  width: 22px;
  height: 16px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  object-fit: cover;
  background: rgba(0, 0, 0, 0.14);
  flex: 0 0 auto;
`;

const MetaRow = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.66);
`;

const MiniPill = styled.span`
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.1);
  color: rgba(255, 255, 255, 0.78);
`;

const AmountCell = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: flex-start;
  gap: 8px;

  .n {
    font-weight: 950;
    color: rgba(255, 255, 255, 0.92);
  }
  .u {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.66);
    font-weight: 800;
  }
`;

const WinCell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;

  .n {
    font-weight: 980;
    color: rgba(255, 235, 200, 0.94);
    text-shadow: 0 0 16px rgba(255, 0, 110, 0.12);
    letter-spacing: 0.2px;
  }
  .u {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.66);
    font-weight: 800;
  }
  .sub {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.6);
    font-weight: 800;
  }
`;

const StatusPill = styled.span<{ $variant: 'ok' | 'muted' | 'final' }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;

  border: 1px solid
    ${({ $variant }) =>
      $variant === 'ok'
        ? 'rgba(65, 214, 114, 0.45)'
        : $variant === 'final'
          ? 'rgba(255, 0, 110, 0.45)'
          : 'rgba(255,255,255,0.18)'};
  background: ${({ $variant }) =>
    $variant === 'ok'
      ? 'rgba(65, 214, 114, 0.14)'
      : $variant === 'final'
        ? 'rgba(255, 0, 110, 0.14)'
        : 'rgba(255,255,255,0.08)'};
  color: ${({ $variant }) =>
    $variant === 'ok'
      ? 'rgba(210, 255, 225, 0.95)'
      : $variant === 'final'
        ? 'rgba(255,255,255,0.92)'
        : 'rgba(255,255,255,0.78)'};
`;

const ScorePill = styled.div`
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;

  padding: 10px 12px;
  border-radius: 16px;

  border: 1px solid rgba(255, 0, 110, 0.35);
  background: radial-gradient(520px 180px at 20% 15%, rgba(255, 0, 110, 0.22), transparent 60%), rgba(0, 0, 0, 0.1);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.28);
  min-width: 160px;

  .label {
    font-size: 11px;
    letter-spacing: 0.8px;
    font-weight: 900;
    opacity: 0.75;
  }

  .score {
    font-size: 22px;
    font-weight: 950;
    letter-spacing: 0.4px;
    color: rgba(255, 255, 255, 0.95);
  }

  .hint {
    font-size: 11px;
    opacity: 0.75;
  }
`;

const ClaimBtn = styled.button<{ disabled?: boolean }>`
  position: relative;
  height: 36px;
  padding: 0 14px;
  border-radius: 14px;
  border: 1px solid rgba(255, 215, 0, 0.35);
  cursor: pointer;
  font-weight: 980;
  color: rgba(35, 24, 0, 0.95);
  letter-spacing: 0.2px;

  background:
    linear-gradient(135deg, rgba(255, 215, 0, 0.98) 0%, rgba(255, 179, 0, 0.96) 45%, rgba(255, 244, 200, 0.98) 100%),
    radial-gradient(420px 160px at 20% 10%, rgba(255, 255, 255, 0.55), transparent 60%);
  box-shadow:
    0 14px 34px rgba(255, 200, 40, 0.22),
    0 14px 28px rgba(0, 0, 0, 0.22);
  transition:
    transform 0.16s ease,
    filter 0.16s ease,
    box-shadow 0.16s ease,
    opacity 0.16s ease;

  &:hover {
    transform: translateY(-1px);
    filter: brightness(1.02);
    box-shadow:
      0 18px 46px rgba(255, 200, 40, 0.26),
      0 16px 30px rgba(0, 0, 0, 0.26);
  }

  &:active {
    transform: translateY(0);
    filter: brightness(0.98);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.58;
    transform: none;
    filter: grayscale(0.2);
    box-shadow: 0 10px 22px rgba(0, 0, 0, 0.18);
  }

  &::after {
    content: '';
    position: absolute;
    top: -40%;
    left: -30%;
    width: 60%;
    height: 180%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.55), transparent);
    transform: translateX(-120%) skewX(-20deg);
    opacity: 0;
    pointer-events: none;
  }

  &:not(:disabled)::after {
    animation: ${shimmer} 2.3s ease-in-out infinite;
  }

  &:not(:disabled) {
    animation: ${pulse} 2.8s ease-in-out infinite;
  }
`;

const ClaimBtnInner = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 10px;
`;

const ClaimDot = styled.span`
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: rgba(35, 24, 0, 0.85);
  box-shadow: 0 0 14px rgba(255, 255, 255, 0.35);
`;

const ActionWrap = styled.div`
  display: flex;
  justify-content: flex-end;
`;

const CupFoot = styled.div`
  padding: 10px 14px 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
`;

const ViewMore = styled.div`
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(0, 0, 0, 0.1);
  color: rgba(255, 255, 255, 0.84);
  padding: 10px 12px;
  border-radius: 999px;
  font-weight: 850;
`;

const Spinner = styled.div`
  width: 1.05rem;
  height: 1.05rem;
  border: 2.5px solid rgba(35, 24, 0, 0.9);
  border-top-color: transparent;
  border-radius: 50%;
  animation: ${spin} 0.85s linear infinite;
  display: inline-block;
  vertical-align: middle;
`;

const EmptyState = styled.div`
  color: rgba(255, 255, 255, 0.7);
  padding: 0.6rem 0.2rem;
`;

const ErrorState = styled.div`
  color: rgba(255, 180, 180, 0.92);
  padding: 0.6rem 0.2rem;
`;

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
  if (typeof v === 'string') return v as PenaltyWinner;
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

  const betOutcome = outcomeOf(betScore);
  const finalOutcome = outcomeOf(finalScore);

  if (!knockout) {
    return betOutcome === finalOutcome;
  }

  if (drawFinal) {
    return !!betPenalty && !!finalPenalty && betPenalty === finalPenalty;
  }

  return betOutcome === finalOutcome;
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

      parsed.sort((a: ContractUserBetView, b: ContractUserBetView) => Number(b.match_id) - Number(a.match_id));
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
    <Shell>
      <TopHeader>
        <HeaderRow>
          <TitleBlock>
            <Title>My Predictions</Title>
            <Subtitle>
              Potential Winnings shows an estimate, and becomes exact once the match is finalized + settled.
            </Subtitle>
          </TitleBlock>

          <HeaderRight>
            <SearchPill>
              <SearchIcon>🔎</SearchIcon>
              <SearchInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search teams, match id, score (e.g. 2-1), status"
              />
            </SearchPill>

            <Chips>
              <Chip>
                <ChipBadge>👤</ChipBadge>
                <Wallet />
              </Chip>
            </Chips>
          </HeaderRight>
        </HeaderRow>

        <TabsRow>
          <Tab $active={tab === 'wc'} onClick={() => setTab('wc')}>
            World Cup 2026
          </Tab>
        </TabsRow>
      </TopHeader>

      <SectionTitle>
        <div className="main">World Cup 2026</div>
        <div className="sub">Knockout Stage</div>
      </SectionTitle>

      {!connected ? (
        <ErrorState>Connect your wallet to see your predictions.</ErrorState>
      ) : loading ? (
        <EmptyState>
          <Spinner /> Loading predictions…
        </EmptyState>
      ) : errMsg ? (
        <ErrorState>{errMsg}</ErrorState>
      ) : (
        <CupCard>
          <CupHead>
            <CupLeft>
              <CupIcon>🏆</CupIcon>
              <CupTitle>
                <span className="t">World Cup 2026</span>
                <span className="s">• Knockout Stage</span>
              </CupTitle>
            </CupLeft>

            <CupTools>
              <ToolBtn title="Refresh" onClick={() => (account && isApiReady ? fetchBets() : undefined)}>
                ⟳
              </ToolBtn>
              <ToolBtn title="Refresh state" onClick={() => (isApiReady ? fetchState() : undefined)}>
                ⛁
              </ToolBtn>
            </CupTools>
          </CupHead>

          <CupTableHead>
            <div>Match</div>
            <div>Stake</div>
            <div>Your Pick</div>
            <div className="colHide">Potential / Real</div>
            <div>Status</div>
            <div>Action</div>
          </CupTableHead>

          <CupRows>
            {wcBets.length === 0 ? (
              <EmptyState style={{ padding: '10px 2px' }}>No Predictions found for your account.</EmptyState>
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
                const canClaim = matchFinal && settlementPrepared && eligible && !claimed;

                const statusVariant = claimed ? 'ok' : matchFinal ? 'final' : 'muted';
                const statusLabelText = claimed ? 'Claimed' : matchFinal ? 'Finalized' : 'Pending';

                const isClaiming = !!claimingByMatch[Number(b.match_id)];

                const claimTitle = claimed
                  ? 'Already claimed'
                  : !matchFinal
                    ? 'Match not finalized yet'
                    : !settlementPrepared
                      ? 'Settlement not prepared yet (admin must prepare settlement)'
                      : !eligible
                        ? 'Not eligible (requires exact score OR correct outcome; in knockout draws: correct penalty winner)'
                        : isClaiming
                          ? 'Claiming...'
                          : 'Claim your winnings';

                return (
                  <Row key={`wc-${String(b.match_id)}-${i}`}>
                    <MatchCell>
                      <MatchBadge>{i + 1}</MatchBadge>

                      <MatchText>
                        <TeamsLine title={`${home} vs ${away}`}>
                          <TeamBlock>
                            <SmallFlag src={flagForTeam(home)} alt={`${home} flag`} />
                            <TeamName>{home}</TeamName>
                          </TeamBlock>

                          <Vs>vs</Vs>

                          <TeamBlock>
                            <TeamName>{away}</TeamName>
                            <SmallFlag src={flagForTeam(away)} alt={`${away} flag`} />
                          </TeamBlock>
                        </TeamsLine>

                        <MetaRow>
                          <MiniPill>#{String(b.match_id)}</MiniPill>

                          <MiniPill>{phase}</MiniPill>
                          <MiniPill>Kickoff: {kickoff}</MiniPill>
                          <MiniPill>Pool: {poolHuman}</MiniPill>
                          <MiniPill>
                            Current:{' '}
                            <b style={{ color: 'rgba(255,255,255,.92)' }}>
                              {current.home}-{current.away}
                            </b>{' '}
                            <span style={{ opacity: 0.7 }}>• {current.tag}</span>
                          </MiniPill>

                          {matchFinal ? (
                            <MiniPill>
                              Eligibility:{' '}
                              <b style={{ color: eligible ? 'rgba(255,236,160,.95)' : 'rgba(255,180,180,.92)' }}>
                                {eligible ? (exactHit ? 'Eligible (exact)' : 'Eligible (outcome)') : 'Not eligible'}
                              </b>
                            </MiniPill>
                          ) : null}

                          {matchFinal ? (
                            <MiniPill>
                              Settlement:{' '}
                              <b
                                style={{
                                  color: settlementPrepared ? 'rgba(255,236,160,.95)' : 'rgba(255,235,200,.92)',
                                }}>
                                {settlementPrepared ? 'Ready' : 'Not prepared'}
                              </b>
                            </MiniPill>
                          ) : null}

                          {betPenalty ? <MiniPill>Penalty: {betPenalty}</MiniPill> : null}
                        </MetaRow>
                      </MatchText>
                    </MatchCell>

                    <AmountCell>
                      <span className="n">{Number.isFinite(stakeHuman) ? stakeHuman.toFixed(4) : '0.0000'}</span>
                      <span className="u">VARA</span>
                    </AmountCell>

                    <ScorePill>
                      <div className="label">YOUR PICK</div>
                      <div className="score">{pickText}</div>
                      <div className="hint">Score / outcome</div>
                    </ScorePill>

                    <div className="colHide">
                      <WinCell>
                        <span className="n">{displayValue}</span>
                        <span className="u">VARA</span>
                        <span className="sub">{displaySub}</span>
                      </WinCell>
                    </div>

                    <StatusPill $variant={statusVariant as any}>{statusLabelText}</StatusPill>

                    <ActionWrap>
                      <ClaimBtn
                        disabled={!canClaim || isClaiming}
                        title={claimTitle}
                        onClick={() => claim(Number(b.match_id))}>
                        <ClaimBtnInner>
                          {isClaiming ? <Spinner /> : <ClaimDot />}
                          {isClaiming ? 'Claiming…' : canClaim ? `Claim` : claimed ? 'Claimed' : 'Claim'}
                        </ClaimBtnInner>
                      </ClaimBtn>
                    </ActionWrap>
                  </Row>
                );
              })
            )}
          </CupRows>

          <CupFoot>
            <ViewMore>Total Bets: {wcBets.length}</ViewMore>
          </CupFoot>
        </CupCard>
      )}
    </Shell>
  );
};
