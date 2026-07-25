export const DEFAULT_TEAM_TAG_OPTIONS = ['KClub', '科睿', '极鹰', '大圣', '迈创'];

export type TeamTagMap = Record<string, string>;

const TEAM_TAGS_STORAGE_KEY = 'makex-explorer-team-tags';
const TEAM_TAG_OPTIONS_STORAGE_KEY = 'makex-explorer-team-tag-options';

function clean(value: string): string {
  return value.trim();
}

function normalize(value: string): string {
  return clean(value).toLowerCase().replace(/\s+/g, '');
}

export function getTeamNumberFromName(teamName: string): string {
  return clean(teamName).match(/\d{3,}/)?.[0] ?? '';
}

export function getTeamTagKey(teamNumber: string, teamName: string): string {
  const number = clean(teamNumber) || getTeamNumberFromName(teamName);

  if (number) {
    return `number:${number}`;
  }

  return `name:${normalize(teamName)}`;
}

export function getTeamTag(teamTags: TeamTagMap, teamNumber: string, teamName: string): string {
  const key = getTeamTagKey(teamNumber, teamName);
  return teamTags[key] ?? '';
}

export function loadTeamTags(): TeamTagMap {
  try {
    const raw = localStorage.getItem(TEAM_TAGS_STORAGE_KEY);
    return raw ? JSON.parse(raw) as TeamTagMap : {};
  } catch {
    return {};
  }
}

export function saveTeamTags(teamTags: TeamTagMap) {
  localStorage.setItem(TEAM_TAGS_STORAGE_KEY, JSON.stringify(teamTags));
}

export function loadTeamTagOptions(): string[] {
  try {
    const raw = localStorage.getItem(TEAM_TAG_OPTIONS_STORAGE_KEY);
    const stored = raw ? JSON.parse(raw) as string[] : [];
    return Array.from(new Set([...DEFAULT_TEAM_TAG_OPTIONS, ...stored].map(clean).filter(Boolean)));
  } catch {
    return DEFAULT_TEAM_TAG_OPTIONS;
  }
}

export function saveTeamTagOptions(options: string[]) {
  localStorage.setItem(TEAM_TAG_OPTIONS_STORAGE_KEY, JSON.stringify(options.map(clean).filter(Boolean)));
}
