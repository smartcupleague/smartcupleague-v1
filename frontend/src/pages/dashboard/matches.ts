// src/data/matches.ts

export type MatchStatus = "LIVE" | "SCHEDULED" | "SETTLED";
export type MatchResultSide = "HOME" | "DRAW" | "AWAY";

export interface MatchPools {
  home: number;
  draw: number;
  away: number;
}

export interface MatchOdds {
  home: number;
  draw: number;
  away: number;
}

export interface UserBet {
  side: MatchResultSide;
  amount: number;
  isWinner?: boolean;
  payoutAmount?: number;
}

export interface Match {
  id: string;
  cup: string;
  cupColor: "green" | "blue" | "purple";
  phase: string;
  homeTeam: string;
  awayTeam: string;
  kickoffLabel: string;     // e.g. "21:00" or "Finished"
  kickoffSubLabel: string;  // e.g. "Today", "Tomorrow", "2 - 1"
  status: MatchStatus;
  pools: MatchPools;
  odds: MatchOdds;
  userBet?: UserBet;
  resultSide?: MatchResultSide;
  resultScore?: string;
}

export const matches: Match[] = [
  {
    id: "1",
    cup: "Champions League",
    cupColor: "green",
    phase: "Semi-final",
    homeTeam: "Real Madrid",
    awayTeam: "Manchester City",
    kickoffLabel: "21:00",
    kickoffSubLabel: "Today",
    status: "LIVE",
    pools: { home: 4.12, draw: 2.31, away: 3.05 },
    odds: { home: 1.9, draw: 3.2, away: 2.45 }
  },
  {
    id: "2",
    cup: "Copa Libertadores",
    cupColor: "blue",
    phase: "Quarter-finals",
    homeTeam: "Boca Juniors",
    awayTeam: "Flamengo",
    kickoffLabel: "19:30",
    kickoffSubLabel: "Tomorrow",
    status: "SCHEDULED",
    pools: { home: 1.82, draw: 0.73, away: 2.11 },
    odds: { home: 2.15, draw: 3.05, away: 2.8 },
    userBet: {
      side: "HOME",
      amount: 0.02
    }
  },
  {
    id: "3",
    cup: "World Cup",
    cupColor: "purple",
    phase: "Group stage",
    homeTeam: "Argentina",
    awayTeam: "France",
    kickoffLabel: "Finished",
    kickoffSubLabel: "2 - 1",
    status: "SETTLED",
    pools: { home: 5.77, draw: 1.03, away: 4.22 },
    odds: { home: 2.1, draw: 3.3, away: 2.7 },
    userBet: {
      side: "HOME",
      amount: 0.04,
      isWinner: true,
      payoutAmount: 0.08
    },
    resultSide: "HOME",
    resultScore: "2 - 1"
  }
];
