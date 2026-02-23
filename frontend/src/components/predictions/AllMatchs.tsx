import React, { useEffect, useState, useCallback, useMemo } from 'react';
import styled, { keyframes } from 'styled-components';
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

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

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

function isFinalized(result: any) {
  return getResultDetails(result).label === 'FINAL';
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

const Shell = styled.div`
  position: relative;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 12px;
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
  min-width: 420px;

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

const ShortcutBar = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
`;

const Shortcut = styled.button`
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.1);
  color: rgba(255, 255, 255, 0.84);
  padding: 10px 12px;
  border-radius: 14px;
  cursor: pointer;
  font-weight: 650;
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

const TabsRow = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 12px;
`;

const Tab = styled.button<{ $active?: boolean }>`
  position: relative;
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

const InfoBar = styled.div`
  margin-top: 10px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.1);
  backdrop-filter: var(--blur);
  padding: 10px 12px;

  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  @media (max-width: 980px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

const InfoLeft = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  color: rgba(255, 255, 255, 0.74);
  font-size: 12px;
`;

const Pill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.1);
`;

const InfoRight = styled.div`
  display: flex;
  gap: 10px;
  align-items: center;
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
`;

const Spinner = styled.div`
  width: 1.05rem;
  height: 1.05rem;
  border: 2.5px solid rgba(255, 0, 110, 0.9);
  border-top-color: transparent;
  border-radius: 50%;
  animation: ${spin} 0.85s linear infinite;
  display: inline-block;
  vertical-align: middle;
`;

const SectionTitle = styled.div`
  margin-top: 8px;
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

const List = styled.div`
  display: grid;
  gap: 12px;
`;

const MatchCard = styled.div`
  border-radius: calc(var(--r) + 6px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: radial-gradient(900px 260px at 18% 0%, rgba(255, 0, 110, 0.12), transparent 60%), rgba(0, 0, 0, 0.1);
  backdrop-filter: var(--blur);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.35);
  overflow: hidden;
`;

const CardTop = styled.div`
  padding: 12px 14px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  @media (max-width: 700px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
`;

const TeamsLine = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex-wrap: wrap;
`;

const TeamNameWithFlag = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;

  .name {
    font-weight: 950;
    color: rgba(255, 255, 255, 0.92);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 240px;
  }
`;


const FlagImg = styled.img`
  width: 40px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  object-fit: cover;
  flex: 0 0 auto;
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.25);
`;

const Vs = styled.span`
  font-size: 12px;
  font-weight: 900;
  color: rgba(255, 255, 255, 0.62);
`;

const StatusPill = styled.span<{ $status: 'OPEN' | 'LIVE' | 'FINAL' }>`
  flex: 0 0 auto;
  padding: 9px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 950;
  letter-spacing: 0.5px;

  ${({ $status }) => {
    if ($status === 'FINAL') {
      return `
        border: 1px solid rgba(65, 214, 114, 0.45);
        background: rgba(65, 214, 114, 0.14);
        color: rgba(210, 255, 225, 0.95);
      `;
    }
    if ($status === 'LIVE') {
      return `
        border: 1px solid rgba(70, 170, 255, 0.45);
        background: rgba(70, 170, 255, 0.14);
        color: rgba(220, 245, 255, 0.95);
      `;
    }
    return `
      border: 1px solid rgba(255, 194, 75, 0.32);
      background: rgba(255, 194, 75, 0.10);
      color: rgba(255, 235, 200, 0.95);
    `;
  }}
`;

const StatusLine = styled.div`
  margin-top: 6px;
  color: rgba(255, 255, 255, 0.78);
  font-size: 12px;
  font-weight: 800;
  opacity: 0.95;
`;

const CardMid = styled.div`
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding: 12px 14px;

  display: grid;
  grid-template-columns: 1.2fr 240px 240px;
  gap: 12px;
  align-items: center;

  @media (max-width: 1000px) {
    grid-template-columns: 1fr;
  }
`;

const MidMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
`;

const Meta = styled.span`
  padding: 7px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.1);
`;

const ScoreBlock = styled.div`
  border-radius: 16px;
  border: 1px solid rgba(255, 0, 110, 0.22);
  background: radial-gradient(520px 180px at 20% 15%, rgba(255, 0, 110, 0.18), transparent 60%), rgba(0, 0, 0, 0.1);
  box-shadow: 0 14px 32px rgba(0, 0, 0, 0.28);
  padding: 10px 12px;

  display: grid;
  place-items: center;
  text-align: center;

  .label {
    font-size: 12px;
    font-weight: 950;
    letter-spacing: 0.9px;
    opacity: 0.8;
    margin-bottom: 4px;
  }
  .score {
    font-size: 28px;
    font-weight: 950;
    color: rgba(255, 255, 255, 0.95);
    letter-spacing: 0.6px;
  }
  .sub {
    font-size: 11px;
    opacity: 0.72;
    margin-top: 2px;
  }
`;

const Pools = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
`;

const PoolBox = styled.div`
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.1);
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  gap: 10px;

  .k {
    color: rgba(255, 255, 255, 0.65);
    font-size: 12px;
    font-weight: 800;
  }
  .v {
    color: rgba(255, 255, 255, 0.92);
    font-weight: 950;
  }
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;

  @media (max-width: 1000px) {
    justify-content: flex-start;
  }
