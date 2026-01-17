import React, { useEffect, useState, useCallback, useMemo } from 'react';
import styled, { keyframes } from 'styled-components';
import { useApi } from '@gear-js/react-hooks';
import { web3Enable } from '@polkadot/extension-dapp';
import { Program, Service } from '@/hocs/lib';
import { useNavigate } from 'react-router-dom';
import type { MatchInfo as MatchInfoChain, ResultStatus as ResultStatusChain, Outcome } from '@/hocs/lib';

const PROGRAM_ID = import.meta.env.VITE_BOLAOCOREPROGRAM;

type MatchInfo = Omit<MatchInfoChain, 'match_id' | 'kick_off' | 'pool_home' | 'pool_draw' | 'pool_away' | 'result'> & {
  match_id: string;
  kick_off: string;
  pool_home: string;
  pool_draw: string;
  pool_away: string;
  result: ResultStatusChain;
};

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const Page = styled.div`
  position: relative;
  width: 100%;
  min-height: 100%;
  padding: 18px;

  @media (min-width: 1100px) {
    padding: 22px 24px;
  }
`;

const Bg = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(1200px 700px at 18% 8%, rgba(255, 0, 110, 0.22), transparent 60%),
    radial-gradient(900px 600px at 72% 18%, rgba(142, 30, 100, 0.2), transparent 60%),
    radial-gradient(900px 700px at 60% 85%, rgba(255, 79, 156, 0.12), transparent 55%),
    radial-gradient(1200px 900px at 50% 110%, rgba(0, 0, 0, 0.45), transparent 60%),
    repeating-linear-gradient(115deg, rgba(255, 255, 255, 0.03) 0 1px, transparent 1px 7px);
  mix-blend-mode: screen;
  opacity: 0.55;
  filter: blur(0.2px);
`;

const Shell = styled.div`
  position: relative;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 12px;
`;

/* =========================
   Header (title + search + shortcuts)
========================= */

const TopHeader = styled.header`
  width: 100%;
  border-radius: calc(var(--r) + 8px);
  border: 1px solid var(--stroke2);
  background: radial-gradient(900px 260px at 18% 0%, rgba(255, 0, 110, 0.14), transparent 60%),
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
  transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.08);
  }
`;

/* =========================
   Tournament Tabs + Info bar + Filters
========================= */

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
  transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease;

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

const FiltersRow = styled.div`
  margin-top: 10px;
  display: grid;
  grid-template-columns: 160px 160px 160px 160px 140px 1fr;
  gap: 10px;

  @media (max-width: 1100px) {
    grid-template-columns: 1fr 1fr;
  }
`;

const Select = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.1);
  color: rgba(255, 255, 255, 0.86);
  padding: 10px 12px;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;

  &:hover {
    border-color: rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.08);
  }
`;

const FilterSearch = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;

  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.1);
`;

const FilterSearchInput = styled.input`
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

/* =========================
   Content section title
========================= */

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

/* =========================
   Match card (like screenshot rows)
========================= */

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
`;

const TeamsLine = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  color: rgba(255, 255, 255, 0.92);
  font-weight: 900;
`;

const Flag = styled.span`
  width: 26px;
  height: 18px;
  border-radius: 5px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  display: inline-block;
`;

const TeamsText = styled.div`
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;

  .t {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .vs {
    font-size: 12px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.6);
  }
`;

const ClosePill = styled.span`
  flex: 0 0 auto;
  padding: 7px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 194, 75, 0.2);
  background: rgba(255, 194, 75, 0.08);
  color: rgba(255, 235, 200, 0.92);
  font-size: 12px;
  font-weight: 800;
`;

const CardMid = styled.div`
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding: 10px 14px;

  display: grid;
  grid-template-columns: 220px 1fr 220px;
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

const Odds = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 10px;

  @media (max-width: 1000px) {
    grid-template-columns: 1fr;
  }
`;

const OddBox = styled.div`
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
  background: radial-gradient(260px 140px at 30% 20%, rgba(255, 0, 110, 0.65), transparent 60%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.04));
  box-shadow: 0 10px 28px rgba(255, 0, 110, 0.18);
  transition: transform 0.15s ease, filter 0.15s ease;

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
  transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease;

  &:hover {
    transform: translateY(-1px);
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.18);
  }
  &:active {
    transform: translateY(0);
  }
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

/* =========================
   Helpers (unchanged logic)
========================= */

function formatOutcome(outcome: Outcome) {
  switch (outcome) {
    case 'Home':
      return <span style={{ color: '#2f9c5f', fontWeight: 800 }}>Home</span>;
    case 'Draw':
      return <span style={{ color: '#ddab18', fontWeight: 800 }}>Draw</span>;
    case 'Away':
      return <span style={{ color: '#2f53a3', fontWeight: 800 }}>Away</span>;
    default:
      return <span>-</span>;
  }
}

function isVariant<K extends string>(value: unknown, key: K): value is Record<K, unknown> {
  return typeof value === 'object' && value !== null && key in value;
}

function resolveStatus(result: ResultStatusChain) {
  if (isVariant(result, 'Unresolved')) return <Meta>Unresolved</Meta>;
  if (isVariant(result, 'Proposed')) return <Meta>Proposed: {formatOutcome((result as any).Proposed.outcome)}</Meta>;
  if (isVariant(result, 'Finalized')) return <Meta>Finalized: {formatOutcome((result as any).Finalized.outcome)}</Meta>;
  return <Meta>Unknown</Meta>;
}

function formatDatetime(kickOff: string) {
  const ms = Number(kickOff);
  if (!ms || Number.isNaN(ms)) return '-';
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAmount(val: string | number | bigint, decimals = 9) {
  if (val === null || val === undefined) return '—';
  const bn = typeof val === 'bigint' ? val : BigInt(val);
  const divisor = BigInt(10) ** BigInt(decimals);
  const intVal = bn / divisor;
  const frac = (bn % divisor).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${intVal.toString()}.${frac}` : intVal.toString();
}

