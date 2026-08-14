import { useEffect, useRef, useState } from 'react';
import styles from './PracticeEventHub.module.css';
import { ScoreCalculator, type ScoreCalculatorResult } from '../scoring/ScoreCalculator';
import {
  generateExplorerSchedule,
  type PracticeMatch,
  type PracticeTeam,
} from '../../utils/practiceScheduleGenerator';
import {
  buildPracticeExplorerInsights,
  getPracticeExplorerMetricRankings,
  type PracticeExplorerMatchRow,
} from '../../utils/practiceExplorerAnalysis';
import { solveRidgeEpa, type AllianceScoreObservation } from '../../utils/practiceEpa';
import { getValidAccessToken } from '../../services/authService';
import { mergePracticeTeams } from '../../utils/practiceTeamMerge';

interface PracticeEventRecord {
  id: string;
  name: string;
  date: string;
  venue: string;
  notes: string;
  eventItem: string;
  sourceLogisticsEventId: string;
  teams: PracticeTeam[];
  manualTeams: PracticeTeam[];
}

export interface PracticeLogisticsParticipant {
  id: string;
  name: string;
  role: string;
  eventItem: string;
  teamNo: string;
  teamName: string;
}

export interface PracticeLogisticsEvent {
  id: string;
  name: string;
  date: string;
  venue: string;
  participants: PracticeLogisticsParticipant[];
}

interface PracticeEventHubProps {
  logisticsEvents: PracticeLogisticsEvent[];
  accessToken?: string;
  onOpenInspire: () => void;
  onOpenExplorer: () => void;
  onOpenSimulation: () => void;
  onOpenScoreCalculator: () => void;
}

interface ExplorerScheduleGeneratorProps {
  accessToken?: string;
  onAnalysisRowsChange?: (rows: PracticeExplorerMatchRow[]) => void;
}

interface ExplorerScheduleCard {
  id: string;
  createdAt: string;
  fieldCount: number;
  schedule: PracticeMatch[];
  results: Record<string, ScoreCalculatorResult>;
}

interface ExplorerScheduleState {
  fieldCount: number;
  cards: ExplorerScheduleCard[];
  updatedAt: string;
}

function createExplorerScheduleCardId(): string {
  return `schedule-card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const STORAGE_KEY = 'makexrank::practice-events';
const DELETED_EVENT_IDS_KEY = 'makexrank::practice-deleted-event-ids';
const ACTIVE_EXPLORER_TEAMS_KEY = 'makexrank::active-practice-explorer-teams';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
const PRACTICE_SYNC_TABLE = import.meta.env.VITE_SUPABASE_PRACTICE_SYNC_TABLE?.trim() || 'practice_sync';
const PRACTICE_SYNC_ID = 'shared-practice-state';
const EXPLORER_SCHEDULE_STORAGE_KEY = 'makexrank::explorer-schedule-state';
const EXPLORER_SCHEDULE_SYNC_ID = 'shared-explorer-schedule-state';

const EMPTY_EXPLORER_SCHEDULE_STATE: ExplorerScheduleState = {
  fieldCount: 1,
  cards: [],
  updatedAt: '',
};

function normalizeScheduleResults(value: unknown): Record<string, ScoreCalculatorResult> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, result]) => {
    if (!result || typeof result !== 'object') return false;
    const score = result as Partial<ScoreCalculatorResult>;
    return Number.isFinite(score.redScore) && Number.isFinite(score.blueScore);
  })) as Record<string, ScoreCalculatorResult>;
}

function normalizeExplorerScheduleCard(value: unknown, index: number): ExplorerScheduleCard | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Partial<ExplorerScheduleCard>;
  if (!Array.isArray(source.schedule) || source.schedule.length === 0) return null;
  const rawFieldCount = Number(source.fieldCount);
  return {
    id: typeof source.id === 'string' && source.id ? source.id : `schedule-card-${index + 1}`,
    createdAt: typeof source.createdAt === 'string' ? source.createdAt : '',
    fieldCount: Number.isInteger(rawFieldCount) && rawFieldCount >= 1 && rawFieldCount <= 4
      ? rawFieldCount
      : 1,
    schedule: source.schedule as PracticeMatch[],
    results: normalizeScheduleResults(source.results),
  };
}

function normalizeExplorerScheduleState(value: unknown): ExplorerScheduleState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return EMPTY_EXPLORER_SCHEDULE_STATE;
  }

  const source = value as Partial<ExplorerScheduleState>;
  const rawFieldCount = Number(source.fieldCount);
  const fieldCount = Number.isInteger(rawFieldCount) && rawFieldCount >= 1 && rawFieldCount <= 4
    ? rawFieldCount
    : 1;
  const cards = Array.isArray(source.cards)
    ? source.cards
      .map(normalizeExplorerScheduleCard)
      .filter((card): card is ExplorerScheduleCard => Boolean(card))
    : [];
  const legacySource = source as Partial<ExplorerScheduleCard>;
  if (cards.length === 0 && Array.isArray(legacySource.schedule) && legacySource.schedule.length > 0) {
    cards.push({
      id: 'legacy-schedule-card',
      createdAt: typeof source.updatedAt === 'string' ? source.updatedAt : '',
      fieldCount,
      schedule: legacySource.schedule,
      results: normalizeScheduleResults(legacySource.results),
    });
  }

  return {
    fieldCount,
    cards,
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : '',
  };
}

function loadExplorerScheduleState(): ExplorerScheduleState {
  try {
    return normalizeExplorerScheduleState(JSON.parse(
      window.localStorage.getItem(EXPLORER_SCHEDULE_STORAGE_KEY) ?? 'null',
    ));
  } catch {
    return EMPTY_EXPLORER_SCHEDULE_STATE;
  }
}

function saveExplorerScheduleState(state: ExplorerScheduleState): void {
  window.localStorage.setItem(EXPLORER_SCHEDULE_STORAGE_KEY, JSON.stringify(state));
}

function getPracticeSyncHeaders(accessToken: string): HeadersInit {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

async function fetchRemoteExplorerScheduleState(accessToken: string): Promise<ExplorerScheduleState | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const query = new URLSearchParams({
    select: 'events,updated_at',
    id: `eq.${EXPLORER_SCHEDULE_SYNC_ID}`,
    limit: '1',
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${PRACTICE_SYNC_TABLE}?${query.toString()}`, {
    headers: getPracticeSyncHeaders(accessToken),
  });
  if (!response.ok) throw new Error(`读取赛程云数据失败（${response.status}）`);
  const rows = await response.json() as Array<{ events?: unknown; updated_at?: string }>;
  if (!rows.length) return null;
  const state = normalizeExplorerScheduleState(rows[0].events);
  return {
    ...state,
    updatedAt: state.updatedAt || rows[0].updated_at || '',
  };
}

