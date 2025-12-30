import React, { useState, useEffect, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import { useAccount, useAlert, useApi } from '@gear-js/react-hooks';
import { web3Enable } from '@polkadot/extension-dapp';
import { Program, Service } from '@/hocs/lib';

const PROGRAM_ID = import.meta.env.VITE_BOLAOCOREPROGRAM;

type Outcome = 'Home' | 'Draw' | 'Away';

interface UserBetView {
  match_id: number;
  selected: Outcome;
  amount: string | number | bigint;
  paid: boolean;
}

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const Container = styled.div`
  width: 100%;
  margin: 0;
  padding: 1.25rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 1.2rem;

  @media (min-width: 1024px) {
    padding: 1.75rem 2rem;
  }
`;

const BetsPanel = styled.section`
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
  white-space: nowrap;
`;

const BetsList = styled.ul`
  list-style: none;
  margin: 0.4rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
`;

const BetItem = styled.li`
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

const BetMain = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
`;

const BetTitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.88rem;
  color: rgba(255, 255, 255, 0.92);
`;

const BetTitleStrong = styled.span`
  font-weight: 650;
`;

const MetaRow = styled.div`
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

const StatusPill = styled.span<{ $variant: 'ok' | 'muted' }>`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.24rem 0.7rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 650;
  border: 1px solid ${({ $variant }) => ($variant === 'ok' ? 'rgba(65, 214, 114, 0.55)' : 'rgba(255,255,255,0.18)')};
  background: ${({ $variant }) => ($variant === 'ok' ? 'rgba(65, 214, 114, 0.14)' : 'rgba(255,255,255,0.08)')};
  color: ${({ $variant }) => ($variant === 'ok' ? 'rgba(210, 255, 225, 0.95)' : 'rgba(255,255,255,0.75)')};
  white-space: nowrap;
`;

const OutcomeTag = styled.span<{ $o: Outcome }>`
  font-weight: 750;
  ${({ $o }) => {
    switch ($o) {
      case 'Home':
        return 'color: #2f9c5f;';
      case 'Draw':
        return 'color: #ddab18;';
      case 'Away':
        return 'color: #2f53a3;';
      default:
        return 'color: rgba(255,255,255,0.85);';
    }
  }}
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

const EmptyState = styled.div`
  color: var(--text-muted);
  padding: 0.6rem 0.2rem;
`;

const ErrorState = styled.div`
  color: rgba(255, 180, 180, 0.92);
  padding: 0.6rem 0.2rem;
`;

function normalizeOutcome(v: any): Outcome {
  if (typeof v === 'string') return v as Outcome;
  if (v && typeof v === 'object') return Object.keys(v)[0] as Outcome;
  return 'Draw';
}

function formatAmount(val: string | number | bigint, decimals = 12) {
  if (val === null || val === undefined) return '—';
  const bn = typeof val === 'bigint' ? val : BigInt(val);
  const divisor = BigInt(10) ** BigInt(decimals);
  const intVal = bn / divisor;
  const frac = (bn % divisor).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${intVal.toString()}.${frac}` : intVal.toString();
}

export const QueryBetsByUserComponent: React.FC = () => {
  const { account } = useAccount();
  const alert = useAlert();
  const { api, isApiReady } = useApi();

  const [bets, setBets] = useState<UserBetView[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    void web3Enable('Bolao Bets UI');
  }, []);

  const fetchBets = useCallback(async () => {
    if (!api || !isApiReady || !account) return;

    setLoading(true);
    setErrMsg(null);

    try {
      const svc = new Service(new Program(api, PROGRAM_ID));
      const result = await svc.queryBetsByUser(account.decodedAddress);

      const parsed = (result as any[]).map((v) => ({
        match_id: Number(v.match_id),
        selected: normalizeOutcome(v.selected),
        amount: typeof v.amount === 'bigint' ? v.amount : BigInt(v.amount?.toString?.() ?? v.amount ?? 0),
        paid: !!v.paid,
      })) as UserBetView[];

      parsed.sort((a, b) => b.match_id - a.match_id);

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
    if (account && isApiReady) fetchBets();
  }, [account, isApiReady, fetchBets]);

  const connected = !!account;

  return (
    <Container>
      <BetsPanel>
        <PanelHeader>
          <PanelHeaderText>
            <PanelTitle>My Predictions</PanelTitle>
            <PanelSubtitle>
              {!connected
                ? 'Connect your wallet to see your bets'
                : loading
                ? 'Loading from chain…'
                : `${bets?.length ?? 0} bet(s) found`}
            </PanelSubtitle>
          </PanelHeaderText>

          <PanelTag>Wallet</PanelTag>
        </PanelHeader>

        {!connected ? (
          <ErrorState>Connect your wallet to see your predictions.</ErrorState>
        ) : loading ? (
          <EmptyState>
            <Spinner /> Loading predictions…
          </EmptyState>
        ) : errMsg ? (
          <ErrorState>{errMsg}</ErrorState>
        ) : bets && bets.length > 0 ? (
          <BetsList>
            {bets.map((b, i) => (
              <BetItem key={`${b.match_id}-${i}`}>
                <BetMain>
                  <BetTitleRow>
                    <BetTitleStrong>Match</BetTitleStrong>
                    <MetaTag>#{b.match_id}</MetaTag>
                  </BetTitleRow>

                  <MetaRow>
                    <MetaTag>
                      Selected: <OutcomeTag $o={b.selected}>{b.selected}</OutcomeTag>
                    </MetaTag>

                    <MetaTag>Amount: {formatAmount(b.amount)}</MetaTag>

                    <MetaTag>
                      Paid: <StatusPill $variant={b.paid ? 'ok' : 'muted'}>{b.paid ? 'Yes' : 'No'}</StatusPill>
                    </MetaTag>
                  </MetaRow>
                </BetMain>

                <ActionCol>
                  <StatusPill $variant={b.paid ? 'ok' : 'muted'}>{b.paid ? 'Paid ✓' : 'Pending'}</StatusPill>
                </ActionCol>
              </BetItem>
            ))}
          </BetsList>
        ) : (
          <EmptyState>No Predictions found for your account.</EmptyState>
        )}
      </BetsPanel>
    </Container>
  );
};
