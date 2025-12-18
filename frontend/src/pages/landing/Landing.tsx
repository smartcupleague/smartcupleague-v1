import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './landing.css';

type Slide = { src: string; alt: string; kicker?: string; title: string; subtitle: string };

export const Landing: React.FC = () => {
  const navigate = useNavigate();

  const slides: Slide[] = useMemo(
    () => [
      {
        src: '/images/Carrossel01.jpg',
        alt: 'Soccer stadium lights at night',
        kicker: 'PREDICTION MARKET',
        title: 'Predict soccer. Trade outcomes.',
        subtitle: 'A transparent market for match results powered by on-chain pools.',
      },
      {
        src: '/images/Carrossel02.jpg',
        alt: 'Soccer fans celebrating',
        kicker: 'SOCCER · WEB3',
        title: 'A market made for fans',
        subtitle: 'Use your knowledge and see odds move with community predictions.',
      },
      {
        src: '/images/Carrossel03.jpg',
        alt: 'Soccer team lineup',
        kicker: 'LIVE TOURNAMENTS',
        title: 'Tournaments, leagues, rivalries',
        subtitle: 'Join competitions, climb leaderboards, and earn rewards.',
      },
      {
        src: '/images/Carrossel04.jpg',
        alt: 'Soccer ball on the pitch',
        kicker: 'FAIR & PUBLIC',
        title: 'No hidden house tricks',
        subtitle: 'Pools and probabilities are visible—settlement happens on-chain.',
      },
    ],
    [],
  );

  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = window.setInterval(() => setActive((i) => (i + 1) % slides.length), 4500);
    return () => window.clearInterval(t);
  }, [paused, slides.length]);

  const goPrev = () => setActive((i) => (i - 1 + slides.length) % slides.length);
  const goNext = () => setActive((i) => (i + 1) % slides.length);

  return (
    <div className="scb-page">
      {/* NAVBAR */}
      <nav className="scb-nav">
        <div className="scb-nav__left">
          <div className="scb-nav__links">
            <div className="logo-small">
              <img className="logo-small" src="./Logos.png" alt="SmartCupLeague logo" />
            </div>
            <a href="#market">Prediction Market</a>
            <a href="#tournaments">Tournaments</a>
            <a href="#why">Why</a>
            <a href="#how">How it works</a>
            <a href="#faq">FAQ</a>
          </div>
        </div>

        <div className="scb-nav__right">
          <button className="scb-btn scb-btn--primary" onClick={() => navigate('/dashboard')}>
            Enter app
          </button>
        </div>
      </nav>

      <main>
        <section
          className="scb-hero-carousel"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}>
          <div className="scb-carousel">
            {slides.map((s, idx) => (
              <div key={s.src} className={`scb-slide ${idx === active ? 'is-active' : ''}`}>
                <img src={s.src} alt={s.alt} className="scb-slide__img" />
                <div className="scb-slide__gradient" />

                <div className="scb-slide__content">
                  <p className="scb-hero__kicker">{s.kicker ?? 'SMARTCUPLEAGUE'}</p>

                  <h1 className="scb-hero__headline">
                    <span className="scb-hero__headline-main">{s.title}</span>
                    <span className="scb-hero__headline-line">{s.subtitle}</span>
                    <span className="scb-hero__headline-line">
                      Soccer prediction markets on the <span className="scb-hero__highlight">blockchain</span>
                    </span>
                  </h1>

                  <div className="scb-hero__cta-row">
                    <button className="scb-btn scb-btn--primary scb-hero__cta" onClick={() => navigate('/dashboard')}>
                      Start predicting
                    </button>
                    <a className="scb-btn scb-btn--ghost" href="#market">
                      Learn how markets work
                    </a>
                  </div>

                  <div className="scb-hero__badges">
                    <span className="scb-pill">Transparent pools</span>
                    <span className="scb-pill">Community-driven odds</span>
                    <span className="scb-pill">On-chain settlement</span>
                  </div>
                </div>
              </div>
            ))}

            <button
              className="scb-carousel__arrow scb-carousel__arrow--left"
              onClick={goPrev}
              aria-label="Previous slide">
              ‹
            </button>
            <button className="scb-carousel__arrow scb-carousel__arrow--right" onClick={goNext} aria-label="Next slide">
              ›
            </button>

            <div className="scb-carousel__dots" aria-label="Carousel dots">
              {slides.map((_, i) => (
                <button
                  key={i}
                  className={`scb-dot ${i === active ? 'is-active' : ''}`}
                  onClick={() => setActive(i)}
                  aria-label={`Go to slide ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </section>

        <section id="market" className="scb-section scb-section--tight">
          <header className="scb-section__header scb-section__header--center">
            <h2>What is a soccer prediction market?</h2>
            <p>
              SmartCupLeague is not a traditional bookmaker. It’s a <b>market</b> where the community expresses belief
              on match outcomes (Home / Draw / Away) and the <b>odds emerge from the pools</b>.
            </p>
          </header>

          <div className="scb-grid">
            <div className="scb-feature-card">
              <h3>📈 Odds from the crowd</h3>
              <p>Odds update based on how much liquidity is in each outcome pool.</p>
            </div>
            <div className="scb-feature-card">
              <h3>🔎 Fully transparent</h3>
              <p>Pool sizes and payouts are visible—no hidden margins or “house” tricks.</p>
            </div>
            <div className="scb-feature-card">
              <h3>⛓ On-chain settlement</h3>
              <p>Once results are finalized, rewards are settled through the smart contract.</p>
            </div>
          </div>
        </section>

        <section className="scb-hero-info">
          <div className="scb-hero-info__inner">
            <h2 className="scb-hero-info__title">Predict matches, earn rewards, and climb soccer leaderboards.</h2>
            <p className="scb-hero-info__text">
              Every prediction contributes to the pools, shaping the market odds in real time. Compete across
              tournaments and unlock prizes and exclusive NFTs.
            </p>
          </div>
        </section>

        <section className="scb-section scb-section--band">
          <div className="scb-band">
            <div className="scb-band__item">
              <p className="scb-band__value">24/7</p>
              <p className="scb-band__label">Soccer markets & tournaments</p>
            </div>
            <div className="scb-band__item">
              <p className="scb-band__value">Visible</p>
              <p className="scb-band__label">Pools & implied probabilities</p>
            </div>
            <div className="scb-band__item">
              <p className="scb-band__value">On-chain</p>
              <p className="scb-band__label">Settlement & transparency</p>
            </div>
          </div>
        </section>

        {/* ================= TOURNAMENTS ================= */}
        <section id="tournaments" className="scb-section scb-section--tight">
          <header className="scb-section__header scb-section__header--center">
            <h2>Pick your tournament.</h2>
            <p>Big stages, big rivalries. One account for all markets.</p>
          </header>

          <div className="scb-tournaments">
            <div className="scb-tournament-card">
              <img src="/images/tournament-worldcup.jpg" alt="World Cup" />
              <div className="scb-tournament-card__content">
                <span className="scb-pill">Global</span>
                <h3>World Cup</h3>
                <p>Bracket · Grand prize pools</p>
              </div>
            </div>

            <div className="scb-tournament-card">
              <img src="/images/tournament-euro.jpg" alt="Euro Championship" />
              <div className="scb-tournament-card__content">
                <span className="scb-pill">Europe</span>
                <h3>Euro Championship</h3>
                <p>Elite teams · High engagement</p>
              </div>
            </div>

            <div className="scb-tournament-card">
              <img src="/images/tournament-copaamerica.jpg" alt="Copa América" />
              <div className="scb-tournament-card__content">
                <span className="scb-pill">South America</span>
                <h3>Copa América</h3>
                <p>Classic rivalries · Derby energy</p>
              </div>
            </div>
          </div>
        </section>

        {/* ================= WHY ================= */}
        <section id="why" className="scb-section scb-section--tight">
          <header className="scb-section__header scb-section__header--center">
            <h2>Why SmartCupLeague?</h2>
            <p>Because soccer predictions should feel like a market: open, liquid, and community-driven.</p>
          </header>

          <div className="scb-grid">
            <div className="scb-feature-card">
              <h3>🏆 Leaderboards</h3>
              <p>Earn points every match and climb tournament rankings.</p>
            </div>
            <div className="scb-feature-card">
              <h3>⚡ Fast resolution</h3>
              <p>When the result is finalized, rewards can be settled immediately.</p>
            </div>
            <div className="scb-feature-card">
              <h3>🛡 Fair by design</h3>
              <p>Odds are derived from pools transparent and verifiable.</p>
            </div>
          </div>
        </section>

        <section className="scb-section scb-section--tight">
          <header className="scb-section__header scb-section__header--center">
            <h2>How the odds are formed</h2>
            <p>Pool-based pricing: more liquidity on an outcome lowers its payout multiplier.</p>
          </header>

          <div className="scb-steps scb-steps--cards">
            <div className="scb-step-card">
              <div className="scb-step-card__num">1</div>
              <div>
                <b>Fans add liquidity</b>
                <p>Each outcome (Home/Draw/Away) has its own pool.</p>
              </div>
            </div>
            <div className="scb-step-card">
              <div className="scb-step-card__num">2</div>
              <div>
                <b>Odds reflect confidence</b>
                <p>The bigger the pool, the lower the multiplier (more “likely”).</p>
              </div>
            </div>
            <div className="scb-step-card">
              <div className="scb-step-card__num">3</div>
              <div>
                <b>Settlement on results</b>
                <p>When finalized, the winning pool earns payouts.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="scb-section scb-section--highlights">
          <header className="scb-section__header">
            <h2>Featured soccer markets.</h2>
          </header>

          <div className="scb-highlights">
            <div className="scb-highlight">
              <img src="/images/highlight-spain-france.jpg" alt="Spain vs France" />
              <div className="scb-highlight__overlay">
                <span>Europe</span>
                Spain 🇪🇸 vs 🇫🇷 France
              </div>
            </div>

            <div className="scb-highlight">
              <img src="/images/highlight-argentina-uruguay.jpg" alt="Argentina vs Uruguay" />
              <div className="scb-highlight__overlay">
                <span>South America</span>
                Argentina 🇦🇷 vs 🇺🇾 Uruguay
              </div>
            </div>

            <div className="scb-highlight">
              <img src="/images/highlight-england-germany.jpg" alt="England vs Germany" />
              <div className="scb-highlight__overlay">
                <span>Global</span>
                England 🏴 vs 🇩🇪 Germany
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="scb-section scb-section--tight">
          <header className="scb-section__header scb-section__header--center">
            <h2>How it works</h2>
            <p>From wallet to prediction in minutes.</p>
          </header>

          <div className="scb-steps">
            <div className="scb-step">1 — Connect wallet</div>
            <div className="scb-step">2 — Choose a match market</div>
            <div className="scb-step">3 — Predict & earn</div>
          </div>
        </section>

        <section className="scb-section scb-section--tight">
          <header className="scb-section__header scb-section__header--center">
            <h2>Trust & transparency</h2>
            <p>Built so the community can verify what’s happening.</p>
          </header>

          <div className="scb-grid">
            <div className="scb-feature-card">
              <h3>🔐 Non-custodial</h3>
              <p>You interact with the contract from your wallet.</p>
            </div>
            <div className="scb-feature-card">
              <h3>🧾 Public pools</h3>
              <p>See total value locked and pool distribution anytime.</p>
            </div>
            <div className="scb-feature-card">
              <h3>🧠 Oracle results</h3>
              <p>Results get proposed and finalized transparently.</p>
            </div>
          </div>
        </section>

        <section id="faq" className="scb-section scb-section--tight">
          <header className="scb-section__header scb-section__header--center">
            <h2>FAQ</h2>
            <p>Quick answers about soccer prediction markets.</p>
          </header>

          <div className="scb-faq">
            <details className="scb-faq__item">
              <summary>Is this a sportsbook?</summary>
              <p>
                It behaves like a <b>prediction market</b>: odds emerge from community pools instead of fixed lines from
                a house.
              </p>
            </details>

            <details className="scb-faq__item">
              <summary>How are payouts calculated?</summary>
              <p>
                Payout multipliers are derived from pool ratios (total pool / selected pool). Bigger pool = lower
                multiplier.
              </p>
            </details>

            <details className="scb-faq__item">
              <summary>When does betting close?</summary>
              <p>Markets close at kick-off time. After that, predictions are disabled.</p>
            </details>
          </div>
        </section>

        {/* ================= CTA FINAL ================= */}
        <section className="scb-section scb-section--cta">
          <div className="scb-cta">
            <h2>Ready for kickoff?</h2>
            <p>Enter the app and start predicting soccer outcomes with the community.</p>
            <button className="scb-btn scb-btn--primary scb-btn--lg" onClick={() => navigate('/dashboard')}>
              Enter SmartCupLeague
            </button>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="scb-footer">© {new Date().getFullYear()} SmartCupLeague — Powered by fans.</footer>
    </div>
  );
};

export default Landing;
