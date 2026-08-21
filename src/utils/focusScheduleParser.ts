export interface ScheduleAllianceTeam {
  number: string;
  name: string;
  seatLabel?: string;
}

export interface FocusScheduleMatch {
  id: string;
  field: string;
  matchNo: string;
  alliance: 'red' | 'blue';
  teamNumber: string;
  teamName: string;
  partnerNumber: string;
  partnerName: string;
  opponents: Array<{
    number: string;
    name: string;
  }>;
  redAlliance: ScheduleAllianceTeam[];
  blueAlliance: ScheduleAllianceTeam[];
}

export interface FocusTeamSchedule {
  query: string;
  teamNumber: string;
  teamName: string;
  matches: FocusScheduleMatch[];
}

interface ColumnIndexes {
  field: number;
  matchNo: number;
  red1No: number;
  red1Name: number;
  red2No: number;
  red2Name: number;
  blue1No: number;
  blue1Name: number;
  blue2No: number;
  blue2Name: number;
}

interface TeamSlot {
  alliance: 'red' | 'blue';
  slot: 1 | 2;
  number: string;
  name: string;
}

interface ParsedMatchRow {
  field: string;
  matchNo: string;
  teams: TeamSlot[];
}

const FALLBACK_INDEXES: ColumnIndexes = {
  field: 0,
  matchNo: 1,
  red1No: 2,
  red1Name: 3,
  red2No: 4,
  red2Name: 5,
  blue1No: 6,
  blue1Name: 7,
  blue2No: 8,
  blue2Name: 9,
};

function cleanCell(value: string): string {
  return value.replace(/^\uFEFF/, '').replace(/^"|"$/g, '').trim();
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(cleanCell(current));
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(cleanCell(current));
  return cells;
}

function splitLine(line: string): string[] {
  const trimmed = line.trim();
  if (trimmed.includes('|')) {
    return trimmed
      .replace(/^\||\|$/g, '')
      .split('|')
      .map(cleanCell);
  }

  if (line.includes('\t')) {
    return line.split('\t').map(cleanCell);
  }

  if (line.includes(',')) {
    return splitCsvLine(line);
  }

  return line.split(/\s{2,}/).map(cleanCell);
}

function isMarkdownSeparatorRow(row: string[]): boolean {
  return row.length > 0 && row.every((cell) => /^:?-{3,}:?$/.test(cleanCell(cell)));
}

function isScheduleHeaderRow(row: string[]): boolean {
  const joined = normalize(row.join('|'));
  return (
    (joined.includes('红方战队1') && joined.includes('蓝方战队2'))
    || (joined.includes('red1team') && joined.includes('blue2team'))
  );
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '').replace(/[：:]/g, '');
}

function findColumn(headers: string[], required: string[], forbidden: string[] = []): number {
  const normalizedRequired = required.map(normalize);
  const normalizedForbidden = forbidden.map(normalize);

  return headers.findIndex((header) => {
    const normalizedHeader = normalize(header);
    return normalizedRequired.every((keyword) => normalizedHeader.includes(keyword))
      && normalizedForbidden.every((keyword) => !normalizedHeader.includes(keyword));
  });
}

function getColumnIndexes(rows: string[][]): { indexes: ColumnIndexes; dataStartIndex: number } {
  const headerIndex = rows.findIndex(isScheduleHeaderRow);

  if (headerIndex < 0) {
    return { indexes: FALLBACK_INDEXES, dataStartIndex: 0 };
  }

  const headers = rows[headerIndex];
  const indexes: ColumnIndexes = {
    field: findColumn(headers, ['场地']),
    matchNo: findColumn(headers, ['场次']),
    red1No: findColumn(headers, ['红方', '战队1'], ['名称']),
    red1Name: findColumn(headers, ['红方', '战队1', '名称']),
    red2No: findColumn(headers, ['红方', '战队2'], ['名称']),
    red2Name: findColumn(headers, ['红方', '战队2', '名称']),
    blue1No: findColumn(headers, ['蓝方', '战队1'], ['名称']),
    blue1Name: findColumn(headers, ['蓝方', '战队1', '名称']),
    blue2No: findColumn(headers, ['蓝方', '战队2'], ['名称']),
    blue2Name: findColumn(headers, ['蓝方', '战队2', '名称']),
  };

  const hasMissingRequired = Object.values(indexes).some((index) => index < 0);

  return {
    indexes: hasMissingRequired ? FALLBACK_INDEXES : indexes,
    dataStartIndex: headerIndex + 1,
  };
}

function readCell(row: string[], index: number): string {
  return cleanCell(row[index] ?? '');
}

