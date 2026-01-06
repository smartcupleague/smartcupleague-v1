import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Footer } from './Footer';
import { DashboardHome } from './DashboardHome';
import './scb-dashboard.css';
import { Wallet } from '@gear-js/wallet-connect';
import { MatchList } from './MatchList';
import { MatchesTableComponent } from './AllMatchs';
import { QueryBetsByUserComponent } from './QueryBetsByUser';

export type SectionKey = 'home' | 'my-bets' | 'all-bets' | 'all-cups' | 'dao' | 'settings';


const matches = [
  {
    id: 1,
    homeTeam: 'Argentina',
    awayTeam: 'Brasil',
    homeFlagUrl: '/flags/flag_argentina.jpg',
    awayFlagUrl: '/flags/flag_brasil.jpg',
    dateLabel: '21 Nov · 18:00',
    groupLabel: 'Semi-final',
    stadiumLabel: 'Lusail Stadium',
  },
  {
    id: 2,
    homeTeam: 'Belgica',
    awayTeam: 'Francia',
    homeFlagUrl: '/flags/flag_belgica.jpg',
    awayFlagUrl: '/flags/flag_frança.jpg',
    dateLabel: '22 Nov · 21:00',
    groupLabel: 'Quarter-final',
  },
  {
    id: 3,
    homeTeam: 'Qatar',
    awayTeam: 'Ecuador',
    homeFlagUrl: '/images/flag_qatar.jpg',
    awayFlagUrl: '/images/flag_equador.jpg',
    dateLabel: '22 Nov · 23:00',
    groupLabel: 'Quarter-final',
  },
];

const Dashboard: React.FC = () => {
  const [activeSection, setActiveSection] = useState<SectionKey>('home');

  const renderSection = () => {
    switch (activeSection) {
      case 'home':
        return <DashboardHome />;
      case 'my-bets':
        return <QueryBetsByUserComponent/>;
      case 'all-bets':
        return <MatchesTableComponent/>;
      case 'all-cups':
        return <div className="scb-panel-placeholder">All Cups – coming soon.</div>;
      case 'dao':
        return <div className="scb-panel-placeholder">DAO – governance view.</div>;
      case 'settings':
        return <div className="scb-panel-placeholder">Settings – profile & preferences.</div>;
      default:
        return null;
    }
  };

  return (
    <div className="scb-shell">
      <Sidebar activeSection={activeSection} onChangeSection={setActiveSection} />

      <div className="scb-main">
        <header className="scb-main__topbar">
          <div className="scb-main__topbar-left">
            <h1 className="scb-main__title">
              {activeSection === 'home' && 'Overview'}
              {activeSection === 'my-bets' && 'My Predictions'}
              {activeSection === 'all-bets' && 'All Predictions'}
              {activeSection === 'all-cups' && 'All Cups'}
              {activeSection === 'dao' && 'DAO & Governance'}
              {activeSection === 'settings' && 'Settings'}
            </h1>
            <p className="scb-main__subtitle">Multicup betting powered by BolaoCore smart programs.</p>
          </div>
          <div className="scb-main__topbar-right">
            <div className="scb-search">
              <input className="scb-search__input" placeholder="Search matches, cups, wallets…" />
            </div>

            <div className="scb-wallet-container">
              <Wallet />
            </div>
          </div>
        </header>

        <main className="scb-main__content">{renderSection()}</main>

        <Footer />
      </div>
    </div>
  );
};

export { Dashboard };
