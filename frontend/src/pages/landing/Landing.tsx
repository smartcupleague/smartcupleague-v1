import React from 'react';
import { useNavigate } from 'react-router-dom';
import './landing.css';

export const Landing: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="scb-page">
      {/* NAVBAR */}
      <nav className="scb-nav">
        <div className="scb-nav__left">
          <div className="scb-nav__links">
            <div className="logo-small">
              <img className="logo-small" src="./Logos.png" alt="Soccer fans celebrating" />
            </div>
            <a href="#tournaments">Tournaments</a>
            <a href="#why">Why SmartCupBet</a>
            <a href="#how">How it works</a>
            <a href="#community">Community</a>
          </div>
        </div>

        <div className="scb-nav__right">
          <button className="scb-btn scb-btn--ghost">Log in</button>
          <button className="scb-btn scb-btn--primary" onClick={() => navigate('/dashboard')}>
            Enter app
          </button>
        </div>
      </nav>

      <main>
        <section className="scb-hero">
          <div className="scb-hero__image-wrapper">
            <img src="/images/Carrossel02.jpg" alt="Soccer fans celebrating" className="scb-hero__image" />
            <div className="scb-hero__image-gradient"></div>
          </div>

          <div className="scb-hero__headline-block">
            <p className="scb-hero__kicker">CONNECTING</p>

            <h1 className="scb-hero__headline">
              <span className="scb-hero__headline-main">SOCCER</span>
              <span className="scb-hero__headline-line">AND TECH FANS</span>
              <span className="scb-hero__headline-line">
                IN THE <span className="scb-hero__highlight">BLOCKCHAIN</span>
              </span>
            </h1>

            <button className="scb-btn scb-btn--primary scb-hero__cta" onClick={() => navigate('/dashboard')}>
              Make your bet
            </button>
          </div>
        </section>

        {/* ================= BANDA PINK DEL HERO ================= */}
        <section className="scb-hero-info">
          <div className="scb-hero-info__inner">
            <h2 className="scb-hero-info__title">
              Compete for prizes in crypto and exclusive NFTs in the Grand Prize Competition.
            </h2>

            <p className="scb-hero-info__text">
              By betting on each match you are already earning points for the Grand Prize Pool. The top three
              competitors will split the prize and earn exclusive NFTs! Supporters of the project also receive a share
              of the total value locked after the final.
            </p>
          </div>
        </section>

        {/* ================= STRIP DE ESTADÍSTICAS ================= */}
        <section className="scb-section scb-section--band">
          <div className="scb-band">
            <div className="scb-band__item">
              <p className="scb-band__value">24/7</p>
              <p className="scb-band__label">Live tournaments</p>
            </div>
            <div className="scb-band__item">
              <p className="scb-band__value">20%</p>
              <p className="scb-band__label">Prize pool for champions</p>
            </div>
            <div className="scb-band__item">
              <p className="scb-band__value">0%</p>
              <p className="scb-band__label">Hidden house tricks</p>
            </div>
          </div>
        </section>

        {/* ================= TOURNAMENTS ================= */}
        <section id="tournaments" className="scb-section scb-section--tight">
          <header className="scb-section__header scb-section__header--center">
            <h2>Pick your tournament.</h2>
            <p>Big stages, big prizes. One account for all.</p>
          </header>

          <div className="scb-tournaments">
            <div className="scb-tournament-card">
              <img src="/images/tournament-worldcup.jpg" alt="" />
              <div className="scb-tournament-card__content">
                <span className="scb-pill">Global</span>
                <h3>World Cup</h3>
                <p>Full bracket · Grand prize pool</p>
              </div>
            </div>

            <div className="scb-tournament-card">
              <img src="/images/tournament-euro.jpg" alt="" />
              <div className="scb-tournament-card__content">
                <span className="scb-pill">Europe</span>
                <h3>Euro Championship</h3>
                <p>Elite teams · Big rewards</p>
              </div>
            </div>

            <div className="scb-tournament-card">
              <img src="/images/tournament-copaamerica.jpg" alt="" />
              <div className="scb-tournament-card__content">
                <span className="scb-pill">South America</span>
                <h3>Copa América</h3>
                <p>Classic rivalries · Derby atmosphere</p>
              </div>
            </div>
          </div>
        </section>

        {/* ================= WHY ================= */}
        <section id="why" className="scb-section scb-section--tight">
          <header className="scb-section__header scb-section__header--center">
            <h2>Why SmartCupBet?</h2>
          </header>

          <div className="scb-grid">
            <div className="scb-feature-card">
              <h3>🏆 Tournament leaderboards</h3>
              <p>Score points every match and chase the jackpot</p>
            </div>
            <div className="scb-feature-card">
              <h3>⚡ Instant payouts</h3>
              <p>Rewards settle immediately after match results</p>
            </div>
            <div className="scb-feature-card">
              <h3>🛡 Fair play</h3>
              <p>Transparent odds and visible prize pools</p>
            </div>
          </div>
        </section>

        {/* ================= HIGHLIGHTS ================= */}
        <section className="scb-section scb-section--highlights">
          <header className="scb-section__header">
            <h2>Tonight's top clashes.</h2>
          </header>

          <div className="scb-highlights">
            <div className="scb-highlight">
              <img src="/images/highlight-spain-france.jpg" />
              <div className="scb-highlight__overlay">
                <span>Europe</span>
                Spain 🇪🇸 vs 🇫🇷 France
              </div>
            </div>

            <div className="scb-highlight">
              <img src="/images/highlight-argentina-uruguay.jpg" />
              <div className="scb-highlight__overlay">
                <span>South America</span>
                Argentina 🇦🇷 vs 🇺🇾 Uruguay
              </div>
            </div>

            <div className="scb-highlight">
              <img src="/images/highlight-england-germany.jpg" />
              <div className="scb-highlight__overlay">
                <span>Global</span>
                England 🏴 vs 🇩🇪 Germany
              </div>
            </div>
          </div>
        </section>

        {/* ================= HOW ================= */}
        <section id="how" className="scb-section scb-section--tight">
          <header className="scb-section__header scb-section__header--center">
            <h2>How it works</h2>
          </header>

          <div className="scb-steps">
            <div className="scb-step">1 — Create account</div>
            <div className="scb-step">2 — Join a tournament</div>
            <div className="scb-step">3 — Predict & win</div>
          </div>
        </section>

        {/* ================= COMMUNITY ================= */}
        <section id="community" className="scb-section scb-section--tight">
          <header className="scb-section__header scb-section__header--center">
            <h2>Built for fan energy.</h2>
            <p>Play solo or invite your crew.</p>
          </header>

          <div className="scb-community">
            <div className="scb-community__card">Private leagues & leaderboards</div>
            <div className="scb-community__card">Live chat & match hype</div>
            <div className="scb-community__card">Global audience & events</div>
          </div>
        </section>

        {/* ================= CTA FINAL ================= */}
        <section className="scb-section scb-section--cta">
          <div className="scb-cta">
            <h2>Ready for kickoff?</h2>
            <p>Join live tournaments and make every match count.</p>
            <button className="scb-btn scb-btn--primary scb-btn--lg">Enter SmartCupBet</button>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="scb-footer">© {new Date().getFullYear()} SmartCupBet — Powered by fans.</footer>
    </div>
  );
};

export default Landing;
