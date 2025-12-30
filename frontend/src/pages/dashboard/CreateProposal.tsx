import React, { useCallback, useEffect, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { useAccount, useAlert, useApi } from '@gear-js/react-hooks';
import { web3Enable, web3FromSource } from '@polkadot/extension-dapp';
import { TransactionBuilder } from 'sails-js';
import { Program, Service } from '@/hocs/dao';
import type { ProposalKind } from '@/hocs/dao';

const PROGRAM_ID = import.meta.env.VITE_DAOPROGRAM;

const PROPOSAL_KIND_OPTIONS = [
  { value: 'SetFeeBps', label: 'Set Fee (BPS)' },
  { value: 'SetFinalPrizeBps', label: 'Set Final Prize (BPS)' },
  { value: 'SetMaxPayoutChunk', label: 'Set Max Payout Chunk' },
  { value: 'AddPhase', label: 'Add Phase' },
  { value: 'AddMatch', label: 'Add Match' },
  { value: 'SetQuorum', label: 'Set Quorum (BPS)' },
  { value: 'SetVotingPeriod', label: 'Set Voting Period (seconds)' },
];

type Kind =
  | 'SetFeeBps'
  | 'SetFinalPrizeBps'
  | 'SetMaxPayoutChunk'
  | 'AddPhase'
  | 'AddMatch'
  | 'SetQuorum'
  | 'SetVotingPeriod';

type Method = 'CreateProposal';

type ProposalKindForm =
  | { type: 'SetFeeBps'; new_fee_bps: string }
  | { type: 'SetFinalPrizeBps'; new_final_prize_bps: string }
  | { type: 'SetMaxPayoutChunk'; new_max_payout_chunk: string }
  | { type: 'AddPhase'; name: string; start_time: string; end_time: string }
  | { type: 'AddMatch'; phase: string; home: string; away: string; kick_off: string }
  | { type: 'SetQuorum'; new_quorum_bps: string }
  | { type: 'SetVotingPeriod'; new_voting_period: string };

/* ---------- STYLES (vino glass) ---------- */
const spin = keyframes`to { transform: rotate(360deg); }`;
const floatIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

const Container = styled.div`
  width: min(560px, 100%);
  margin: 1.6rem auto;
  padding: 1.2rem;
  border-radius: 1.35rem;
  background: radial-gradient(circle at top left, rgba(255, 0, 110, 0.12), rgba(23, 0, 12, 0.92));
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.9);
  animation: ${floatIn} 220ms ease-out;
`;

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.8rem 0.9rem 0.9rem;
  border-radius: 1.1rem;
  background: rgba(9, 0, 6, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.12);
`;

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  min-width: 0;
`;

const TitleWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 1.05rem;
  letter-spacing: 0.01em;
  color: var(--text-main, #fff);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Subtitle = styled.p`
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-muted, #e8cfdd);
  line-height: 1.25;
`;

const MetaPill = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 0, 110, 0.55);
  background: rgba(255, 0, 110, 0.14);
  color: #ffe4f2;
  font-size: 0.78rem;
  white-space: nowrap;
`;

const Form = styled.div`
  margin-top: 0.95rem;
  padding: 1rem 1rem 1.05rem;
  border-radius: 1.15rem;
  background: rgba(9, 0, 6, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.85);
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr);
  gap: 0.7rem 0.9rem;
  align-items: center;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const Label = styled.label`
  font-size: 0.88rem;
  color: rgba(255, 255, 255, 0.92);
  letter-spacing: 0.01em;
  user-select: none;

  @media (max-width: 520px) {
    margin-top: 0.25rem;
  }
`;

const controlCss = `
  width: 100%;
  min-width: 0;
  border-radius: 0.95rem;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(10, 0, 6, 0.96);
  color: #fff;
  padding: 0.58rem 0.8rem;
  font-size: 0.9rem;
  outline: none;
  transition: border-color 140ms ease-out, box-shadow 140ms ease-out, transform 120ms ease-out;

  &::placeholder { color: rgba(196, 163, 186, 0.9); }

  &:focus {
    border-color: rgba(255, 0, 110, 0.85);
    box-shadow: 0 0 0 3px rgba(255, 0, 110, 0.22);
  }

  &:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }
`;

const Input = styled.input`
  ${controlCss}
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;

  &[type='number'] {
    appearance: textfield;
  }
  &[type='number']::-webkit-outer-spin-button,
  &[type='number']::-webkit-inner-spin-button {
    appearance: none;
    margin: 0;
  }
`;

const Select = styled.select`
  ${controlCss}
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;

  background-image: linear-gradient(45deg, transparent 50%, rgba(255, 255, 255, 0.6) 50%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.6) 50%, transparent 50%);
  background-position: calc(100% - 18px) calc(50% - 2px), calc(100% - 12px) calc(50% - 2px);
  background-size: 6px 6px, 6px 6px;
  background-repeat: no-repeat;
