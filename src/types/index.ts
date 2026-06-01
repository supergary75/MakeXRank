export interface TeamRaw {
  team: string;
  wins: number;
  draws?: number;
  losses: number;
  points: number;
  totalScore: number;
  netScore: number;
  matches: number;
  attempt1Score?: number;
  attempt1TimeSeconds?: number | null;
  attempt1TimeText?: string;
  attempt2Score?: number;
  attempt2TimeSeconds?: number | null;
  attempt2TimeText?: string;
  bestTimeSeconds?: number | null;
  bestTimeText?: string;
  epa?: string;
}

export interface TeamRanked extends TeamRaw {
  draws: number;
  totalMatches: number;
  totalWinLossScore: number;
  epa: string;
  winRate: string;
}

export interface Alliance {
  number: number;
  name: string;
  team1: string;
  team2: string;
  team1EPA: string;
  team2EPA: string;
  totalEPA: string;
}

export interface PlayoffMatch {
  alliance1: Alliance;
  alliance2: Alliance;
  winner: Alliance | null;
  epaDiff: string;
}

export interface CompetitionRecord {
  id: string;
  eventType: EventType;
  name: string;
  createdAt: string;
  updatedAt: string;
  lastUpdate: string;
  sourceText: string;
  teamsData: TeamRaw[];
}

export type SortField =
  | 'wins'
  | 'draws'
  | 'losses'
  | 'totalMatches'
  | 'winRate'
  | 'totalWinLossScore'
  | 'netScore'
  | 'totalScore'
  | 'attempt1Score'
  | 'attempt1TimeSeconds'
  | 'attempt2Score'
  | 'attempt2TimeSeconds'
  | 'bestTimeSeconds'
  | 'epa';

export type SortOrder = 'asc' | 'desc';

export type NotificationType = 'success' | 'error' | 'info';

export type EventType = 'MakeX Inspire' | 'MakeX Explorer' | 'MakeX Challenge';
export type TabName = 'ranking' | 'playoff';
export type ViewMode = 'event-types' | 'lobby' | 'competition';
