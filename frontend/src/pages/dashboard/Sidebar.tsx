
import React from 'react';
import type { SectionKey } from './Dashboard';
import "./scb-dashboard.css"; 

interface SidebarProps {
  activeSection: SectionKey;
  onChangeSection: (section: SectionKey) => void;
}

interface NavItem {
  key: SectionKey;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { key: 'home', label: 'Home', icon: <span className="scb-icon">🏠</span> },
  { key: 'my-bets', label: 'My Predictions', icon: <span className="scb-icon">🎯</span> },
  { key: 'all-bets', label: 'All Predictions', icon: <span className="scb-icon">📊</span> },
  { key: 'all-cups', label: 'All Cups', icon: <span className="scb-icon">🏆</span> },
  { key: 'dao', label: 'DAO', icon: <span className="scb-icon">⚙️</span> },
];

export const Sidebar: React.FC<SidebarProps> = ({ activeSection, onChangeSection }) => {
  return (
    <aside className="scb-sidebar">
      <div className="scb-sidebar__brand">
        <div className="scb-logo">
          <div className="logo-small">
              <img className="logo-small" src="./Logos.png" alt="Soccer fans celebrating" />
            </div>
        </div>
        <span className="scb-sidebar__version">v1.0</span>
      </div>

      <nav className="scb-sidebar__nav">
        {navItems.map((item) => (
          <button
            key={item.key}
            className={
              'scb-sidebar__item ' +
              (item.key === activeSection ? 'scb-sidebar__item--active' : '')
            }
            onClick={() => onChangeSection(item.key)}
          >
            {item.icon}
            <span className="scb-sidebar__label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="scb-sidebar__bottom">
        <button
          className={
            'scb-sidebar__item scb-sidebar__item--ghost ' +
            (activeSection === 'settings' ? 'scb-sidebar__item--active' : '')
          }
          onClick={() => onChangeSection('settings')}
        >
          <span className="scb-icon">⚙️</span>
          <span className="scb-sidebar__label">Settings</span>
        </button>
        <button className="scb-sidebar__item scb-sidebar__item--ghost">
          <span className="scb-icon">🌙</span>
          <span className="scb-sidebar__label">Dark mode</span>
        </button>
      </div>
    </aside>
  );
};
