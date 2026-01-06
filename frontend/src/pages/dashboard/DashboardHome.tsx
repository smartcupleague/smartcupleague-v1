import React, { useCallback, useEffect, useState } from 'react';
import { useAccount, useApi, useAlert } from '@gear-js/react-hooks';
import { web3Enable } from '@polkadot/extension-dapp';

import { ActivitySection } from './ActivitySection';
import { CreateProposalComponent } from './CreateProposal';
import { QueryProposalsComponent } from './AllProposals';

import { Program, Service } from '@/hocs/dao';
import type { Proposal as DaoProposal } from '@/hocs/dao';
import './scb-dashboard.css';

const PROGRAM_ID = import.meta.env.VITE_DAOPROGRAM as `0x${string}`;

type TabKey = 'overview' | 'new' | 'all' | 'mine';

const Tabs = ({ active, onChange }: { active: TabKey; onChange: (t: TabKey) => void }) => {
  return (
    <div className="scb-tabs">
      <button
        className={`scb-tab ${active === 'overview' ? 'scb-tab--active' : ''}`}
        onClick={() => onChange('overview')}
        type="button">
        <span className="scb-tab__icon">⌂</span>
        Overview
      </button>

      <button
        className={`scb-tab ${active === 'new' ? 'scb-tab--active' : ''}`}
        onClick={() => onChange('new')}
        type="button">
        <span className="scb-tab__icon">＋</span>
        New Proposal
      </button>

      <button
        className={`scb-tab ${active === 'all' ? 'scb-tab--active' : ''}`}
        onClick={() => onChange('all')}
        type="button">
        <span className="scb-tab__icon">≋</span>
        All Proposals
      </button>

      <button
        className={`scb-tab ${active === 'mine' ? 'scb-tab--active' : ''}`}
        onClick={() => onChange('mine')}
        type="button">
        <span className="scb-tab__icon">⦿</span>
        My Proposals
      </button>
    </div>
  );
};

const MyProposalsPanel: React.FC = () => {
  const { account } = useAccount();
  const { api, isApiReady } = useApi();
  const alert = useAlert();

  const [loading, setLoading] = useState(false);
  const [proposals, setProposals] = useState<DaoProposal[] | null>(null);

  useEffect(() => {
    void web3Enable('DAO Proposals dApp');
  }, []);

  const fetchMine = useCallback(async () => {
    if (!api || !isApiReady) return;

    if (!account) {
      setProposals([]);
      return;
    }

    setLoading(true);
    try {
      const svc = new Service(new Program(api, PROGRAM_ID));
      const data = await svc.queryProposals(); 

      const mine = data.filter(
        (p) => (p.proposer || '').toLowerCase() === account.decodedAddress.toLowerCase()
      );

      setProposals(mine);
    } catch (e) {
      setProposals([]);
      alert.error('Failed to fetch proposals');
    } finally {
      setLoading(false);
    }
  }, [api, isApiReady, account, alert]);

  useEffect(() => {
    void fetchMine();
  }, [fetchMine]);

  return (
    <div className="scb-panel-placeholder" style={{ background: 'var(--panel-bg)', borderColor: 'var(--border-soft)' }}>
      <div className="scb-section__header scb-dashboard__header-row" style={{ marginBottom: '0.8rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>My Proposals</h2>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)' }}>
            Proposals created by your connected wallet.
          </p>
        </div>

        <div className="scb-dashboard__filters">
          <button
            className="scb-sidebar__item scb-btn--small"
            style={{ width: 'auto', padding: '0.45rem 0.9rem' }}
            onClick={fetchMine}
            type="button">
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {!account ? (
        <div style={{ color: 'var(--text-muted)' }}>Connect your wallet to see your proposals.</div>
      ) : proposals === null ? (
        <div style={{ color: 'var(--text-muted)' }}>Loading…</div>
      ) : proposals.length === 0 ? (
        <div style={{ color: 'var(--text-muted)' }}>No proposals found for your address.</div>
      ) : (
        <div className="scb-dao-grid">
          {proposals.map((p) => {
            const statusLabel = typeof p.status === 'object' ? Object.keys(p.status)[0] : String(p.status);
            return (
              <div key={p.id} className="scb-dao-card scb-dao-card--proposals">
                <div className="scb-dao-card__header">
                  <h3 style={{ margin: 0 }}>Proposal #{p.id}</h3>
                  <span className="scb-dao-count">{p.executed ? 'Executed' : 'Open/Closed'}</span>
                </div>

                <p className="scb-dao-sub" style={{ whiteSpace: 'pre-line' }}>
                  {p.description}
                </p>

                <div className="scb-dao-tags">
                  <span className="scb-log-tag scb-log-tag--purple">
                    Y {p.yes} · N {p.no} · A {p.abstain}
                  </span>
                  <span className="scb-log-tag scb-log-tag--green">{statusLabel}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const DashboardHome: React.FC = () => {
  const [tab, setTab] = useState<TabKey>('overview');

  useEffect(() => {
    const saved = window.localStorage.getItem('scb.dashboard.tab') as TabKey | null;
    if (saved) setTab(saved);
  }, []);

  useEffect(() => {
    window.localStorage.setItem('scb.dashboard.tab', tab);
  }, [tab]);

  return (
    <div className="scb-dashboard-home">
      {/* Tabs header */}
      <div className="scb-section__header scb-dashboard__header-row" style={{ marginBottom: '0.2rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>Governance</h2>
          <p className="scb-main__subtitle" style={{ margin: '0.25rem 0 0' }}>
            Create proposals, review activity, and manage the prediction market.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <Tabs active={tab} onChange={setTab} />
        </div>
      </div>

      {/* OVERVIEW */}
      {tab === 'overview' && (
        <section className="scb-dashboard-home__row">
          <div className="scb-dashboard-home__secondary">
            <ActivitySection />
          </div>
        </section>
      )}

      {/* NEW PROPOSAL */}
      {tab === 'new' && (
        <section className="scb-dashboard-home__row scb-dashboard-home__row--top">
          <CreateProposalComponent />
        </section>
      )}

      {/* ALL PROPOSALS */}
      {tab === 'all' && (
        <section className="scb-dashboard-home__row">
          <div className="scb-dashboard-home__primary">
            <QueryProposalsComponent />
          </div>
        </section>
      )}

      {/* MY PROPOSALS */}
      {tab === 'mine' && (
        <section className="scb-dashboard-home__row">
          <div className="scb-dashboard-home__primary">
            <MyProposalsPanel />
          </div>
        </section>
      )}
    </div>
  );
};