async function fetchRemoteExplorerScheduleUpdatedAt(accessToken: string): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return '';
  const query = new URLSearchParams({
    select: 'updated_at',
    id: `eq.${EXPLORER_SCHEDULE_SYNC_ID}`,
    limit: '1',
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${PRACTICE_SYNC_TABLE}?${query.toString()}`, {
    headers: getPracticeSyncHeaders(accessToken),
  });
  if (!response.ok) throw new Error(`读取赛程云端版本失败（${response.status}）`);
  const rows = await response.json() as Array<{ updated_at?: string }>;
  return rows[0]?.updated_at ?? '';
}

async function saveRemoteExplorerScheduleState(
  state: ExplorerScheduleState,
  accessToken: string,
): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  const saveWithToken = (token: string) => fetch(
    `${SUPABASE_URL}/rest/v1/${PRACTICE_SYNC_TABLE}?on_conflict=id`, {
      method: 'POST',
      headers: {
        ...getPracticeSyncHeaders(token),
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        id: EXPLORER_SCHEDULE_SYNC_ID,
        events: state,
        updated_at: state.updatedAt || new Date().toISOString(),
      }),
    });
  let response = await saveWithToken(accessToken);
  if (response.status === 401) {
    const refreshedToken = await getValidAccessToken(true);
    if (refreshedToken) response = await saveWithToken(refreshedToken);
  }
  if (!response.ok) throw new Error(`保存赛程云数据失败（${response.status}）`);
}

interface PracticeSyncResult {
  events: PracticeEventRecord[];
  deletedEventIds: string[];
}

function normalizeDeletedEventIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0)));
}

function loadDeletedEventIds(): string[] {
  try {
    return normalizeDeletedEventIds(JSON.parse(window.localStorage.getItem(DELETED_EVENT_IDS_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

async function syncPracticeEvents(
  events: PracticeEventRecord[],
  deletedEventIds: string[],
  accessToken: string,
): Promise<PracticeSyncResult> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { events, deletedEventIds };
  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
  const query = new URLSearchParams({ select: 'events,deleted_event_ids', id: `eq.${PRACTICE_SYNC_ID}`, limit: '1' });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${PRACTICE_SYNC_TABLE}?${query.toString()}`, { headers });
  if (!response.ok) throw new Error(`读取练习赛云数据失败（${response.status}）`);
  const rows = await response.json() as Array<{ events?: PracticeEventRecord[]; deleted_event_ids?: unknown }>;
  const nextDeletedEventIds = Array.from(new Set([
    ...normalizeDeletedEventIds(rows[0]?.deleted_event_ids),
    ...normalizeDeletedEventIds(deletedEventIds),
  ]));
  const deletedSet = new Set(nextDeletedEventIds);
  const remoteEvents = (Array.isArray(rows[0]?.events) ? rows[0].events : [])
    .filter((event) => !deletedSet.has(event.id));
  const merged = new Map(remoteEvents.map((event) => [event.id, event]));
  events.filter((event) => !deletedSet.has(event.id)).forEach((event) => {
    const remoteEvent = merged.get(event.id);
    merged.set(event.id, remoteEvent ? {
      ...remoteEvent,
      ...event,
      manualTeams: mergePracticeTeams(remoteEvent.manualTeams ?? [], event.manualTeams ?? []),
    } : event);
  });
  const next = Array.from(merged.values());
  const saveResponse = await fetch(`${SUPABASE_URL}/rest/v1/${PRACTICE_SYNC_TABLE}?on_conflict=id`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      id: PRACTICE_SYNC_ID,
      events: next,
      deleted_event_ids: nextDeletedEventIds,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!saveResponse.ok) throw new Error(`保存练习赛云数据失败（${saveResponse.status}）`);
  return { events: next, deletedEventIds: nextDeletedEventIds };
}

function loadEvents(): PracticeEventRecord[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.map((event) => ({
      ...event,
      eventItem: typeof event.eventItem === 'string' && event.eventItem ? event.eventItem : 'MakeX Explorer',
      sourceLogisticsEventId: typeof event.sourceLogisticsEventId === 'string' ? event.sourceLogisticsEventId : '',
      teams: Array.isArray(event.teams) ? event.teams : [],
      manualTeams: Array.isArray(event.manualTeams) ? event.manualTeams : [],
    })) : [];
  } catch {
    return [];
  }
}

