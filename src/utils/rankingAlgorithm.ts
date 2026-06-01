import type { EventType, TeamRaw, TeamRanked, SortField, SortOrder } from '../types';

export function calculateRanking(teams: TeamRaw[], eventType: EventType): TeamRanked[] {
  return teams.map((team) => {
    if (eventType === 'MakeX Inspire') {
      return {
        ...team,
        draws: 0,
        totalMatches: team.matches,
        totalWinLossScore: team.totalScore,
        epa: team.bestTimeText ?? '--',
        winRate: '0.0',
      };
    }

    const draws = Math.max(team.matches - team.wins - team.losses, 0);
    const epaValue = team.matches > 0 ? (team.totalScore / team.matches / 2).toFixed(2) : '0.00';
    return {
      ...team,
      draws,
      totalMatches: team.matches,
      totalWinLossScore: team.points,
      epa: epaValue,
      winRate:
        team.matches > 0
          ? ((team.wins / team.matches) * 100).toFixed(1)
          : '0.0',
    };
  });
}

export function sortTeams(
  teams: TeamRanked[],
  sortField: SortField,
  sortOrder: SortOrder,
  eventType: EventType,
): TeamRanked[] {
  if (eventType === 'MakeX Inspire') {
    return [...teams].sort((a, b) => compareInspireTeams(a, b, sortField, sortOrder));
  }

  return [...teams].sort((a, b) => {
    let aValue: number = getFieldValue(a, sortField);
    let bValue: number = getFieldValue(b, sortField);

    if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;

    // Tiebreakers: winLossScore -> netScore -> wins -> totalScore
    if (sortField !== 'totalWinLossScore' && b.totalWinLossScore !== a.totalWinLossScore) {
      return b.totalWinLossScore - a.totalWinLossScore;
    }
    if (sortField !== 'netScore' && b.netScore !== a.netScore) {
      return b.netScore - a.netScore;
    }
    if (sortField !== 'wins' && b.wins !== a.wins) {
      return b.wins - a.wins;
    }
    return b.totalScore - a.totalScore;
  });
}

function getFieldValue(team: TeamRanked, field: SortField): number {
  const val = team[field];
  if (val == null) {
    if (field.includes('TimeSeconds')) {
      return Number.POSITIVE_INFINITY;
    }

    return 0;
  }
  if (typeof val === 'string') return parseFloat(val) || 0;
  return val as number;
}

function compareNumeric(left: number, right: number, sortOrder: SortOrder): number {
  if (left < right) return sortOrder === 'asc' ? -1 : 1;
  if (left > right) return sortOrder === 'asc' ? 1 : -1;
  return 0;
}

function compareInspireTeams(
  a: TeamRanked,
  b: TeamRanked,
  sortField: SortField,
  sortOrder: SortOrder,
): number {
  const aValue = getFieldValue(a, sortField);
  const bValue = getFieldValue(b, sortField);
  const fieldComparison = compareNumeric(aValue, bValue, sortOrder);
  if (fieldComparison !== 0) {
    return fieldComparison;
  }

  const aRegularScore = a.attempt1Score ?? 0;
  const bRegularScore = b.attempt1Score ?? 0;
  if (bRegularScore !== aRegularScore) {
    return bRegularScore - aRegularScore;
  }

  const aRegularTime = a.attempt1TimeSeconds ?? Number.POSITIVE_INFINITY;
  const bRegularTime = b.attempt1TimeSeconds ?? Number.POSITIVE_INFINITY;
  if (aRegularTime !== bRegularTime) {
    return aRegularTime - bRegularTime;
  }

  if (b.totalScore !== a.totalScore) {
    return b.totalScore - a.totalScore;
  }

  const aBestTime = a.bestTimeSeconds ?? Number.POSITIVE_INFINITY;
  const bBestTime = b.bestTimeSeconds ?? Number.POSITIVE_INFINITY;
  if (aBestTime !== bBestTime) {
    return aBestTime - bBestTime;
  }

  return a.team.localeCompare(b.team, 'zh-CN');
}