`;

const PrimaryBtn = styled.button`
  border: 1px solid rgba(255, 0, 110, 0.25);
  border-radius: 999px;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 850;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.95);
  background:
    radial-gradient(260px 140px at 30% 20%, rgba(255, 0, 110, 0.65), transparent 60%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.04));
  box-shadow: 0 10px 28px rgba(255, 0, 110, 0.18);
  transition:
    transform 0.15s ease,
    filter 0.15s ease;

  &:hover {
    transform: translateY(-1px);
    filter: brightness(1.05);
  }
  &:active {
    transform: translateY(0);
  }
`;

const GhostBtn = styled.button`
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.84);
  background: rgba(0, 0, 0, 0.1);
  transition:
    transform 0.15s ease,
    background 0.15s ease,
    border-color 0.15s ease;

  &:hover {
    transform: translateY(-1px);
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.18);
  }
  &:active {
    transform: translateY(0);
  }
`;

const ClaimBtn = styled.button`
  border: 1px solid rgba(65, 214, 114, 0.38);
  border-radius: 999px;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 950;
  cursor: pointer;
  color: rgba(210, 255, 225, 0.95);
  background: rgba(65, 214, 114, 0.14);
  box-shadow: 0 10px 26px rgba(65, 214, 114, 0.12);
  transition:
    transform 0.15s ease,
    filter 0.15s ease;

  &:hover {
    transform: translateY(-1px);
    filter: brightness(1.05);
  }
  &:active {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    transform: none;
  }
