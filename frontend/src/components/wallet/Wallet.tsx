import React from 'react';
import styled, { keyframes } from 'styled-components';
import { useAccount } from '@gear-js/react-hooks';
import { Wallet as GearWallet } from '@gear-js/wallet-connect';
import { FaWallet } from 'react-icons/fa';
import { HiSparkles } from 'react-icons/hi2';

const shimmer = keyframes`
  0%   { transform: translateX(-140%) skewX(-18deg); opacity: 0; }
  18%  { opacity: .65; }
  55%  { opacity: .28; }
  100% { transform: translateX(140%) skewX(-18deg); opacity: 0; }
`;

const breathe = keyframes`
  0%, 100% { transform: translateY(0); filter: brightness(1); }
  50%      { transform: translateY(-1px); filter: brightness(1.05); }
`;

const glow = keyframes`
  0%, 100% { box-shadow: 0 0 0 rgba(255, 46, 118, 0), 0 0 0 rgba(0,0,0,0); }
  50%      { box-shadow: 0 0 26px rgba(255, 46, 118, .14), 0 18px 60px rgba(0,0,0,.25); }
`;

const pulseRing = keyframes`
  0%   { transform: scale(.92); opacity: .0; }
  45%  { opacity: .55; }
  100% { transform: scale(1.18); opacity: 0; }
`;

const InlineWrap = styled.div<{ $connected?: boolean }>`
  width: 100%;
  min-width: 0;
  flex: 1 1 auto;

  display: grid;
  gap: 10px;

  &,
  & * {
    box-sizing: border-box;
  }

  /* GearWallet wrappers stretch */
  > div,
  > div > div {
    width: 100%;
  }

  /* kill unknown wrapper backgrounds */
  div {
    background: transparent;
  }

  button {
    width: 100% !important;
    min-width: 0 !important;
    height: 44px;

    border-radius: 16px;
    position: relative;
    overflow: hidden;

    border: 1px solid ${({ $connected }) => ($connected ? 'rgba(255, 46, 118, .42)' : 'rgba(255,255,255,.14)')};

    background:
      radial-gradient(800px 200px at 18% 8%, rgba(255, 46, 118, 0.24), transparent 60%),
      radial-gradient(640px 180px at 85% 30%, rgba(168, 5, 69, 0.16), transparent 65%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(0, 0, 0, 0.16));

    backdrop-filter: blur(12px);
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
      0 14px 40px rgba(0, 0, 0, 0.34),
      0 0 0 1px rgba(255, 255, 255, 0.035) inset;

    cursor: pointer;
    transition:
      transform 0.16s ease,
      filter 0.16s ease,
      border-color 0.16s ease,
      box-shadow 0.16s ease;
  }

  /* glossy sheen */
  button::after {
    content: '';
    position: absolute;
    top: -70%;
    left: -40%;
    width: 70%;
    height: 260%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.22), transparent);
    transform: translateX(-140%) skewX(-18deg);
    opacity: 0;
    pointer-events: none;
  }

  button:hover::after {
    animation: ${shimmer} 2.1s ease-in-out infinite;
  }

  button:hover {
    transform: translateY(-1px);
    filter: brightness(1.03);
    border-color: ${({ $connected }) => ($connected ? 'rgba(255, 46, 118, .62)' : 'rgba(255,255,255,.20)')};
    box-shadow:
      0 18px 56px rgba(0, 0, 0, 0.38),
      0 0 0 1px rgba(255, 255, 255, 0.05) inset;
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
    filter: drop-shadow(0 0 14px rgba(255, 46, 118, 0.14));
  }

  /* Gear Wallet internal layout */
  button > * {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  /* make long addresses not break */
  button span,
  button p,
  button div {
    min-width: 0;
  }
`;

const MiniHead = styled.div<{ $connected?: boolean }>`
  width: 100%;
  min-width: 0;

  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  padding: 10px 12px;
  border-radius: 16px;

  border: 1px solid rgba(255, 255, 255, 0.10);
  background:
    radial-gradient(720px 220px at 18% 10%, rgba(255, 46, 118, 0.16), transparent 60%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(0, 0, 0, 0.14));

  backdrop-filter: blur(12px);
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.30);
  position: relative;
  overflow: hidden;

  &::after {
    content: '';
    position: absolute;
    top: -70%;
    left: -45%;
    width: 75%;
    height: 260%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.18), transparent);
    transform: translateX(-140%) skewX(-18deg);
    opacity: 0;
    pointer-events: none;
  }

  &:hover::after {
    animation: ${shimmer} 2.35s ease-in-out infinite;
  }

  .left {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .ico {
    width: 30px;
    height: 30px;
    border-radius: 12px;
    display: grid;
    place-items: center;
    position: relative;

    border: 1px solid ${({ $connected }) => ($connected ? 'rgba(255, 46, 118, .34)' : 'rgba(255,255,255,.12)')};
    background:
      radial-gradient(circle at 30% 20%, rgba(255, 46, 118, 0.22), transparent 62%),
      rgba(0, 0, 0, 0.10);

    animation: ${glow} 2.8s ease-in-out infinite;
  }

  /* pulse ring when connected */
  .ico::before {
    content: '';
    position: absolute;
    inset: -8px;
    border-radius: 999px;
    border: 1px solid rgba(255, 46, 118, 0.22);
    background: radial-gradient(circle, rgba(255, 46, 118, 0.14), transparent 60%);
    opacity: ${({ $connected }) => ($connected ? 1 : 0)};
    animation: ${({ $connected }) => ($connected ? pulseRing : 'none')} 2.4s ease-in-out infinite;
    pointer-events: none;
  }

  .label {
    font-weight: 950;
    font-size: 12px;
    letter-spacing: 0.12em;
    color: rgba(255, 255, 255, 0.92);
    text-transform: uppercase;
    white-space: nowrap;
  }

  .status {
    display: inline-flex;
    align-items: center;
    gap: 8px;

    padding: 7px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 950;
    white-space: nowrap;

    border: 1px solid ${({ $connected }) => ($connected ? 'rgba(65, 214, 114, .34)' : 'rgba(255,255,255,.14)')};
    background: ${({ $connected }) => ($connected ? 'rgba(65, 214, 114, 0.12)' : 'rgba(0,0,0,0.10)')};
    color: ${({ $connected }) => ($connected ? 'rgba(210, 255, 225, 0.95)' : 'rgba(255,255,255,0.86)')};

    box-shadow: 0 10px 26px rgba(0, 0, 0, 0.18);
    animation: ${({ $connected }) => ($connected ? breathe : 'none')} 3.2s ease-in-out infinite;
  }

  .status svg {
    width: 18px;
    height: 18px;
    opacity: 0.95;
    filter: ${({ $connected }) =>
      $connected ? 'drop-shadow(0 0 14px rgba(65,214,114,.16))' : 'drop-shadow(0 0 14px rgba(255,46,118,.10))'};
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