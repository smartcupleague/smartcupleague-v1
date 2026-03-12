import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AppFooter } from '@/components/layout/footer/AppFooter';
import './legal.css';

export default function DaoConstitution() {
  const navigate = useNavigate();

  return (
    <div className="legal-page">
      <header className="legal-header">
        <button className="legal-back" onClick={() => navigate(-1)} type="button">
          ← Back
        </button>
        <img src="/Logos.png" alt="SmartCup League" className="legal-logo" />
      </header>

      <main className="legal-content">
        <div className="legal-badge">DRAFT</div>
        <h1 className="legal-title">SMARTCUPDAO 2025 — CONSTITUTION (DRAFT)</h1>
        <p className="legal-updated">Last updated: 2025 — Subject to ratification by DAO members</p>

        <section className="legal-section">
          <h2>Preamble</h2>
          <p>
            SmartCupDAO is a decentralized autonomous organization governing the SmartCup League
            prediction platform. This Constitution establishes the principles, structure, and processes
            by which SmartCupDAO operates.
          </p>
        </section>

        <section className="legal-section">
          <h2>Article I — Purpose</h2>
          <p>
            SmartCupDAO exists to govern the SmartCup League protocol in a fair, transparent, and
            community-driven manner. Its primary mission is to ensure the long-term sustainability,
            security, and growth of the prediction platform while protecting the interests of all participants.
          </p>
        </section>

        <section className="legal-section">
          <h2>Article II — Membership</h2>
          <p>
            Membership in SmartCupDAO is open to any address holding governance tokens or meeting
            participation criteria established by the DAO. Members have the right to propose, vote,
            and participate in governance activities.
          </p>
        </section>

        <section className="legal-section">
          <h2>Article III — Governance Structure</h2>
          <p>
            The DAO operates through an on-chain proposal and voting mechanism. Any member may submit
            a proposal. Proposals are categorized as follows:
          </p>
          <ul>
            <li><strong>Create New Tournament</strong> — Register new prediction tournaments</li>
            <li><strong>Protocol Parameter Update</strong> — Adjust fees, reward structures, pool distributions</li>
            <li><strong>Governance Parameter Update</strong> — Modify voting period, quorum, thresholds</li>
            <li><strong>Treasury Funding Proposal</strong> — Allocate DAO treasury funds</li>
            <li><strong>Compliance & Safety Proposal</strong> — Address platform safety and regulatory matters</li>
            <li><strong>Membership Proposal</strong> — Onboard or remove DAO members</li>
            <li><strong>Informational / Signaling Proposal</strong> — Non-binding community signals</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>Article IV — Voting</h2>
          <p>
            Proposals enter a voting period upon submission. Votes are cast on-chain as Yes, No, or
            Abstain. A proposal passes if it meets the required quorum and majority thresholds as
            configured in the protocol parameters.
          </p>
        </section>

        <section className="legal-section">
          <h2>Article V — Treasury</h2>
          <p>
            A portion of prediction fees flows to the DAO treasury. Treasury funds are managed
            on-chain and may only be deployed via approved governance proposals.
          </p>
        </section>

        <section className="legal-section">
          <h2>Article VI — Smart Contract Sovereignty</h2>
          <p>
            The smart contracts governing the protocol are the ultimate authority. This Constitution
            is a guiding document; in cases of conflict, the on-chain code takes precedence. Code
            changes must follow the governance process outlined herein.
          </p>
        </section>

        <section className="legal-section">
          <h2>Article VII — Amendments</h2>
          <p>
            Amendments to this Constitution require a Governance Parameter Update proposal that
            achieves supermajority approval as defined by the current governance parameters.
          </p>
        </section>

        <section className="legal-section">
          <h2>Article VIII — Dissolution</h2>
          <p>
            SmartCupDAO may only be dissolved through a specific dissolution proposal achieving
            supermajority approval. Upon dissolution, treasury assets are distributed pro-rata
            to token holders.
          </p>
        </section>

        <div className="legal-draft-notice">
          ⚠️ This Constitution is a draft and has not been formally ratified by SmartCupDAO. It is
          provided for informational purposes and community review prior to the official DAO launch.
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
