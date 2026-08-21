import type { EventType, TeamRaw } from '../types';
import { formatSecondsAsClock, parseTimeToSeconds } from './time';

type TableColumnKey =
  | 'redTeam1Name'
  | 'redTeam2Name'
  | 'blueTeam1Name'
  | 'blueTeam2Name'
  | 'redWinLossScore'
  | 'redTotalScore'
  | 'redNetScore'
  | 'blueWinLossScore'
  | 'blueTotalScore'
  | 'blueNetScore';

const DEFAULT_TABLE_INDEX: Record<TableColumnKey, number> = {
  redTeam1Name: 3,
  redTeam2Name: 5,
  blueTeam1Name: 7,
  blueTeam2Name: 9,
  redWinLossScore: 10,
  redTotalScore: 11,
  redNetScore: 12,
  blueWinLossScore: 13,
  blueTotalScore: 14,
  blueNetScore: 15,
};

const HEADER_ALIASES: Record<TableColumnKey, string[]> = {
  redTeam1Name: ['红方战队1名称', '红方1名称', '红1名称', '红方队伍1名称'],
  redTeam2Name: ['红方战队2名称', '红方2名称', '红2名称', '红方队伍2名称'],
  blueTeam1Name: ['蓝方战队1名称', '蓝方1名称', '蓝1名称', '蓝方队伍1名称'],
  blueTeam2Name: ['蓝方战队2名称', '蓝方2名称', '蓝2名称', '蓝方队伍2名称'],
  redWinLossScore: ['红方胜负分', '红方胜负积分', '红方积分'],
  redTotalScore: ['红方总分', '红方得分'],
  redNetScore: ['红方净胜分', '红方净分'],
  blueWinLossScore: ['蓝方胜负分', '蓝方胜负积分', '蓝方积分'],
  blueTotalScore: ['蓝方总分', '蓝方得分'],
  blueNetScore: ['蓝方净胜分', '蓝方净分'],
};

const INSPIRE_TEAM_NAME_HEADERS = ['队伍名称', '战队名称', '队名', '参赛队伍', '队伍', '参赛队名'];

function normalizeCell(value: string): string {
  return value.replace(/\uFEFF/g, '').replace(/\r/g, '').trim();
}

function parseNumber(value: string): number {
  const normalized = normalizeCell(value).replace(/,/g, '');
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return 0;
  }

  return Number(match[0]) || 0;
}

function hasRecordedNumber(value: string): boolean {
  return /-?\d+(?:\.\d+)?/.test(normalizeCell(value).replace(/,/g, ''));
}

function splitRow(row: string): string[] {
  const trimmed = row.trim();
  if (trimmed.includes('|')) {
    return trimmed
      .replace(/^\||\|$/g, '')
      .split('|')
      .map(normalizeCell);
  }

  if (row.includes('\t')) {
    return row.split('\t').map(normalizeCell);
  }

  if (row.includes(',')) {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < row.length; index += 1) {
      const char = row[index];

      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }

      if (char === ',' && !inQuotes) {
        result.push(normalizeCell(current));
        current = '';
        continue;
      }

      current += char;
    }

    result.push(normalizeCell(current));
    return result;
  }

  return row
    .split(/\s{2,}/)
    .map(normalizeCell)
    .filter(Boolean);
}

function isTableHeaderOrSeparator(row: string[]): boolean {
  const normalizedCells = row.map(normalizeCell);
  if (normalizedCells.length > 0 && normalizedCells.every((cell) => /^:?-{3,}:?$/.test(cell))) {
    return true;
  }

  const joined = normalizedCells.join('|').toLowerCase().replace(/\s+/g, '');
  return (
    (joined.includes('红方战队1') && joined.includes('蓝方战队2'))
    || (joined.includes('red1team') && joined.includes('blue2team'))
  );
}

function resolveColumnIndexes(header: string[]): Record<TableColumnKey, number> {
  const resolved = { ...DEFAULT_TABLE_INDEX };

  (Object.keys(HEADER_ALIASES) as TableColumnKey[]).forEach((key) => {
    const headerIndex = header.findIndex((cell) => HEADER_ALIASES[key].includes(normalizeCell(cell)));
    if (headerIndex >= 0) {
      resolved[key] = headerIndex;
    }
  });

  return resolved;
}

function parseRows(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim());
}

