import React, { useState, useEffect, useCallback, useMemo } from 'react';
import styled, { keyframes } from 'styled-components';
import { useAccount, useAlert, useApi } from '@gear-js/react-hooks';
import { web3Enable } from '@polkadot/extension-dapp';
import { Program, Service } from '@/hocs/lib';
import { Wallet } from '@gear-js/wallet-connect';

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
  background: radial-gradient(circle at 30% 20%, rgba(255, 79, 156, 0.4), transparent 60%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.05));
  border: 1px solid rgba(255, 255, 255, 0.12);
`;

const ChipStrong = styled.span`
  font-weight: 900;
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
  transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease;

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
  transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.08);
  }
`;

const CupTableHead = styled.div`
  padding: 10px 14px 8px;
  display: grid;
  grid-template-columns: 1.6fr 140px 160px 170px 120px 44px;
  gap: 10px;
  color: rgba(255, 255, 255, 0.65);
  font-size: 12px;

  @media (max-width: 980px) {
    grid-template-columns: 1fr 140px 120px;
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
  grid-template-columns: 1.6fr 140px 160px 170px 120px 44px;
  gap: 10px;
  align-items: center;

  transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(255, 0, 110, 0.35);
    background: rgba(255, 255, 255, 0.06);
  }

  @media (max-width: 980px) {
    grid-template-columns: 1fr 140px 120px;
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
  gap: 4px;

  .teams {
    font-weight: 900;
    color: rgba(255, 255, 255, 0.92);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .meta {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.66);
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
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
  align-items: baseline;
  gap: 8px;

  .n {
    font-weight: 950;
    color: rgba(255, 235, 200, 0.92);
    text-shadow: 0 0 16px rgba(255, 0, 110, 0.1);
  }
  .u {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.66);
    font-weight: 800;
  }
`;

const StatusPill = styled.span<{ $variant: 'ok' | 'muted' }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 900;

  border: 1px solid ${({ $variant }) => ($variant === 'ok' ? 'rgba(65, 214, 114, 0.45)' : 'rgba(255,255,255,0.18)')};
  background: ${({ $variant }) => ($variant === 'ok' ? 'rgba(65, 214, 114, 0.14)' : 'rgba(255,255,255,0.08)')};
  color: ${({ $variant }) => ($variant === 'ok' ? 'rgba(210, 255, 225, 0.95)' : 'rgba(255,255,255,0.78)')};
  white-space: nowrap;
`;

const TrashBtn = styled.button`
  width: 34px;
  height: 34px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.1);
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;

  &:hover {
    border-color: rgba(255, 0, 110, 0.35);
    background: rgba(255, 255, 255, 0.08);
  }
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
  border: 2.5px solid rgba(255, 0, 110, 0.9);
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

const OutcomePill = styled.span<{ $o: Outcome }>`
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.1);
  font-weight: 900;

  ${({ $o }) => {
    switch ($o) {
      case 'Home':
        return 'color: rgba(65,214,114,.92);';
      case 'Draw':
        return 'color: rgba(255,194,75,.92);';
      case 'Away':
        return 'color: rgba(120,160,255,.92);';
      default:
        return 'color: rgba(255,255,255,.85);';
    }
  }}
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

function calcPotential(amountHuman: number, selected: Outcome) {
  const base = Number.isFinite(amountHuman) ? amountHuman : 0;
  const mult = selected === 'Draw' ? 2.7 : selected === 'Away' ? 2.3 : 2.0;
  return base * mult;
}

export const QueryBetsByUserComponent: React.FC = () => {
  const { account } = useAccount();
  const alert = useAlert();
  const { api, isApiReady } = useApi();

  const [bets, setBets] = useState<UserBetView[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const [tab, setTab] = useState<'wc' | 'lib' | 'ucl'>('wc');
  const [search, setSearch] = useState('');

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

  const wcBets = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = bets ?? [];
    if (!q) return list;

    return list.filter((b) => {
      const s = `#${b.match_id} ${b.selected} ${b.paid ? 'paid' : 'pending'}`.toLowerCase();
      return s.includes(q);
    });
  }, [bets, search]);

  return (
    <Shell>
      <TopHeader>
        <HeaderRow>
          <TitleBlock>
            <Title>My Predictions</Title>
            <Subtitle>View and manage all of your active bets across tournaments.</Subtitle>
          </TitleBlock>

          <HeaderRight>
            <SearchPill>
              <SearchIcon>🔎</SearchIcon>
              <SearchInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search matches, cups, wallet"
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
        <>
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
                <ToolBtn title="Copy">⎘</ToolBtn>
              </CupTools>
            </CupHead>

            <CupTableHead>
              <div>Match</div>
              <div>Stake</div>
              <div className="colHide">Selected</div>
              <div className="colHide">Potential Winnings</div>
              <div>Status</div>
              <div />
            </CupTableHead>

            <CupRows>
              {wcBets.length === 0 ? (
                <EmptyState style={{ padding: '10px 2px' }}>No Predictions found for your account.</EmptyState>
              ) : (
                wcBets.map((b, i) => {
                  const amountHuman = Number(formatAmount(b.amount));
                  const potential = calcPotential(amountHuman, b.selected);

                  return (
                    <Row key={`wc-${b.match_id}-${i}`}>
                      <MatchCell>
                        <MatchBadge>{i + 1}</MatchBadge>
                        <MatchText>
                          <div className="teams">
                            Match <span style={{ opacity: 0.7, fontWeight: 900 }}>#{b.match_id}</span>
                          </div>
                          <div className="meta">
                            <MiniPill>Knockout</MiniPill>
                            <MiniPill>Active Bet</MiniPill>
                          </div>
                        </MatchText>
                      </MatchCell>

                      <AmountCell>
                        <span className="n">{amountHuman || 0}</span>
                        <span className="u">VARA</span>
                      </AmountCell>

                      <div className="colHide">
                        <OutcomePill $o={b.selected}>{b.selected}</OutcomePill>
                      </div>

                      <div className="colHide">
                        <WinCell>
                          <span className="n">{Number.isFinite(potential) ? potential.toFixed(2) : '0.00'}</span>
                          <span className="u">VARA</span>
                        </WinCell>
                      </div>

                      <StatusPill $variant={b.paid ? 'ok' : 'muted'}>{b.paid ? 'Paid' : 'Pending'}</StatusPill>

                      <TrashBtn title="Remove">🗑</TrashBtn>
                    </Row>
                  );
                })
              )}
            </CupRows>

            <CupFoot>
              <ViewMore>Total Bets: {wcBets.length}</ViewMore>
            </CupFoot>
          </CupCard>
        </>
      )}
    </Shell>
  );
};
