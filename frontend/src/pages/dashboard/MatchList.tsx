
import React from "react";
import { useNavigate } from "react-router-dom";
import "./matchs.css";

type Match = {
  id: string | number;
  homeTeam: string;
  awayTeam: string;
  homeFlagUrl: string;
  awayFlagUrl: string;
  dateLabel?: string;   
  groupLabel?: string;  
  stadiumLabel?: string; 
};

interface MatchListProps {
  title?: string;
  subtitle?: string;
  tagLabel?: string;
  matches: Match[];
}

export const MatchList: React.FC<MatchListProps> = ({
  title = "World Cup Matches",
  subtitle = "Seleccioná un partido para apostar",
  tagLabel = "Live & Upcoming",
  matches,
}) => {
  const navigate = useNavigate();

  const handleBetClick = (matchId: Match["id"]) => {
    navigate(`/match`);
  };

  return (
    <section className="scb-match-list-panel">
      <header className="scb-match-list-panel__header">
        <div>
          <h2 className="scb-match-list-panel__title">{title}</h2>
          <p className="scb-match-list-panel__subtitle">{subtitle}</p>
        </div>
        {tagLabel && (
          <span className="scb-match-list-panel__tag">{tagLabel}</span>
        )}
      </header>

      <ul className="scb-match-list">
        {matches.map((match) => (
          <li key={match.id} className="scb-match-item">
            {/* Info principal */}
            <div className="scb-match-item__main">
              <div className="scb-match-teams">
                <div className="scb-match-team">
                  <span className="scb-match-flag">
                    <img
                      src={match.homeFlagUrl}
                      alt={`Bandera de ${match.homeTeam}`}
                    />
                  </span>
                  <span className="scb-match-team-name">
                    {match.homeTeam}
                  </span>
                </div>

                <span className="scb-match-vs">vs</span>

                <div className="scb-match-team">
                  <span className="scb-match-flag">
                    <img
                      src={match.awayFlagUrl}
                      alt={`Bandera de ${match.awayTeam}`}
                    />
                  </span>
                  <span className="scb-match-team-name">
                    {match.awayTeam}
                  </span>
                </div>
              </div>

              <div className="scb-match-meta">
                {match.dateLabel && (
                  <span className="scb-match-meta-tag">
                    {match.dateLabel}
                  </span>
                )}
                {match.groupLabel && (
                  <span className="scb-match-meta-tag">
                    {match.groupLabel}
                  </span>
                )}
                {match.stadiumLabel && (
                  <span className="scb-match-meta-tag">
                    {match.stadiumLabel}
                  </span>
                )}
              </div>
            </div>

            {/* Acción Bet */}
            <div className="scb-match-item__action">
              <button
                type="button"
                className="scb-match-bet-btn"
                onClick={() => handleBetClick(match.id)}
              >
                <span>League</span>
                <span className="scb-match-bet-btn-icon">↗</span>
              </button>
            </div>
          </li>
        ))}

        {matches.length === 0 && (
          <li className="scb-match-item">
            <div className="scb-match-item__main">
              <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                No hay partidos disponibles por ahora.
              </span>
            </div>
          </li>
        )}
      </ul>
    </section>
  );
};