`;

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
    <Shell>
      <TopHeader>
        <HeaderRow>
          <TitleBlock>
            <Title>All Matches</Title>
            <Subtitle>Browse matches, live scores, pools and predict outcomes.</Subtitle>
          </TitleBlock>

          <HeaderRight>
            <SearchPill>
              <SearchIcon>🔎</SearchIcon>
              <SearchInput
                value={headerSearch}
                onChange={(e) => setHeaderSearch(e.target.value)}
                placeholder="Search teams, match ID, date..."
              />
            </SearchPill>

            <ShortcutBar>
              <Shortcut onClick={() => navigate('/my-predictions')}>🎯 My Predictions</Shortcut>
              <Shortcut onClick={() => navigate('/leaderboards')}>🏅 Leaderboard</Shortcut>
              <Shortcut onClick={() => navigate('/final-prizes')}>🏆 Final Prize</Shortcut>
            </ShortcutBar>
          </HeaderRight>
        </HeaderRow>

        <TabsRow>
          <Tab $active={tab === 'wc'} onClick={() => setTab('wc')}>
            World Cup 2026
          </Tab>
        </TabsRow>

        <InfoBar>
          <InfoLeft>
            <Pill>⏱ Bet closes 10m before kickoff</Pill>
            <Pill>📈 75% Match / 20% Final / 5% DAO</Pill>
            <Pill>✅ On-chain pools</Pill>
            <Pill>🟢 LIVE</Pill>
          </InfoLeft>
          <InfoRight>
            <span className="muted">Auto refresh on page open</span>
          </InfoRight>
        </InfoBar>
      </TopHeader>

      <SectionTitle>
        <div className="main">World Cup 2026</div>
        <div className="sub">Group Stage</div>
      </SectionTitle>

      {loading ? (
        <div style={{ color: 'rgba(255,255,255,.70)', padding: '8px 2px' }}>
          <Spinner /> Loading matches…
        </div>
      ) : filteredMatches.length > 0 ? (
        <List>
          {filteredMatches.map((m) => {
            const r = getResultDetails(m.result);
            const totalPoolHuman = formatAmount(m.match_prize_pool, 12);

            const statusText =
              r.label === 'FINAL'
                ? `This match has ended. Final score: ${r.home}-${r.away}.`
                : r.label === 'LIVE'
                  ? `Live now: ${r.home}-${r.away} (proposed).`
                  : `Open for predictions until ${closesLabel(m.kick_off)}.`;

            return (
              <MatchCard key={m.match_id}>
                <CardTop>
                  <div>
                    <TeamsLine title={`${m.home} vs ${m.away}`}>
                      <TeamNameWithFlag>
                        <FlagImg src={flagForTeam(m.home)} alt={`${m.home} flag`} />
                        <span className="name">{m.home}</span>
                      </TeamNameWithFlag>

                      <Vs>vs</Vs>

                      <TeamNameWithFlag>
                        <span className="name">{m.away}</span>
                        <FlagImg src={flagForTeam(m.away)} alt={`${m.away} flag`} />
                      </TeamNameWithFlag>

                      <StatusPill $status={r.label}>
                        {r.label === 'OPEN' ? 'OPEN' : r.label === 'LIVE' ? 'LIVE' : 'FINAL'}
                      </StatusPill>
                    </TeamsLine>

                    <StatusLine>{statusText}</StatusLine>
                  </div>

                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {r.label !== 'FINAL' && <Pill>{closesLabel(m.kick_off)}</Pill>}

                    {r.label === 'FINAL' && (
                      <ClaimBtn
                        onClick={() => handleClaim(m.match_id)}
                        disabled={claimLoadingId === m.match_id}
                        title={!account ? 'Connect wallet to claim' : 'Claim match prize'}>
                        {claimLoadingId === m.match_id ? 'Claiming…' : 'Claim'}
                      </ClaimBtn>
                    )}
                  </div>
                </CardTop>

                <CardMid>
                  <MidMeta>
                    <Meta>#{m.match_id}</Meta>
                    <Meta>{m.phase}</Meta>
                    <Meta>{formatDatetime(m.kick_off)}</Meta>
                    <Meta>{m.has_bets ? 'Has bets ✓' : 'No bets'}</Meta>
                    <Meta>Pool: {totalPoolHuman} VARA</Meta>
                  </MidMeta>

                  <ScoreBlock>
                    <div className="label">
                      {r.label === 'OPEN' ? 'OPEN' : r.label === 'LIVE' ? 'LIVE SCORE' : 'FINAL SCORE'}
                    </div>
                    <div className="score">
                      {r.home}-{r.away}
                    </div>
                    <div className="sub">
                      {r.label === 'FINAL' ? 'On-chain finalized result' : 'On-chain current result'}
                    </div>
                  </ScoreBlock>

                  <Pools>
                    <PoolBox>
                      <span className="k">Match Prize Pool</span>
                      <span className="v">{totalPoolHuman} VARA</span>
                    </PoolBox>
                  </Pools>

                  <Actions>
                    <PrimaryBtn onClick={() => navigate(`/match/${m.match_id}`)}>
                      {r.label === 'FINAL' ? 'View →' : 'Predict →'}
                    </PrimaryBtn>
                    <GhostBtn onClick={() => navigate(`/match/${m.match_id}`)}>Details</GhostBtn>
                  </Actions>
                </CardMid>
              </MatchCard>
            );
          })}
        </List>
      ) : (
        <div style={{ color: 'rgba(255,255,255,.70)', padding: '8px 2px' }}>No matches registered.</div>
      )}
    </Shell>
  );
};
