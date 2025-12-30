import React, { useEffect, useState, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import { useApi, useAlert } from '@gear-js/react-hooks';
import { web3Enable } from '@polkadot/extension-dapp';
import { Program, Service } from '@/hocs/dao';
import type { Proposal as DaoProposal } from '@/hocs/dao';

const PROGRAM_ID = import.meta.env.VITE_DAOPROGRAM as `0x${string}`;

const spin = keyframes`to { transform: rotate(360deg); }`;
const floatIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

const Container = styled.div`
  width: min(980px, 100%);
  margin: 1.6rem auto;
  padding: 1.1rem;
  border-radius: 1.35rem;
  background: radial-gradient(circle at top left, rgba(255, 0, 110, 0.12), rgba(23, 0, 12, 0.92));
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: var(--shadow-deep, 0 20px 60px rgba(0, 0, 0, 0.9));
  animation: ${floatIn} 220ms ease-out;
`;

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.85rem 0.95rem;
  border-radius: 1.1rem;
  background: rgba(9, 0, 6, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.12);
`;

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 0.85rem;
  min-width: 0;
`;

const TitleWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
  min-width: 0;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 1.08rem;
  letter-spacing: 0.01em;
  color: var(--text-main, #fff);
  line-height: 1.2;
`;

const Subtitle = styled.p`
  margin: 0;
  font-size: 0.86rem;
  color: var(--text-muted, #e8cfdd);
  line-height: 1.25;
`;

const MetaPill = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 0, 110, 0.55);
  background: rgba(255, 0, 110, 0.14);
  color: #ffe4f2;
  font-size: 0.78rem;
  white-space: nowrap;
`;

const TableWrap = styled.div`
  margin-top: 0.95rem;
  border-radius: 1.15rem;
  overflow: hidden;
  background: rgba(9, 0, 6, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.85);
`;

const TableScroll = styled.div`
  overflow-x: auto;

  &::-webkit-scrollbar {
    height: 9px;
  }
  &::-webkit-scrollbar-track {
    background: rgba(23, 0, 12, 0.55);
  }
  &::-webkit-scrollbar-thumb {
    background: linear-gradient(180deg, rgba(255, 0, 110, 0.55), rgba(255, 79, 156, 0.55));
    border-radius: 10px;
  }
  &::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(180deg, rgba(255, 0, 110, 0.9), rgba(255, 79, 156, 0.9));
  }
`;

const Table = styled.table`
  border-collapse: collapse;
  width: 100%;
  font-size: 0.92rem;
  color: var(--text-main, #fff);
  min-width: 980px;
`;

const Th = styled.th`
  padding: 0.85rem 0.9rem;
  font-weight: 650;
  text-align: left;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  background: radial-gradient(circle at top left, rgba(255, 0, 110, 0.12), rgba(10, 0, 6, 0.96));
  color: rgba(255, 255, 255, 0.92);
  letter-spacing: 0.01em;
  white-space: nowrap;
`;

const Td = styled.td`
  padding: 0.78rem 0.9rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(9, 0, 6, 0.92);
  white-space: nowrap;
  vertical-align: top;
`;

const Tr = styled.tr<{ faded?: boolean }>`
  ${({ faded }) => faded && 'opacity: 0.58;'}
  transition: background 140ms ease-out, transform 120ms ease-out;

  &:hover td {
    background: rgba(10, 0, 6, 0.98);
  }
`;

const StatusTag = styled.span<{ status: string }>`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 92px;
  justify-content: center;
  font-size: 0.78rem;
  font-weight: 650;
  border-radius: 999px;
  padding: 0.22rem 0.65rem;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.06);
  color: #fff;

  ${({ status }) =>
    status === 'Active' &&
    `
      border-color: rgba(255, 0, 110, 0.55);
      background: rgba(255, 0, 110, 0.14);
      box-shadow: 0 14px 30px rgba(255, 0, 110, 0.12);
    `}
  ${({ status }) =>
    status === 'Succeeded' &&
    `
      border-color: rgba(255, 79, 156, 0.55);
      background: rgba(255, 79, 156, 0.14);
    `}
  ${({ status }) =>
    status === 'Executed' &&
    `
      border-color: rgba(212, 180, 198, 0.38);
      background: rgba(122, 19, 73, 0.35);
    `}
  ${({ status }) =>
    status === 'Defeated' &&
    `
      border-color: rgba(255, 255, 255, 0.18);
      background: rgba(255, 255, 255, 0.06);
      color: rgba(232, 207, 221, 0.95);
    `}
  ${({ status }) =>
    status === 'Expired' &&
    `
      border-color: rgba(255, 207, 51, 0.45);
      background: rgba(255, 207, 51, 0.12);
    `}
`;

const TypeTag = styled.span`
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  font-weight: 650;
  font-size: 0.78rem;
  padding: 0.18rem 0.55rem;
  border: 1px solid rgba(255, 0, 110, 0.4);
  background: rgba(255, 0, 110, 0.12);
  color: #ffe4f2;
  margin-right: 0.45rem;
`;

const Detail = styled.span`
  color: rgba(232, 207, 221, 0.92);
  font-size: 0.84rem;
`;

const Mono = styled.span`
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
`;

const Proposer = styled(Mono)`
  color: rgba(255, 79, 156, 0.95);
  font-size: 0.86rem;
`;

const Desc = styled.div`
  font-size: 0.85rem;
  color: rgba(232, 207, 221, 0.92);
  max-width: 520px;
  white-space: pre-line;
  line-height: 1.35;
`;

const Votes = styled.div`
  display: inline-flex;
  gap: 0.45rem;
  align-items: center;
`;

const VotePill = styled.span<{ variant: 'yes' | 'no' | 'abstain' }>`
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.18rem 0.5rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.9);

  ${({ variant }) =>
    variant === 'yes' &&
    `
      border-color: rgba(255, 0, 110, 0.55);
      background: rgba(255, 0, 110, 0.12);
    `}
  ${({ variant }) =>
    variant === 'no' &&
    `
      border-color: rgba(255, 255, 255, 0.18);
      background: rgba(255, 255, 255, 0.06);
      color: rgba(232, 207, 221, 0.92);
    `}
  ${({ variant }) =>
    variant === 'abstain' &&
    `
      border-color: rgba(255, 207, 51, 0.45);
      background: rgba(255, 207, 51, 0.10);
    `}
`;

const Spinner = styled.div`
  width: 2.2rem;
  height: 2.2rem;
  border: 3px solid rgba(255, 0, 110, 0.85);
  border-top-color: transparent;
  border-radius: 50%;
  animation: ${spin} 0.85s linear infinite;
  margin: 1.8rem auto;
`;

const EmptyMsg = styled.div`
  color: rgba(232, 207, 221, 0.85);
  font-size: 0.95rem;
  text-align: center;
  padding: 1.8rem 0 1.6rem 0;
`;

function getProposalKindString(kind: any): { type: string; details: string | null } {
  if (typeof kind !== 'object' || kind === null) return { type: '-', details: null };
  const key = Object.keys(kind)[0];
  switch (key) {
    case 'SetFeeBps':
      return { type: 'Set Fee BPS', details: `→ ${kind.SetFeeBps.new_fee_bps}` };
    case 'SetFinalPrizeBps':
      return { type: 'Set Final Prize BPS', details: `→ ${kind.SetFinalPrizeBps.new_final_prize_bps}` };
    case 'SetMaxPayoutChunk':
      return { type: 'Set Max Payout Chunk', details: `→ ${kind.SetMaxPayoutChunk.new_max_payout_chunk}` };
    case 'AddPhase':
      return {
        type: 'Add Phase',
        details: `“${kind.AddPhase.name}” (${formatDate(kind.AddPhase.start_time)} ~ ${formatDate(kind.AddPhase.end_time)})`,
      };
    case 'AddMatch':
      return {
        type: 'Add Match',
        details: `Phase: ${kind.AddMatch.phase}, ${kind.AddMatch.home} vs ${kind.AddMatch.away}, Kickoff: ${formatDate(
          kind.AddMatch.kick_off,
        )}`,
      };
    case 'SetQuorum':
      return { type: 'Set Quorum', details: `→ ${kind.SetQuorum.new_quorum_bps}` };
    case 'SetVotingPeriod':
      return { type: 'Set Voting Period', details: `→ ${kind.SetVotingPeriod.new_voting_period}` };
    default:
      return { type: key, details: null };
  }
}

function formatStatus(status: any): string {
  if (!status) return '-';
  if (typeof status === 'object') return Object.keys(status)[0];
  if (typeof status === 'string') return status;
  return '-';
}

function getActorIdShort(actorId: string) {
  return actorId.slice(0, 7) + '…' + actorId.slice(-4);
}

function formatDate(ts: string | number) {
  const n = typeof ts === 'string' ? parseInt(ts, 10) : ts;
  if (!n || n === 0) return '-';
  const d = new Date(Number(n) * 1000);
  return (
    d.toLocaleDateString(undefined, { year: '2-digit', month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}

/* ----------------------------- */
/* Main component                */
/* ----------------------------- */

export const QueryProposalsComponent: React.FC = () => {
  const { api, isApiReady } = useApi();
  const alert = useAlert();

  const [loading, setLoading] = useState(false);
  const [proposals, setProposals] = useState<DaoProposal[] | null>(null);

  useEffect(() => {
    void web3Enable('DAO Proposals dApp');
  }, []);

  const fetchProposals = useCallback(async () => {
    if (!api || !isApiReady) return;
    setLoading(true);
    try {
      const svc = new Service(new Program(api, PROGRAM_ID));
      const data = await svc.queryProposals(); // ✅ DaoProposal[]
      setProposals(data);
    } catch (e: any) {
      setProposals([]);
      alert.error('Failed to fetch proposals');
    } finally {
      setLoading(false);
    }
  }, [api, isApiReady, alert]);

  useEffect(() => {
    void fetchProposals();
  }, [fetchProposals]);

  return (
    <Container>
      <Header>
        <Brand>
          <TitleWrap>
            <Title>DAO Proposals</Title>
            <Subtitle>Browse active and historical governance proposals.</Subtitle>
          </TitleWrap>
        </Brand>

        <MetaPill>Smart Cup Governance</MetaPill>
      </Header>

      <TableWrap>
        <TableScroll>
          <Table>
            <thead>
              <tr>
                <Th>ID</Th>
                <Th>Type</Th>
                <Th>Description</Th>
                <Th>Proposer</Th>
                <Th>When</Th>
                <Th>Votes</Th>
                <Th>Status</Th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <Td colSpan={7}>
                    <Spinner />
                  </Td>
                </tr>
              ) : proposals === null ? (
                <tr>
                  <Td colSpan={7}>
                    <EmptyMsg>Loading…</EmptyMsg>
                  </Td>
                </tr>
              ) : proposals.length === 0 ? (
                <tr>
                  <Td colSpan={7}>
                    <EmptyMsg>No proposals found</EmptyMsg>
                  </Td>
                </tr>
              ) : (
                proposals.map((p) => {
                  const { type, details } = getProposalKindString(p.kind);
                  const statusString = formatStatus(p.status);

                  return (
                    <Tr key={p.id} faded={statusString === 'Executed' || statusString === 'Expired'}>
                      <Td>
                        <Mono>{p.id}</Mono>
                      </Td>

                      <Td>
                        <TypeTag>{type}</TypeTag>
                        {details && <Detail>{details}</Detail>}
                      </Td>

                      <Td>
                        <Desc>{p.description}</Desc>
                      </Td>

                      <Td>
                        <Proposer title={p.proposer}>{getActorIdShort(p.proposer)}</Proposer>
                      </Td>

                      <Td>
                        <div>
                          <Detail>Starts:</Detail> <span>{formatDate(p.start_time)}</span>
                        </div>
                        <div>
                          <Detail>Ends:</Detail> <span>{formatDate(p.end_time)}</span>
                        </div>
                      </Td>

                      <Td>
                        <Votes>
                          <VotePill variant="yes">
                            <span>Y</span>
                            <Mono>{p.yes}</Mono>
                          </VotePill>
                          <VotePill variant="no">
                            <span>N</span>
                            <Mono>{p.no}</Mono>
                          </VotePill>
                          <VotePill variant="abstain">
                            <span>A</span>
                            <Mono>{p.abstain}</Mono>
                          </VotePill>
                        </Votes>
                      </Td>

                      <Td>
                        <StatusTag status={statusString}>{statusString}</StatusTag>
                      </Td>
                    </Tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </TableScroll>
      </TableWrap>
    </Container>
  );
};
