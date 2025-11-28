import React from "react";
import "./scb-dashboard.css"; 

export const ActivitySection: React.FC = () => {
  return (
    <section className="scb-activity">
      <div className="scb-activity__card scb-activity__card--log">
        <div className="scb-activity__header">
          <div>
            <h3>BolaoCore events</h3>
            <p>Registration, oracle finalization and prize streaming.</p>
          </div>
          <span className="scb-activity__tag">Live feed</span>
        </div>

        <ul className="scb-log">
          <li>
            <span className="scb-log-tag">Register</span>
            New match added: Boca Juniors vs Flamengo (Copa Libertadores).
            <span className="scb-log-time">· 2 min ago</span>
          </li>
          <li>
            <span className="scb-log-tag scb-log-tag--green">Oracle</span>
            Result finalized: Argentina 2 - 1 France (World Cup).
            <span className="scb-log-time">· 18 min ago</span>
          </li>
          <li>
            <span className="scb-log-tag scb-log-tag--purple">Prize</span>
            0.32 ₿ streamed to the Final Prize Pool.
            <span className="scb-log-time">· 25 min ago</span>
          </li>
          <li>
            <span className="scb-log-tag">Points</span>
            +24 points for wallet 0xa3...c9f on Argentina win.
            <span className="scb-log-time">· 31 min ago</span>
          </li>
        </ul>
      </div>

      <div className="scb-activity__card scb-activity__card--winners">
        <div className="scb-activity__header">
          <div>
            <h3>Top winners (24h)</h3>
            <p>Biggest net positive payouts across all cups.</p>
          </div>
        </div>

        <ul className="scb-winners">
          <li>
            <span className="scb-winner-rank">#1</span>
            <span className="scb-winner-name">0xa3...c9f</span>
            <span className="scb-winner-cup">World Cup · ARG vs FRA</span>
            <span className="scb-winner-amount">+0.21 ₿</span>
          </li>
          <li>
            <span className="scb-winner-rank">#2</span>
            <span className="scb-winner-name">0x44...19b</span>
            <span className="scb-winner-cup">Champions League</span>
            <span className="scb-winner-amount">+0.17 ₿</span>
          </li>
          <li>
            <span className="scb-winner-rank">#3</span>
            <span className="scb-winner-name">0xd8...02e</span>
            <span className="scb-winner-cup">Copa Libertadores</span>
            <span className="scb-winner-amount">+0.11 ₿</span>
          </li>
        </ul>
      </div>

      <div className="scb-activity__card scb-activity__card--community">
        <div className="scb-activity__header">
          <div>
            <h3>DAO community</h3>
            <p>Live governance around fees, cups and prize models.</p>
          </div>
        </div>

        <div className="scb-activity__avatars">
          <div className="scb-activity__avatar scb-activity__avatar--one" />
          <div className="scb-activity__avatar scb-activity__avatar--two" />
          <div className="scb-activity__avatar scb-activity__avatar--three" />
          <span className="scb-activity__avatar-count">+128 online</span>
        </div>

        <ul className="scb-activity__messages">
          <li>
            <span className="scb-activity__user">0x9f...d3a</span>
            <span className="scb-activity__text">
              Voting “yes” on lowering the fee to 4.5%.
            </span>
          </li>
          <li>
            <span className="scb-activity__user">0x11...b7e</span>
            <span className="scb-activity__text">
              Requesting to add AFC Asian Cup 2027 to global cups.
            </span>
          </li>
        </ul>

        <button className="scb-btn scb-btn--ghost scb-btn--full scb-btn--sm">
          Open DAO chat
        </button>
      </div>
    </section>
  );
};