function closesLabel(kickOff: string) {
  const ko = Number(kickOff);
  if (!ko || Number.isNaN(ko)) return '—';
  // bet closes 10 minutes before kickoff (like screenshot)
  const closesAt = ko - 10 * 60 * 1000;
  const diff = closesAt - Date.now();
  if (diff <= 0) return 'Closed';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `Closes in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `Closes in ${hrs}h ${rem}m`;
}

/* =========================
   Component
========================= */

export const MatchesTableComponent: React.FC = () => {
  const { api, isApiReady } = useApi();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<MatchInfo[] | null>(null);

  const [tab, setTab] = useState<'wc' | 'lib' | 'ucl'>('wc');
  const [headerSearch, setHeaderSearch] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  useEffect(() => {
    void web3Enable('Bolao Matches UI');
  }, []);

  const fetchMatches = useCallback(async () => {
    if (!api || !isApiReady) return;
    setLoading(true);

    try {
      const svc = new Service(new Program(api, PROGRAM_ID));
      const state = await svc.queryState();
      const list = state?.matches ?? [];

      const normalized: MatchInfo[] = list.map((m) => ({
        ...(m as Omit<MatchInfo, 'match_id' | 'kick_off' | 'pool_home' | 'pool_draw' | 'pool_away'>),
        match_id: String(m.match_id),
        kick_off: String(m.kick_off),
        pool_home: String(m.pool_home),
        pool_draw: String(m.pool_draw),
        pool_away: String(m.pool_away),
        result: m.result,
      }));

      setMatches(normalized);
    } catch (e) {
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

  return (
   
      <Shell>
        <TopHeader>
          <HeaderRow>
            <TitleBlock>
              <Title>All Predictions</Title>
              <Subtitle>Multicup betting powered by smart programs</Subtitle>
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
              <Pill>🧮 Scoring multipliers</Pill>
              <Pill>✅ Verified</Pill>
              <Pill>🟢 LIVE</Pill>
            </InfoLeft>

            <InfoRight>
              <span className="muted">Oracle updated • 2m ago</span>
            </InfoRight>
          </InfoBar>

          <FiltersRow>
            <Select>
              Group <span style={{ opacity: 0.7 }}>▾</span>
            </Select>
            <Select>
              Weight ×1 <span style={{ opacity: 0.7 }}>▾</span>
            </Select>
            <Select>
              All Statuses <span style={{ opacity: 0.7 }}>▾</span>
            </Select>
            <Select>
              Kickoff Soonest <span style={{ opacity: 0.7 }}>▾</span>
            </Select>
            <Select>
              Today <span style={{ opacity: 0.7 }}>▾</span>
            </Select>

            <FilterSearch>
              <span style={{ opacity: 0.8 }}>🔎</span>
              <FilterSearchInput
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder="Search teams, match ID, date..."
              />
            </FilterSearch>
          </FiltersRow>
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
            {filteredMatches.map((m) => (
              <MatchCard key={m.match_id}>
                <CardTop>
                  <TeamsLine title={`${m.home} vs ${m.away}`}>
                    <Flag aria-hidden="true" />
                    <TeamsText>
                      <span className="t">{m.home}</span>
                      <span className="vs">vs</span>
                      <span className="t">{m.away}</span>
                    </TeamsText>
                  </TeamsLine>

                  <ClosePill>{closesLabel(m.kick_off)}</ClosePill>
                </CardTop>

                <CardMid>
                  <MidMeta>
                    <Meta>{m.phase}</Meta>
                    <Meta>{formatDatetime(m.kick_off)}</Meta>
                    {resolveStatus(m.result)}
                    <Meta>{m.has_bets ? 'Has bets ✓' : 'No bets'}</Meta>
                  </MidMeta>

                  <Odds>
                    <OddBox>
                      <span className="k">Pools H</span>
                      <span className="v">{formatAmount(m.pool_home)}</span>
                    </OddBox>
                    <OddBox>
                      <span className="k">Pools D</span>
                      <span className="v">{formatAmount(m.pool_draw)}</span>
                    </OddBox>
                    <OddBox>
                      <span className="k">Pools A</span>
                      <span className="v">{formatAmount(m.pool_away)}</span>
                    </OddBox>
                  </Odds>

                  <Actions>
                    <PrimaryBtn onClick={() => navigate(`/match/${m.match_id}`)}>Predict →</PrimaryBtn>
                    <GhostBtn onClick={() => navigate(`/match/${m.match_id}`)}>Details</GhostBtn>
                  </Actions>
                </CardMid>
              </MatchCard>
            ))}
          </List>
        ) : (
          <div style={{ color: 'rgba(255,255,255,.70)', padding: '8px 2px' }}>No matches registered.</div>
        )}
      </Shell>
  
  );
};
