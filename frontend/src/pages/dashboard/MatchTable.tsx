import React from 'react';
import { matches, Match } from './matches';
import './scb-dashboard.css';

const getCupPillClass = (color: Match['cupColor']) => {
  switch (color) {
    case 'green':
      return 'scb-pill scb-pill--green';
    case 'blue':
      return 'scb-pill scb-pill--blue';
    case 'purple':
      return 'scb-pill scb-pill--purple';
    default:
      return 'scb-pill';
  }
};

const formatOdds = (match: Match) =>
  `${match.odds.home.toFixed(2)} · ${match.odds.draw.toFixed(2)} · ${match.odds.away.toFixed(2)}`;

const renderStatus = (status: Match['status']) => {
  if (status === 'LIVE') {
    return (
      <div className="scb-status scb-status--live">
        <span className="scb-status-dot" />
        Live
      </div>
    );
  }
  if (status === 'SCHEDULED') {
    return <div className="scb-status scb-status--scheduled">Scheduled</div>;
  }
  return (
    <div className="scb-status scb-status--settled">
      <span className="scb-status-dot" />
      Payout completed
    </div>
  );
};

export const MatchTable: React.FC = () => {
  return (
    <div className="scb-match-table-wrapper">
      <div className="scb-match-table__header">
        <h3>All cups · matches</h3>
        <p>Home / Draw / Away pools and odds managed by BolaoCore.</p>
      </div>

      <table className="scb-match-table">
        <thead>
          <tr>
            <th>Cup / Phase</th>
            <th>Match</th>
            <th>Kickoff</th>
            <th>Pools (Home / Draw / Away)</th>
            <th>Odds</th>
            <th>Your prediction</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((match) => (
            <tr key={match.id}>
              {/* Cup / phase */}
              <td>
                <div className="scb-match-meta">
                  <span className={getCupPillClass(match.cupColor)}>{match.cup}</span>
                  <span className="scb-match-phase">{match.phase}</span>
                </div>
              </td>

              {/* Teams */}
              <td>
                <div className="scb-match-teams">
                  <span>{match.homeTeam}</span>
                  <span className="scb-vs">vs</span>
                  <span>{match.awayTeam}</span>
                </div>
              </td>

              {/* Kickoff */}
              <td>
                <div className="scb-match-time">
                  <span>{match.kickoffLabel}</span>
                  <span className="scb-match-time-sub">{match.kickoffSubLabel}</span>
                </div>
              </td>

              {/* Pools */}
              <td>
                <div className="scb-match-pools">
                  <div>
                    <span className="scb-label">Home</span>
                    <p className="scb-pool__value">₿ {match.pools.home.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="scb-label">Draw</span>
                    <p className="scb-pool__value">₿ {match.pools.draw.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="scb-label">Away</span>
                    <p className="scb-pool__value">₿ {match.pools.away.toFixed(2)}</p>
                  </div>
                </div>
              </td>

              {/* Odds / result */}
              <td>
                {match.resultSide ? (
                  <p className="scb-value">
                    Result: <strong>{match.resultSide}</strong>
                    {match.resultScore && <span className="scb-match-result-score"> · {match.resultScore}</span>}
                  </p>
                ) : (
                  <p className="scb-value">{formatOdds(match)}</p>
                )}
              </td>

              <td>
                {match.userBet ? (
                  <div className={'scb-user-bet ' + (match.userBet.isWinner ? 'scb-user-bet--winner' : '')}>
                    <span className="scb-user-bet-label">Your pick:</span>
                    <span className="scb-user-bet-pill">
                      {match.userBet.side} · {match.userBet.amount.toFixed(2)} ₿
                      {typeof match.userBet.payoutAmount === 'number' && (
                        <span style={{ marginLeft: 6 }}>(+{match.userBet.payoutAmount.toFixed(2)} ₿)</span>
                      )}
                    </span>
                  </div>
                ) : (
                  <button className="scb-btn scb-btn--ghost scb-btn--xs">Place bet</button>
                )}
              </td>

              {/* Status */}
              <td>{renderStatus(match.status)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
