import React from 'react';
import styled, { keyframes, css } from 'styled-components';
import { useAccount } from '@gear-js/react-hooks';
import { Wallet as GearWallet } from '@gear-js/wallet-connect';
import { FaWallet } from 'react-icons/fa';
import { HiSparkles } from 'react-icons/hi2';

const shimmer = keyframes`
  0%   { transform: translateX(-140%) skewX(-18deg); opacity: 0; }
  18%  { opacity: .55; }
  55%  { opacity: .25; }
  100% { transform: translateX(140%) skewX(-18deg); opacity: 0; }
`;

const glow = keyframes`
  0%, 100% { filter: drop-shadow(0 0 0 rgba(255,0,110,0)); }
  50%      { filter: drop-shadow(0 0 14px rgba(255,0,110,.22)); }
`;

const InlineWrap = styled.div<{ $connected?: boolean }>`
  width: 100%;
  min-width: 0;
  flex: 1 1 auto;

  display: grid;
  gap: 8px;

  &,
  & * {
    box-sizing: border-box;
  }

  /* GearWallet wrappers stretch */
  > div,
  > div > div {
    width: 100%;
  }

  div {
    background: transparent;
  }

  button {
    width: 100% !important;
    min-width: 0 !important;

    height: 42px;
    border-radius: 14px;

    border: 1px solid ${({ $connected }) => ($connected ? 'rgba(255, 120, 190, .40)' : 'rgba(255,255,255,.14)')};
    background:
      radial-gradient(520px 180px at 25% 20%, rgba(255, 0, 110, 0.22), transparent 62%),
      linear-gradient(135deg, rgba(24, 7, 16, 0.70) 0%, rgba(6, 2, 5, 0.35) 65%);

    color: rgba(255, 255, 255, 0.92);
    font-weight: 950;
    font-size: 13px;
    letter-spacing: 0.2px;

    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;

    padding: 0 14px;
    box-shadow:
      0 10px 22px rgba(0, 0, 0, 0.22),
      0 0 0 1px rgba(255, 255, 255, 0.03) inset;

    cursor: pointer;
    transition:
      transform 0.16s ease,
      filter 0.16s ease,
      border-color 0.16s ease,
      box-shadow 0.16s ease;
  }

  button:hover {
    transform: translateY(-1px);
    filter: brightness(1.03);
    border-color: ${({ $connected }) => ($connected ? 'rgba(255, 140, 205, .62)' : 'rgba(255,255,255,.20)')};
  }

  button:active {
    transform: translateY(0);
    filter: brightness(0.98);
  }

  button svg {
    width: 20px;
    height: 20px;
    opacity: 0.95;
    flex: 0 0 auto;
  }

  button > * {
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }
`;

const MiniHead = styled.div<{ $connected?: boolean }>`
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  padding: 8px 10px;
  border-radius: 14px;

  border: 1px solid rgba(255, 255, 255, 0.10);
  background:
    radial-gradient(520px 160px at 20% 10%, rgba(255, 0, 110, 0.18), transparent 60%),
    rgba(0, 0, 0, 0.10);

  position: relative;
  overflow: hidden;

  &::after {
    content: '';
    position: absolute;
    top: -70%;
    left: -45%;
    width: 75%;
    height: 260%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.20), transparent);
    transform: translateX(-140%) skewX(-18deg);
    opacity: 0;
    pointer-events: none;
  }

  &:hover::after {
    animation: ${shimmer} 2.1s ease-in-out infinite;
  }

  .left {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .ico {
    width: 28px;
    height: 28px;
    border-radius: 11px;
    display: grid;
    place-items: center;

    border: 1px solid ${({ $connected }) => ($connected ? 'rgba(255, 120, 190, .34)' : 'rgba(255,255,255,.12)')};
    background:
      radial-gradient(circle at 30% 20%, rgba(255, 0, 110, 0.22), transparent 62%),
      rgba(0,0,0,.10);

    animation: ${glow} 2.6s ease-in-out infinite;
  }

  .label {
    font-weight: 950;
    font-size: 12px;
    letter-spacing: 0.6px;
    color: rgba(255, 255, 255, 0.92);
    text-transform: uppercase;
    white-space: nowrap;
  }

  .status {
    display: inline-flex;
    align-items: center;
    gap: 8px;

    padding: 6px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 900;

    border: 1px solid ${({ $connected }) => ($connected ? 'rgba(255, 120, 190, .34)' : 'rgba(255,255,255,.12)')};
    background: ${({ $connected }) => ($connected ? 'rgba(255, 0, 110, 0.12)' : 'rgba(255,255,255,0.06)')};
    color: rgba(255, 255, 255, 0.88);
    white-space: nowrap;
  }
`;

type StyledWalletProps = {
  fullWidth?: boolean;
  showHeader?: boolean; 
};

export function StyledWallet({ showHeader = false }: StyledWalletProps) {
  const { account } = useAccount();
  const connected = !!account;

  return (
    <InlineWrap $connected={connected}>
      {showHeader ? (
        <MiniHead $connected={connected}>
          <div className="left">
            <div className="ico" aria-hidden="true">
              <FaWallet />
            </div>
            <div className="label">Wallet</div>
          </div>

          <div className="status">
            <HiSparkles />
            {connected ? 'Connected' : 'Not connected'}
          </div>
        </MiniHead>
      ) : null}

      <GearWallet theme="vara" displayBalance={false} />
    </InlineWrap>
  );
}