function normalizeEventItem(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchesEventItem(value: string, selectedItem: string): boolean {
  const normalizedValue = normalizeEventItem(value);
  const normalizedSelected = normalizeEventItem(selectedItem);
  if (!normalizedValue) return false;
  return normalizedValue.includes(normalizedSelected)
    || normalizedSelected.includes(normalizedValue)
    || (normalizedSelected === 'makexinspire' && normalizedValue.includes('ins'))
    || (normalizedSelected === 'makexexplorer' && normalizedValue.includes('exp'))
    || (normalizedSelected === 'makexchallenge' && normalizedValue.includes('cha'));
}

function buildPracticeTeams(source: PracticeLogisticsEvent, selectedEventItem: string): PracticeTeam[] {
  const groups = new Map<string, PracticeTeam>();
  source.participants.filter((participant) => participant.role === '队员'
    && matchesEventItem(participant.eventItem, selectedEventItem)).forEach((participant) => {
    const teamNo = participant.teamNo.trim() || '未填写编号';
    const teamName = participant.teamName.trim() || teamNo;
    const normalizedTeamNo = teamNo.replace(/\s+/g, '').toLowerCase();
    const normalizedTeamName = teamName.replace(/\s+/g, '').toLowerCase();
    const teamIdentity = normalizedTeamNo && !teamNo.includes('未填写') ? normalizedTeamNo : normalizedTeamName;
    const key = `${normalizeEventItem(selectedEventItem)}::${teamIdentity}`;
    const team = groups.get(key) ?? { id: key, eventItem: selectedEventItem, teamNo, teamName, isKClub: true, members: [] };
    if (!team.members.some((member) => member.id === participant.id)) {
      team.members.push({ id: participant.id, name: participant.name });
    }
    groups.set(key, team);
  });
  return Array.from(groups.values());
}

function normalizeTeamIdentity(value: string): string {
  return value.trim().replace(/\s+/g, '').toLowerCase();
}

function getExplorerScheduleRanking(
  schedule: PracticeMatch[],
  results: Record<string, ScoreCalculatorResult>,
) {
  return Array.from(new Map(
    schedule.flatMap((match) => [match.red1, match.red2, match.blue1, match.blue2])
      .map((team) => [team.id, team]),
  ).values()).map((team) => {
    let played = 0; let wins = 0; let draws = 0; let losses = 0;
    let rankingPoints = 0; let totalScore = 0; let netScore = 0;
    schedule.forEach((match) => {
      const result = results[match.id];
      if (!result) return;
      const isRed = match.red1.id === team.id || match.red2.id === team.id;
      const isBlue = match.blue1.id === team.id || match.blue2.id === team.id;
      if (!isRed && !isBlue) return;
      played += 1;
      const own = isRed ? result.redScore : result.blueScore;
      const other = isRed ? result.blueScore : result.redScore;
      totalScore += own;
      netScore += own - other;
      if (own > other) { wins += 1; rankingPoints += 3; }
      else if (own === other) { draws += 1; rankingPoints += 1; }
      else losses += 1;
    });
    const averageContribution = played > 0 ? totalScore / played / 2 : 0;
    return { team, played, wins, draws, losses, rankingPoints, totalScore, netScore, averageContribution };
  }).sort((a, b) => b.rankingPoints - a.rankingPoints
    || b.totalScore - a.totalScore
    || b.netScore - a.netScore
    || a.team.teamNo.localeCompare(b.team.teamNo));
}

function buildScheduleAnalysisRows(cards: ExplorerScheduleCard[], canonicalTeams: PracticeTeam[] = []): PracticeExplorerMatchRow[] {
  const resolveTeam = (team: PracticeTeam) => canonicalTeams.find((candidate) => (
    normalizeEventItem(candidate.eventItem) === normalizeEventItem(team.eventItem)
    && ((normalizeTeamIdentity(candidate.teamNo) && normalizeTeamIdentity(candidate.teamNo) === normalizeTeamIdentity(team.teamNo))
      || (normalizeTeamIdentity(candidate.teamName) && normalizeTeamIdentity(candidate.teamName) === normalizeTeamIdentity(team.teamName)))
  )) ?? team;
  const teams = new Map<string, PracticeTeam>();
  const appearances = new Map<string, Array<{
    totalScore: number;
    breakdown: Record<string, number>;
  }>>();
  const observations: AllianceScoreObservation[] = [];
  cards.forEach((card) => card.schedule.forEach((match) => {
    const result = card.results[match.id];
    if (!result) return;
    const redTeams = [resolveTeam(match.red1), resolveTeam(match.red2)];
    const blueTeams = [resolveTeam(match.blue1), resolveTeam(match.blue2)];
    [...redTeams, ...blueTeams].forEach((team) => {
      teams.set(team.id, team);
    });
    redTeams.forEach((team) => appearances.set(team.id, [
      ...(appearances.get(team.id) ?? []),
      { totalScore: result.redScore, breakdown: result.redBreakdown ?? {} },
    ]));
    blueTeams.forEach((team) => appearances.set(team.id, [
      ...(appearances.get(team.id) ?? []),
      { totalScore: result.blueScore, breakdown: result.blueBreakdown ?? {} },
    ]));
    observations.push(
      { teamIds: [redTeams[0].id, redTeams[1].id], total: result.redScore, breakdown: result.redBreakdown ?? {} },
      { teamIds: [blueTeams[0].id, blueTeams[1].id], total: result.blueScore, breakdown: result.blueBreakdown ?? {} },
    );
  }));
  const teamIds = Array.from(teams.keys());
  const totalEpa = solveRidgeEpa(teamIds, observations, (observation) => observation.total);
  const allianceShare = (breakdown: Record<string, number>, keys: string[]) => (
    keys.reduce((sum, key) => sum + (Number(breakdown[key]) || 0), 0) / 2
  );
  return Array.from(teams.values()).flatMap((team) => {
    if (team.id.startsWith('virtual-team-')) return [];
    const teamAppearances = appearances.get(team.id) ?? [];
    const label = `${team.teamNo} · ${team.teamName}`;
    return teamAppearances.map((appearance, index): PracticeExplorerMatchRow => ({
      team: label,
      round: index + 1,
      equity: 0,
      bucket: Math.max(0, allianceShare(appearance.breakdown, ['cone'])),
      flag: Math.max(0, allianceShare(appearance.breakdown, ['flag'])),
      yellowBlock: Math.max(0, allianceShare(appearance.breakdown, ['yellowBlock'])),
      redBlueBlock: Math.max(0, allianceShare(appearance.breakdown, ['colorBlock'])),
      yellowBall: Math.max(0, allianceShare(appearance.breakdown, ['yellowNet', 'yellowFrame'])),
      onlineBall: Math.max(0, allianceShare(appearance.breakdown, ['ballNet', 'ballFrame'])),
      fieldBall: Math.max(0, allianceShare(appearance.breakdown, ['ball5', 'ball10', 'ball20'])),
      penalty: Math.min(0, allianceShare(appearance.breakdown, ['violation', 'yellow', 'redCard'])),
      redCard: Math.min(0, allianceShare(appearance.breakdown, ['redCard'])),
      contributionScore: appearance.totalScore / 2,
      epa: totalEpa.get(team.id) ?? 0,
      totalScore: appearance.totalScore,
    }));
  });
}

export function ExplorerScheduleGenerator({ accessToken, onAnalysisRowsChange }: ExplorerScheduleGeneratorProps) {
  const roundsPerTeam = 4;
  const [scheduleState, setScheduleState] = useState<ExplorerScheduleState>(loadExplorerScheduleState);
  const [scheduleCloudReady, setScheduleCloudReady] = useState(false);
  const [message, setMessage] = useState('');
  const [activeScoreMatch, setActiveScoreMatch] = useState<{ cardId: string; match: PracticeMatch } | null>(null);
  const [openScheduleCardId, setOpenScheduleCardId] = useState<string | null>(null);
  const scheduleUpdatedAtRef = useRef(scheduleState.updatedAt);
  const { fieldCount, cards } = scheduleState;
  const [teams] = useState<PracticeTeam[]>(() => {
    try { return JSON.parse(window.localStorage.getItem(ACTIVE_EXPLORER_TEAMS_KEY) ?? '[]'); } catch { return []; }
  });
  const isKClubTeam = (team: PracticeTeam) => Boolean(
    team.isKClub || teams.some((candidate) => candidate.isKClub && (
      (candidate.teamNo.trim() && candidate.teamNo.trim().toLowerCase() === team.teamNo.trim().toLowerCase())
      || (candidate.teamName.trim() && candidate.teamName.trim().toLowerCase() === team.teamName.trim().toLowerCase())
    )),
  );
  const renderTeamName = (team: PracticeTeam) => (
    <>{team.teamName}{isKClubTeam(team) && <span className={styles.kcTeamBadge}>KC</span>}</>
  );
  const formatTeamName = (team: PracticeTeam) => `${team.teamName}${isKClubTeam(team) ? ' KC' : ''}`;

  useEffect(() => {
    saveExplorerScheduleState(scheduleState);
    scheduleUpdatedAtRef.current = scheduleState.updatedAt;
  }, [scheduleState]);

  useEffect(() => {
    onAnalysisRowsChange?.(buildScheduleAnalysisRows(cards, teams));
  }, [cards, onAnalysisRowsChange, teams]);

  useEffect(() => {
    let cancelled = false;
    if (!accessToken) {
      setScheduleCloudReady(false);
      return;
    }

    void fetchRemoteExplorerScheduleState(accessToken).then(async (remoteState) => {
      if (cancelled) return;
      const localState = loadExplorerScheduleState();
      const nextState = remoteState && remoteState.updatedAt > localState.updatedAt
        ? remoteState
        : localState;
      setScheduleState(nextState);
      saveExplorerScheduleState(nextState);
      if (!remoteState || localState.updatedAt > remoteState.updatedAt) {
        await saveRemoteExplorerScheduleState(nextState, accessToken);
      }
      if (!cancelled) setScheduleCloudReady(true);
    }).catch(() => {
      if (!cancelled) setScheduleCloudReady(false);
    });

    return () => { cancelled = true; };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !scheduleCloudReady) return;
    const timer = window.setTimeout(() => {
      void saveRemoteExplorerScheduleState(scheduleState, accessToken);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [accessToken, scheduleCloudReady, scheduleState]);

  useEffect(() => {
    if (!accessToken || !scheduleCloudReady) return;
    let cancelled = false;
    const pullLatest = () => {
      void fetchRemoteExplorerScheduleUpdatedAt(accessToken).then(async (remoteUpdatedAt) => {
        if (cancelled || !remoteUpdatedAt || remoteUpdatedAt <= scheduleUpdatedAtRef.current) return;
        const remoteState = await fetchRemoteExplorerScheduleState(accessToken);
        if (cancelled || !remoteState || remoteState.updatedAt <= scheduleUpdatedAtRef.current) return;
        scheduleUpdatedAtRef.current = remoteState.updatedAt;
        setScheduleState(remoteState);
      }).catch(() => undefined);
    };
    const pullWhenVisible = () => { if (document.visibilityState === 'visible') pullLatest(); };
    const interval = window.setInterval(pullLatest, 3000);
    window.addEventListener('focus', pullLatest);
    window.addEventListener('online', pullLatest);
    document.addEventListener('visibilitychange', pullWhenVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', pullLatest);
      window.removeEventListener('online', pullLatest);
      document.removeEventListener('visibilitychange', pullWhenVisible);
    };
  }, [accessToken, scheduleCloudReady]);

  const updateScheduleState = (
    updater: (current: ExplorerScheduleState) => Omit<ExplorerScheduleState, 'updatedAt'>,
  ) => {
    setScheduleState((current) => ({
      ...updater(current),
      updatedAt: new Date().toISOString(),
    }));
  };

  const createSchedule = () => {
    const minimumTeamCount = fieldCount * 4;
    const virtualTeamCount = Math.max(0, minimumTeamCount - teams.length);
    const virtualTeams: PracticeTeam[] = Array.from({ length: virtualTeamCount }, (_, index) => ({
      id: `virtual-explorer-${index + 1}`,
      eventItem: 'MakeX Explorer',
      teamNo: `V${String(index + 1).padStart(3, '0')}`,
      teamName: `虚拟赛队${index + 1}`,
      members: [{ id: `virtual-member-${index + 1}`, name: '虚拟队员' }],
    }));
    const scheduledTeams = [...teams, ...virtualTeams];
    const next = generateExplorerSchedule(scheduledTeams, roundsPerTeam, fieldCount);
    if (next) {
      const createdAt = new Date().toISOString();
      const card: ExplorerScheduleCard = {
        id: createExplorerScheduleCardId(),
        createdAt,
        fieldCount,
        schedule: next,
        results: {},
      };
      updateScheduleState((current) => ({ ...current, fieldCount, cards: [...current.cards, card] }));
    }
    setMessage(next
      ? `已新增赛程卡 ${cards.length + 1}：使用 ${teams.length} 支真实赛队${virtualTeamCount ? `，并补入 ${virtualTeamCount} 支虚拟赛队` : ''}，生成 ${next.length} 场随机赛程。`
      : '当前条件未找到合适赛程，请重新生成。');
  };
  const deleteScheduleCard = (card: ExplorerScheduleCard, cardIndex: number) => {
    if (!window.confirm(`确定删除“赛程卡 ${cardIndex + 1}”吗？该卡内的赛程、计分和排名数据会一起删除。`)) return;
    updateScheduleState((current) => ({
      ...current,
      cards: current.cards.filter((item) => item.id !== card.id),
    }));
    if (openScheduleCardId === card.id) setOpenScheduleCardId(null);
    if (activeScoreMatch?.cardId === card.id) setActiveScoreMatch(null);
    setMessage(`赛程卡 ${cardIndex + 1} 已删除，正在同步到云端。`);
  };
  return <section className={styles.secondarySchedule}>
    <div><small>Schedule Generator</small><h2>Explorer 赛程生成器</h2>{accessToken && <em>{scheduleCloudReady ? 'Supabase 已同步' : '正在连接云端'}</em>}</div>
    <p>每支赛队固定参加4场资格赛；多个场地可同时比赛，同一时间轮次不会重复安排同一支赛队。赛队不足场地满负荷时，自动创建虚拟赛队补足。</p>
    <div className={styles.scheduleControls}><label><span>比赛场地数量</span><select value={fieldCount} onChange={(event) => { const nextFieldCount = Number(event.target.value); updateScheduleState((current) => ({ ...current, fieldCount: nextFieldCount })); setMessage(''); }}><option value={1}>1 个场地</option><option value={2}>2 个场地</option><option value={3}>3 个场地</option><option value={4}>4 个场地</option></select></label><button type="button" onClick={createSchedule}>生成随机赛程</button></div>
    {message && <p className={styles.scheduleMessage}>{message}</p>}
    {cards.length === 0 && <div className={styles.scheduleEmpty}>尚未生成赛程。点击“生成随机赛程”后，会在这里新增第一张赛程卡。</div>}
    <div className={styles.scheduleCardList}>{cards.map((card, cardIndex) => {
      const isOpen = openScheduleCardId === card.id;
      const ranking = isOpen ? getExplorerScheduleRanking(card.schedule, card.results) : [];
      const cardAnalysisRows = isOpen ? buildScheduleAnalysisRows([card], teams) : [];
      const cardInsights = isOpen ? buildPracticeExplorerInsights(cardAnalysisRows) : [];
      const cardMetricRankings = isOpen ? getPracticeExplorerMetricRankings(cardAnalysisRows) : [];
      const completedMatches = Object.keys(card.results).length;
      return <article className={styles.scheduleCard} key={card.id}>
        <div className={styles.scheduleCardHeader}><div><small>赛程卡 {cardIndex + 1}</small><h3>Explorer 资格排位赛 · 赛程与成绩</h3><span>{card.fieldCount} 个场地 · {card.schedule.length} 场 · 已计分 {completedMatches} 场{card.createdAt ? ` · ${new Date(card.createdAt).toLocaleString('zh-CN')}` : ''}</span></div><div className={styles.scheduleCardActions}><button type="button" onClick={() => setOpenScheduleCardId(isOpen ? null : card.id)}>{isOpen ? '收起赛程卡' : '进入赛程卡'}</button><button type="button" className={styles.deleteScheduleCardButton} onClick={() => deleteScheduleCard(card, cardIndex)}>删除赛程卡</button></div></div>
        {isOpen && <><div className={styles.scheduleTableWrap}>
          <div className={styles.schedulePublicTitle}>Explorer 资格排位赛 · 赛程表及成绩公示</div>
          <table className={styles.scheduleTable}>
            <thead><tr><th>场地</th><th>场次</th><th className={styles.redHead}>红方战队1</th><th className={styles.redHead}>红方战队2</th><th className={styles.blueHead}>蓝方战队1</th><th className={styles.blueHead}>蓝方战队2</th><th>红方胜负分</th><th className={styles.redScoreHead}>红方总分</th><th>红方净胜分</th><th>蓝方胜负分</th><th className={styles.blueScoreHead}>蓝方总分</th><th>蓝方净胜分</th></tr></thead>
            <tbody>{card.schedule.map((match) => { const result = card.results[match.id]; const redWin = result ? (result.redScore > result.blueScore ? 3 : result.redScore === result.blueScore ? 1 : 0) : null; const blueWin = result ? (result.blueScore > result.redScore ? 3 : result.blueScore === result.redScore ? 1 : 0) : null; const redNet = result ? result.redScore - result.blueScore : null; return <tr key={match.id} onClick={() => setActiveScoreMatch({ cardId: card.id, match })} className={styles.clickableMatch}><td><strong>场地 {match.field}</strong><button type="button">进入计分</button></td><td>{match.slot}</td>{[match.red1, match.red2, match.blue1, match.blue2].map((team, teamIndex) => <td key={`${match.id}-${teamIndex}`}><strong>{team.teamNo}</strong><span>{renderTeamName(team)}</span></td>)}<td className={styles.pendingScore}>{redWin ?? '—'}</td><td className={`${styles.pendingScore} ${styles.redScoreCell}`}>{result?.redScore ?? '—'}</td><td className={styles.pendingScore}>{redNet ?? '—'}</td><td className={styles.pendingScore}>{blueWin ?? '—'}</td><td className={`${styles.pendingScore} ${styles.blueScoreCell}`}>{result?.blueScore ?? '—'}</td><td className={styles.pendingScore}>{redNet === null ? '—' : -redNet}</td></tr>; })}</tbody>
          </table>
        </div>
        <div className={styles.mobileMatchList}>
          <div className={styles.schedulePublicTitle}>Explorer 资格排位赛 · 赛程与成绩</div>
          {card.schedule.map((match) => {
            const result = card.results[match.id];
            return <article className={styles.mobileMatchCard} key={`mobile-${match.id}`}>
              <div className={styles.mobileMatchHeader}>
                <div><strong>场次 {match.slot}</strong><span>场地 {match.field}</span></div>
                <button type="button" onClick={() => setActiveScoreMatch({ cardId: card.id, match })}>进入计分</button>
              </div>
              <div className={`${styles.mobileAlliance} ${styles.mobileRedAlliance}`}>
                <div><b>红方</b><strong>{result ? result.redScore : '待计分'}</strong></div>
                <p><span>{match.red1.teamNo}</span>{renderTeamName(match.red1)}</p>
                <p><span>{match.red2.teamNo}</span>{renderTeamName(match.red2)}</p>
              </div>
              <div className={`${styles.mobileAlliance} ${styles.mobileBlueAlliance}`}>
                <div><b>蓝方</b><strong>{result ? result.blueScore : '待计分'}</strong></div>
                <p><span>{match.blue1.teamNo}</span>{renderTeamName(match.blue1)}</p>
                <p><span>{match.blue2.teamNo}</span>{renderTeamName(match.blue2)}</p>
              </div>
            </article>;
          })}
        </div>
        <div className={styles.rankingWrap}><div className={styles.schedulePublicTitle}>Explorer 资格赛实时排名</div><table className={styles.rankingTable}><thead><tr><th>排名</th><th>队号</th><th>赛队名称</th><th>已赛</th><th>胜-平-负</th><th>排名积分</th><th>联盟总得分</th><th>平均贡献分</th><th>净胜分</th></tr></thead><tbody>{ranking.map((row, index) => <tr key={row.team.id}><td><strong>{index + 1}</strong></td><td>{row.team.teamNo}</td><td>{renderTeamName(row.team)}</td><td>{row.played}</td><td>{row.wins}-{row.draws}-{row.losses}</td><td><strong>{row.rankingPoints}</strong></td><td>{row.totalScore}</td><td>{Math.round(row.averageContribution)}</td><td>{row.netScore}</td></tr>)}</tbody></table></div>
        <section className={styles.cardAnalysis}>
          <div className={styles.schedulePublicTitle}>赛程卡 {cardIndex + 1} · 单卡能力分析</div>
          <p>这里只统计当前赛程卡的已计分比赛；回归 EPA 也仅使用本卡的红蓝联盟组合重新估算，不与其他赛程卡混合。</p>
          {cardAnalysisRows.length === 0 ? <div className={styles.scheduleEmpty}>本赛程卡暂无已计分比赛。</div> : <>
            <div className={styles.cardInsightGrid}>{cardInsights.map((insight) => <article key={insight.team}>
              <strong>{insight.team}</strong>
              <span>本卡场次 {insight.matches}</span>
              <span>本卡平均贡献 {Math.round(insight.averageContribution)}</span>
              <span>本卡回归 EPA {Math.round(insight.averageEpa)}</span>
            </article>)}</div>
            <div className={styles.cardMetricGrid}>{cardMetricRankings.map((metric) => <article key={metric.key}>
              <h4>{metric.label}</h4>
              {metric.teams.map((team, index) => <div key={`${metric.key}-${team.team}`}><span>{index + 1}. {team.team}</span><strong>{Math.round(team.best)}</strong></div>)}
            </article>)}</div>
          </>}
        </section></>}
      </article>;
    })}</div>
    {activeScoreMatch && <ScoreCalculator
      onBack={() => setActiveScoreMatch(null)}
      draftKey={`${activeScoreMatch.cardId}::${activeScoreMatch.match.id}`}
      onSave={async (result) => {
        const nextState: ExplorerScheduleState = {
          ...scheduleState,
          cards: scheduleState.cards.map((card) => card.id === activeScoreMatch.cardId
            ? { ...card, results: { ...card.results, [activeScoreMatch.match.id]: result } }
            : card),
          updatedAt: new Date().toISOString(),
        };
        saveExplorerScheduleState(nextState);
        scheduleUpdatedAtRef.current = nextState.updatedAt;
        setScheduleState(nextState);
        const validAccessToken = await getValidAccessToken();
        if (!validAccessToken) throw new Error('登录状态已失效，请重新登录后再保存。');
        await saveRemoteExplorerScheduleState(nextState, validAccessToken);
      }}
      matchInfo={{ field: `场地${activeScoreMatch.match.field}`, matchNo: String(activeScoreMatch.match.slot), red1: `${activeScoreMatch.match.red1.teamNo} ${formatTeamName(activeScoreMatch.match.red1)}`, red2: `${activeScoreMatch.match.red2.teamNo} ${formatTeamName(activeScoreMatch.match.red2)}`, blue1: `${activeScoreMatch.match.blue1.teamNo} ${formatTeamName(activeScoreMatch.match.blue1)}`, blue2: `${activeScoreMatch.match.blue2.teamNo} ${formatTeamName(activeScoreMatch.match.blue2)}` }}
    />}
  </section>;
}

export function PracticeEventHub({ logisticsEvents, accessToken, onOpenInspire, onOpenExplorer, onOpenSimulation, onOpenScoreCalculator }: PracticeEventHubProps) {
  const [events, setEvents] = useState<PracticeEventRecord[]>(loadEvents);
  const [deletedEventIds, setDeletedEventIds] = useState<string[]>(loadDeletedEventIds);
  const [cloudReady, setCloudReady] = useState(false);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [form, setForm] = useState({
    sourceLogisticsEventId: '',
    eventItem: 'MakeX Explorer',
    name: '',
    date: new Date().toISOString().slice(0, 10),
    venue: '',
    notes: '',
  });
  const [manualTeamForm, setManualTeamForm] = useState({ eventItem: 'MakeX Explorer', teamNo: '', teamName: '', members: '' });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  }, [events]);

  useEffect(() => {
    window.localStorage.setItem(DELETED_EVENT_IDS_KEY, JSON.stringify(deletedEventIds));
  }, [deletedEventIds]);

  useEffect(() => {
    let cancelled = false;
    if (!accessToken) { setCloudReady(false); return; }
    void syncPracticeEvents(loadEvents(), loadDeletedEventIds(), accessToken).then((next) => {
      if (cancelled) return;
      setEvents(next.events);
      setDeletedEventIds(next.deletedEventIds);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next.events));
      window.localStorage.setItem(DELETED_EVENT_IDS_KEY, JSON.stringify(next.deletedEventIds));
      setCloudReady(true);
    }).catch(() => { if (!cancelled) setCloudReady(false); });
    return () => { cancelled = true; };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !cloudReady) return;
    const timer = window.setTimeout(() => { void syncPracticeEvents(events, deletedEventIds, accessToken); }, 600);
    return () => window.clearTimeout(timer);
  }, [accessToken, cloudReady, deletedEventIds, events]);

  useEffect(() => {
    if (!accessToken || !cloudReady) return;
    let cancelled = false;
    const pullLatest = () => {
      void syncPracticeEvents(loadEvents(), loadDeletedEventIds(), accessToken).then((next) => {
        if (cancelled) return;
        setEvents((current) => JSON.stringify(current) === JSON.stringify(next.events) ? current : next.events);
        setDeletedEventIds((current) => JSON.stringify(current) === JSON.stringify(next.deletedEventIds)
          ? current
          : next.deletedEventIds);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next.events));
        window.localStorage.setItem(DELETED_EVENT_IDS_KEY, JSON.stringify(next.deletedEventIds));
      }).catch(() => undefined);
    };
    const interval = window.setInterval(pullLatest, 12000);
    window.addEventListener('focus', pullLatest);
    return () => { cancelled = true; window.clearInterval(interval); window.removeEventListener('focus', pullLatest); };
  }, [accessToken, cloudReady]);

  useEffect(() => {
    setEvents((current) => {
      let changed = false;
      const next = current.map((event) => {
        const source = logisticsEvents.find((item) => item.id === event.sourceLogisticsEventId)
          ?? logisticsEvents.find((item) => item.name.trim() === event.name.trim())
          ?? logisticsEvents.find((item) => Boolean(event.date && event.venue)
            && item.date === event.date
            && item.venue.trim() === event.venue.trim());
        if (!source) return event;

        const teams = buildPracticeTeams(source, event.eventItem || 'MakeX Explorer');
        const sourceChanged = event.sourceLogisticsEventId !== source.id;
        const teamsChanged = JSON.stringify(event.teams) !== JSON.stringify(teams);
        if (!sourceChanged && !teamsChanged) return event;

        changed = true;
        return { ...event, sourceLogisticsEventId: source.id, teams };
      });
      return changed ? next : current;
    });
  }, [logisticsEvents]);

  const activeEvent = events.find((event) => event.id === activeEventId) ?? null;
  const activeEventItem = activeEvent?.eventItem || 'MakeX Explorer';
  const activeLogisticsSource = activeEvent
    ? logisticsEvents.find((event) => event.id === activeEvent.sourceLogisticsEventId)
      ?? logisticsEvents.find((event) => event.name.trim() === activeEvent.name.trim())
      ?? logisticsEvents.find((event) => Boolean(activeEvent.date && activeEvent.venue)
        && event.date === activeEvent.date
        && event.venue.trim() === activeEvent.venue.trim())
    : null;
  const activeTeams = activeEvent
    ? (activeLogisticsSource
      ? buildPracticeTeams(activeLogisticsSource, activeEventItem)
      : activeEvent.teams.filter((team) => matchesEventItem(team.eventItem, activeEventItem)))
    : [];
  const rosterGroups = ['MakeX Explorer', 'MakeX Inspire'].map((eventItem) => {
    const syncedTeams = activeLogisticsSource
      ? buildPracticeTeams(activeLogisticsSource, eventItem)
      : (activeEventItem === eventItem ? activeTeams : []);
    const manualTeams = (activeEvent?.manualTeams ?? []).filter((team) => matchesEventItem(team.eventItem, eventItem));
    const teams = mergePracticeTeams(syncedTeams, manualTeams);
    return {
      eventItem,
      teams,
      memberCount: teams.reduce((total, team) => total + team.members.length, 0),
    };
  });

  const createEvent = () => {
    const name = form.name.trim();
    if (!name) return;
    const source = logisticsEvents.find((event) => event.id === form.sourceLogisticsEventId);
    setEvents((current) => [{
      id: `practice-${Date.now()}`,
      name,
      date: form.date,
      venue: form.venue.trim(),
      notes: form.notes.trim(),
      eventItem: form.eventItem,
      sourceLogisticsEventId: source?.id ?? '',
      teams: source ? buildPracticeTeams(source, form.eventItem) : [],
      manualTeams: [],
    }, ...current]);
    setForm((current) => ({ ...current, sourceLogisticsEventId: '', name: '', venue: '', notes: '' }));
  };

  const selectLogisticsEvent = (sourceId: string) => {
    const source = logisticsEvents.find((event) => event.id === sourceId);
    setForm((current) => ({ ...current, sourceLogisticsEventId: sourceId, name: source?.name ?? current.name, date: source?.date || current.date, venue: source?.venue ?? current.venue }));
  };

  const syncActiveEvent = () => {
    if (!activeEvent) return;
    const source = activeLogisticsSource;
    if (!source) return;
    setEvents((current) => current.map((event) => event.id === activeEvent.id ? { ...event, sourceLogisticsEventId: source.id, name: source.name, date: source.date, venue: source.venue, teams: buildPracticeTeams(source, event.eventItem || 'MakeX Explorer') } : event));
  };

  const deleteEvent = (eventId: string) => {
    setDeletedEventIds((current) => current.includes(eventId) ? current : [...current, eventId]);
    setEvents((current) => current.filter((event) => event.id !== eventId));
    if (activeEventId === eventId) setActiveEventId(null);
  };

  const addManualTeam = () => {
    if (!activeEvent) return;
    const teamNo = manualTeamForm.teamNo.trim();
    const teamName = manualTeamForm.teamName.trim();
    const memberNames = manualTeamForm.members.split(/[、,，;；\n]+/).map((name) => name.trim()).filter(Boolean);
    if (!teamNo || !teamName || memberNames.length === 0) return;
    const eventItem = manualTeamForm.eventItem;
    const id = `${normalizeEventItem(eventItem)}::${teamNo.replace(/\s+/g, '').toLowerCase()}`;
    const nextTeam: PracticeTeam = { id, eventItem, teamNo, teamName, members: memberNames.map((name, index) => ({ id: `manual-${Date.now()}-${index}`, name })) };
    setEvents((current) => current.map((event) => {
      if (event.id !== activeEvent.id) return event;
      const existing = event.manualTeams ?? [];
      const withoutSame = existing.filter((team) => team.id !== id);
      return { ...event, manualTeams: [...withoutSame, nextTeam] };
    }));
    setManualTeamForm((current) => ({ ...current, teamNo: '', teamName: '', members: '' }));
  };

  if (activeEvent) {
    return (
      <div className={styles.hub}>
        <div className={styles.workspaceBar}>
          <button type="button" onClick={() => setActiveEventId(null)}>← 返回练习赛列表</button>
          <div><strong>{activeEvent.name}</strong><span>{activeEvent.date || '日期待定'} · {activeEvent.venue || '场地待定'} · {activeEventItem}</span></div>
          <em>{cloudReady ? 'Supabase 已同步' : '练习赛工作台'}</em>
        </div>

        {activeEvent.notes && <p className={styles.eventNotes}>{activeEvent.notes}</p>}

        <section className={styles.rosterSection}>
          <div className={styles.heading}>
            <div><small>Club Teams</small><h2>俱乐部内部赛队</h2></div>
            <div className={styles.rosterActions}>
              {activeEvent.sourceLogisticsEventId && <button className={styles.syncButton} type="button" onClick={syncActiveEvent}>同步后勤最新人员</button>}
            </div>
          </div>
          <div className={styles.manualTeamPanel}>
            <div><small>Manual Team</small><strong>手动添加赛队</strong></div>
            <div className={styles.manualTeamGrid}>
              <label><span>赛项</span><select value={manualTeamForm.eventItem} onChange={(event) => setManualTeamForm((current) => ({ ...current, eventItem: event.target.value }))}><option>MakeX Explorer</option><option>MakeX Inspire</option></select></label>
              <label><span>赛队编号</span><input value={manualTeamForm.teamNo} onChange={(event) => setManualTeamForm((current) => ({ ...current, teamNo: event.target.value }))} placeholder="例如：98404" /></label>
              <label><span>赛队名称</span><input value={manualTeamForm.teamName} onChange={(event) => setManualTeamForm((current) => ({ ...current, teamName: event.target.value }))} placeholder="例如：星辰主宰" /></label>
              <label><span>赛队队员</span><input value={manualTeamForm.members} onChange={(event) => setManualTeamForm((current) => ({ ...current, members: event.target.value }))} placeholder="多人请用顿号或逗号分隔" /></label>
              <button type="button" onClick={addManualTeam} disabled={!manualTeamForm.teamNo.trim() || !manualTeamForm.teamName.trim() || !manualTeamForm.members.trim()}>添加赛队</button>
            </div>
          </div>
          <div className={styles.rosterGroups}>
            {rosterGroups.map((group) => (
              <details className={styles.rosterGroup} key={group.eventItem} open>
                <summary>
                  <div><strong>{group.eventItem}</strong><span>{group.memberCount} 名队员 · {group.teams.length} 支赛队</span></div>
                  <em>展开 / 收起</em>
                </summary>
                {group.teams.length === 0 ? <div className={styles.rosterEmpty}><strong>暂无 {group.eventItem} 内部赛队</strong><span>后勤赛事中尚未录入该赛项的参赛队员、队号或队名。</span></div> : (
                  <div className={styles.teamTableWrap}>
                    <table className={styles.teamTable}>
                      <thead><tr><th>队号</th><th>赛队名称</th><th>队员人数</th><th>参赛队员</th></tr></thead>
                      <tbody>{group.teams.map((team) => <tr key={team.id}><td><strong>{team.teamNo}</strong></td><td>{team.teamName}{team.isKClub && <span className={styles.kcTeamBadge}>KC</span>}</td><td>{team.members.length} 人</td><td>{team.members.map((member) => member.name).join('、')}</td></tr>)}</tbody>
                    </table>
                  </div>
                )}
              </details>
            ))}
          </div>
        </section>

        <div className={styles.moduleGrid}>
          <article className={styles.moduleCard}>
            <div className={styles.cardTop}><div><small>练习赛项</small><h3>MakeX Inspire</h3></div><span>Inspire</span></div>
            <p>用于 Inspire 练习赛数据整理。后续可以接入常规任务、随机任务、最好成绩、最快时间和训练复盘记录。</p>
            <button type="button" onClick={onOpenInspire}>进入 MakeX Inspire</button>
          </article>
          <article className={styles.moduleCard}>
            <div className={styles.cardTop}><div><small>练习赛项</small><h3>MakeX Explorer</h3></div><span>Explorer</span></div>
            <p>用于 Explorer 练习赛数据整理，包含表格读取、参数分析、单场得分、EPA 变化和训练复盘。</p>
            <button type="button" onClick={() => { window.localStorage.setItem(ACTIVE_EXPLORER_TEAMS_KEY, JSON.stringify(rosterGroups.find((group) => group.eventItem === 'MakeX Explorer')?.teams ?? [])); onOpenExplorer(); }}>进入 MakeX Explorer</button>
          </article>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.hub}>
      <section className={styles.builder}>
        <div className={styles.heading}><div><small>Practice Event</small><h2>创建练习赛事</h2></div><span>{events.length} 场赛事</span></div>
        <p className={styles.hint}>填写练习赛基本信息生成赛事卡片，点击卡片后进入该赛事的数据分析与模拟比赛工具。</p>
        <div className={styles.formGrid}>
          <label className={styles.wideField}><span>从后勤赛事调用（推荐）</span><select value={form.sourceLogisticsEventId} onChange={(event) => selectLogisticsEvent(event.target.value)}><option value="">不调用，手动创建</option>{logisticsEvents.map((event) => <option key={event.id} value={event.id}>{event.name}（{event.participants.filter((participant) => participant.role === '队员').length} 名队员）</option>)}</select></label>
          <label><span>对应赛项</span><select value={form.eventItem} onChange={(event) => setForm((current) => ({ ...current, eventItem: event.target.value }))}><option>MakeX Explorer</option><option>MakeX Inspire</option><option>MakeX Challenge</option></select></label>
          <label><span>赛事名称</span><input placeholder="例如：8 月 Explorer 队内练习赛" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
          <label><span>比赛日期</span><input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} /></label>
          <label><span>比赛场地</span><input placeholder="例如：KCLUB 训练场" value={form.venue} onChange={(event) => setForm((current) => ({ ...current, venue: event.target.value }))} /></label>
          <label><span>备注</span><input placeholder="训练目标或参赛队伍说明" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label>
        </div>
        <button className={styles.primaryButton} type="button" onClick={createEvent} disabled={!form.name.trim()}>生成赛事卡片</button>
      </section>

      <section className={styles.listSection}>
        <div className={styles.heading}><div><small>Practice Cards</small><h2>练习赛事列表</h2></div></div>
        {events.length === 0 ? (
          <div className={styles.empty}><strong>暂无练习赛事</strong><span>请先填写上方信息并生成赛事卡片。</span></div>
        ) : (
          <div className={styles.eventGrid}>
            {events.map((event) => (
              <article key={event.id} className={styles.eventCard}>
                <div><span>练习赛事</span><small>{event.date || '日期待定'}</small></div>
                <h3>{event.name}</h3>
                <p>{event.eventItem} · {event.venue || '场地待定'}</p>
                <div className={styles.cardActions}>
                  <button type="button" onClick={() => setActiveEventId(event.id)}>进入练习赛工作台</button>
                  <button className={styles.deleteButton} type="button" onClick={() => deleteEvent(event.id)}>删除卡片</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className={styles.simulatorSection}>
        <div className={styles.heading}><div><small>Simulation</small><h2>赛事模拟器</h2></div><span>独立工具</span></div>
        <p className={styles.hint}>与练习赛事列表同级使用，无需先创建或进入赛事卡片。用于战队签到、比赛计时、现场判罚和语音倒计时演练。</p>
        <button className={styles.primaryButton} type="button" onClick={onOpenSimulation}>进入赛事模拟器</button>
      </section>

      <section className={styles.simulatorSection}>
        <div className={styles.heading}><div><small>Explorer Simulation Scoring</small><h2>Explorer模拟赛计分系统</h2></div><span>独立工具</span></div>
        <p className={styles.hint}>快速记录红蓝双方得分、加减分项目和最终比分，点击进入独立计分界面。</p>
        <button className={styles.primaryButton} type="button" onClick={onOpenScoreCalculator}>进入Explorer模拟赛计分系统</button>
      </section>
    </div>
  );
}
