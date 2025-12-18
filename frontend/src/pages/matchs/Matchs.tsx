import './styles.css';
import { MatchCard } from './MatchCard';
import { InfoCard } from './InfoCard';
import { Layout } from './Layout';
import { Wallet } from '@gear-js/wallet-connect';
import { useParams } from 'react-router-dom';

const matchCardPropsById = {
  '1': {
    id: '1',
    flag1: '/flags/qatar.jpg',
    flag2: '/flags/ecuador.jpg',
  },
  '2': {
    id: '2',
    flag1: '/flags/england.jpg',
    flag2: '/flags/iran.jpg',
  },
  '3': {
    id: '3',
    flag1: '/flags/argentina.jpg',
    flag2: '/flags/saudi_arabia.jpg',
  },
} as const;

function Match() {
  const { id } = useParams<{ id: string }>();

  const matchProps = id && matchCardPropsById[id as keyof typeof matchCardPropsById];

  return (
    <Layout>
      <div className="left-column">
        <InfoCard title="Until now you win" highlight="+US$50.00" />

        <InfoCard title="Grand Prize">
          <ul className="info-list">
            <li>#1 US$1000.00</li>
            <li>#2 US$500.00</li>
            <li>#3 US$200.00</li>
            <li>#all</li>
            <li>US$10.00 / participant</li>
          </ul>
        </InfoCard>

        <InfoCard title="Matches Participation">
          <p>50% (32/64) games</p>
          <p>
            <b>CONGRATS</b>
          </p>
          <p>You are eligible to win the Grand Prize</p>
        </InfoCard>
      </div>

      <div className="main-column">
        <header className="top-summary">
          <div className="top-summary__wallet">
            <Wallet />
          </div>
          <div className="top-summary__right">
            <div>Grand Prize Pos: #10</div>
            <div>Points: 55</div>
          </div>
        </header>

        {matchProps ? (
          <MatchCard {...matchProps} />
        ) : (
          <div className="info-card">
            <h3 className="info-card__title">Match not found</h3>
            <div className="info-card__body">The selected match does not exist.</div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default Match;
