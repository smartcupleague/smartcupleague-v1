import React, { useEffect, useState, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import { useApi } from '@gear-js/react-hooks';
import { web3Enable } from '@polkadot/extension-dapp';
import { Program, Service } from '@/hocs/lib';
import { useNavigate } from 'react-router-dom';
import type { MatchInfo as MatchInfoChain, ResultStatus as ResultStatusChain, Outcome } from '@/hocs/lib';

const PROGRAM_ID = '0x799e6a51d7fa45386ff7c771266995df0403f4ade22e697a25ae20a99060c21b';

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

const Container = styled.div`
  width: 100%;
  margin: 0; /* deja que el layout padre controle el margen */
  padding: 1.25rem 1rem; /* opcional, para que no quede pegado a los bordes */
  display: flex;
  flex-direction: column;
  gap: 1.2rem;

  @media (min-width: 1024px) {
    padding: 1.75rem 2rem;
  }
`;

const MatchListPanel = styled.section`
  border-radius: 1.1rem;
  padding: 1rem 1.1rem 1.2rem;
  background: radial-gradient(circle at top left, rgba(255, 0, 110, 0.12), var(--wine-900));
  border: 1px solid var(--border-soft);
  box-shadow: 0 20px 45px rgba(0, 0, 0, 0.85);
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
`;

const PanelHeader = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.6rem;
`;

const PanelHeaderText = styled.div`
  min-width: 0;
`;

const PanelTitle = styled.h3`
  margin: 0;
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.94);
`;

const PanelSubtitle = styled.p`
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
  color: var(--text-muted);
`;

const PanelTag = styled.span`
  align-self: flex-start;
  font-size: 0.72rem;
  padding: 0.18rem 0.55rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 0, 110, 0.7);
  color: #ffe4f2;
  background: rgba(255, 0, 110, 0.16);
`;

const MatchList = styled.ul`
  list-style: none;
  margin: 0.4rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
`;

const MatchItem = styled.li`
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) auto;
  gap: 0.6rem;
  align-items: center;
  padding: 0.55rem 0.7rem;
  border-radius: 0.9rem;
  background: rgba(10, 0, 6, 0.96);
  border: 1px solid var(--border-soft);
  transition: border-color 0.15s ease-out, background-color 0.15s ease-out, transform 0.08s ease-out,
    box-shadow 0.12s ease-out;

  &:hover {
    border-color: rgba(255, 0, 110, 0.6);
    background: radial-gradient(circle at top left, rgba(255, 0, 110, 0.12), rgba(10, 0, 6, 0.96));
    transform: translateY(-1px);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.9);
  }

  @media (max-width: 640px) {
    grid-template-columns: minmax(0, 1fr);
    align-items: flex-start;
  }
`;

const MatchMain = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
`;

const TeamsRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.88rem;
  color: rgba(255, 255, 255, 0.92);
`;

const TeamName = styled.span`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 650;
`;

const Vs = styled.span`
  font-size: 0.8rem;
  color: var(--text-muted);
`;

const MatchMeta = styled.div`
  font-size: 0.78rem;
  color: var(--text-muted);
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
`;

const MetaTag = styled.span`
  padding: 0.12rem 0.5rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(24, 0, 13, 0.9);
`;

const ActionCol = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;

  @media (max-width: 640px) {
    justify-content: flex-start;
  }
`;

const BetButton = styled.button`
  border: none;
  outline: none;
  border-radius: 999px;
  padding: 0.35rem 0.95rem;
  font-size: 0.8rem;
  font-weight: 550;
  letter-spacing: 0.02em;
  cursor: pointer;
  background-image: linear-gradient(135deg, var(--accent), var(--accent-soft));
  color: #fff;
  box-shadow: 0 8px 22px rgba(255, 0, 110, 0.55);
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  transition: transform 0.08s ease-out, box-shadow 0.12s ease-out, filter 0.12s ease-out;
  white-space: nowrap;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 12px 30px rgba(255, 0, 110, 0.7);
    filter: brightness(1.04);
  }

  &:active {
    transform: translateY(0);
    box-shadow: 0 6px 18px rgba(255, 0, 110, 0.45);
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

function formatOutcome(outcome: Outcome) {
  switch (outcome) {
    case 'Home':
      return <span style={{ color: '#2f9c5f', fontWeight: 700 }}>Home</span>;
    case 'Draw':
      return <span style={{ color: '#ddab18', fontWeight: 700 }}>Draw</span>;
    case 'Away':
      return <span style={{ color: '#2f53a3', fontWeight: 700 }}>Away</span>;
    default:
      return <span>-</span>;
  }
}

function resolveStatus(result: ResultStatusChain) {
  if (result === 'Unresolved') return <MetaTag>Unresolved</MetaTag>;
  if ('Proposed' in result) return <MetaTag>Proposed: {formatOutcome(result.Proposed.outcome)}</MetaTag>;
  if ('Finalized' in result) return <MetaTag>Finalized: {formatOutcome(result.Finalized.outcome)}</MetaTag>;
  return <MetaTag>Unknown</MetaTag>;
}

function formatDatetime(kickOff: string) {
  const ms = Number(kickOff); // asumes ms
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

/* component */
export const MatchesTableComponent: React.FC = () => {
  const { api, isApiReady } = useApi();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<MatchInfo[] | null>(null);

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

  return (
    <Container>
      <MatchListPanel>
        <PanelHeader>
          <PanelHeaderText>
            <PanelTitle>Matches</PanelTitle>
            <PanelSubtitle>
              {loading ? 'Loading from chain…' : `${matches?.length ?? 0} match(es) registered`}
            </PanelSubtitle>
          </PanelHeaderText>

          <PanelTag>Group stage</PanelTag>
        </PanelHeader>

        {loading ? (
          <div style={{ color: 'var(--text-muted)', padding: '0.6rem 0.2rem' }}>
            <Spinner /> Loading matches…
          </div>
        ) : matches && matches.length > 0 ? (
          <MatchList>
            {matches.map((m) => (
              <MatchItem key={m.match_id}>
                <MatchMain>
                  <TeamsRow title={`${m.home} vs ${m.away}`}>
                    <TeamName>{m.home}</TeamName>
                    <Vs>vs</Vs>
                    <TeamName>{m.away}</TeamName>
                  </TeamsRow>

                  <MatchMeta>
                    <MetaTag>{m.phase}</MetaTag>
                    <MetaTag>{formatDatetime(m.kick_off)}</MetaTag>
                    {resolveStatus(m.result)}
                    <MetaTag>
                      Pools: H {formatAmount(m.pool_home)} {' · '}D {formatAmount(m.pool_draw)} {' · '}A{' '}
                      {formatAmount(m.pool_away)}
                    </MetaTag>
                    <MetaTag>{m.has_bets ? 'Has bets ✓' : 'No bets'}</MetaTag>
                  </MatchMeta>
                </MatchMain>

                <ActionCol>
                  <BetButton onClick={() => navigate(`/match/${m.match_id}`)}>
                    Bet <span style={{ fontSize: '0.9rem' }}>→</span>
                  </BetButton>
                </ActionCol>
              </MatchItem>
            ))}
          </MatchList>
        ) : (
          <div style={{ color: 'var(--text-muted)', padding: '0.6rem 0.2rem' }}>No matches registered.</div>
        )}
      </MatchListPanel>
    </Container>
  );
};