function buildTeamSlot(
  row: string[],
  indexes: ColumnIndexes,
  alliance: 'red' | 'blue',
  slot: 1 | 2,
): TeamSlot {
  const numberIndex = alliance === 'red'
    ? slot === 1 ? indexes.red1No : indexes.red2No
    : slot === 1 ? indexes.blue1No : indexes.blue2No;
  const nameIndex = alliance === 'red'
    ? slot === 1 ? indexes.red1Name : indexes.red2Name
    : slot === 1 ? indexes.blue1Name : indexes.blue2Name;

  return {
    alliance,
    slot,
    number: readCell(row, numberIndex),
    name: readCell(row, nameIndex),
  };
}

function parseMatchRows(rawText: string): ParsedMatchRow[] {
  const rows = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(splitLine);

  if (rows.length === 0) {
    return [];
  }

  const { indexes, dataStartIndex } = getColumnIndexes(rows);

  return rows.slice(dataStartIndex)
    .filter((row) => !isMarkdownSeparatorRow(row) && !isScheduleHeaderRow(row))
    .map((row) => {
    const teams = [
      buildTeamSlot(row, indexes, 'red', 1),
      buildTeamSlot(row, indexes, 'red', 2),
      buildTeamSlot(row, indexes, 'blue', 1),
      buildTeamSlot(row, indexes, 'blue', 2),
    ].filter((team) => team.number || team.name);

    return {
      field: readCell(row, indexes.field),
      matchNo: readCell(row, indexes.matchNo),
      teams,
    };
    })
    .filter((match) => match.teams.length >= 2 && match.matchNo);
}

function splitFocusQueries(input: string): string[] {
  return Array.from(new Set(
    input
      .split(/[\n,，、;；]+/)
      .map((item) => item.trim())
      .filter(Boolean),
  ));
}

function isQueryMatch(team: TeamSlot, query: string): boolean {
  const normalizedQuery = normalize(query);
  const normalizedNumber = normalize(team.number);
  const normalizedName = normalize(team.name);

  if (!normalizedQuery) {
    return false;
  }

  if (normalizedNumber === normalizedQuery || normalizedName === normalizedQuery) {
    return true;
  }

  return normalizedQuery.length >= 2 && normalizedName.includes(normalizedQuery);
}

function sortMatches(matches: FocusScheduleMatch[]): FocusScheduleMatch[] {
  return [...matches].sort((first, second) => {
    const firstNo = Number(first.matchNo);
    const secondNo = Number(second.matchNo);

    if (Number.isFinite(firstNo) && Number.isFinite(secondNo) && firstNo !== secondNo) {
      return firstNo - secondNo;
    }

    return `${first.field}-${first.matchNo}`.localeCompare(`${second.field}-${second.matchNo}`);
  });
}

function toScheduleAllianceTeams(teams: TeamSlot[], alliance: 'red' | 'blue'): ScheduleAllianceTeam[] {
  return teams
    .filter((team) => team.alliance === alliance)
    .sort((first, second) => first.slot - second.slot)
    .map((team) => ({
      number: team.number,
      name: team.name,
      seatLabel: `${alliance === 'red' ? '红' : '蓝'}${team.slot}`,
    }));
}

export function buildFocusTeamSchedules(rawText: string, focusInput: string): FocusTeamSchedule[] {
  const queries = splitFocusQueries(focusInput);
  const matchRows = parseMatchRows(rawText);

  return queries.map((query) => {
    const matches: FocusScheduleMatch[] = [];
    const seen = new Set<string>();

    matchRows.forEach((matchRow) => {
      matchRow.teams.forEach((team) => {
        if (!isQueryMatch(team, query)) {
          return;
        }

        const partner = matchRow.teams.find(
          (candidate) => candidate.alliance === team.alliance && candidate.slot !== team.slot,
        );
        const opponents = matchRow.teams
          .filter((candidate) => candidate.alliance !== team.alliance)
          .map((candidate) => ({
            number: candidate.number,
            name: candidate.name,
          }));
        const key = `${matchRow.field}|${matchRow.matchNo}|${team.number}|${team.name}`;

        if (seen.has(key)) {
          return;
        }

        seen.add(key);
        matches.push({
          id: key,
          field: matchRow.field,
          matchNo: matchRow.matchNo,
          alliance: team.alliance,
          teamNumber: team.number,
          teamName: team.name,
          partnerNumber: partner?.number ?? '',
          partnerName: partner?.name ?? '',
          opponents,
          redAlliance: toScheduleAllianceTeams(matchRow.teams, 'red'),
          blueAlliance: toScheduleAllianceTeams(matchRow.teams, 'blue'),
        });
      });
    });

    const sortedMatches = sortMatches(matches);
    const firstMatch = sortedMatches[0];

    return {
      query,
      teamNumber: firstMatch?.teamNumber ?? '',
      teamName: firstMatch?.teamName ?? '',
      matches: sortedMatches,
    };
  });
}

export function countScheduleRows(rawText: string): number {
  return parseMatchRows(rawText).length;
}
