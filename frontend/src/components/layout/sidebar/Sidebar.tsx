import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import './scb-dashboard.css';

type SectionKey = 'home' | 'my-predictions' | 'leaderboards' | 'all-predictions' | 'all-cups' | 'dao' | 'settings';

interface NavItem {
  key: SectionKey;
  label: string;
  path: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    key: 'home',
    label: 'Home',
    path: '/home',
    icon: <span className="scb-icon">🏠</span>,
  },
  {
    key: 'my-predictions',
    label: 'My Predictions',
    path: '/my-predictions',
    icon: <span className="scb-icon">🎯</span>,
  },
  {
    key: 'leaderboards',
    label: 'Leaderboards',
    path: '/leaderboards',
    icon: <span className="scb-icon">🏅</span>,
  },
  {
    key: 'all-predictions',
    label: 'All Predictions',
    path: '/all-predictions',
    icon: <span className="scb-icon">📊</span>,
  },

  {
    key: 'dao',
    label: 'DAO',
    path: '/dao',
    icon: <span className="scb-icon">⚙️</span>,
  },
];

export const Sidebar: React.FC = () => {
  const { pathname } = useLocation();

  return (
    <aside className="scb-sidebar">
      <div className="logo-small">
        <img className="logo-small" src="./Logos.png" alt="Soccer fans celebrating" />
      </div>
      <div className="scb-sidebar__brand" />

      <nav className="scb-sidebar__nav">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.path);

          return (
            <NavLink
              key={item.key}
              to={item.path}
              className={'scb-sidebar__item ' + (isActive ? 'scb-sidebar__item--active' : '')}>
              {item.icon}
              <span className="scb-sidebar__label">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="scb-sidebar__bottom">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            'scb-sidebar__item scb-sidebar__item--ghost ' + (isActive ? 'scb-sidebar__item--active' : '')
          }>
          <span className="scb-icon">⚙️</span>
          <span className="scb-sidebar__label">Settings</span>
        </NavLink>

        <button className="scb-sidebar__item scb-sidebar__item--ghost">
          <span className="scb-icon">🌙</span>
          <span className="scb-sidebar__label">Dark mode</span>
        </button>
      </div>
    </aside>
  );
};