function parseAllianceTableData(rows: string[]): TeamRaw[] {
  if (rows.length <= 1) {
    return [];
  }

  const header = splitRow(rows[0]);
  const indexes = resolveColumnIndexes(header);
  const minimumIndex = Math.max(...Object.values(indexes));
  const teamMap = new Map<string, TeamRaw>();

  const getOrCreateTeam = (teamName: string): TeamRaw => {
    if (!teamMap.has(teamName)) {
      teamMap.set(teamName, {
        team: teamName,
        wins: 0,
        losses: 0,
        points: 0,
        totalScore: 0,
        netScore: 0,
        matches: 0,
      });
    }

    return teamMap.get(teamName)!;
  };

  const updateTeam = (
    teamName: string,
    winLossScore: number,
    totalScore: number,
    netScore: number,
    opponentWinLossScore: number,
  ) => {
    const normalizedName = normalizeCell(teamName);
    if (!normalizedName) {
      return;
    }

    const team = getOrCreateTeam(normalizedName);
    team.points += winLossScore;
    team.totalScore += totalScore;
    team.netScore += netScore;
    team.matches += 1;

    if (winLossScore > opponentWinLossScore) {
      team.wins += 1;
    } else if (winLossScore < opponentWinLossScore) {
      team.losses += 1;
    }
  };

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const parts = splitRow(rows[rowIndex]);
    if (isTableHeaderOrSeparator(parts)) {
      continue;
    }
    if (parts.length <= minimumIndex) {
      continue;
    }

    const redTeam1Name = parts[indexes.redTeam1Name] ?? '';
    const redTeam2Name = parts[indexes.redTeam2Name] ?? '';
    const blueTeam1Name = parts[indexes.blueTeam1Name] ?? '';
    const blueTeam2Name = parts[indexes.blueTeam2Name] ?? '';

    if (![redTeam1Name, redTeam2Name, blueTeam1Name, blueTeam2Name].some((value) => normalizeCell(value))) {
      continue;
    }

    const resultCells = [
      parts[indexes.redWinLossScore] ?? '',
      parts[indexes.redTotalScore] ?? '',
      parts[indexes.blueWinLossScore] ?? '',
      parts[indexes.blueTotalScore] ?? '',
    ];
    // Scheduled but unplayed rows often contain team names while every result
    // cell is blank. Treating those blanks as zero creates a fake 0:0 draw.
    // A genuine scoreless draw remains valid because its recorded cells are
    // numeric (normally 1, 0, 1, 0).
    if (!resultCells.every(hasRecordedNumber)) {
      continue;
    }

    const redWinLossScore = parseNumber(parts[indexes.redWinLossScore] ?? '');
    const redTotalScore = parseNumber(parts[indexes.redTotalScore] ?? '');
    const redNetScore = parseNumber(parts[indexes.redNetScore] ?? '');
    const blueWinLossScore = parseNumber(parts[indexes.blueWinLossScore] ?? '');
    const blueTotalScore = parseNumber(parts[indexes.blueTotalScore] ?? '');
    const blueNetScore = parseNumber(parts[indexes.blueNetScore] ?? '');

    updateTeam(redTeam1Name, redWinLossScore, redTotalScore, redNetScore, blueWinLossScore);
    updateTeam(redTeam2Name, redWinLossScore, redTotalScore, redNetScore, blueWinLossScore);
    updateTeam(blueTeam1Name, blueWinLossScore, blueTotalScore, blueNetScore, redWinLossScore);
    updateTeam(blueTeam2Name, blueWinLossScore, blueTotalScore, blueNetScore, redWinLossScore);
  }

  return Array.from(teamMap.values());
}

function parseInspireTableData(rows: string[]): TeamRaw[] {
  if (rows.length <= 1) {
    return [];
  }
  const teams: TeamRaw[] = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const parts = splitRow(rows[rowIndex]);
    if (parts.length < 18) {
      continue;
    }

    const teamName = normalizeCell(parts[2] ?? '');
    if (!teamName || INSPIRE_TEAM_NAME_HEADERS.includes(teamName)) {
      continue;
    }

    const attempt1Score = parseNumber(parts[8] ?? '');
    const attempt1TimeRaw = normalizeCell(parts[9] ?? '');
    const attempt1TimeSeconds = parseTimeToSeconds(attempt1TimeRaw);
    const attempt2Score = parseNumber(parts[14] ?? '');
    const attempt2TimeRaw = normalizeCell(parts[15] ?? '');
    const attempt2TimeSeconds = parseTimeToSeconds(attempt2TimeRaw);
    const totalScore = parseNumber(parts[16] ?? '');
    const totalTimeRaw = normalizeCell(parts[17] ?? '');
    const totalTimeSeconds = parseTimeToSeconds(totalTimeRaw);

    const attempt1Valid = attempt1Score > 0 || Boolean(attempt1TimeRaw);
    const attempt2Valid = attempt2Score > 0 || Boolean(attempt2TimeRaw);
    const validAttempts = Number(attempt1Valid) + Number(attempt2Valid);

    teams.push({
      team: teamName,
      wins: 0,
      losses: 0,
      points: totalScore,
      totalScore,
      netScore: 0,
      matches: validAttempts,
      attempt1Score,
      attempt1TimeSeconds,
      attempt1TimeText: attempt1TimeRaw || formatSecondsAsClock(attempt1TimeSeconds),
      attempt2Score,
      attempt2TimeSeconds,
      attempt2TimeText: attempt2TimeRaw || formatSecondsAsClock(attempt2TimeSeconds),
      bestTimeSeconds: totalTimeSeconds,
      bestTimeText: totalTimeRaw || formatSecondsAsClock(totalTimeSeconds),
    });
  }

  return teams;
}

export function parseTableData(text: string, eventType: EventType): TeamRaw[] {
  const rows = parseRows(text);

  if (eventType === 'MakeX Inspire') {
    return parseInspireTableData(rows);
  }

  return parseAllianceTableData(rows);
}

