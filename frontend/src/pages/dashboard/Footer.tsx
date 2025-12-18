import React from "react";
import "./scb-dashboard.css"; 

export const Footer: React.FC = () => {
  return (
    <footer className="scb-footer">
      <div className="scb-footer__left">
        <span className="scb-footer__brand">SmartCupLeague</span>
        <span className="scb-footer__copy">© 2025 All rights reserved</span>
      </div>

      <div className="scb-footer__links">
        <a href="#">Terms</a>
        <a href="#">Privacy</a>
        <a href="#">Smart Contracts</a>
        <a href="#">Security</a>
      </div>
    </footer>
  );
};
