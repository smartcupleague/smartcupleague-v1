import React from 'react';
import { DaoPanel } from './DaoPanel';
import { MatchTable } from './MatchTable';
import { ActivitySection } from './ActivitySection';
import './scb-dashboard.css';

export const DashboardHome: React.FC = () => {
  return (
    <div className="scb-dashboard-home">
      <section className="scb-dashboard-home__row scb-dashboard-home__row--top">
        <DaoPanel />
      </section>

      <section className="scb-dashboard-home__row">
        <div className="scb-dashboard-home__primary">
          <div className="scb-section__header scb-dashboard__header-row">
            <div>
              <h2>Live & upcoming matches</h2>
              <p>All matches and pools registered by BolaoCore smart programs.</p>
            </div>

            <div className="scb-dashboard__filters">
              <div className="scb-tabs">
                <button className="scb-tab scb-tab--active">Live</button>
                <button className="scb-tab">Upcoming</button>
                <button className="scb-tab">Settled</button>
              </div>

              <select className="scb-select" defaultValue="all">
                <option value="all">All cups</option>
                <option value="ucl">Champions League</option>
                <option value="lib">Copa Libertadores</option>
                <option value="wc">World Cup</option>
                <option value="euro">EURO</option>
              </select>
            </div>
          </div>

          <MatchTable />
        </div>

        <div className="scb-dashboard-home__secondary">
          <ActivitySection />
        </div>
      </section>
    </div>
  );
};