/**
 * Extracts the roster from an Explorer schedule without treating unplayed
 * rows as matches. This keeps the ranking board useful before scoring starts.
 */
export function parseScheduledTeamData(text: string, eventType: EventType): TeamRaw[] {
  if (eventType === 'MakeX Inspire') {
    return parseTableData(text, eventType);
  }

  const rows = parseRows(text);
  if (rows.length <= 1) {
    return [];
  }

  const header = splitRow(rows[0]);
  const indexes = resolveColumnIndexes(header);
  const teamColumns = [
    { id: Math.max(indexes.redTeam1Name - 1, 0), name: indexes.redTeam1Name },
    { id: Math.max(indexes.redTeam2Name - 1, 0), name: indexes.redTeam2Name },
    { id: Math.max(indexes.blueTeam1Name - 1, 0), name: indexes.blueTeam1Name },
    { id: Math.max(indexes.blueTeam2Name - 1, 0), name: indexes.blueTeam2Name },
  ];
  const teams = new Map<string, TeamRaw>();

  rows.slice(1).forEach((row) => {
    const parts = splitRow(row);
    if (isTableHeaderOrSeparator(parts)) {
      return;
    }

    teamColumns.forEach(({ id, name }) => {
      const teamName = normalizeCell(parts[name] ?? '');
      const teamId = normalizeCell(parts[id] ?? '');
      const key = teamId || teamName;
      if (!key || !teamName || teams.has(key)) {
        return;
      }

      teams.set(key, {
        team: teamName,
        wins: 0,
        losses: 0,
        points: 0,
        totalScore: 0,
        netScore: 0,
        matches: 0,
      });
    });
  });

  return Array.from(teams.values());
}

export function countTeamsFromSourceText(text: string, eventType: EventType): number {
  const rows = parseRows(text);
  if (rows.length <= 1) {
    return 0;
  }

  if (eventType === 'MakeX Inspire') {
    return parseInspireTableData(rows).length;
  }

  const header = splitRow(rows[0]);
  const indexes = resolveColumnIndexes(header);
  const identifierIndexes = [
    { id: Math.max(indexes.redTeam1Name - 1, 0), name: indexes.redTeam1Name },
    { id: Math.max(indexes.redTeam2Name - 1, 0), name: indexes.redTeam2Name },
    { id: Math.max(indexes.blueTeam1Name - 1, 0), name: indexes.blueTeam1Name },
    { id: Math.max(indexes.blueTeam2Name - 1, 0), name: indexes.blueTeam2Name },
  ];
  const teamKeys = new Set<string>();

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const parts = splitRow(rows[rowIndex]);
    if (isTableHeaderOrSeparator(parts)) {
      continue;
    }

    identifierIndexes.forEach(({ id, name }) => {
      const teamId = normalizeCell(parts[id] ?? '');
      const teamName = normalizeCell(parts[name] ?? '');
      const teamKey = teamId || teamName;

      if (teamKey) {
        teamKeys.add(teamKey);
      }
    });
  }

  return teamKeys.size;
}

export function getHighestSingleMatchScoreFromSourceText(text: string, eventType: EventType): number {
  const rows = parseRows(text);
  if (rows.length <= 1) {
    return 0;
  }

  if (eventType === 'MakeX Inspire') {
    return 0;
  }

  const header = splitRow(rows[0]);
  const indexes = resolveColumnIndexes(header);
  const minimumIndex = Math.max(indexes.redTotalScore, indexes.blueTotalScore);
  let highestScore = 0;

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const parts = splitRow(rows[rowIndex]);
    if (isTableHeaderOrSeparator(parts)) {
      continue;
    }
    if (parts.length <= minimumIndex) {
      continue;
    }

    const redScore = parseNumber(parts[indexes.redTotalScore] ?? '');
    const blueScore = parseNumber(parts[indexes.blueTotalScore] ?? '');
    highestScore = Math.max(highestScore, redScore, blueScore);
  }

  return highestScore;
}

export function parseCSVData(csvText: string): TeamRaw[] {
  const lines = csvText.split('\n');
  const teams: TeamRaw[] = [];

  lines.forEach((line) => {
    const parts = line.split(',').map((part) => part.trim());
    if (parts.length >= 4) {
      teams.push({
        team: parts[0],
        wins: parseInt(parts[1], 10) || 0,
        losses: parseInt(parts[2], 10) || 0,
        points: parseInt(parts[3], 10) || 0,
        totalScore: 0,
        netScore: 0,
        matches: 0,
      });
    }
  });

  return teams;
}

export function parseCSVFileContent(content: string): TeamRaw[] {
  const lines = content.split('\n').filter((line) => line.trim());
  const teams: TeamRaw[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    const parts = lines[index].split(',').map((part) => part.trim());
    if (parts.length >= 4) {
      teams.push({
        team: parts[0],
        wins: parseInt(parts[1], 10) || 0,
        losses: parseInt(parts[2], 10) || 0,
        points: parseInt(parts[3], 10) || 0,
        totalScore: 0,
        netScore: 0,
        matches: 0,
      });
    }
  }

  return teams;
}