`;

const Textarea = styled.textarea`
  ${controlCss}
  min-height: 88px;
  resize: vertical;
  line-height: 1.35;
`;

const Helper = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
  margin-top: -0.2rem;
  color: rgba(232, 207, 221, 0.9);
  font-size: 0.78rem;
`;

const Hint = styled.span`
  color: rgba(232, 207, 221, 0.88);
`;

const Counter = styled.span`
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  color: rgba(255, 255, 255, 0.82);
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  padding-top: 0.2rem;
`;

const Button = styled.button<{ disabled?: boolean }>`
  position: relative;
  border: 1px solid rgba(255, 0, 110, 0.55);
  background: radial-gradient(circle at top left, rgba(255, 0, 110, 0.35), rgba(23, 0, 12, 0.95));
  color: #fff;
  border-radius: 0.95rem;
  padding: 0.62rem 0.95rem;
  font-weight: 650;
  font-size: 0.9rem;
  letter-spacing: 0.01em;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  box-shadow: 0 18px 40px rgba(255, 0, 110, 0.18);
  transition: transform 110ms ease-out, box-shadow 140ms ease-out, border-color 140ms ease-out, opacity 140ms ease-out;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(255, 0, 110, 0.9);
    box-shadow: 0 22px 50px rgba(255, 0, 110, 0.28);
  }

  &:active {
    transform: translateY(0px);
  }

  ${({ disabled }) =>
    disabled &&
    `
      opacity: 0.55;
      cursor: not-allowed;
      transform: none !important;
      box-shadow: none !important;
      border-color: rgba(255,255,255,0.16) !important;
    `}
`;

const Spinner = styled.div`
  width: 1.02rem;
  height: 1.02rem;
  border: 2px solid rgba(255, 255, 255, 0.9);
  border-top-color: transparent;
  border-radius: 50%;
  animation: ${spin} 0.85s linear infinite;
`;

/* ---------- MAIN COMPONENT ---------- */

