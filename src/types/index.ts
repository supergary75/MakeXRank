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
  team1Code?: string;
  team2Code?: string;
  team1Seed?: number;
  team2Seed?: number;
  team1EPA: string;
  team2EPA: string;
  totalEPA: string;
  totalNetScore: number;
  totalWinLossScore: number;
  totalScore: number;
  powerScore: number;
  outlook: string;
}

export interface PlayoffMatch {
  roundName: string;
  alliance1: Alliance;
  alliance2: Alliance;
  winner: Alliance;
  loser: Alliance;
  alliance1WinRate: number;
  alliance2WinRate: number;
  strengthDiff: number;
  reason: string;
}

export interface PlayoffPrediction {
  rounds: Array<{
    name: string;
    matches: PlayoffMatch[];
  }>;
  semifinals: PlayoffMatch[];
  final: PlayoffMatch | null;
  bronze: PlayoffMatch | null;
  champion: Alliance | null;
  runnerUp: Alliance | null;
  thirdPlace: Alliance | null;
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

export interface CompetitionTopTeam {
  attempt1Score?: number;
  attempt1TimeSeconds?: number | null;
  attempt1TimeText?: string;
  attempt2Score?: number;
  attempt2TimeSeconds?: number | null;
  attempt2TimeText?: string;
  bestTimeSeconds?: number | null;
  bestTimeText?: string;
  competitionId: string;
  competitionName: string;
  draws: number;
  epa: string;
  eventType: EventType;
  losses: number;
  netScore: number;
  rankInCompetition: number;
  team: string;
  totalScore: number;
  totalWinLossScore: number;
  wins: number;
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
export type StorageMode = 'local' | 'supabase';
export type UserRole = 'admin' | 'editor' | 'viewer';
export type EventType = 'MakeX Inspire' | 'MakeX Explorer' | 'MakeX Challenge';

export interface AuthUserProfile {
  authUserId: string;
  username: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  allowedEventTypes: EventType[] | null;
  allowedCompetitionIds: string[] | null;
}
export type TabName = 'ranking' | 'playoff' | 'focusSchedule';
export type ViewMode =
  | 'home'
  | 'login'
  | 'my-tasks'
  | 'event-types'
  | 'logistics'
  | 'logistics-roster'
  | 'logistics-event'
  | 'logistics-event-roster'
  | 'logistics-event-rooms'
  | 'training-plan'
  | 'training-event'
  | 'simulation-system'
  | 'score-calculator'
  | 'practice-analysis'
  | 'practice-explorer'
  | 'lobby'
  | 'competition';
