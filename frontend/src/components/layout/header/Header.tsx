import { Wallet } from '@gear-js/wallet-connect';
import styles from './Header.module.scss';

function Header() {
  return (
    <header className={styles.header}>
      <div className="logo-small">
        <img className="logo-small" src="./Logos.png" alt="Soccer fans celebrating" />
      </div>
    </header>
  );
}

export { Header };