export const CreateProposalComponent: React.FC = () => {
  const { account } = useAccount();
  const alert = useAlert();
  const { api, isApiReady } = useApi();
  const [loading, setLoading] = useState<Method | null>(null);
  const [kind, setKind] = useState<Kind>('SetFeeBps');
  const [form, setForm] = useState<ProposalKindForm>({ type: 'SetFeeBps', new_fee_bps: '' });
  const [desc, setDesc] = useState('');

  useEffect(() => {
    void web3Enable('DAO Proposal dApp');
  }, []);

  useEffect(() => {
    switch (kind) {
      case 'SetFeeBps':
        setForm({ type: 'SetFeeBps', new_fee_bps: '' });
        break;
      case 'SetFinalPrizeBps':
        setForm({ type: 'SetFinalPrizeBps', new_final_prize_bps: '' });
        break;
      case 'SetMaxPayoutChunk':
        setForm({ type: 'SetMaxPayoutChunk', new_max_payout_chunk: '' });
        break;
      case 'AddPhase':
        setForm({ type: 'AddPhase', name: '', start_time: '', end_time: '' });
        break;
      case 'AddMatch':
        setForm({ type: 'AddMatch', phase: '', home: '', away: '', kick_off: '' });
        break;
      case 'SetQuorum':
        setForm({ type: 'SetQuorum', new_quorum_bps: '' });
        break;
      case 'SetVotingPeriod':
        setForm({ type: 'SetVotingPeriod', new_voting_period: '' });
        break;
    }
  }, [kind]);

  
  const buildProposalKind = (): ProposalKind => {
    switch (form.type) {
      case 'SetFeeBps':
        return { SetFeeBps: { new_fee_bps: form.new_fee_bps?.trim() ? form.new_fee_bps.trim() : '0' } };

      case 'SetFinalPrizeBps':
        return {
          SetFinalPrizeBps: {
            new_final_prize_bps: form.new_final_prize_bps?.trim() ? form.new_final_prize_bps.trim() : '0',
          },
        };

      case 'SetMaxPayoutChunk':
        return {
          SetMaxPayoutChunk: {
            new_max_payout_chunk: form.new_max_payout_chunk?.trim() ? form.new_max_payout_chunk.trim() : '0',
          },
        };

      case 'AddPhase':
        return {
          AddPhase: {
            name: form.name,
            start_time: form.start_time?.trim() ? form.start_time.trim() : '0',
            end_time: form.end_time?.trim() ? form.end_time.trim() : '0',
          },
        };

      case 'AddMatch':
        return {
          AddMatch: {
            phase: form.phase,
            home: form.home,
            away: form.away,
            kick_off: form.kick_off?.trim() ? form.kick_off.trim() : '0',
          },
        };

      case 'SetQuorum':
        return { SetQuorum: { new_quorum_bps: form.new_quorum_bps?.trim() ? Number(form.new_quorum_bps.trim()) : 0 } };

      case 'SetVotingPeriod':
        return {
          SetVotingPeriod: { new_voting_period: form.new_voting_period?.trim() ? form.new_voting_period.trim() : '0' },
        };
    }
  };

  const canSubmit = (() => {
    if (!desc.trim()) return false;
    switch (form.type) {
      case 'SetFeeBps':
        return form.new_fee_bps && /^\d+$/.test(form.new_fee_bps);
      case 'SetFinalPrizeBps':
        return form.new_final_prize_bps && /^\d+$/.test(form.new_final_prize_bps);
      case 'SetMaxPayoutChunk':
        return form.new_max_payout_chunk && /^\d+$/.test(form.new_max_payout_chunk);
      case 'AddPhase':
        return (
          form.name.trim() &&
          form.start_time &&
          /^\d+$/.test(form.start_time) &&
          form.end_time &&
          /^\d+$/.test(form.end_time)
        );
      case 'AddMatch':
        return (
          form.phase.trim() && form.home.trim() && form.away.trim() && form.kick_off && /^\d+$/.test(form.kick_off)
        );
      case 'SetQuorum':
        return form.new_quorum_bps && /^\d+$/.test(form.new_quorum_bps);
      case 'SetVotingPeriod':
        return form.new_voting_period && /^\d+$/.test(form.new_voting_period);
      default:
        return false;
    }
  })();

  const sendTransaction = useCallback(
    async (tx: TransactionBuilder<unknown>, m: Method) => {
      try {
        const { signer } = await web3FromSource(account!.meta.source);
        tx.withAccount(account!.decodedAddress, { signer });

        await tx.calculateGas();
        const { blockHash, response } = await tx.signAndSend();

        alert.info(`Included in block ${blockHash}`);
        await response();
        alert.success('Proposal created!');
      } catch (err) {
        console.error(err);
        alert.error('Proposal creation failed');
      } finally {
        setLoading(null);
      }
    },
    [account, alert],
  );

  const handleCreate = async () => {
    if (!account) {
      alert.error('Connect your wallet first');
      return;
    }
    if (!isApiReady) {
      alert.error('Node API not ready');
      return;
    }

    const svc = new Service(new Program(api, PROGRAM_ID));
    try {
      const tx = svc.createProposal(buildProposalKind(), desc.trim());
      setLoading('CreateProposal');
      await sendTransaction(tx, 'CreateProposal');
      setDesc('');
      // reset
      switch (kind) {
        case 'SetFeeBps':
          setForm({ type: 'SetFeeBps', new_fee_bps: '' });
          break;
        case 'SetFinalPrizeBps':
          setForm({ type: 'SetFinalPrizeBps', new_final_prize_bps: '' });
          break;
        case 'SetMaxPayoutChunk':
          setForm({ type: 'SetMaxPayoutChunk', new_max_payout_chunk: '' });
          break;
        case 'AddPhase':
          setForm({ type: 'AddPhase', name: '', start_time: '', end_time: '' });
          break;
        case 'AddMatch':
          setForm({ type: 'AddMatch', phase: '', home: '', away: '', kick_off: '' });
          break;
        case 'SetQuorum':
          setForm({ type: 'SetQuorum', new_quorum_bps: '' });
          break;
        case 'SetVotingPeriod':
          setForm({ type: 'SetVotingPeriod', new_voting_period: '' });
          break;
      }
    } catch (err) {
      alert.error('Failed to build proposal transaction');
      setLoading(null);
    }
  };

  const renderKindFields = () => {
    switch (form.type) {
      case 'SetFeeBps':
        return (
          <>
            <Label>New Fee (BPS)</Label>
            <Input
              type="number"
              min={0}
              placeholder="e.g. 500 (5%)"
              value={form.new_fee_bps}
              disabled={loading !== null}
              onChange={(e) => setForm({ ...form, new_fee_bps: e.target.value })}
            />
          </>
        );

      case 'SetFinalPrizeBps':
        return (
          <>
            <Label>Final Prize (BPS)</Label>
            <Input
              type="number"
              min={0}
              placeholder="e.g. 2000 (20%)"
              value={form.new_final_prize_bps}
              disabled={loading !== null}
              onChange={(e) => setForm({ ...form, new_final_prize_bps: e.target.value })}
            />
          </>
        );

      case 'SetMaxPayoutChunk':
        return (
          <>
            <Label>Max Payout Chunk</Label>
            <Input
              type="number"
              min={0}
              placeholder="e.g. 10000000000000"
              value={form.new_max_payout_chunk}
              disabled={loading !== null}
              onChange={(e) => setForm({ ...form, new_max_payout_chunk: e.target.value })}
            />
          </>
        );

      case 'AddPhase':
        return (
          <>
            <Label>Phase Name</Label>
            <Input
              type="text"
              placeholder="e.g. Group Stage"
              value={form.name}
              disabled={loading !== null}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />

            <Label>Start Time (epoch s)</Label>
            <Input
              type="number"
              min={0}
              placeholder="e.g. 1730000000"
              value={form.start_time}
              disabled={loading !== null}
              onChange={(e) => setForm({ ...form, start_time: e.target.value })}
            />

            <Label>End Time (epoch s)</Label>
            <Input
              type="number"
              min={0}
              placeholder="e.g. 1730600000"
              value={form.end_time}
              disabled={loading !== null}
              onChange={(e) => setForm({ ...form, end_time: e.target.value })}
            />
          </>
        );

      case 'AddMatch':
        return (
          <>
            <Label>Phase</Label>
            <Input
              type="text"
              placeholder="e.g. Group Stage"
              value={form.phase}
              disabled={loading !== null}
              onChange={(e) => setForm({ ...form, phase: e.target.value })}
            />

            <Label>Home Team</Label>
            <Input
              type="text"
              placeholder="e.g. México"
              value={form.home}
              disabled={loading !== null}
              onChange={(e) => setForm({ ...form, home: e.target.value })}
            />

            <Label>Away Team</Label>
            <Input
              type="text"
              placeholder="e.g. Brasil"
              value={form.away}
              disabled={loading !== null}
              onChange={(e) => setForm({ ...form, away: e.target.value })}
            />

            <Label>Kickoff Time (epoch s)</Label>
            <Input
              type="number"
              min={0}
              placeholder="e.g. 1730050000"
              value={form.kick_off}
              disabled={loading !== null}
              onChange={(e) => setForm({ ...form, kick_off: e.target.value })}
            />
          </>
        );

      case 'SetQuorum':
        return (
          <>
            <Label>Quorum (BPS)</Label>
            <Input
              type="number"
              min={0}
              placeholder="e.g. 2000 (20%)"
              value={form.new_quorum_bps}
              disabled={loading !== null}
              onChange={(e) => setForm({ ...form, new_quorum_bps: e.target.value })}
            />
          </>
        );

      case 'SetVotingPeriod':
        return (
          <>
            <Label>Voting Period (seconds)</Label>
            <Input
              type="number"
              min={0}
              placeholder="e.g. 86400"
              value={form.new_voting_period}
              disabled={loading !== null}
              onChange={(e) => setForm({ ...form, new_voting_period: e.target.value })}
            />
          </>
        );

      default:
        return null;
    }
  };

  return (
    <Container>
      <Header>
        <Brand>
          <TitleWrap>
            <Title>Governance: Create Proposal</Title>
            <Subtitle>Submit a change for the DAO to vote and execute on-chain.</Subtitle>
          </TitleWrap>
        </Brand>

        <MetaPill>DAO</MetaPill>
      </Header>

      <Form>
        <Grid>
          <Label>Proposal Kind</Label>
          <Select value={kind} disabled={loading !== null} onChange={(e) => setKind(e.target.value as Kind)}>
            {PROPOSAL_KIND_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>

          {renderKindFields()}

          <Label>Description</Label>
          <div>
            <Textarea
              rows={3}
              placeholder="Explain what you want to change and why it benefits the protocol…"
              value={desc}
              disabled={loading !== null}
              onChange={(e) => setDesc(e.target.value)}
              maxLength={600}
            />
            <Helper>
              <Hint>Tip: include numbers + rationale.</Hint>
              <Counter>{desc.length}/600</Counter>
            </Helper>
          </div>
        </Grid>

        <Actions>
          <Button disabled={loading !== null || !canSubmit} onClick={handleCreate}>
            {loading ? <Spinner /> : null}
            Create Proposal
          </Button>
        </Actions>
      </Form>
    </Container>
  );
};
