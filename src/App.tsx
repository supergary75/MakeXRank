import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AuthUserProfile,
  CompetitionRecord,
  CompetitionTopTeam,
  EventType,
  SortField,
  SortOrder,
  StorageMode,
  TabName,
  TeamRaw,
  TeamRanked,
  UserRole,
  ViewMode,
} from './types';
import {
  countTeamsFromSourceText,
  getHighestSingleMatchScoreFromSourceText,
  parseTableData,
} from './utils/dataParser';
import {
  cacheCompetitionsLocally,
  deleteCompetitionRecord,
  fetchRemoteCompetitions,
  getPreferredStorageMode,
  isSupabaseConfigured,
  loadCachedCompetitions,
  saveCompetitionRecord,
} from './services/competitionStorage';
import {
  bootstrapAdminUser,
  createManagedUser,
  deleteManagedUser,
  fetchManagedUsers,
  getStoredAccessToken,
  isAuthAvailable,
  resetManagedUserPassword,
  restoreAuthUser,
  signInWithUsername,
  signOutCurrentUser,
  updateManagedUser,
} from './services/authService';
import { calculateRanking, sortTeams } from './utils/rankingAlgorithm';
import {
  getTeamTagKey,
  loadTeamTagOptions,
  loadTeamTags,
  saveTeamTagOptions,
  saveTeamTags,
  type TeamTagMap,
} from './utils/teamTags';
import {
  buildPracticeExplorerInsights,
  getPracticeExplorerMetricRankings,
  parsePracticeExplorerData,
  type PracticeExplorerMatchRow,
} from './utils/practiceExplorerAnalysis';
import { useNotification } from './hooks/useNotification';
import { useFeaturedTeams } from './hooks/useFeaturedTeams';
import { useAutoRefresh } from './hooks/useAutoRefresh';

import { CompetitionLobby } from './components/competition/CompetitionLobby';
import { EventTypeSelector } from './components/competition/EventTypeSelector';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import { TabNavigation } from './components/layout/TabNavigation';
import { DataControls } from './components/data-input/DataControls';
import { DataInputPanel } from './components/data-input/DataInputPanel';
import { StatsCards } from './components/ranking/StatsCards';
import { FeaturedTeams } from './components/ranking/FeaturedTeams';
import { SearchBox } from './components/ranking/SearchBox';
import { RankingTable } from './components/ranking/RankingTable';
import { PlayoffView } from './components/playoff/PlayoffView';
import { FocusScheduleView } from './components/schedule/FocusScheduleView';
import { AuthPanel } from './components/auth/AuthPanel';
import { NotificationContainer } from './components/ui/Notification';

import styles from './App.module.css';

type TrainingDateMode = 'training' | 'self';

const DEFAULT_EVENT_TYPE: EventType = 'MakeX Inspire';
const EVENT_TYPES: EventType[] = ['MakeX Inspire', 'MakeX Explorer', 'MakeX Challenge'];
const TRAINING_GROUP_OPTIONS = ['FRC', 'MakeX Inspire', 'MakeX Explorer', 'MakeX Challenge'];
const DEFAULT_TRAINING_DATE_MODE: TrainingDateMode = 'training';
const TRAINING_TIME_OPTIONS = [
  '08:00',
  '08:30',
  '09:00',
  '09:30',
  '10:00',
  '10:30',
  '11:00',
  '11:30',
  '12:00',
  '13:00',
  '13:30',
  '14:00',
  '14:30',
  '15:00',
  '15:30',
  '16:00',
  '16:30',
  '17:00',
  '17:30',
  '18:00',
  '19:00',
  '19:30',
  '20:00',
  '20:30',
  '21:00',
];
const PRACTICE_EXPLORER_STORAGE_KEY = 'competitive-ranking-board::practice-explorer';
const LOGISTICS_EVENTS_STORAGE_KEY = 'competitive-ranking-board::logistics-events';
const TRAINING_EVENTS_STORAGE_KEY = 'competitive-ranking-board::training-events';
const TRAINING_SCHEDULES_STORAGE_KEY = 'competitive-ranking-board::training-schedules';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
const TRAINING_SYNC_TABLE = import.meta.env.VITE_SUPABASE_TRAINING_SYNC_TABLE?.trim() || 'training_sync';
const TRAINING_SYNC_ID = 'global';

interface PracticeExplorerState {
  sourceText: string;
  teamsData: TeamRaw[];
  rows: PracticeExplorerMatchRow[];
  lastUpdate: string;
}

interface LogisticsEventRecord {
  id: string;
  name: string;
  date: string;
  venue: string;
  group: string;
  notes: string;
  createdAt: string;
}

interface LogisticsEventForm {
  name: string;
  date: string;
  venue: string;
  group: string;
  notes: string;
}

interface TrainingEventRecord {
  id: string;
  name: string;
  date: string;
  calendarDates: string[];
  calendarDateModes: Record<string, TrainingDateMode>;
  calendarDateTimes: Record<string, string>;
  venue: string;
  group: string;
  coach: string;
  notes: string;
  createdAt: string;
}

interface TrainingEventForm {
  name: string;
  date: string;
  venue: string;
  group: string;
  coach: string;
  notes: string;
}

interface TrainingScheduleRow {
  id: string;
  time: string;
  topic: string;
  teams: string;
  coach: string;
  target: string;
  notes: string;
}

type TrainingScheduleMap = Record<string, TrainingScheduleRow[]>;

interface CalendarDay {
  dateKey: string;
  day: number;
  isCurrentMonth: boolean;
}

interface TrainingCloudState {
  events: TrainingEventRecord[];
  schedules: TrainingScheduleMap;
}

interface TrainingSyncRow {
  id: string;
  events: unknown[];
  schedules: Record<string, unknown>;
  updated_at: string;
}

function hasEventAccess(user: AuthUserProfile | null, eventType: EventType): boolean {
  if (!user || user.role === 'admin') {
    return true;
  }

  if (!user.allowedEventTypes || user.allowedEventTypes.length === 0) {
    return true;
  }

  return user.allowedEventTypes.includes(eventType);
}

function hasCompetitionAccess(
  user: AuthUserProfile | null,
  competition: CompetitionRecord,
): boolean {
  if (!hasEventAccess(user, competition.eventType)) {
    return false;
  }

  if (!user || user.role === 'admin') {
    return true;
  }

  if (!user.allowedCompetitionIds || user.allowedCompetitionIds.length === 0) {
    return true;
  }

  return user.allowedCompetitionIds.includes(competition.id);
}

function getDefaultSortField(eventType: EventType): SortField {
  return eventType === 'MakeX Inspire' ? 'attempt1Score' : 'totalWinLossScore';
}

function formatTime(): string {
  return new Date().toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function createCompetitionRecord(name: string, eventType: EventType): CompetitionRecord {
  const now = new Date().toISOString();

  return {
    id: `competition-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    eventType,
    name,
    createdAt: now,
    updatedAt: now,
    lastUpdate: '',
    sourceText: '',
    teamsData: [],
  };
}

function loadPracticeExplorerState(): PracticeExplorerState {
  if (typeof window === 'undefined') {
    return { sourceText: '', teamsData: [], rows: [], lastUpdate: '' };
  }

  try {
    const raw = window.localStorage.getItem(PRACTICE_EXPLORER_STORAGE_KEY);
    if (!raw) {
      return { sourceText: '', teamsData: [], rows: [], lastUpdate: '' };
    }

    const parsed = JSON.parse(raw) as Partial<PracticeExplorerState>;
    return {
      sourceText: typeof parsed.sourceText === 'string' ? parsed.sourceText : '',
      teamsData: Array.isArray(parsed.teamsData) ? parsed.teamsData : [],
      rows: Array.isArray(parsed.rows) ? parsed.rows : [],
      lastUpdate: typeof parsed.lastUpdate === 'string' ? parsed.lastUpdate : '',
    };
  } catch {
    return { sourceText: '', teamsData: [], rows: [], lastUpdate: '' };
  }
}

function savePracticeExplorerState(state: PracticeExplorerState): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(PRACTICE_EXPLORER_STORAGE_KEY, JSON.stringify(state));
}

function loadLogisticsEvents(): LogisticsEventRecord[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(LOGISTICS_EVENTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is Partial<LogisticsEventRecord> => item && typeof item === 'object')
      .map((item) => ({
        id: typeof item.id === 'string' ? item.id : `logistics-${Date.now()}`,
        name: typeof item.name === 'string' ? item.name : '',
        date: typeof item.date === 'string' ? item.date : '',
        venue: typeof item.venue === 'string' ? item.venue : '',
        group: typeof item.group === 'string' ? item.group : '',
        notes: typeof item.notes === 'string' ? item.notes : '',
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
      }))
      .filter((item) => item.name.trim());
  } catch {
    return [];
  }
}

function saveLogisticsEvents(events: LogisticsEventRecord[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(LOGISTICS_EVENTS_STORAGE_KEY, JSON.stringify(events));
}

function isTrainingDateMode(value: unknown): value is TrainingDateMode {
  return value === 'training' || value === 'self';
}

function getTrainingDateModeLabel(mode: TrainingDateMode): string {
  return mode === 'self' ? '自主练习' : '集训';
}

function normalizeTrainingDateModes(
  dates: string[],
  modes: unknown,
): Record<string, TrainingDateMode> {
  const source = modes && typeof modes === 'object' && !Array.isArray(modes)
    ? modes as Record<string, unknown>
    : {};

  return Object.fromEntries(
    dates.map((dateKey) => [
      dateKey,
      isTrainingDateMode(source[dateKey]) ? source[dateKey] : DEFAULT_TRAINING_DATE_MODE,
    ]),
  );
}

function normalizeTrainingDateTimes(
  dates: string[],
  times: unknown,
): Record<string, string> {
  const source = times && typeof times === 'object' && !Array.isArray(times)
    ? times as Record<string, unknown>
    : {};

  return Object.fromEntries(
    dates
      .map((dateKey) => [dateKey, typeof source[dateKey] === 'string' ? source[dateKey].trim() : ''] as const)
      .filter(([, time]) => time),
  );
}

function loadTrainingEvents(): TrainingEventRecord[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(TRAINING_EVENTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is Partial<TrainingEventRecord> => item && typeof item === 'object')
      .map((item) => {
        const calendarDates = Array.isArray(item.calendarDates)
          ? item.calendarDates.filter((date): date is string => typeof date === 'string')
          : typeof item.date === 'string' && item.date ? [item.date] : [];

        return {
          id: typeof item.id === 'string' ? item.id : `training-${Date.now()}`,
          name: typeof item.name === 'string' ? item.name : '',
          date: typeof item.date === 'string' ? item.date : '',
          calendarDates,
          calendarDateModes: normalizeTrainingDateModes(calendarDates, item.calendarDateModes),
          calendarDateTimes: normalizeTrainingDateTimes(calendarDates, item.calendarDateTimes),
          venue: typeof item.venue === 'string' ? item.venue : '',
          group: typeof item.group === 'string' ? item.group : '',
          coach: typeof item.coach === 'string' ? item.coach : '',
          notes: typeof item.notes === 'string' ? item.notes : '',
          createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
        };
      })
      .filter((item) => item.name.trim());
  } catch {
    return [];
  }
}

function saveTrainingEvents(events: TrainingEventRecord[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(TRAINING_EVENTS_STORAGE_KEY, JSON.stringify(events));
}

function getTodayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMonthKey(dateKey: string): string {
  return /^\d{4}-\d{2}/.test(dateKey) ? dateKey.slice(0, 7) : getTodayKey().slice(0, 7);
}

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  return `${year}年${Number(month)}月`;
}

function addMonths(monthKey: string, offset: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getCalendarDays(monthKey: string): CalendarDay[] {
  const [year, month] = monthKey.split('-').map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const leadingDays = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const totalCells = Math.ceil((leadingDays + daysInMonth) / 7) * 7;

  return Array.from({ length: totalCells }, (_, index) => {
    const date = new Date(year, month - 1, 1 + index - leadingDays);
    return {
      dateKey: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      day: date.getDate(),
      isCurrentMonth: date.getMonth() === month - 1,
    };
  });
}

function getTrainingScheduleKey(eventId: string, dateKey: string): string {
  return `${eventId}::${dateKey}`;
}

function loadTrainingSchedules(): TrainingScheduleMap {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(TRAINING_SCHEDULES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).map(([key, rows]) => [
        key,
        Array.isArray(rows)
          ? rows
            .filter((row): row is Partial<TrainingScheduleRow> => row && typeof row === 'object')
            .map((row) => ({
              id: typeof row.id === 'string' ? row.id : `schedule-${Date.now()}`,
              time: typeof row.time === 'string' ? row.time : '',
              topic: typeof row.topic === 'string' ? row.topic : '',
              teams: typeof row.teams === 'string' ? row.teams : '',
              coach: typeof row.coach === 'string' ? row.coach : '',
              target: typeof row.target === 'string' ? row.target : '',
              notes: typeof row.notes === 'string' ? row.notes : '',
            }))
          : [],
      ]),
    );
  } catch {
    return {};
  }
}

function saveTrainingSchedules(schedules: TrainingScheduleMap): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(TRAINING_SCHEDULES_STORAGE_KEY, JSON.stringify(schedules));
}

function getTrainingSyncHeaders(accessToken: string, includeJson = false): HeadersInit {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
  };
}

async function requestTrainingSync<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      ...getTrainingSyncHeaders(accessToken, Boolean(init?.body)),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function normalizeTrainingEvents(input: unknown): TrainingEventRecord[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((item): item is Partial<TrainingEventRecord> => item && typeof item === 'object')
    .map((item) => {
      const calendarDates = Array.isArray(item.calendarDates)
        ? item.calendarDates.filter((date): date is string => typeof date === 'string')
        : typeof item.date === 'string' && item.date ? [item.date] : [];

      return {
        id: typeof item.id === 'string' ? item.id : `training-${Date.now()}`,
        name: typeof item.name === 'string' ? item.name : '',
        date: typeof item.date === 'string' ? item.date : '',
        calendarDates,
        calendarDateModes: normalizeTrainingDateModes(calendarDates, item.calendarDateModes),
        calendarDateTimes: normalizeTrainingDateTimes(calendarDates, item.calendarDateTimes),
        venue: typeof item.venue === 'string' ? item.venue : '',
        group: typeof item.group === 'string' ? item.group : '',
        coach: typeof item.coach === 'string' ? item.coach : '',
        notes: typeof item.notes === 'string' ? item.notes : '',
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
      };
    })
    .filter((item) => item.name.trim());
}

function normalizeTrainingSchedules(input: unknown): TrainingScheduleMap {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>).map(([key, rows]) => [
      key,
      Array.isArray(rows)
        ? rows
          .filter((row): row is Partial<TrainingScheduleRow> => row && typeof row === 'object')
          .map((row) => ({
            id: typeof row.id === 'string' ? row.id : `schedule-${Date.now()}`,
            time: typeof row.time === 'string' ? row.time : '',
            topic: typeof row.topic === 'string' ? row.topic : '',
            teams: typeof row.teams === 'string' ? row.teams : '',
            coach: typeof row.coach === 'string' ? row.coach : '',
            target: typeof row.target === 'string' ? row.target : '',
            notes: typeof row.notes === 'string' ? row.notes : '',
          }))
        : [],
    ]),
  );
}

async function fetchRemoteTrainingState(accessToken: string): Promise<TrainingCloudState | null> {
  const params = new URLSearchParams({
    select: 'id,events,schedules,updated_at',
    id: `eq.${TRAINING_SYNC_ID}`,
    limit: '1',
  });

  const rows = await requestTrainingSync<TrainingSyncRow[]>(
    `/rest/v1/${TRAINING_SYNC_TABLE}?${params.toString()}`,
    accessToken,
  );

  if (!rows.length) {
    return null;
  }

  return {
    events: normalizeTrainingEvents(rows[0].events),
    schedules: normalizeTrainingSchedules(rows[0].schedules),
  };
}

async function saveRemoteTrainingState(
  events: TrainingEventRecord[],
  schedules: TrainingScheduleMap,
  accessToken: string,
): Promise<void> {
  const params = new URLSearchParams({ on_conflict: 'id' });
  await requestTrainingSync<TrainingSyncRow[]>(
    `/rest/v1/${TRAINING_SYNC_TABLE}?${params.toString()}`,
    accessToken,
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify({
        id: TRAINING_SYNC_ID,
        events,
        schedules,
        updated_at: new Date().toISOString(),
      }),
    },
  );
}

function mergeTrainingState(localState: TrainingCloudState, remoteState: TrainingCloudState | null): TrainingCloudState {
  if (!remoteState) {
    return localState;
  }

  if (remoteState.events.length > 0 || Object.keys(remoteState.schedules).length > 0) {
    return remoteState;
  }

  return localState;
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function drawWrappedCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): number {
  const chars = Array.from(text);
  let line = '';
  let linesDrawn = 0;

  for (const char of chars) {
    const nextLine = `${line}${char}`;
    if (line && context.measureText(nextLine).width > maxWidth) {
      context.fillText(line, x, y);
      y += lineHeight;
      linesDrawn += 1;
      line = char;
      if (linesDrawn >= maxLines) {
        return y;
      }
    } else {
      line = nextLine;
    }
  }

  if (line && linesDrawn < maxLines) {
    context.fillText(line, x, y);
    y += lineHeight;
  }

  return y;
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('图片生成失败，请重试。'));
      }
    }, 'image/png');
  });
}

function sanitizeFileNamePart(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').slice(0, 48) || 'training';
}

function getTrainingEventTypeBadge(event: TrainingEventRecord): string {
  const source = `${event.group} ${event.name}`.toLowerCase();
  if (source.includes('frc')) {
    return 'FRC';
  }
  if (source.includes('inspire') || source.includes('ins')) {
    return 'INS';
  }
  if (source.includes('explorer') || source.includes('exp')) {
    return 'EXP';
  }
  if (source.includes('challenge') || source.includes('cha')) {
    return 'CHA';
  }
  return '集训';
}

function getTrainingOverviewBadge(events: TrainingEventRecord[], dateKey: string): string {
  const badges = Array.from(new Set(events.map((event) => {
    const eventType = getTrainingEventTypeBadge(event);
    const dateMode = getTrainingEventDateMode(event, dateKey);
    if (eventType === '集训') {
      return getTrainingDateModeLabel(dateMode);
    }
    return dateMode === 'self' ? `${eventType}自主` : `${eventType}集训`;
  })));
  return badges.join('/');
}

function getTrainingEventCalendarDates(event: TrainingEventRecord): string[] {
  return Array.from(new Set(
    (event.calendarDates ?? []).filter((date): date is string => /^\d{4}-\d{2}-\d{2}$/.test(date)),
  ));
}

function getTrainingEventDateMode(event: TrainingEventRecord, dateKey: string): TrainingDateMode {
  return isTrainingDateMode(event.calendarDateModes?.[dateKey])
    ? event.calendarDateModes[dateKey]
    : DEFAULT_TRAINING_DATE_MODE;
}

function getTrainingEventDateTime(event: TrainingEventRecord, dateKey: string): string {
  return typeof event.calendarDateTimes?.[dateKey] === 'string'
    ? event.calendarDateTimes[dateKey].trim()
    : '';
}

function splitTrainingTimeRange(value: string): { start: string; end: string } {
  const [start = '', end = ''] = value.split('-').map((part) => part.trim());
  return { start, end };
}

function formatTrainingTimeRange(start: string, end: string): string {
  return [start.trim(), end.trim()].filter(Boolean).join('-');
}

function getTrainingEventsByDate(events: TrainingEventRecord[]): Record<string, TrainingEventRecord[]> {
  const eventsByDate: Record<string, TrainingEventRecord[]> = {};

  const addEventToDate = (dateKey: string, event: TrainingEventRecord) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      return;
    }

    const existingEvents = eventsByDate[dateKey] ?? [];
    if (existingEvents.some((existingEvent) => existingEvent.id === event.id)) {
      return;
    }

    eventsByDate[dateKey] = [...existingEvents, event];
  };

  events.forEach((event) => {
    getTrainingEventCalendarDates(event).forEach((dateKey) => addEventToDate(dateKey, event));
  });

  return eventsByDate;
}

function sortCompetitionsByCreatedAt(competitions: CompetitionRecord[]): CompetitionRecord[] {
  return [...competitions].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function getTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function mergeCompetitionsForSync(
  localCompetitions: CompetitionRecord[],
  remoteCompetitions: CompetitionRecord[],
): {
  mergedCompetitions: CompetitionRecord[];
  competitionsToUpload: CompetitionRecord[];
} {
  const mergedById = new Map(remoteCompetitions.map((competition) => [competition.id, competition]));
  const remoteById = new Map(remoteCompetitions.map((competition) => [competition.id, competition]));
  const competitionsToUpload: CompetitionRecord[] = [];

  for (const localCompetition of localCompetitions) {
    const remoteCompetition = remoteById.get(localCompetition.id);

    if (!remoteCompetition) {
      mergedById.set(localCompetition.id, localCompetition);
      competitionsToUpload.push(localCompetition);
      continue;
    }

    if (getTimestamp(localCompetition.updatedAt) > getTimestamp(remoteCompetition.updatedAt)) {
      mergedById.set(localCompetition.id, localCompetition);
      competitionsToUpload.push(localCompetition);
    }
  }

  return {
    mergedCompetitions: sortCompetitionsByCreatedAt(Array.from(mergedById.values())),
    competitionsToUpload,
  };
}

export default function App() {
  const [competitions, setCompetitions] = useState<CompetitionRecord[]>(() => loadCachedCompetitions());
  const [viewMode, setViewMode] = useState<ViewMode>('home');
  const [activeCompetitionId, setActiveCompetitionId] = useState<string | null>(null);
  const [selectedEventType, setSelectedEventType] = useState<EventType | null>(null);
  const [sortField, setSortField] = useState<SortField>('totalWinLossScore');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [activeTab, setActiveTab] = useState<TabName>('ranking');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [awaitingPaste, setAwaitingPaste] = useState(false);
  const [storageMode, setStorageMode] = useState<StorageMode>(() => getPreferredStorageMode());
  const [authUser, setAuthUser] = useState<AuthUserProfile | null>(null);
  const [managedUsers, setManagedUsers] = useState<AuthUserProfile[]>([]);
  const [authPanelOpen, setAuthPanelOpen] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [teamTags, setTeamTags] = useState<TeamTagMap>(() => loadTeamTags());
  const [teamTagOptions, setTeamTagOptions] = useState<string[]>(() => loadTeamTagOptions());
  const [practiceExplorer, setPracticeExplorer] = useState<PracticeExplorerState>(() => loadPracticeExplorerState());
  const [practiceExplorerAwaitingPaste, setPracticeExplorerAwaitingPaste] = useState(false);
  const [logisticsEvents, setLogisticsEvents] = useState<LogisticsEventRecord[]>(() => loadLogisticsEvents());
  const [logisticsEventForm, setLogisticsEventForm] = useState<LogisticsEventForm>({
    name: '',
    date: '',
    venue: '',
    group: '',
    notes: '',
  });
  const [trainingEvents, setTrainingEvents] = useState<TrainingEventRecord[]>(() => loadTrainingEvents());
  const [trainingEventForm, setTrainingEventForm] = useState<TrainingEventForm>({
    name: '',
    date: '',
    venue: '',
    group: '',
    coach: '',
    notes: '',
  });
  const [activeTrainingEventId, setActiveTrainingEventId] = useState<string | null>(null);
  const [trainingOverviewMonth, setTrainingOverviewMonth] = useState(() => {
    const firstDatedEvent = loadTrainingEvents().find((event) => event.date);
    return getMonthKey(firstDatedEvent?.date || getTodayKey());
  });
  const [selectedTrainingDates, setSelectedTrainingDates] = useState<string[]>(() => [getTodayKey()]);
  const [activeTrainingDateMode, setActiveTrainingDateMode] =
    useState<TrainingDateMode>(DEFAULT_TRAINING_DATE_MODE);
  const [activeTrainingDateKey, setActiveTrainingDateKey] = useState<string | null>(null);
  const [activeTrainingStartTime, setActiveTrainingStartTime] = useState('');
  const [activeTrainingEndTime, setActiveTrainingEndTime] = useState('');
  const [visibleTrainingMonth, setVisibleTrainingMonth] = useState(() => getMonthKey(getTodayKey()));
  const [trainingSchedules, setTrainingSchedules] = useState<TrainingScheduleMap>(() => loadTrainingSchedules());
  const [trainingCloudReady, setTrainingCloudReady] = useState(false);

  const pasteAreaRef = useRef<HTMLTextAreaElement>(null);
  const practiceExplorerPasteAreaRef = useRef<HTMLTextAreaElement>(null);
  const trainingCloudSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { notifications, showNotification } = useNotification();
  const { featuredTeams, addTeam, removeTeam, toggleTeam } = useFeaturedTeams();

  const activeCompetition =
    competitions.find((competition) => competition.id === activeCompetitionId) ?? null;
  const activeTrainingEvent =
    trainingEvents.find((event) => event.id === activeTrainingEventId) ?? null;
  const activeTrainingTableDates = activeTrainingEvent
    ? selectedTrainingDates.filter((dateKey) =>
      getTrainingEventDateMode(activeTrainingEvent, dateKey) === 'training')
    : [];
  const activeTrainingScheduleEntries = activeTrainingEvent
    ? activeTrainingTableDates.flatMap((dateKey) =>
      (trainingSchedules[getTrainingScheduleKey(activeTrainingEvent.id, dateKey)] ?? [{
        id: `auto-${dateKey}`,
        time: getTrainingEventDateTime(activeTrainingEvent, dateKey),
        topic: '',
        teams: '',
        coach: '',
        target: '',
        notes: '',
      }]).map((row) => ({
        dateKey,
        row,
      })),
    )
    : [];
  const trainingCalendarDays = getCalendarDays(visibleTrainingMonth);
  const trainingOverviewCalendarDays = getCalendarDays(trainingOverviewMonth);
  const trainingEventsByDate = getTrainingEventsByDate(trainingEvents);
  const authEnabled = isAuthAvailable();
  const accessibleEventTypes = EVENT_TYPES.filter((eventType) => hasEventAccess(authUser, eventType));
  const canEdit = authEnabled ? authUser?.role === 'admin' || authUser?.role === 'editor' : true;
  const canDeleteCompetition = authEnabled ? authUser?.role === 'admin' : true;
  const canManageUsers = authEnabled ? authUser?.role === 'admin' : false;
  const activeEventType = activeCompetition?.eventType ?? selectedEventType ?? DEFAULT_EVENT_TYPE;
  const lobbyCompetitions = selectedEventType
    ? competitions.filter((competition) =>
      competition.eventType === selectedEventType && hasCompetitionAccess(authUser, competition))
    : [];
  const competitionCounts = EVENT_TYPES.reduce<Record<EventType, number>>((counts, eventType) => {
    counts[eventType] = competitions.filter(
      (competition) =>
        competition.eventType === eventType && hasCompetitionAccess(authUser, competition),
    ).length;
    return counts;
  }, {
    'MakeX Inspire': 0,
    'MakeX Explorer': 0,
    'MakeX Challenge': 0,
  });
  const teamsData = activeCompetition?.teamsData ?? [];
  const importedTeamCount = activeCompetition
    ? countTeamsFromSourceText(activeCompetition.sourceText, activeCompetition.eventType)
      || activeCompetition.teamsData.length
    : 0;
  const highestSingleMatchScore = activeCompetition
    ? getHighestSingleMatchScoreFromSourceText(activeCompetition.sourceText, activeCompetition.eventType)
    : 0;
  const rankedTeams: TeamRanked[] = sortTeams(
    calculateRanking(teamsData, activeEventType),
    sortField,
    sortOrder,
    activeEventType,
  );
  const practiceExplorerTeamCount =
    new Set(practiceExplorer.rows.map((row) => row.team)).size || practiceExplorer.teamsData.length;
  const practiceExplorerHighestSingleMatchScore = practiceExplorer.rows.reduce(
    (best, row) => Math.max(best, row.totalScore),
    0,
  );
  const practiceExplorerTotalMatches = practiceExplorer.rows.length;
  const practiceExplorerInsights = buildPracticeExplorerInsights(practiceExplorer.rows);
  const practiceExplorerMetricRankings = getPracticeExplorerMetricRankings(practiceExplorer.rows);
  const practiceExplorerBestEpaInsight = practiceExplorerInsights
    .slice()
    .sort((left, right) => right.bestEpa - left.bestEpa)[0];
  const filteredPracticeExplorerInsights = searchKeyword.trim()
    ? practiceExplorerInsights.filter((insight) => insight.team.toLowerCase().includes(searchKeyword.trim().toLowerCase()))
    : practiceExplorerInsights;
  const topEpaTeams: CompetitionTopTeam[] = competitions
    .flatMap((competition) => {
      const competitionRankedTeams = sortTeams(
        calculateRanking(competition.teamsData, competition.eventType),
        competition.eventType === 'MakeX Inspire' ? 'attempt1Score' : 'epa',
        'desc',
        competition.eventType,
      );

      return competitionRankedTeams.map((team, index) => ({
        attempt1Score: team.attempt1Score,
        attempt1TimeSeconds: team.attempt1TimeSeconds,
        attempt1TimeText: team.attempt1TimeText,
        attempt2Score: team.attempt2Score,
        attempt2TimeSeconds: team.attempt2TimeSeconds,
        attempt2TimeText: team.attempt2TimeText,
        bestTimeSeconds: team.bestTimeSeconds,
        bestTimeText: team.bestTimeText,
        competitionId: competition.id,
        competitionName: competition.name,
        draws: team.draws,
        eventType: competition.eventType,
        team: team.team,
        epa: team.epa,
        wins: team.wins,
        losses: team.losses,
        netScore: team.netScore,
        totalScore: team.totalScore,
        totalWinLossScore: team.totalWinLossScore,
        rankInCompetition: index + 1,
      }));
    })
    .filter((team) => {
      const relatedCompetition = competitions.find((competition) => competition.id === team.competitionId);
      if (!relatedCompetition) {
        return false;
      }

      return (!selectedEventType || team.eventType === selectedEventType)
        && hasCompetitionAccess(authUser, relatedCompetition);
    })
    .sort((left, right) => {
      if (left.eventType === 'MakeX Inspire' && right.eventType === 'MakeX Inspire') {
        const leftRegularScore = left.attempt1Score ?? 0;
        const rightRegularScore = right.attempt1Score ?? 0;
        if (rightRegularScore !== leftRegularScore) {
          return rightRegularScore - leftRegularScore;
        }

        const leftTime = left.attempt1TimeSeconds ?? Number.POSITIVE_INFINITY;
        const rightTime = right.attempt1TimeSeconds ?? Number.POSITIVE_INFINITY;
        if (leftTime !== rightTime) {
          return leftTime - rightTime;
        }

        if (right.totalScore !== left.totalScore) {
          return right.totalScore - left.totalScore;
        }

        return left.team.localeCompare(right.team, 'zh-CN');
      }

      const epaDiff = (parseFloat(right.epa) || 0) - (parseFloat(left.epa) || 0);
      if (epaDiff !== 0) return epaDiff;

      if (right.totalWinLossScore !== left.totalWinLossScore) {
        return right.totalWinLossScore - left.totalWinLossScore;
      }

      if (right.netScore !== left.netScore) {
        return right.netScore - left.netScore;
      }

      if (right.wins !== left.wins) {
        return right.wins - left.wins;
      }

      return left.team.localeCompare(right.team, 'zh-CN');
    })
    .slice(0, 20);

  useEffect(() => {
    cacheCompetitionsLocally(competitions);
  }, [competitions]);

  useEffect(() => {
    saveTrainingEvents(trainingEvents);
  }, [trainingEvents]);

  useEffect(() => {
    saveTrainingSchedules(trainingSchedules);
  }, [trainingSchedules]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!authEnabled) {
        if (!cancelled) {
          setAuthReady(true);
        }
        return;
      }

      const restoredUser = await restoreAuthUser();
      if (cancelled) {
        return;
      }

      setAuthUser(restoredUser);
      setAuthReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [authEnabled]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!canManageUsers) {
        setManagedUsers(authUser ? [authUser] : []);
        return;
      }

      const accessToken = getStoredAccessToken();
      if (!accessToken) {
        return;
      }

      try {
        const users = await fetchManagedUsers(accessToken);
        if (!cancelled) {
          setManagedUsers(users);
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : '未知错误';
          showNotification(`读取账号列表失败：${message}`, 'error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authUser, canManageUsers, showNotification]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!authUser) {
        setTrainingCloudReady(false);
        return;
      }

      const accessToken = getStoredAccessToken();
      if (!accessToken) {
        setTrainingCloudReady(false);
        return;
      }

      try {
        const localState: TrainingCloudState = {
          events: loadTrainingEvents(),
          schedules: loadTrainingSchedules(),
        };
        const remoteState = await fetchRemoteTrainingState(accessToken);
        const mergedState = mergeTrainingState(localState, remoteState);

        if (cancelled) {
          return;
        }

        setTrainingEvents(mergedState.events);
        setTrainingSchedules(mergedState.schedules);
        saveTrainingEvents(mergedState.events);
        saveTrainingSchedules(mergedState.schedules);
        await saveRemoteTrainingState(mergedState.events, mergedState.schedules, accessToken);

        if (!cancelled) {
          setTrainingCloudReady(true);
          showNotification('已连接 Supabase 集训安排云端同步，登录设备会共享同一份集训日历。', 'success');
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        setTrainingCloudReady(false);
        const message = error instanceof Error ? error.message : '未知错误';
        showNotification(`集训安排云同步失败，暂时使用本地数据。原因：${message}`, 'error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authUser, showNotification]);

  useEffect(() => {
    if (!authUser || !trainingCloudReady) {
      return;
    }

    const accessToken = getStoredAccessToken();
    if (!accessToken) {
      return;
    }

    if (trainingCloudSaveTimerRef.current) {
      clearTimeout(trainingCloudSaveTimerRef.current);
    }

    trainingCloudSaveTimerRef.current = setTimeout(() => {
      void saveRemoteTrainingState(trainingEvents, trainingSchedules, accessToken).catch((error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        showNotification(`集训安排保存到 Supabase 失败：${message}`, 'error');
      });
    }, 500);

    return () => {
      if (trainingCloudSaveTimerRef.current) {
        clearTimeout(trainingCloudSaveTimerRef.current);
        trainingCloudSaveTimerRef.current = null;
      }
    };
  }, [authUser, showNotification, trainingCloudReady, trainingEvents, trainingSchedules]);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setStorageMode('local');
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const localCompetitions = loadCachedCompetitions();
        const remoteCompetitions = await fetchRemoteCompetitions();
        const { mergedCompetitions, competitionsToUpload } = mergeCompetitionsForSync(
          localCompetitions,
          remoteCompetitions,
        );

        if (competitionsToUpload.length > 0) {
          await Promise.all(
            competitionsToUpload.map((competition) => saveCompetitionRecord(competition)),
          );
        }

        const syncedCompetitions =
          competitionsToUpload.length > 0
            ? await fetchRemoteCompetitions()
            : mergedCompetitions;

        if (cancelled) {
          return;
        }

        setCompetitions(sortCompetitionsByCreatedAt(syncedCompetitions));
        setStorageMode('supabase');
        showNotification(
          competitionsToUpload.length > 0
            ? `已将当前设备的 ${competitionsToUpload.length} 场本地比赛同步到 Supabase，其他设备刷新后即可看到。`
            : '已连接 Supabase 云端数据，当前设备会与共享比赛库同步。',
          'success',
        );
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : '未知错误';
        setStorageMode('local');
        showNotification(`Supabase 连接失败，已回退到本地存储。原因：${message}`, 'error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [showNotification]);

  useEffect(() => {
    if (viewMode === 'competition' && !activeCompetition) {
      setViewMode('lobby');
    }
  }, [viewMode, activeCompetition]);

  useEffect(() => {
    if (viewMode === 'lobby' && !selectedEventType) {
      setViewMode('event-types');
    }
  }, [selectedEventType, viewMode]);

  useEffect(() => {
    if (activeCompetition?.eventType) {
      setSelectedEventType(activeCompetition.eventType);
    }
  }, [activeCompetition]);

  useEffect(() => {
    if (!activeCompetition) {
      return;
    }

    if (
      (activeTab === 'playoff' && activeCompetition.eventType === 'MakeX Inspire')
      || (activeTab === 'focusSchedule' && activeCompetition.eventType !== 'MakeX Explorer')
    ) {
      setActiveTab('ranking');
    }
  }, [activeCompetition, activeTab]);

  useEffect(() => {
    if (!activeCompetition) {
      return;
    }

    if (hasCompetitionAccess(authUser, activeCompetition)) {
      return;
    }

    setActiveCompetitionId(null);
    setViewMode(selectedEventType ? 'lobby' : 'event-types');
    showNotification('当前账号无权访问这场比赛，已返回可见范围。', 'error');
  }, [activeCompetition, authUser, selectedEventType, showNotification]);

  useEffect(() => {
    if (!selectedEventType) {
      return;
    }

    if (accessibleEventTypes.includes(selectedEventType)) {
      return;
    }

    setSelectedEventType(accessibleEventTypes[0] ?? null);
    setViewMode('event-types');
  }, [accessibleEventTypes, selectedEventType]);

  const ensureEditorAccess = useCallback(() => {
    if (canEdit) {
      return true;
    }

    showNotification('请先用 editor 或 admin 账号登录后再修改比赛数据。', 'error');
    return false;
  }, [canEdit, showNotification]);

  const runAuthTask = useCallback(
    async (task: () => Promise<void>) => {
      setAuthBusy(true);
      try {
        await task();
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误';
        showNotification(message, 'error');
      } finally {
        setAuthBusy(false);
      }
    },
    [showNotification],
  );

  const handleLogin = useCallback(
    async (username: string, password: string) => {
      await runAuthTask(async () => {
        const profile = await signInWithUsername(username, password);
        setAuthUser(profile);
        setViewMode('home');
        setAuthPanelOpen(false);
        showNotification(`欢迎回来，${profile.displayName}。`, 'success');
      });
    },
    [runAuthTask, showNotification],
  );

  const handleLogout = useCallback(
    async () => {
      await runAuthTask(async () => {
        await signOutCurrentUser();
        setAuthUser(null);
        setManagedUsers([]);
        showNotification('已退出当前账号。', 'info');
      });
    },
    [runAuthTask, showNotification],
  );

  const handleBootstrapAdmin = useCallback(
    async (input: {
      username: string;
      displayName: string;
      password: string;
      role: UserRole;
      allowedEventTypes?: EventType[] | null;
      allowedCompetitionIds?: string[] | null;
    }) => {
      await runAuthTask(async () => {
        const profile = await bootstrapAdminUser(input);
        setAuthUser(profile);
        setViewMode('home');
        setAuthPanelOpen(false);
        showNotification(`首个管理员 ${profile.displayName} 已创建并登录。`, 'success');
      });
    },
    [runAuthTask, showNotification],
  );

  const handleCreateManagedUser = useCallback(
    async (input: {
      username: string;
      displayName: string;
      password: string;
      role: UserRole;
      allowedEventTypes?: EventType[] | null;
      allowedCompetitionIds?: string[] | null;
    }) => {
      const accessToken = getStoredAccessToken();
      if (!accessToken) {
        showNotification('当前登录状态已失效，请重新登录管理员账号。', 'error');
        return;
      }

      await runAuthTask(async () => {
        const profile = await createManagedUser(accessToken, input);
        const users = await fetchManagedUsers(accessToken);
        setManagedUsers(users);
        showNotification(`已创建账号：${profile.username}`, 'success');
      });
    },
    [runAuthTask, showNotification],
  );

  const handleUpdateManagedUser = useCallback(
    async (
      authUserId: string,
      input: {
        displayName?: string;
        role?: UserRole;
        allowedEventTypes?: EventType[] | null;
        allowedCompetitionIds?: string[] | null;
      },
    ) => {
      const accessToken = getStoredAccessToken();
      if (!accessToken) {
        showNotification('当前登录状态已失效，请重新登录管理员账号。', 'error');
        return;
      }

      await runAuthTask(async () => {
        await updateManagedUser(accessToken, authUserId, input);
        setManagedUsers((previous) =>
          previous.map((user) =>
            user.authUserId === authUserId
              ? {
                ...user,
                displayName: input.displayName ?? user.displayName,
                role: input.role ?? user.role,
                allowedEventTypes:
                  'allowedEventTypes' in input
                    ? input.allowedEventTypes ?? null
                    : user.allowedEventTypes,
                allowedCompetitionIds:
                  'allowedCompetitionIds' in input
                    ? input.allowedCompetitionIds ?? null
                    : user.allowedCompetitionIds,
              }
              : user,
          ),
        );

        if (authUser?.authUserId === authUserId) {
          setAuthUser((previous) => (
            previous
              ? {
                ...previous,
                displayName: input.displayName ?? previous.displayName,
                role: input.role ?? previous.role,
                allowedEventTypes:
                  'allowedEventTypes' in input
                    ? input.allowedEventTypes ?? null
                    : previous.allowedEventTypes,
                allowedCompetitionIds:
                  'allowedCompetitionIds' in input
                    ? input.allowedCompetitionIds ?? null
                    : previous.allowedCompetitionIds,
              }
              : previous
          ));
        }

        showNotification('账号权限已更新。', 'success');
      });
    },
    [authUser, runAuthTask, showNotification],
  );

  const handleResetManagedUserPassword = useCallback(
    async (authUserId: string, nextPassword: string) => {
      const accessToken = getStoredAccessToken();
      if (!accessToken) {
        showNotification('当前登录状态已失效，请重新登录管理员账号。', 'error');
        return;
      }

      await runAuthTask(async () => {
        await resetManagedUserPassword(accessToken, authUserId, nextPassword);
        showNotification('新密码已保存。', 'success');
      });
    },
    [runAuthTask, showNotification],
  );

  const handleDeleteManagedUser = useCallback(
    async (authUserId: string) => {
      const accessToken = getStoredAccessToken();
      if (!accessToken) {
        showNotification('当前登录状态已失效，请重新登录管理员账号。', 'error');
        return;
      }

      await runAuthTask(async () => {
        await deleteManagedUser(accessToken, authUserId);
        setManagedUsers((previous) => previous.filter((user) => user.authUserId !== authUserId));
        showNotification('用户已删除。', 'success');
      });
    },
    [runAuthTask, showNotification],
  );

  const handleToggleUserActive = useCallback(
    async (authUserId: string, isActive: boolean) => {
      const accessToken = getStoredAccessToken();
      if (!accessToken) {
        showNotification('当前登录状态已失效，请重新登录管理员账号。', 'error');
        return;
      }

      await runAuthTask(async () => {
        await updateManagedUser(accessToken, authUserId, { isActive });
        setManagedUsers((previous) =>
          previous.map((user) =>
            user.authUserId === authUserId ? { ...user, isActive } : user,
          ),
        );
        if (authUser?.authUserId === authUserId && !isActive) {
          await signOutCurrentUser();
          setAuthUser(null);
          setManagedUsers([]);
          setAuthPanelOpen(false);
        }
        showNotification(isActive ? '账号已启用。' : '账号已停用。', 'success');
      });
    },
    [authUser?.authUserId, runAuthTask, showNotification],
  );

  const syncCompetition = useCallback(
    async (competition: CompetitionRecord) => {
      if (storageMode !== 'supabase') {
        return;
      }

      try {
        await saveCompetitionRecord(competition);
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误';
        showNotification(`Supabase 保存失败，本次改动仅保留在当前浏览器。原因：${message}`, 'error');
      }
    },
    [showNotification, storageMode],
  );

  const removeCompetitionFromCloud = useCallback(
    async (id: string) => {
      if (storageMode !== 'supabase') {
        return;
      }

      try {
        await deleteCompetitionRecord(id);
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误';
        showNotification(`Supabase 删除失败，云端可能仍保留这场比赛。原因：${message}`, 'error');
      }
    },
    [showNotification, storageMode],
  );

  const updateActiveCompetition = useCallback(
    (updater: (competition: CompetitionRecord) => CompetitionRecord) => {
      if (!activeCompetition) {
        return;
      }

      const nextCompetition = updater(activeCompetition);
      setCompetitions((previous) =>
        previous.map((competition) =>
          competition.id === nextCompetition.id ? nextCompetition : competition,
        ),
      );
      void syncCompetition(nextCompetition);
    },
    [activeCompetition, syncCompetition],
  );

  const handleCreateCompetition = useCallback(
    (name: string) => {
      if (!ensureEditorAccess()) {
        return;
      }

      if (!selectedEventType) {
        showNotification('请先选择一个赛项。', 'error');
        return;
      }

      if (!hasEventAccess(authUser, selectedEventType)) {
        showNotification('当前账号无权在这个赛项下创建比赛。', 'error');
        return;
      }

      const trimmedName = name.trim();
      if (!trimmedName) {
        showNotification('请先输入比赛名称。', 'error');
        return;
      }

      const competition = createCompetitionRecord(trimmedName, selectedEventType);
      setCompetitions((previous) => [competition, ...previous]);
      setSortField(getDefaultSortField(selectedEventType));
      setSortOrder('desc');
      void syncCompetition(competition);
      showNotification(`已在 ${selectedEventType} 下创建比赛卡片：${trimmedName}`, 'success');
    },
    [authUser, ensureEditorAccess, selectedEventType, showNotification, syncCompetition],
  );

  const handleOpenCompetition = useCallback(
    (id: string) => {
      const competition = competitions.find((item) => item.id === id);
      if (!competition) {
        showNotification('没有找到这场比赛。', 'error');
        return;
      }

      if (!hasCompetitionAccess(authUser, competition)) {
        showNotification('当前账号无权打开这场比赛。', 'error');
        return;
      }

      setSelectedEventType(competition.eventType);
      setSortField(getDefaultSortField(competition.eventType));
      setSortOrder('desc');
      setActiveCompetitionId(id);
      setViewMode('competition');
      setActiveTab('ranking');
      setSearchKeyword('');
    },
    [authUser, competitions, showNotification],
  );

  const handleSelectEventType = useCallback((eventType: EventType) => {
    if (!hasEventAccess(authUser, eventType)) {
      showNotification('当前账号无权访问这个赛项。', 'error');
      return;
    }

    setSelectedEventType(eventType);
    setSortField(getDefaultSortField(eventType));
    setSortOrder('desc');
    setViewMode('lobby');
    setActiveCompetitionId(null);
    setSearchKeyword('');
    setAwaitingPaste(false);
  }, [authUser, showNotification]);

  const handleBackToLobby = useCallback(() => {
    setViewMode('lobby');
    setSearchKeyword('');
    setAwaitingPaste(false);
  }, []);

  const handleBackToEventTypes = useCallback(() => {
    setViewMode('event-types');
    setActiveCompetitionId(null);
    setSearchKeyword('');
    setAwaitingPaste(false);
  }, []);

  const handleOpenDataAnalysis = useCallback(() => {
    setViewMode('event-types');
    setActiveCompetitionId(null);
    setSearchKeyword('');
    setAwaitingPaste(false);
  }, []);

  const handleOpenLogistics = useCallback(() => {
    setViewMode('logistics');
    setActiveCompetitionId(null);
    setSearchKeyword('');
    setAwaitingPaste(false);
  }, []);

  const handleOpenTrainingPlan = useCallback(() => {
    const firstDatedEvent = trainingEvents.find((event) => event.date);
    if (firstDatedEvent) {
      setTrainingOverviewMonth(getMonthKey(firstDatedEvent.date));
    }
    setViewMode('training-plan');
    setActiveCompetitionId(null);
    setActiveTrainingEventId(null);
    setSearchKeyword('');
    setAwaitingPaste(false);
    setPracticeExplorerAwaitingPaste(false);
  }, [trainingEvents]);

  const handleLogisticsFormChange = useCallback(
    (field: keyof LogisticsEventForm, value: string) => {
      setLogisticsEventForm((previous) => ({
        ...previous,
        [field]: value,
      }));
    },
    [],
  );

  const handleCreateLogisticsEvent = useCallback(() => {
    if (!canEdit) {
      showNotification('当前账号没有编辑权限。', 'error');
      return;
    }

    const trimmedName = logisticsEventForm.name.trim();
    if (!trimmedName) {
      showNotification('请先输入赛事名称。', 'error');
      return;
    }

    const now = new Date().toISOString();
    const nextEvent: LogisticsEventRecord = {
      id: `logistics-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmedName,
      date: logisticsEventForm.date.trim(),
      venue: logisticsEventForm.venue.trim(),
      group: logisticsEventForm.group.trim(),
      notes: logisticsEventForm.notes.trim(),
      createdAt: now,
    };

    setLogisticsEvents((previous) => {
      const next = [nextEvent, ...previous];
      saveLogisticsEvents(next);
      return next;
    });
    setLogisticsEventForm({
      name: '',
      date: '',
      venue: '',
      group: '',
      notes: '',
    });
    showNotification(`已生成后勤赛事卡片：${trimmedName}`, 'success');
  }, [canEdit, logisticsEventForm, showNotification]);

  const handleDeleteLogisticsEvent = useCallback(
    (id: string) => {
      if (!canEdit) {
        showNotification('当前账号没有编辑权限。', 'error');
        return;
      }

      setLogisticsEvents((previous) => {
        const next = previous.filter((event) => event.id !== id);
        saveLogisticsEvents(next);
        return next;
      });
      showNotification('已删除后勤赛事卡片。', 'info');
    },
    [canEdit, showNotification],
  );

  const handleTrainingFormChange = useCallback(
    (field: keyof TrainingEventForm, value: string) => {
      setTrainingEventForm((previous) => ({
        ...previous,
        [field]: value,
      }));
    },
    [],
  );

  const handleCreateTrainingEvent = useCallback(() => {
    if (!canEdit) {
      showNotification('当前账号没有编辑权限。', 'error');
      return;
    }

    const trimmedName = trainingEventForm.name.trim();
    if (!trimmedName) {
      showNotification('请先输入比赛名称。', 'error');
      return;
    }

    const now = new Date().toISOString();
    const nextEvent: TrainingEventRecord = {
      id: `training-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmedName,
      date: trainingEventForm.date.trim(),
      calendarDates: trainingEventForm.date.trim() ? [trainingEventForm.date.trim()] : [],
      calendarDateModes: trainingEventForm.date.trim()
        ? { [trainingEventForm.date.trim()]: DEFAULT_TRAINING_DATE_MODE }
        : {},
      calendarDateTimes: {},
      venue: trainingEventForm.venue.trim(),
      group: trainingEventForm.group.trim(),
      coach: trainingEventForm.coach.trim(),
      notes: trainingEventForm.notes.trim(),
      createdAt: now,
    };

    setTrainingEvents((previous) => {
      const next = [nextEvent, ...previous];
      saveTrainingEvents(next);
      return next;
    });
    if (nextEvent.date) {
      setTrainingOverviewMonth(getMonthKey(nextEvent.date));
    }
    setTrainingEventForm({
      name: '',
      date: '',
      venue: '',
      group: '',
      coach: '',
      notes: '',
    });
    showNotification(`已生成集训比赛卡片：${trimmedName}`, 'success');
  }, [canEdit, showNotification, trainingEventForm]);

  const handleDeleteTrainingEvent = useCallback(
    (id: string) => {
      if (!canEdit) {
        showNotification('当前账号没有编辑权限。', 'error');
        return;
      }

      setTrainingEvents((previous) => {
        const next = previous.filter((event) => event.id !== id);
        saveTrainingEvents(next);
        return next;
      });
      setTrainingSchedules((previous) => {
        const next = Object.fromEntries(
          Object.entries(previous).filter(([key]) => !key.startsWith(`${id}::`)),
        );
        saveTrainingSchedules(next);
        return next;
      });
      setActiveTrainingEventId((currentId) => (currentId === id ? null : currentId));
      showNotification('已删除集训比赛卡片。', 'info');
    },
    [canEdit, showNotification],
  );

  const handleOpenTrainingEvent = useCallback((id: string) => {
    const trainingEvent = trainingEvents.find((event) => event.id === id);
    const eventDates = trainingEvent ? getTrainingEventCalendarDates(trainingEvent) : [];
    const defaultDate = eventDates[0] || trainingEvent?.date || getTodayKey();
    const defaultTime = trainingEvent ? getTrainingEventDateTime(trainingEvent, defaultDate) : '';
    const defaultTimeRange = splitTrainingTimeRange(defaultTime);
    setActiveTrainingEventId(id);
    setSelectedTrainingDates(eventDates);
    setActiveTrainingDateMode(DEFAULT_TRAINING_DATE_MODE);
    setActiveTrainingDateKey(eventDates[0] ?? null);
    setActiveTrainingStartTime(defaultTimeRange.start);
    setActiveTrainingEndTime(defaultTimeRange.end);
    setVisibleTrainingMonth(getMonthKey(defaultDate));
    setViewMode('training-event');
    setActiveCompetitionId(null);
    setSearchKeyword('');
    setAwaitingPaste(false);
    setPracticeExplorerAwaitingPaste(false);
  }, [trainingEvents]);

  const syncActiveTrainingCalendarDates = useCallback(() => {
    if (!activeTrainingEvent) {
      return;
    }

    const nextDates = Array.from(new Set(
      selectedTrainingDates.filter((dateKey) => /^\d{4}-\d{2}-\d{2}$/.test(dateKey)),
    )).sort();

    setTrainingEvents((events) => {
      const nextEvents = events.map((event) =>
        event.id === activeTrainingEvent.id
          ? {
            ...event,
            calendarDates: nextDates,
            calendarDateModes: normalizeTrainingDateModes(nextDates, event.calendarDateModes),
            calendarDateTimes: normalizeTrainingDateTimes(nextDates, event.calendarDateTimes),
          }
          : event,
      );
      saveTrainingEvents(nextEvents);
      return nextEvents;
    });
  }, [activeTrainingEvent, selectedTrainingDates]);

  const handleBackToTrainingPlan = useCallback(() => {
    syncActiveTrainingCalendarDates();
    setViewMode('training-plan');
    setActiveTrainingEventId(null);
    setSearchKeyword('');
    setAwaitingPaste(false);
    setPracticeExplorerAwaitingPaste(false);
  }, [syncActiveTrainingCalendarDates]);

  const handleMoveTrainingOverviewMonth = useCallback((offset: number) => {
    setTrainingOverviewMonth((previous) => addMonths(previous, offset));
  }, []);

  const handleOpenTrainingOverviewDay = useCallback((dateKey: string) => {
    const firstEvent = getTrainingEventsByDate(trainingEvents)[dateKey]?.[0];
    if (firstEvent) {
      handleOpenTrainingEvent(firstEvent.id);
    }
  }, [handleOpenTrainingEvent, trainingEvents]);

  const handleSelectTrainingDate = useCallback((dateKey: string) => {
    const storedTime = activeTrainingEvent ? getTrainingEventDateTime(activeTrainingEvent, dateKey) : '';
    const { start, end } = splitTrainingTimeRange(storedTime);
    const isExistingDate = selectedTrainingDates.includes(dateKey);
    const nextMode = activeTrainingEvent && isExistingDate
      ? getTrainingEventDateMode(activeTrainingEvent, dateKey)
      : activeTrainingDateMode;
    setActiveTrainingDateKey(dateKey);
    setActiveTrainingDateMode(nextMode);
    setActiveTrainingStartTime(start);
    setActiveTrainingEndTime(end);

    setSelectedTrainingDates((previous) => {
      const nextDates = Array.from(new Set([...previous, dateKey])).sort();

      if (activeTrainingEvent) {
        setTrainingEvents((events) => {
          const nextEvents = events.map((event) => {
            if (event.id !== activeTrainingEvent.id) {
              return event;
            }

            const nextModes = { ...event.calendarDateModes };
            nextModes[dateKey] = nextMode;

            return {
              ...event,
              calendarDates: nextDates,
              calendarDateModes: normalizeTrainingDateModes(nextDates, nextModes),
              calendarDateTimes: normalizeTrainingDateTimes(nextDates, event.calendarDateTimes),
            };
          });
          saveTrainingEvents(nextEvents);
          return nextEvents;
        });
      }

      return nextDates;
    });

    if (activeTrainingEvent) {
      const scheduleKey = getTrainingScheduleKey(activeTrainingEvent.id, dateKey);
      setTrainingSchedules((previous) => {
        if (nextMode === 'self') {
          const next = { ...previous };
          delete next[scheduleKey];
          saveTrainingSchedules(next);
          return next;
        }

        const currentRows = previous[scheduleKey] ?? [];
        const currentTime = getTrainingEventDateTime(activeTrainingEvent, dateKey);

        const nextRow: TrainingScheduleRow = {
          id: currentRows[0]?.id ?? `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          time: currentRows[0]?.time || currentTime,
          topic: currentRows[0]?.topic ?? '',
          teams: currentRows[0]?.teams ?? '',
          coach: currentRows[0]?.coach ?? '',
          target: currentRows[0]?.target ?? '',
          notes: currentRows[0]?.notes ?? '',
        };
        const next = {
          ...previous,
          [scheduleKey]: [nextRow, ...currentRows.slice(1)],
        };
        saveTrainingSchedules(next);
        return next;
      });
    }

    setTrainingOverviewMonth(getMonthKey(dateKey));
    setVisibleTrainingMonth(getMonthKey(dateKey));
  }, [activeTrainingDateMode, activeTrainingEvent, selectedTrainingDates]);

  const handleToggleTrainingDateMode = useCallback(() => {
    const nextMode: TrainingDateMode = activeTrainingDateMode === 'training' ? 'self' : 'training';
    setActiveTrainingDateMode(nextMode);

    if (!activeTrainingEvent || !activeTrainingDateKey || !selectedTrainingDates.includes(activeTrainingDateKey)) {
      return;
    }

    const scheduleKey = getTrainingScheduleKey(activeTrainingEvent.id, activeTrainingDateKey);
    setTrainingEvents((events) => {
      const nextEvents = events.map((event) => {
        if (event.id !== activeTrainingEvent.id) {
          return event;
        }

        return {
          ...event,
          calendarDateModes: normalizeTrainingDateModes(event.calendarDates, {
            ...event.calendarDateModes,
            [activeTrainingDateKey]: nextMode,
          }),
        };
      });
      saveTrainingEvents(nextEvents);
      return nextEvents;
    });

    setTrainingSchedules((previous) => {
      if (nextMode === 'self') {
        const next = { ...previous };
        delete next[scheduleKey];
        saveTrainingSchedules(next);
        return next;
      }

      const currentRows = previous[scheduleKey] ?? [];
      const currentTime = getTrainingEventDateTime(activeTrainingEvent, activeTrainingDateKey);
      const nextRow: TrainingScheduleRow = {
        id: currentRows[0]?.id ?? `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        time: currentRows[0]?.time || currentTime,
        topic: currentRows[0]?.topic ?? '',
        teams: currentRows[0]?.teams ?? '',
        coach: currentRows[0]?.coach ?? '',
        target: currentRows[0]?.target ?? '',
        notes: currentRows[0]?.notes ?? '',
      };
      const next = {
        ...previous,
        [scheduleKey]: [nextRow, ...currentRows.slice(1)],
      };
      saveTrainingSchedules(next);
      return next;
    });
  }, [activeTrainingDateKey, activeTrainingDateMode, activeTrainingEvent, selectedTrainingDates]);

  const handleUpdateActiveTrainingTime = useCallback((field: 'start' | 'end', value: string) => {
    if (!canEdit || !activeTrainingEvent || !activeTrainingDateKey) {
      return;
    }

    const nextStart = field === 'start' ? value : activeTrainingStartTime;
    const nextEnd = field === 'end' ? value : activeTrainingEndTime;
    const nextTime = formatTrainingTimeRange(nextStart, nextEnd);
    const scheduleKey = getTrainingScheduleKey(activeTrainingEvent.id, activeTrainingDateKey);

    if (field === 'start') {
      setActiveTrainingStartTime(value);
    } else {
      setActiveTrainingEndTime(value);
    }

    setTrainingEvents((events) => {
      const nextEvents = events.map((event) => {
        if (event.id !== activeTrainingEvent.id) {
          return event;
        }

        const nextDates = Array.from(new Set([...event.calendarDates, activeTrainingDateKey])).sort();
        const nextTimes = { ...event.calendarDateTimes };
        if (nextTime) {
          nextTimes[activeTrainingDateKey] = nextTime;
        } else {
          delete nextTimes[activeTrainingDateKey];
        }

        return {
          ...event,
          calendarDates: nextDates,
          calendarDateModes: normalizeTrainingDateModes(nextDates, event.calendarDateModes),
          calendarDateTimes: normalizeTrainingDateTimes(nextDates, nextTimes),
        };
      });
      saveTrainingEvents(nextEvents);
      return nextEvents;
    });

    setSelectedTrainingDates((previous) =>
      previous.includes(activeTrainingDateKey) ? previous : [...previous, activeTrainingDateKey].sort(),
    );
    setTrainingSchedules((previous) => {
      if (activeTrainingDateMode === 'self') {
        const next = { ...previous };
        delete next[scheduleKey];
        saveTrainingSchedules(next);
        return next;
      }

      const currentRows = previous[scheduleKey] ?? [];
      const nextRow: TrainingScheduleRow = {
        id: currentRows[0]?.id ?? `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        time: nextTime,
        topic: currentRows[0]?.topic ?? '',
        teams: currentRows[0]?.teams ?? '',
        coach: currentRows[0]?.coach ?? '',
        target: currentRows[0]?.target ?? '',
        notes: currentRows[0]?.notes ?? '',
      };
      const next = {
        ...previous,
        [scheduleKey]: [nextRow, ...currentRows.slice(1)],
      };
      saveTrainingSchedules(next);
      return next;
    });
  }, [activeTrainingDateKey, activeTrainingEndTime, activeTrainingEvent, activeTrainingStartTime, canEdit]);

  const handleClearActiveTrainingDate = useCallback(() => {
    if (!canEdit || !activeTrainingEvent || !activeTrainingDateKey) {
      return;
    }

    const scheduleKey = getTrainingScheduleKey(activeTrainingEvent.id, activeTrainingDateKey);
    setSelectedTrainingDates((previous) => previous.filter((dateKey) => dateKey !== activeTrainingDateKey));
    setTrainingEvents((events) => {
      const nextEvents = events.map((event) => {
        if (event.id !== activeTrainingEvent.id) {
          return event;
        }

        const nextDates = event.calendarDates.filter((dateKey) => dateKey !== activeTrainingDateKey);
        const nextModes = { ...event.calendarDateModes };
        const nextTimes = { ...event.calendarDateTimes };
        delete nextModes[activeTrainingDateKey];
        delete nextTimes[activeTrainingDateKey];

        return {
          ...event,
          calendarDates: nextDates,
          calendarDateModes: normalizeTrainingDateModes(nextDates, nextModes),
          calendarDateTimes: normalizeTrainingDateTimes(nextDates, nextTimes),
        };
      });
      saveTrainingEvents(nextEvents);
      return nextEvents;
    });
    setTrainingSchedules((previous) => {
      const next = { ...previous };
      delete next[scheduleKey];
      saveTrainingSchedules(next);
      return next;
    });
    setActiveTrainingDateKey(null);
    setActiveTrainingStartTime('');
    setActiveTrainingEndTime('');
  }, [activeTrainingDateKey, activeTrainingEvent, canEdit]);

  const handleMoveTrainingMonth = useCallback((offset: number) => {
    setVisibleTrainingMonth((previous) => addMonths(previous, offset));
  }, []);

  const handleExportTrainingCalendarImage = useCallback(async () => {
    if (!activeTrainingEvent) {
      return;
    }

    try {
      const monthDays = getCalendarDays(visibleTrainingMonth);
      const rows = Math.ceil(monthDays.length / 7);
      const width = 1600;
      const margin = 72;
      const headerHeight = 190;
      const weekdayHeight = 52;
      const gap = 14;
      const gridWidth = width - margin * 2;
      const cellWidth = (gridWidth - gap * 6) / 7;
      const cellHeight = 150;
      const height = margin + headerHeight + weekdayHeight + rows * cellHeight + (rows - 1) * gap + margin;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('当前浏览器无法生成图片。');
      }

      const background = context.createLinearGradient(0, 0, width, height);
      background.addColorStop(0, '#151e28');
      background.addColorStop(0.52, '#090d13');
      background.addColorStop(1, '#040609');
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);

      context.fillStyle = 'rgba(0, 200, 255, 0.12)';
      context.beginPath();
      context.arc(width * 0.18, 80, 280, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(242, 56, 69, 0.12)';
      context.beginPath();
      context.arc(width * 0.88, 120, 240, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = '#ffffff';
      context.font = '700 46px Georgia, "Times New Roman", serif';
      context.fillText(activeTrainingEvent.name, margin, margin + 22);
      context.fillStyle = '#c9d4de';
      context.font = '700 24px Georgia, "Times New Roman", serif';
      context.fillText(`${activeTrainingEvent.group || '未填写赛项'} · ${formatMonthLabel(visibleTrainingMonth)}`, margin, margin + 70);
      context.fillStyle = '#7f91a3';
      context.font = '600 20px Georgia, "Times New Roman", serif';
      context.fillText(`地点：${activeTrainingEvent.venue || '未填写'}    教练：${activeTrainingEvent.coach || '未填写'}`, margin, margin + 112);

      const legendX = width - margin - 330;
      drawRoundedRect(context, legendX, margin + 8, 330, 58, 18);
      context.fillStyle = 'rgba(8, 12, 18, 0.68)';
      context.fill();
      context.strokeStyle = 'rgba(214, 182, 95, 0.72)';
      context.lineWidth = 2;
      context.stroke();
      context.fillStyle = '#ffe8a8';
      context.font = '800 20px Georgia, "Times New Roman", serif';
      context.fillText('金边 = 已选择 / 有安排', legendX + 24, margin + 45);

      const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
      const weekdayY = margin + headerHeight;
      context.font = '900 22px Georgia, "Times New Roman", serif';
      context.textAlign = 'center';
      weekdays.forEach((weekday, index) => {
        const x = margin + index * (cellWidth + gap) + cellWidth / 2;
        context.fillStyle = '#7f91a3';
        context.fillText(weekday, x, weekdayY);
      });

      monthDays.forEach((day, index) => {
        const row = Math.floor(index / 7);
        const column = index % 7;
        const x = margin + column * (cellWidth + gap);
        const y = margin + headerHeight + weekdayHeight + row * (cellHeight + gap);
        const isSelected = selectedTrainingDates.includes(day.dateKey);
        const scheduleRows = isSelected
          ? trainingSchedules[getTrainingScheduleKey(activeTrainingEvent.id, day.dateKey)] ?? []
          : [];
        const dateMode = getTrainingEventDateMode(activeTrainingEvent, day.dateKey);
        const modeLabel = getTrainingDateModeLabel(dateMode);
        const dateTime = isSelected ? getTrainingEventDateTime(activeTrainingEvent, day.dateKey) : '';

        drawRoundedRect(context, x, y, cellWidth, cellHeight, 24);
        context.fillStyle = day.isCurrentMonth ? 'rgba(8, 12, 18, 0.82)' : 'rgba(8, 12, 18, 0.46)';
        context.fill();
        context.strokeStyle = isSelected ? '#d6b65f' : 'rgba(217, 226, 236, 0.14)';
        context.lineWidth = isSelected ? 4 : 1.5;
        context.stroke();

        context.textAlign = 'left';
        context.fillStyle = day.isCurrentMonth ? '#ffffff' : '#7f91a3';
        context.font = '900 30px Georgia, "Times New Roman", serif';
        context.fillText(String(day.day), x + 20, y + 42);

        if (isSelected) {
          drawRoundedRect(context, x + cellWidth - 104, y + 18, 80, 28, 14);
          context.fillStyle = dateMode === 'self'
            ? 'rgba(0, 245, 255, 0.18)'
            : 'rgba(214, 182, 95, 0.18)';
          context.fill();
          context.fillStyle = '#ffe8a8';
          context.font = '900 15px Georgia, "Times New Roman", serif';
          context.textAlign = 'center';
          context.fillText(modeLabel, x + cellWidth - 64, y + 38);
        }

        const firstRow = scheduleRows[0];
        if (firstRow) {
          context.textAlign = 'left';
          context.fillStyle = '#c9d4de';
          context.font = '700 17px Georgia, "Times New Roman", serif';
          const summary = [dateTime || firstRow.time, firstRow.topic].filter(Boolean).join('  ');
          drawWrappedCanvasText(context, summary || '已安排训练', x + 20, y + 82, cellWidth - 40, 23, 2);
        } else if (isSelected) {
          context.fillStyle = '#ffe8a8';
          context.font = '800 17px Georgia, "Times New Roman", serif';
          context.fillText(modeLabel, x + 20, y + 82);
          if (dateTime) {
            context.fillStyle = '#bdfcff';
            context.font = '800 16px Georgia, "Times New Roman", serif';
            context.fillText(dateTime, x + 20, y + 108);
          }
        }
      });

      context.textAlign = 'left';
      context.fillStyle = '#7f91a3';
      context.font = '600 18px Georgia, "Times New Roman", serif';
      context.fillText(`导出时间：${new Date().toLocaleString('zh-CN')}`, margin, height - 36);

      const blob = await canvasToPngBlob(canvas);
      const fileName = `${sanitizeFileNamePart(activeTrainingEvent.name)}-${visibleTrainingMonth}-集训日历.png`;
      const file = new File([blob], fileName, { type: 'image/png' });
      const shareData: ShareData = {
        files: [file],
        title: `${activeTrainingEvent.name} 集训日历`,
        text: `${activeTrainingEvent.name} ${formatMonthLabel(visibleTrainingMonth)} 集训日历`,
      };

      if (navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
        showNotification('已打开系统分享。', 'success');
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showNotification('已导出集训日历图片。', 'success');
    } catch (error) {
      showNotification(error instanceof Error ? error.message : '导出图片失败，请重试。', 'error');
    }
  }, [activeTrainingEvent, selectedTrainingDates, showNotification, trainingSchedules, visibleTrainingMonth]);

  const handleUpdateActiveTrainingCoach = useCallback((value: string) => {
    if (!canEdit || !activeTrainingEvent) {
      return;
    }

    setTrainingEvents((previous) => {
      const next = previous.map((event) =>
        event.id === activeTrainingEvent.id ? { ...event, coach: value } : event,
      );
      saveTrainingEvents(next);
      return next;
    });
  }, [activeTrainingEvent, canEdit]);

  const handleUpdateTrainingScheduleRow = useCallback(
    (dateKey: string, rowId: string, field: keyof Omit<TrainingScheduleRow, 'id'>, value: string) => {
      if (!canEdit || !activeTrainingEvent) {
        return;
      }

      const scheduleKey = getTrainingScheduleKey(activeTrainingEvent.id, dateKey);
      setTrainingSchedules((previous) => {
        const currentRows = previous[scheduleKey] ?? [{
          id: rowId,
          time: '',
          topic: '',
          teams: '',
          coach: '',
          target: '',
          notes: '',
        }];
        const next = {
          ...previous,
          [scheduleKey]: currentRows.map((row) =>
            row.id === rowId ? { ...row, [field]: value } : row,
          ),
        };
        saveTrainingSchedules(next);
        return next;
      });

      if (field === 'time') {
        setTrainingEvents((events) => {
          const nextEvents = events.map((event) => {
            if (event.id !== activeTrainingEvent.id) {
              return event;
            }

            const nextTimes = { ...event.calendarDateTimes };
            const trimmedValue = value.trim();
            if (trimmedValue) {
              nextTimes[dateKey] = trimmedValue;
            } else {
              delete nextTimes[dateKey];
            }

            return {
              ...event,
              calendarDateTimes: normalizeTrainingDateTimes(event.calendarDates, nextTimes),
            };
          });
          saveTrainingEvents(nextEvents);
          return nextEvents;
        });
      }
    },
    [activeTrainingEvent, canEdit],
  );

  const handleOpenPracticeAnalysis = useCallback(() => {
    setViewMode('practice-analysis');
    setActiveCompetitionId(null);
    setSearchKeyword('');
    setAwaitingPaste(false);
    setPracticeExplorerAwaitingPaste(false);
  }, []);

  const handleOpenPracticeExplorer = useCallback(() => {
    setViewMode('practice-explorer');
    setActiveCompetitionId(null);
    setSortField('totalWinLossScore');
    setSortOrder('desc');
    setSearchKeyword('');
    setAwaitingPaste(false);
    setPracticeExplorerAwaitingPaste(false);
  }, []);

  const handleBackToPracticeAnalysis = useCallback(() => {
    setViewMode('practice-analysis');
    setSearchKeyword('');
    setPracticeExplorerAwaitingPaste(false);
  }, []);

  const handleBackToHome = useCallback(() => {
    setViewMode('home');
    setActiveCompetitionId(null);
    setActiveTrainingEventId(null);
    setSearchKeyword('');
    setAwaitingPaste(false);
    setPracticeExplorerAwaitingPaste(false);
  }, []);

  const handleDeleteCompetition = useCallback(
    (id: string) => {
      if (!canDeleteCompetition) {
        showNotification('当前账号没有删除赛事卡片的权限。', 'error');
        return;
      }

      const competition = competitions.find((item) => item.id === id);
      setCompetitions((previous) => previous.filter((item) => item.id !== id));
      void removeCompetitionFromCloud(id);

      if (activeCompetitionId === id) {
        setActiveCompetitionId(null);
        setViewMode('lobby');
      }

      showNotification(
        competition ? `已删除比赛卡片：${competition.name}` : '比赛卡片已删除。',
        'info',
      );
    },
    [activeCompetitionId, canDeleteCompetition, competitions, removeCompetitionFromCloud, showNotification],
  );

  const parseAndApplyTable = useCallback(
    (text: string, successMessage?: string) => {
      if (!activeCompetition) {
        showNotification('请先从赛事大厅进入一个比赛。', 'error');
        return;
      }

      if (!text.trim()) {
        showNotification('请先复制或粘贴比赛表格，再点击“读取并解析剪贴板”。', 'error');
        return;
      }

      const normalizedText = text.trim();
      const currentCompetitionHasData =
        activeCompetition.sourceText.trim().length > 0 || activeCompetition.teamsData.length > 0;
      const duplicateCompetition = competitions.find((competition) => {
        if (competition.id === activeCompetition.id) {
          return false;
        }

        if (competition.eventType !== activeCompetition.eventType) {
          return false;
        }

        return competition.sourceText.trim() === normalizedText;
      });

      if (!currentCompetitionHasData && duplicateCompetition) {
        const shouldReuse = window.confirm(
          `检测到这份导入内容与《${duplicateCompetition.name}》完全一致。是否仍然导入到《${activeCompetition.name}》？`,
        );

        if (!shouldReuse) {
          showNotification('已取消导入，请重新复制当前比赛的表格后再试。', 'info');
          return;
        }
      }

      try {
        const parsed = parseTableData(text, activeCompetition.eventType);

        if (parsed.length === 0) {
          showNotification('没有识别到有效表格数据，请确认复制的是完整比赛表格。', 'error');
          return;
        }

        const lastUpdate = formatTime();
        updateActiveCompetition((competition) => ({
          ...competition,
          sourceText: text,
          teamsData: parsed,
          lastUpdate,
          updatedAt: new Date().toISOString(),
        }));

        showNotification(
          successMessage ?? `成功解析 ${parsed.length} 支队伍的数据，已写入 ${activeCompetition.name}。`,
          'success',
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误';
        showNotification(`数据解析失败：${message}`, 'error');
      }
    },
    [activeCompetition, competitions, showNotification, updateActiveCompetition],
  );

  const handleSourceTextChange = useCallback(
    (text: string) => {
      if (!canEdit) {
        return;
      }

      if (awaitingPaste && text.trim()) {
        setAwaitingPaste(false);
      }

      updateActiveCompetition((competition) => ({
        ...competition,
        sourceText: text,
        updatedAt: new Date().toISOString(),
      }));
    },
    [awaitingPaste, canEdit, updateActiveCompetition],
  );

  useEffect(() => {
    if (!awaitingPaste || !activeCompetition || activeTab !== 'ranking') {
      return;
    }

    const handlePasteCapture = (event: ClipboardEvent) => {
      const pastedText = event.clipboardData?.getData('text')?.trim() ?? '';
      if (!pastedText) {
        return;
      }

      if (pasteAreaRef.current) {
        pasteAreaRef.current.value = pastedText;
      }

      updateActiveCompetition((competition) => ({
        ...competition,
        sourceText: pastedText,
        updatedAt: new Date().toISOString(),
      }));
      setAwaitingPaste(false);
      parseAndApplyTable(pastedText, `已捕获剪贴板内容并更新 ${activeCompetition.name}。`);
    };

    window.addEventListener('paste', handlePasteCapture);
    return () => {
      window.removeEventListener('paste', handlePasteCapture);
    };
  }, [activeCompetition, activeTab, awaitingPaste, parseAndApplyTable, updateActiveCompetition]);

  const handleAutoRefresh = useCallback(() => {
    if (!activeCompetition || activeCompetition.teamsData.length === 0) {
      return;
    }

    updateActiveCompetition((competition) => ({
      ...competition,
      lastUpdate: formatTime(),
      updatedAt: new Date().toISOString(),
    }));
  }, [activeCompetition, updateActiveCompetition]);

  const autoRefresh = useAutoRefresh(handleAutoRefresh);

  const handleClearCompetitionData = useCallback(() => {
    if (!ensureEditorAccess()) {
      return;
    }

    if (!activeCompetition) {
      showNotification('请先从赛事大厅进入一个比赛。', 'error');
      return;
    }

    const hasData = activeCompetition.sourceText.trim() || activeCompetition.teamsData.length > 0;
    if (!hasData) {
      showNotification('当前比赛已经是空数据状态。', 'info');
      return;
    }

    const shouldClear = window.confirm(`确认清空 ${activeCompetition.name} 的导入内容和排名数据吗？`);
    if (!shouldClear) {
      return;
    }

    updateActiveCompetition((competition) => ({
      ...competition,
      sourceText: '',
      teamsData: [],
      lastUpdate: '',
      updatedAt: new Date().toISOString(),
    }));
    setAwaitingPaste(false);
    setSearchKeyword('');
    autoRefresh.setEnabled(false);
    showNotification(`已清空 ${activeCompetition.name} 的导入数据。`, 'success');
  }, [activeCompetition, autoRefresh, ensureEditorAccess, showNotification, updateActiveCompetition]);

  const handleParseClipboard = useCallback(async () => {
    if (!ensureEditorAccess()) {
      return;
    }

    if (!activeCompetition) {
      showNotification('请先从赛事大厅进入一个比赛。', 'error');
      return;
    }

    const inputText = (pasteAreaRef.current?.value ?? activeCompetition.sourceText ?? '').trim();
    let clipboardText = '';
    let clipboardError = '';

    if (navigator.clipboard?.readText) {
      try {
        clipboardText = (await navigator.clipboard.readText()).trim();
      } catch (error) {
        clipboardError = error instanceof Error ? error.message : '当前浏览器拒绝读取系统剪贴板';
      }
    }

    const finalText = clipboardText || inputText;

    if (!finalText) {
      pasteAreaRef.current?.focus();
      setAwaitingPaste(true);
      showNotification(
        clipboardError
          ? `当前环境未能直接读取系统剪贴板，请现在按 Ctrl+V，系统会自动导入。原因：${clipboardError}`
          : '剪贴板为空，请先复制比赛表格；如果浏览器拦截读取，请现在按 Ctrl+V，系统会自动导入。',
        'error',
      );
      return;
    }

    if (clipboardText) {
      setAwaitingPaste(false);
      updateActiveCompetition((competition) => ({
        ...competition,
        sourceText: clipboardText,
        updatedAt: new Date().toISOString(),
      }));
      parseAndApplyTable(clipboardText, `已从系统剪贴板读取并解析 ${activeCompetition.name}。`);
      return;
    }

    setAwaitingPaste(false);
    parseAndApplyTable(
      finalText,
      clipboardError
        ? `系统剪贴板读取受限，已改为解析输入框中的内容并更新 ${activeCompetition.name}。`
        : `已解析输入框中的内容并更新 ${activeCompetition.name}。`,
    );
  }, [activeCompetition, ensureEditorAccess, parseAndApplyTable, showNotification, updateActiveCompetition]);

  const parseAndApplyPracticeExplorerTable = useCallback(
    (text: string, successMessage?: string) => {
      if (!canEdit) {
        showNotification('当前账号没有编辑权限。', 'error');
        return;
      }

      const normalizedText = text.trim();
      if (!normalizedText) {
        showNotification('请先复制或粘贴练习赛表格，再点击读取解析。', 'error');
        return;
      }

      try {
        const parsed = parsePracticeExplorerData(normalizedText);
        if (parsed.rows.length === 0 || parsed.teamsData.length === 0) {
          showNotification('没有识别到有效的 Explorer 练习赛数据，请检查表格是否完整。', 'error');
          return;
        }

        const nextState: PracticeExplorerState = {
          sourceText: normalizedText,
          teamsData: parsed.teamsData,
          rows: parsed.rows,
          lastUpdate: formatTime(),
        };

        setPracticeExplorer(nextState);
        savePracticeExplorerState(nextState);
        setPracticeExplorerAwaitingPaste(false);
        setSortField('totalWinLossScore');
        setSortOrder('desc');
        showNotification(
          successMessage ?? `成功解析 ${parsed.teamsData.length} 支队伍、${parsed.rows.length} 场练习数据。`,
          'success',
        );
      } catch (error) {
        console.error('Practice Explorer parse failed:', error);
        showNotification('解析失败，请确认复制的是 Explorer 比赛表格。', 'error');
      }
    },
    [canEdit, showNotification],
  );

  const handlePracticeExplorerTextChange = useCallback(
    (text: string) => {
      if (!canEdit) {
        return;
      }

      setPracticeExplorer((previous) => {
        const nextState = { ...previous, sourceText: text };
        savePracticeExplorerState(nextState);
        return nextState;
      });
    },
    [canEdit],
  );

  const handleClearPracticeExplorerData = useCallback(() => {
    if (!canEdit) {
      showNotification('当前账号没有编辑权限。', 'error');
      return;
    }

    const hasData = practiceExplorer.sourceText.trim() || practiceExplorer.teamsData.length > 0;
    if (!hasData) {
      showNotification('当前练习赛数据已经是空的。', 'info');
      return;
    }

    const shouldClear = window.confirm('确认清空 MakeX Explorer 练习赛导入内容和排名数据吗？');
    if (!shouldClear) {
      return;
    }

    const nextState: PracticeExplorerState = { sourceText: '', teamsData: [], rows: [], lastUpdate: '' };
    setPracticeExplorer(nextState);
    savePracticeExplorerState(nextState);
    setPracticeExplorerAwaitingPaste(false);
    setSearchKeyword('');
    showNotification('已清空 MakeX Explorer 练习赛数据。', 'success');
  }, [canEdit, practiceExplorer, showNotification]);

  const handlePracticeExplorerRefresh = useCallback(() => {
    if (!canEdit) {
      showNotification('当前账号没有编辑权限。', 'error');
      return;
    }

    if (practiceExplorer.teamsData.length === 0) {
      showNotification('当前还没有可刷新的练习赛排名数据。', 'error');
      return;
    }

    setPracticeExplorer((previous) => {
      const nextState = { ...previous, lastUpdate: formatTime() };
      savePracticeExplorerState(nextState);
      return nextState;
    });
    showNotification('练习赛排名已刷新。', 'success');
  }, [canEdit, practiceExplorer.teamsData.length, showNotification]);

  const handleParsePracticeExplorerClipboard = useCallback(async () => {
    if (!canEdit) {
      showNotification('当前账号没有编辑权限。', 'error');
      return;
    }

    let clipboardText = '';
    let clipboardError = '';

    if (navigator.clipboard?.readText) {
      try {
        clipboardText = (await navigator.clipboard.readText()).trim();
      } catch (error) {
        clipboardError = error instanceof Error ? error.message : '浏览器阻止读取剪贴板';
      }
    }

    const inputText = (practiceExplorerPasteAreaRef.current?.value ?? practiceExplorer.sourceText ?? '').trim();
    const finalText = clipboardText || inputText;

    if (!finalText) {
      practiceExplorerPasteAreaRef.current?.focus();
      setPracticeExplorerAwaitingPaste(true);
      showNotification(
        clipboardError
          ? `当前环境未能直接读取系统剪贴板，请现在按 Ctrl+V，系统会自动导入。原因：${clipboardError}`
          : '剪贴板为空，请先复制 Explorer 练习赛表格；如果浏览器拦截读取，请现在按 Ctrl+V，系统会自动导入。',
        'error',
      );
      return;
    }

    parseAndApplyPracticeExplorerTable(
      finalText,
      clipboardText ? '已从系统剪贴板读取并解析 Explorer 练习赛数据。' : '已解析输入框中的 Explorer 练习赛数据。',
    );
  }, [canEdit, parseAndApplyPracticeExplorerTable, practiceExplorer.sourceText, showNotification]);

  useEffect(() => {
    if (!practiceExplorerAwaitingPaste || viewMode !== 'practice-explorer') {
      return;
    }

    const handlePracticeExplorerPaste = (event: ClipboardEvent) => {
      const pastedText = event.clipboardData?.getData('text')?.trim() ?? '';
      if (!pastedText) {
        return;
      }

      if (practiceExplorerPasteAreaRef.current) {
        practiceExplorerPasteAreaRef.current.value = pastedText;
      }

      parseAndApplyPracticeExplorerTable(pastedText, '已捕获剪贴板内容并更新 Explorer 练习赛数据。');
    };

    window.addEventListener('paste', handlePracticeExplorerPaste);
    return () => {
      window.removeEventListener('paste', handlePracticeExplorerPaste);
    };
  }, [parseAndApplyPracticeExplorerTable, practiceExplorerAwaitingPaste, viewMode]);

  const handleRefresh = useCallback(() => {
    if (!ensureEditorAccess()) {
      return;
    }

    if (!activeCompetition || activeCompetition.teamsData.length === 0) {
      showNotification('当前还没有可刷新的排名数据。', 'error');
      return;
    }

    updateActiveCompetition((competition) => ({
      ...competition,
      lastUpdate: formatTime(),
      updatedAt: new Date().toISOString(),
    }));
    showNotification('当前排名已刷新。', 'success');
  }, [activeCompetition, ensureEditorAccess, showNotification, updateActiveCompetition]);

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortOrder((previous) => (previous === 'desc' ? 'asc' : 'desc'));
        return;
      }

      setSortField(field);
      setSortOrder(field.includes('TimeSeconds') ? 'asc' : 'desc');
    },
    [sortField],
  );

  const handleSetTeamTag = useCallback((teamNumber: string, teamName: string, tag: string) => {
    const key = getTeamTagKey(teamNumber, teamName);

    setTeamTags((previous) => {
      const next = { ...previous };

      if (tag) {
        next[key] = tag;
      } else {
        delete next[key];
      }

      saveTeamTags(next);
      return next;
    });
  }, []);

  const handleAddTeamTagOption = useCallback((tag: string) => {
    const trimmed = tag.trim();

    if (!trimmed) {
      showNotification('请输入要新增的标签名称。', 'error');
      return;
    }

    setTeamTagOptions((previous) => {
      if (previous.includes(trimmed)) {
        showNotification(`标签「${trimmed}」已经存在。`, 'info');
        return previous;
      }

      const next = [...previous, trimmed];
      saveTeamTagOptions(next);
      showNotification(`已新增标签：${trimmed}`, 'success');
      return next;
    });
  }, [showNotification]);

  const handleAutoRefreshToggle = useCallback(
    (enabled: boolean) => {
      if (enabled && !ensureEditorAccess()) {
        return;
      }

      if (enabled && (!activeCompetition || activeCompetition.teamsData.length === 0)) {
        showNotification('请先解析一份数据，再开启自动刷新。', 'error');
        return;
      }

      autoRefresh.setEnabled(enabled);
      showNotification(
        enabled
          ? `自动刷新已开启，仅刷新当前赛事视图（每 ${autoRefresh.interval} 秒）。`
          : '自动刷新已关闭。',
        enabled ? 'success' : 'info',
      );
    },
    [activeCompetition, autoRefresh, ensureEditorAccess, showNotification],
  );

  const accountAction = (
    <div className={styles.accountActions}>
      {authEnabled ? (
        <>
          {authReady && authUser ? (
            <div className={styles.accountChip}>
              <strong>{authUser.displayName}</strong>
              <span>{authUser.role}</span>
            </div>
          ) : (
            <div className={styles.accountChip}>
              <strong>{authReady ? '未登录' : '账号恢复中'}</strong>
              <span>{authReady ? 'viewer mode' : 'syncing'}</span>
            </div>
          )}
          <button
            className={styles.accountButton}
            onClick={() => {
              if (authUser) {
                setAuthPanelOpen(true);
                return;
              }

              setViewMode('login');
              setAuthPanelOpen(true);
            }}
          >
            {authUser ? '账号管理' : '登录'}
          </button>
        </>
      ) : null}
    </div>
  );

  return (
    <div className={styles.app}>
      <div className={styles.container}>
        {viewMode === 'home' || viewMode === 'login' ? (
          <>
            <Header
              eyebrow="Operations Hub"
              title="赛事管理中心"
              subtitle="先在首页登录，再根据工作内容进入对应入口。当前已提供赛事后勤管理、赛事数据分析、练习赛数据分析与集训安排入口。"
              action={
                <div className={styles.headerActions}>
                  <button className={styles.backButton} onClick={handleBackToHome}>
                    返回首页
                  </button>
                  {accountAction}
                </div>
              }
            />

            <section className={styles.portalSection}>
              <div className={styles.portalIntro}>
                <p className={styles.portalEyebrow}>Home</p>
                <h2>选择工作入口</h2>
                <p className={styles.portalHint}>
                  主页负责统一登录和功能分流。进入赛事数据分析后，才会继续选择赛项、创建比赛卡片并做排名与淘汰赛分析。
                </p>
              </div>

              <div className={styles.portalGrid}>
                <article className={styles.portalCard}>
                  <div className={styles.portalCardTop}>
                    <div>
                      <p className={styles.portalCardLabel}>入口一</p>
                      <h3>赛事后勤管理</h3>
                    </div>
                    <span className={styles.portalBadge}>Logistics</span>
                  </div>
                  <p className={styles.portalCardText}>
                    用于后勤协同、物资记录、人员安排与现场事务管理。当前先提供独立入口页，后续可继续扩展成完整后勤系统。
                  </p>
                  <button className={styles.portalButton} onClick={handleOpenLogistics}>
                    进入赛事后勤管理
                  </button>
                </article>

                <article className={styles.portalCard}>
                  <div className={styles.portalCardTop}>
                    <div>
                      <p className={styles.portalCardLabel}>入口二</p>
                      <h3>赛事数据分析</h3>
                    </div>
                    <span className={styles.portalBadge}>Analytics</span>
                  </div>
                  <p className={styles.portalCardText}>
                    进入赛项选择、赛事大厅、比赛详情与排名分析工作台，继续完成表格导入、EPA 排名、淘汰赛预测等操作。
                  </p>
                  <button className={styles.portalButton} onClick={handleOpenDataAnalysis}>
                    进入赛事数据分析
                  </button>
                </article>

                <article className={styles.portalCard}>
                  <div className={styles.portalCardTop}>
                    <div>
                      <p className={styles.portalCardLabel}>入口三</p>
                      <h3>练习赛数据分析</h3>
                    </div>
                    <span className={styles.portalBadge}>Practice</span>
                  </div>
                  <p className={styles.portalCardText}>
                    面向训练日、队内练习赛和模拟赛的数据整理入口。后续可独立加入练习赛成绩导入、单队成长追踪、训练对阵记录与复盘分析。
                  </p>
                  <button className={styles.portalButton} onClick={handleOpenPracticeAnalysis}>
                    进入练习赛数据分析
                  </button>
                </article>

                <article className={styles.portalCard}>
                  <div className={styles.portalCardTop}>
                    <div>
                      <p className={styles.portalCardLabel}>入口四</p>
                      <h3>集训安排</h3>
                    </div>
                    <span className={styles.portalBadge}>Training</span>
                  </div>
                  <p className={styles.portalCardText}>
                    用于集中训练期间的日程规划、队伍分组、训练任务、教练分工与复盘安排。当前先建立独立入口，后续可继续扩展成完整集训看板。
                  </p>
                  <button className={styles.portalButton} onClick={handleOpenTrainingPlan}>
                    进入集训安排
                  </button>
                </article>
              </div>
            </section>

            <Footer lastUpdate="" isLobby storageMode={storageMode} />
          </>
        ) : viewMode === 'event-types' ? (
          <>
            <Header
              eyebrow="Event Selection"
              title="赛项选择"
              subtitle="先选赛项，再进入对应的二级赛事大厅。每个赛项都会独立保存自己的比赛卡片和数据。"
              action={accountAction}
            />

            <EventTypeSelector
              competitionCounts={competitionCounts}
              onSelect={handleSelectEventType}
              visibleEventTypes={accessibleEventTypes}
            />

            <Footer lastUpdate="" isLobby storageMode={storageMode} />
          </>
        ) : viewMode === 'logistics' ? (
          <>
            <Header
              eyebrow="Logistics Workspace"
              title="赛事后勤管理"
              subtitle="这里是后勤管理的独立二级页面。当前先保留统一入口，后续可以继续扩展为物资、人员、日程与现场支持管理。"
              action={
                <div className={styles.headerActions}>
                  <button className={styles.backButton} onClick={handleBackToHome}>
                    返回首页
                  </button>
                  {accountAction}
                </div>
              }
            />

            <section className={styles.portalSection}>
              <div className={styles.portalIntro}>
                <p className={styles.portalEyebrow}>Logistics</p>
                <h2>后勤管理工作台</h2>
                <p className={styles.portalHint}>
                  这个入口已经独立出来，后面你可以继续往里接物资清单、人员分工、场地布置、签到流程或任务排班功能。
                </p>
              </div>

              <article className={styles.logisticsFormPanel}>
                <div className={styles.portalCardTop}>
                  <div>
                    <p className={styles.portalCardLabel}>卡片 1</p>
                    <h3>赛事信息输入</h3>
                  </div>
                  <span className={styles.portalBadge}>Event Info</span>
                </div>

                <div className={styles.logisticsFormGrid}>
                  <label className={styles.logisticsField}>
                    <span>赛事名称</span>
                    <input
                      value={logisticsEventForm.name}
                      onChange={(event) => handleLogisticsFormChange('name', event.target.value)}
                      placeholder="例如：0530 山东 WRCT 初中组"
                      disabled={!canEdit}
                    />
                  </label>
                  <label className={styles.logisticsField}>
                    <span>赛事日期</span>
                    <input
                      type="date"
                      value={logisticsEventForm.date}
                      onChange={(event) => handleLogisticsFormChange('date', event.target.value)}
                      disabled={!canEdit}
                    />
                  </label>
                  <label className={styles.logisticsField}>
                    <span>地点 / 场馆</span>
                    <input
                      value={logisticsEventForm.venue}
                      onChange={(event) => handleLogisticsFormChange('venue', event.target.value)}
                      placeholder="例如：主赛场 A 区"
                      disabled={!canEdit}
                    />
                  </label>
                  <label className={styles.logisticsField}>
                    <span>组别 / 赛项</span>
                    <input
                      value={logisticsEventForm.group}
                      onChange={(event) => handleLogisticsFormChange('group', event.target.value)}
                      placeholder="例如：Explorer 初中组"
                      disabled={!canEdit}
                    />
                  </label>
                  <label className={`${styles.logisticsField} ${styles.logisticsWideField}`}>
                    <span>备注</span>
                    <textarea
                      value={logisticsEventForm.notes}
                      onChange={(event) => handleLogisticsFormChange('notes', event.target.value)}
                      placeholder="可以记录联系人、物资提醒、签到安排等后勤信息"
                      disabled={!canEdit}
                    />
                  </label>
                </div>

                <button className={styles.portalButton} onClick={handleCreateLogisticsEvent} disabled={!canEdit}>
                  生成赛事卡片
                </button>
              </article>

              <div className={styles.logisticsCards}>
                {logisticsEvents.length === 0 ? (
                  <div className={styles.logisticsEmpty}>
                    还没有后勤赛事卡片。先填写上方赛事信息，再点击“生成赛事卡片”。
                  </div>
                ) : (
                  logisticsEvents.map((event) => (
                    <article key={event.id} className={styles.logisticsEventCard}>
                      <div className={styles.portalCardTop}>
                        <div>
                          <p className={styles.portalCardLabel}>赛事卡片</p>
                          <h3>{event.name}</h3>
                        </div>
                        <span className={styles.portalBadge}>{event.date || '未定日期'}</span>
                      </div>
                      <div className={styles.logisticsMeta}>
                        <span>地点：{event.venue || '未填写'}</span>
                        <span>组别：{event.group || '未填写'}</span>
                        <span>创建：{new Date(event.createdAt).toLocaleDateString('zh-CN')}</span>
                      </div>
                      {event.notes && <p className={styles.portalCardText}>{event.notes}</p>}
                      <button className={styles.dangerButton} onClick={() => handleDeleteLogisticsEvent(event.id)}>
                        删除卡片
                      </button>
                    </article>
                  ))
                )}
              </div>
            </section>

            <Footer lastUpdate="" isLobby storageMode={storageMode} />
          </>
        ) : viewMode === 'training-plan' ? (
          <>
            <Header
              eyebrow="Training Schedule"
              title="集训安排"
              subtitle="这里是集训安排的独立二级页面。后续可以接入训练日程、队伍分组、任务清单、教练安排和复盘记录。"
              action={
                <div className={styles.headerActions}>
                  <button className={styles.backButton} onClick={handleBackToHome}>
                    返回首页
                  </button>
                  {accountAction}
                </div>
              }
            />

            <section className={styles.portalSection}>
              <div className={styles.portalIntro}>
                <p className={styles.portalEyebrow}>Training Camp</p>
                <h2>集训安排工作台</h2>
                <p className={styles.portalHint}>
                  这个入口已经独立出来，可以作为后续集训排期和训练执行的总控页面。下一步可以加入每日训练计划、队伍分组、任务目标、签到状态和复盘记录。
                </p>
              </div>

              <article className={styles.logisticsFormPanel}>
                <div className={styles.portalCardTop}>
                  <div>
                    <p className={styles.portalCardLabel}>卡片 1</p>
                    <h3>比赛信息输入</h3>
                  </div>
                  <span className={styles.portalBadge}>Training Event</span>
                </div>

                <div className={styles.logisticsFormGrid}>
                  <label className={styles.logisticsField}>
                    <span>比赛名称</span>
                    <input
                      value={trainingEventForm.name}
                      onChange={(event) => handleTrainingFormChange('name', event.target.value)}
                      placeholder="例如：暑期集训第 1 场模拟赛"
                      disabled={!canEdit}
                    />
                  </label>
                  <label className={styles.logisticsField}>
                    <span>比赛日期</span>
                    <input
                      type="date"
                      value={trainingEventForm.date}
                      onChange={(event) => handleTrainingFormChange('date', event.target.value)}
                      disabled={!canEdit}
                    />
                  </label>
                  <label className={styles.logisticsField}>
                    <span>地点 / 场馆</span>
                    <input
                      value={trainingEventForm.venue}
                      onChange={(event) => handleTrainingFormChange('venue', event.target.value)}
                      placeholder="例如：KClub 训练场 A 区"
                      disabled={!canEdit}
                    />
                  </label>
                  <label className={styles.logisticsField}>
                    <span>组别 / 赛项</span>
                    <select
                      value={trainingEventForm.group}
                      onChange={(event) => handleTrainingFormChange('group', event.target.value)}
                      disabled={!canEdit}
                    >
                      <option value="">请选择赛项</option>
                      {TRAINING_GROUP_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={`${styles.logisticsField} ${styles.logisticsWideField}`}>
                    <span>备注</span>
                    <textarea
                      value={trainingEventForm.notes}
                      onChange={(event) => handleTrainingFormChange('notes', event.target.value)}
                      placeholder="可以记录训练目标、参训队伍、教练安排或注意事项"
                      disabled={!canEdit}
                    />
                  </label>
                </div>

                <button className={styles.portalButton} onClick={handleCreateTrainingEvent} disabled={!canEdit}>
                  生成比赛卡片
                </button>
              </article>

              <article className={`${styles.trainingCalendarPanel} ${styles.trainingOverviewPanel}`}>
                <div className={styles.portalCardTop}>
                  <div>
                    <p className={styles.portalCardLabel}>总览日历</p>
                    <h3>总集训日历</h3>
                    <p className={styles.portalCardText}>
                      自动读取下方集训卡片日期，显示每天的集训级别。点击有集训的日期可进入当天集训工作台。
                    </p>
                  </div>
                  <div className={styles.calendarActions}>
                    <button type="button" onClick={() => handleMoveTrainingOverviewMonth(-1)}>
                      上月
                    </button>
                    <strong>{formatMonthLabel(trainingOverviewMonth)}</strong>
                    <button type="button" onClick={() => handleMoveTrainingOverviewMonth(1)}>
                      下月
                    </button>
                  </div>
                </div>

                <div className={styles.calendarGrid}>
                  {['一', '二', '三', '四', '五', '六', '日'].map((weekday) => (
                    <div key={weekday} className={styles.calendarWeekday}>
                      {weekday}
                    </div>
                  ))}
                  {trainingOverviewCalendarDays.map((day) => {
                    const dayEvents = trainingEventsByDate[day.dateKey] ?? [];
                    const eventTypeLabel = getTrainingOverviewBadge(dayEvents, day.dateKey);
                    const hasSelfPractice = dayEvents.some(
                      (event) => getTrainingEventDateMode(event, day.dateKey) === 'self',
                    );
                    const eventNames = dayEvents.map((event) => event.name || event.group || '未命名集训');

                    return (
                      <button
                        key={day.dateKey}
                        type="button"
                        className={[
                          styles.calendarDay,
                          styles.trainingOverviewDay,
                          day.isCurrentMonth ? '' : styles.calendarMutedDay,
                          dayEvents.length > 0 ? styles.trainingOverviewEventDay : '',
                          hasSelfPractice ? styles.trainingOverviewSelfPracticeDay : '',
                        ].filter(Boolean).join(' ')}
                        onClick={() => handleOpenTrainingOverviewDay(day.dateKey)}
                        disabled={dayEvents.length === 0}
                      >
                        <span>{day.day}</span>
                        {eventTypeLabel && <strong className={styles.trainingOverviewLevel}>{eventTypeLabel}</strong>}
                        {dayEvents.length > 0 && (
                          <small className={styles.trainingOverviewNames}>
                            {eventNames.slice(0, 3).join(' / ')}
                          </small>
                        )}
                      </button>
                    );
                  })}
                </div>
              </article>

              <div className={styles.logisticsCards}>
                {trainingEvents.length === 0 ? (
                  <div className={styles.logisticsEmpty}>
                    还没有集训比赛卡片。先填写上方比赛信息，再点击“生成比赛卡片”。
                  </div>
                ) : (
                  trainingEvents.map((event) => (
                    <article
                      key={event.id}
                      className={`${styles.logisticsEventCard} ${styles.clickableCard}`}
                      onClick={() => handleOpenTrainingEvent(event.id)}
                    >
                      <div className={styles.portalCardTop}>
                        <div>
                          <p className={styles.portalCardLabel}>集训比赛卡片</p>
                          <h3>{event.name}</h3>
                        </div>
                        <span className={styles.portalBadge}>{event.date || '未定日期'}</span>
                      </div>
                      <div className={styles.logisticsMeta}>
                        <span>地点：{event.venue || '未填写'}</span>
                        <span>组别：{event.group || '未填写'}</span>
                        <span>创建：{new Date(event.createdAt).toLocaleDateString('zh-CN')}</span>
                      </div>
                      {event.notes && <p className={styles.portalCardText}>{event.notes}</p>}
                      <div className={styles.cardActionRow}>
                        <span className={styles.cardEnterHint}>点击进入比赛工作台</span>
                        <button
                          className={styles.dangerButton}
                          onClick={(clickEvent) => {
                            clickEvent.stopPropagation();
                            handleDeleteTrainingEvent(event.id);
                          }}
                        >
                          删除卡片
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>

            <Footer lastUpdate="" isLobby storageMode={storageMode} />
          </>
        ) : viewMode === 'training-event' && activeTrainingEvent ? (
          <>
            <Header
              eyebrow="Training Event"
              title={activeTrainingEvent.name}
              subtitle="这里是单场集训比赛的二级工作台。后续可以在这里加入赛程、训练目标、队伍分组、任务记录和复盘内容。"
              action={
                <div className={styles.headerActions}>
                  <button className={styles.backButton} onClick={handleBackToTrainingPlan}>
                    返回集训安排
                  </button>
                  {accountAction}
                </div>
              }
            />

            <section className={styles.portalSection}>
              <div className={styles.portalIntro}>
                <p className={styles.portalEyebrow}>Training Event Workspace</p>
                <h2>{activeTrainingEvent.name}</h2>
                <p className={styles.portalHint}>
                  这个页面已经和上一级集训比赛卡片绑定。后续可以继续添加这场比赛自己的赛队名单、训练任务、练习成绩、问题记录和复盘结论。
                </p>
              </div>

              <article className={styles.logisticsEventCard}>
                <div className={styles.portalCardTop}>
                  <div>
                    <p className={styles.portalCardLabel}>比赛信息</p>
                    <h3>{activeTrainingEvent.name}</h3>
                  </div>
                  <span className={styles.portalBadge}>{activeTrainingEvent.date || '未定日期'}</span>
                </div>
                <div className={styles.logisticsMeta}>
                  <span>地点：{activeTrainingEvent.venue || '未填写'}</span>
                  <span>组别：{activeTrainingEvent.group || '未填写'}</span>
                  <span>创建：{new Date(activeTrainingEvent.createdAt).toLocaleDateString('zh-CN')}</span>
                </div>
                {activeTrainingEvent.notes && <p className={styles.portalCardText}>{activeTrainingEvent.notes}</p>}
              </article>

              <article className={styles.trainingCalendarPanel}>
                <div className={styles.portalCardTop}>
                  <div>
                    <p className={styles.portalCardLabel}>集训日历</p>
                    <h3>
                      {activeTrainingEvent.name}
                      {activeTrainingEvent.group ? ` · ${activeTrainingEvent.group}` : ' · 未填写赛项'}
                    </h3>
                    <p className={styles.portalCardText}>点选日期，编辑当天独立安排。</p>
                  </div>
                  <div className={styles.calendarActions}>
                    <button type="button" onClick={() => handleMoveTrainingMonth(-1)}>
                      上月
                    </button>
                    <strong>{formatMonthLabel(visibleTrainingMonth)}</strong>
                    <button type="button" onClick={() => handleMoveTrainingMonth(1)}>
                      下月
                    </button>
                    <button type="button" onClick={handleExportTrainingCalendarImage}>
                      导出/分享图片
                    </button>
                  </div>
                </div>

                <div className={styles.trainingModeSwitch} aria-label="选择日期状态">
                  <button
                    type="button"
                    className={activeTrainingDateMode === 'self' ? styles.trainingModeSelf : styles.trainingModeTraining}
                    onClick={handleToggleTrainingDateMode}
                  >
                    <span>集训</span>
                    <span>自主练习</span>
                  </button>
                </div>

                <div className={styles.trainingTimePicker}>
                  <div className={styles.trainingTimePickerTitle}>
                    <span>集训时间</span>
                    <strong>{activeTrainingDateKey ? `当前日期：${activeTrainingDateKey}` : '请先点击日历日期'}</strong>
                  </div>
                  <div className={styles.trainingTimeSelectGrid}>
                    <label>
                      <span>开始</span>
                      <select
                        value={activeTrainingStartTime}
                        onChange={(event) => handleUpdateActiveTrainingTime('start', event.target.value)}
                        disabled={!canEdit || !activeTrainingDateKey}
                      >
                        <option value="">选择开始时间</option>
                        {TRAINING_TIME_OPTIONS.map((time) => (
                          <option key={time} value={time}>
                            {time}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>结束</span>
                      <select
                        value={activeTrainingEndTime}
                        onChange={(event) => handleUpdateActiveTrainingTime('end', event.target.value)}
                        disabled={!canEdit || !activeTrainingDateKey}
                      >
                        <option value="">选择结束时间</option>
                        {TRAINING_TIME_OPTIONS.map((time) => (
                          <option key={time} value={time}>
                            {time}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={handleClearActiveTrainingDate}
                      disabled={!canEdit || !activeTrainingDateKey}
                    >
                      取消这个日期
                    </button>
                  </div>
                  <small>先点击日期，再选择开始和结束时间；时间会显示在对应日期中。</small>
                </div>

                <div className={styles.calendarGrid}>
                  {['一', '二', '三', '四', '五', '六', '日'].map((weekday) => (
                    <div key={weekday} className={styles.calendarWeekday}>
                      {weekday}
                    </div>
                  ))}
                  {trainingCalendarDays.map((day) => {
                    const isSelected = selectedTrainingDates.includes(day.dateKey);
                    const isToday = day.dateKey === getTodayKey();
                    const dateMode = isSelected ? getTrainingEventDateMode(activeTrainingEvent, day.dateKey) : null;
                    const dateTime = isSelected ? getTrainingEventDateTime(activeTrainingEvent, day.dateKey) : '';

                    return (
                      <button
                        key={day.dateKey}
                        type="button"
                        className={[
                          styles.calendarDay,
                          day.isCurrentMonth ? '' : styles.calendarMutedDay,
                          isSelected ? styles.calendarSelectedDay : '',
                          activeTrainingDateKey === day.dateKey ? styles.calendarEditingDay : '',
                          dateMode === 'self' ? styles.calendarSelfPracticeDay : '',
                          isToday ? styles.calendarToday : '',
                        ].filter(Boolean).join(' ')}
                        onClick={() => handleSelectTrainingDate(day.dateKey)}
                      >
                        <span>{day.day}</span>
                        {dateMode && (
                          <strong className={styles.trainingDateStatus}>
                            {getTrainingDateModeLabel(dateMode)}
                          </strong>
                        )}
                        {dateTime && <small className={styles.trainingDateTime}>{dateTime}</small>}
                      </button>
                    );
                  })}
                </div>
              </article>

              <article className={styles.trainingSchedulePanel}>
                <div className={styles.portalCardTop}>
                  <div>
                    <p className={styles.portalCardLabel}>集训安排表格</p>
                    <h3>集训安排 {activeTrainingTableDates.length} 天</h3>
                  </div>
                </div>

                <div className={styles.trainingCoachBar}>
                  <label htmlFor="training-coach">教练</label>
                  <input
                    id="training-coach"
                    value={activeTrainingEvent.coach}
                    onChange={(event) => handleUpdateActiveTrainingCoach(event.target.value)}
                    placeholder="填写本场集训教练"
                    disabled={!canEdit}
                  />
                </div>

                <div className={styles.trainingScheduleTableWrap}>
                  <table className={styles.trainingScheduleTable}>
                    <thead>
                      <tr>
                        <th>日期</th>
                        <th>时间</th>
                        <th>训练内容</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeTrainingScheduleEntries.length === 0 ? (
                        <tr>
                          <td colSpan={3} className={styles.trainingScheduleEmpty}>
                            先在上方日历选择“集训”日期，系统会自动生成当天安排；自主练习不会进入此表格。
                          </td>
                        </tr>
                      ) : (
                        activeTrainingScheduleEntries.map(({ dateKey, row }) => (
                          <tr key={`${dateKey}-${row.id}`}>
                            <td className={styles.trainingScheduleDateCell}>{dateKey}</td>
                            <td>
                              <span className={styles.trainingScheduleTimeText}>
                                {getTrainingEventDateTime(activeTrainingEvent, dateKey) || '点击日期后选择时间'}
                              </span>
                            </td>
                            <td>
                              <input
                                value={row.topic}
                                onChange={(event) => handleUpdateTrainingScheduleRow(dateKey, row.id, 'topic', event.target.value)}
                                placeholder="任务训练 / 模拟赛"
                                disabled={!canEdit}
                              />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
            </section>

            <Footer lastUpdate="" isLobby storageMode={storageMode} />
          </>
        ) : viewMode === 'practice-analysis' ? (
          <>
            <Header
              eyebrow="Practice Analytics"
              title="练习赛数据分析"
              subtitle="这里是练习赛数据分析的独立二级页面。后续可以专门接入训练成绩、练习对阵、单队成长曲线和复盘标签。"
              action={
                <div className={styles.headerActions}>
                  <button className={styles.backButton} onClick={handleBackToHome}>
                    返回首页
                  </button>
                  {accountAction}
                </div>
              }
            />

            <section className={styles.portalSection}>
              <div className={styles.portalIntro}>
                <p className={styles.portalEyebrow}>Practice Lab</p>
                <h2>练习赛分析工作台</h2>
                <p className={styles.portalHint}>
                  这个入口已经独立出来，和正式赛事数据分析分开管理。下一步可以在这里添加练习赛表格导入、训练场次卡片、队伍表现趋势和重点复盘记录。
                </p>
              </div>

              <div className={styles.portalGrid}>
                <article className={styles.portalCard}>
                  <div className={styles.portalCardTop}>
                    <div>
                      <p className={styles.portalCardLabel}>练习赛项</p>
                      <h3>MakeX Inspire</h3>
                    </div>
                    <span className={styles.portalBadge}>Inspire</span>
                  </div>
                  <p className={styles.portalCardText}>
                    用于 Inspire 练习赛数据整理。后续可以接入常规任务、随机任务、最好成绩、最快时间和训练复盘记录。
                  </p>
                  <button
                    className={styles.portalButton}
                    onClick={() => showNotification('MakeX Inspire 练习赛分析入口已预留。', 'info')}
                  >
                    进入 MakeX Inspire
                  </button>
                </article>

                <article className={styles.portalCard}>
                  <div className={styles.portalCardTop}>
                    <div>
                      <p className={styles.portalCardLabel}>练习赛项</p>
                      <h3>MakeX Explorer</h3>
                    </div>
                    <span className={styles.portalBadge}>Explorer</span>
                  </div>
                  <p className={styles.portalCardText}>
                    用于 Explorer 练习赛数据整理。后续可以接入对阵表、单场得分、EPA 变化、重点赛队标签和训练赛程复盘。
                  </p>
                  <button
                    className={styles.portalButton}
                    onClick={handleOpenPracticeExplorer}
                  >
                    进入 MakeX Explorer
                  </button>
                </article>
              </div>
            </section>

            <Footer lastUpdate="" isLobby storageMode={storageMode} />
          </>
        ) : viewMode === 'practice-explorer' ? (
          <>
            <Header
              eyebrow="Practice Explorer"
              title="MakeX Explorer 练习赛分析"
              subtitle="用于练习赛、模拟赛或队内训练的 Explorer 表格读取、参数分析和排名整理。这里的数据独立于正式赛事。"
              action={
                <div className={styles.headerActions}>
                  <button className={styles.backButton} onClick={handleBackToPracticeAnalysis}>
                    返回练习赛数据分析
                  </button>
                  {accountAction}
                </div>
              }
            />

            <section className={styles.practiceWorkspace}>
              <div className={styles.practiceToolbar}>
                <div>
                  <p className={styles.portalEyebrow}>Table Import</p>
                  <h2>表格数据读取</h2>
                  <p>
                    复制 Explorer 练习赛完整表格后，点击读取并解析；如果浏览器限制剪切板读取，也可以直接在输入框按 Ctrl+V。
                  </p>
                </div>
                <div className={styles.practiceActions}>
                  <button
                    className={styles.portalButton}
                    onClick={handleParsePracticeExplorerClipboard}
                    disabled={!canEdit}
                  >
                    读取并解析剪贴板
                  </button>
                  <button
                    className={styles.secondaryButton}
                    onClick={handlePracticeExplorerRefresh}
                    disabled={!canEdit}
                  >
                    刷新排名
                  </button>
                </div>
              </div>

              <DataInputPanel
                textValue={practiceExplorer.sourceText}
                onTextChange={handlePracticeExplorerTextChange}
                onClearData={handleClearPracticeExplorerData}
                awaitingPaste={practiceExplorerAwaitingPaste}
                pasteAreaRef={practiceExplorerPasteAreaRef}
                readOnly={!canEdit}
              />

              <section className={styles.parameterPanel}>
                <div>
                  <p className={styles.portalEyebrow}>Parameter Analysis</p>
                  <h2>表格内各项参数分析</h2>
                  <p>自动汇总参赛队伍、练习赛场次、最高 EPA、单场最高得分，并进一步生成稳定性、短板和训练建议。</p>
                </div>

                <div className={styles.parameterGrid}>
                  <div className={styles.parameterCard}>
                    <span>参赛队伍</span>
                    <strong>{practiceExplorerTeamCount}</strong>
                  </div>
                  <div className={styles.parameterCard}>
                    <span>总比赛场次</span>
                    <strong>
                      {Number.isInteger(practiceExplorerTotalMatches)
                        ? practiceExplorerTotalMatches
                        : practiceExplorerTotalMatches.toFixed(1)}
                    </strong>
                  </div>
                  <div className={styles.parameterCard}>
                    <span>最高 EPA 队伍</span>
                    <strong>{practiceExplorerBestEpaInsight?.bestEpa.toFixed(1) ?? '0.0'}</strong>
                    <small>{practiceExplorerBestEpaInsight?.team ?? '暂无数据'}</small>
                  </div>
                  <div className={styles.parameterCard}>
                    <span>单场最高得分</span>
                    <strong>{practiceExplorerHighestSingleMatchScore.toFixed(2)}</strong>
                  </div>
                </div>
              </section>

              <section className={styles.diagnosticPanel}>
                <div className={styles.diagnosticHeader}>
                  <div>
                    <p className={styles.portalEyebrow}>Personal Practice Plan</p>
                    <h2>个性化练习规划</h2>
                    <p>针对每支队的问题自动生成下一轮训练目标、专项练习安排和复盘重点。</p>
                  </div>
                </div>

                {practiceExplorerInsights.length === 0 ? (
                  <div className={styles.logisticsEmpty}>
                    暂无练习规划。请先导入 Explorer 练习赛数据。
                  </div>
                ) : (
                  <div className={styles.practicePlanGrid}>
                    {practiceExplorerInsights.map((insight) => (
                      <article key={`${insight.team}-plan`} className={styles.practicePlanCard}>
                        <div className={styles.practicePlanTitle}>
                          <div>
                            <span>{insight.trainingType}</span>
                            <h3>{insight.team}</h3>
                          </div>
                          <strong>{insight.averageScore.toFixed(1)}</strong>
                        </div>

                        <div className={styles.practicePlanBlock}>
                          <h4>本轮目标</h4>
                          <ul>
                            {insight.practiceGoals.map((goal) => (
                              <li key={goal}>{goal}</li>
                            ))}
                          </ul>
                        </div>

                        <div className={styles.practicePlanBlock}>
                          <h4>练习安排</h4>
                          <ol>
                            {insight.practicePlan.map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ol>
                        </div>

                        <p className={styles.reviewPoint}>{insight.reviewPoint}</p>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className={styles.diagnosticPanel}>
                <div className={styles.diagnosticHeader}>
                  <div>
                    <p className={styles.portalEyebrow}>Training Diagnosis</p>
                    <h2>训练诊断总览</h2>
                    <p>综合平均分、最高分、近三场、稳定性和 EPA，判断每支队伍当前更适合冲分、稳分还是补短板。</p>
                  </div>
                </div>

                {practiceExplorerInsights.length === 0 ? (
                  <div className={styles.logisticsEmpty}>
                    暂无练习赛诊断数据。请先粘贴包含队名、场次、各项得分、EPA 和总分的练习赛表格。
                  </div>
                ) : (
                  <div className={styles.diagnosticGrid}>
                    {practiceExplorerInsights.map((insight, index) => (
                      <article key={insight.team} className={styles.diagnosticCard}>
                        <div className={styles.diagnosticCardTop}>
                          <span>#{index + 1}</span>
                          <strong>{insight.team}</strong>
                          <em>{insight.trainingType}</em>
                        </div>
                        <div className={styles.diagnosticStats}>
                          <span>均分 {insight.averageScore.toFixed(1)}</span>
                          <span>最高 {insight.highestScore}</span>
                          <span>稳定差 {insight.stabilityGap}</span>
                          <span>近三场 {insight.recentAverageScore.toFixed(1)}</span>
                        </div>
                        <p>{insight.suggestion}</p>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className={styles.diagnosticPanel}>
                <div className={styles.diagnosticHeader}>
                  <div>
                    <p className={styles.portalEyebrow}>Metric Rankings</p>
                    <h2>单项能力排名</h2>
                    <p>每个关键得分项都会列出所有队伍排名，优先看单项最高值，同时显示平均值判断常态水平。</p>
                  </div>
                </div>

                <div className={styles.metricRankingGrid}>
                  {practiceExplorerMetricRankings.length === 0 ? (
                    <div className={styles.logisticsEmpty}>暂无单项数据。</div>
                  ) : (
                    practiceExplorerMetricRankings.map((ranking) => (
                      <article key={ranking.key} className={styles.metricRankingCard}>
                        <div className={styles.metricRankingTitle}>
                          <span>{ranking.label}</span>
                          <strong>{ranking.teams[0]?.best ?? 0}</strong>
                          <small>{ranking.teams[0]?.team ?? '暂无数据'}</small>
                        </div>
                        <div className={styles.metricRankingList}>
                          {ranking.teams.map((team, index) => (
                            <div key={`${ranking.key}-${team.team}`} className={styles.metricRankingRow}>
                              <span className={styles.metricRankingOrder}>{index + 1}</span>
                              <span className={styles.metricRankingTeam}>{team.team}</span>
                              <strong>{team.best}</strong>
                              <small>均值 {team.average.toFixed(1)}</small>
                            </div>
                          ))}
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>

              <SearchBox onSearch={setSearchKeyword} />

              <section className={styles.practiceRankPanel}>
                <div className={styles.diagnosticHeader}>
                  <div>
                    <p className={styles.portalEyebrow}>Practice Ranking</p>
                    <h2>练习赛综合排名</h2>
                    <p>默认按平均总分排序；如果要做更细的权重排名，后续可以加入“稳定优先 / 冲分优先 / 淘汰赛适配”模式。</p>
                  </div>
                </div>

                <div className={styles.practiceTableWrap}>
                  <table className={styles.practiceRankTable}>
                    <thead>
                      <tr>
                        <th>排名</th>
                        <th>队伍</th>
                        <th>类型</th>
                        <th>场次</th>
                        <th>平均分</th>
                        <th>最高分</th>
                        <th>最低分</th>
                        <th>近三场</th>
                        <th>平均 EPA</th>
                        <th>最佳 EPA</th>
                        <th>短板</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPracticeExplorerInsights.length === 0 ? (
                        <tr>
                          <td colSpan={11}>暂无匹配队伍。</td>
                        </tr>
                      ) : (
                        filteredPracticeExplorerInsights.map((insight) => (
                          <tr key={insight.team}>
                            <td>{practiceExplorerInsights.indexOf(insight) + 1}</td>
                            <td>{insight.team}</td>
                            <td>
                              <span className={styles.trainingTypeBadge}>{insight.trainingType}</span>
                            </td>
                            <td>{insight.matches}</td>
                            <td>{insight.averageScore.toFixed(1)}</td>
                            <td>{insight.highestScore}</td>
                            <td>{insight.lowestScore}</td>
                            <td>{insight.recentAverageScore.toFixed(1)}</td>
                            <td>{insight.averageEpa.toFixed(1)}</td>
                            <td>{insight.bestEpa.toFixed(1)}</td>
                            <td>{insight.weakness}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </section>

            <Footer lastUpdate={practiceExplorer.lastUpdate} storageMode="local" />
          </>
        ) : viewMode === 'lobby' && selectedEventType ? (
          <>
            <Header
              eyebrow="Competition Hub"
              title={selectedEventType}
              subtitle="这里是该赛项的二级赛事大厅。先创建比赛卡片，再进入对应的排行榜工作台。"
              action={
                <div className={styles.headerActions}>
                  <button className={styles.backButton} onClick={handleBackToHome}>
                    返回主页面
                  </button>
                  <button className={styles.backButton} onClick={handleBackToEventTypes}>
                    返回赛项选择
                  </button>
                  {accountAction}
                </div>
              }
            />

            <CompetitionLobby
              competitions={lobbyCompetitions}
              eventType={selectedEventType}
              onCreateCompetition={handleCreateCompetition}
              onOpenCompetition={handleOpenCompetition}
              onDeleteCompetition={handleDeleteCompetition}
              topEpaTeams={topEpaTeams}
              canCreateCompetition={canEdit}
              canDeleteCompetition={canDeleteCompetition}
            />

            <Footer lastUpdate="" isLobby storageMode={storageMode} />
          </>
        ) : activeCompetition ? (
          <>
            <Header
              eyebrow="Competition Workspace"
              title={activeCompetition.name}
              subtitle={
                activeCompetition.eventType === 'MakeX Inspire'
                  ? '剪贴板导入 · 常规任务按得分优先，同分再比较常规任务用时'
                  : '剪贴板导入 · 排行榜与淘汰赛预测工作台'
              }
              action={
                <div className={styles.headerActions}>
                  <button className={styles.backButton} onClick={handleBackToHome}>
                    返回主页面
                  </button>
                  <button className={styles.backButton} onClick={handleBackToLobby}>
                    返回赛事大厅
                  </button>
                  {accountAction}
                </div>
              }
            />

            <section className={styles.workspaceSummary}>
              <div className={styles.summaryCard}>
                <span className={styles.summaryLabel}>当前赛项</span>
                <strong>{activeCompetition.eventType}</strong>
              </div>
              <div className={styles.summaryCard}>
                <span className={styles.summaryLabel}>当前赛事</span>
                <strong>{activeCompetition.name}</strong>
              </div>
              <div className={styles.summaryCard}>
                <span className={styles.summaryLabel}>已导入队伍</span>
                <strong>{importedTeamCount} 支</strong>
              </div>
              <div className={styles.summaryCard}>
                <span className={styles.summaryLabel}>最近解析</span>
                <strong>{activeCompetition.lastUpdate || '尚未解析'}</strong>
              </div>
            </section>

            <DataControls
              onQuickRead={handleParseClipboard}
              onRefresh={handleRefresh}
              autoRefreshEnabled={autoRefresh.enabled}
              autoRefreshInterval={autoRefresh.interval}
              onAutoRefreshToggle={handleAutoRefreshToggle}
              onIntervalChange={autoRefresh.setInterval}
              storageMode={storageMode}
              editingEnabled={canEdit}
            />

            <TabNavigation
              activeTab={activeTab}
              onTabChange={setActiveTab}
              showPlayoff={activeCompetition.eventType !== 'MakeX Inspire'}
              showFocusSchedule={activeCompetition.eventType === 'MakeX Explorer'}
            />

            {activeTab === 'ranking' && (
              <>
                <DataInputPanel
                  textValue={activeCompetition.sourceText}
                  onTextChange={handleSourceTextChange}
                  onClearData={handleClearCompetitionData}
                  awaitingPaste={awaitingPaste}
                  pasteAreaRef={pasteAreaRef}
                  readOnly={!canEdit}
                />

                <StatsCards
                  eventType={activeCompetition.eventType}
                  highestSingleMatchScore={highestSingleMatchScore}
                  teamCount={importedTeamCount}
                  teams={rankedTeams}
                />

                <FeaturedTeams
                  eventType={activeCompetition.eventType}
                  teams={rankedTeams}
                  featuredNames={featuredTeams}
                  onAdd={addTeam}
                  onRemove={removeTeam}
                  allTeamNames={teamsData.map((team) => team.team)}
                />

                <SearchBox onSearch={setSearchKeyword} />

                <RankingTable
                  eventType={activeCompetition.eventType}
                  teams={rankedTeams}
                  sortField={sortField}
                  sortOrder={sortOrder}
                  onSort={handleSort}
                  searchKeyword={searchKeyword}
                  featuredNames={featuredTeams}
                  onTeamClick={toggleTeam}
                  teamTags={teamTags}
                  tagOptions={teamTagOptions}
                  onSetTeamTag={handleSetTeamTag}
                  onAddTagOption={handleAddTeamTagOption}
                />
              </>
            )}

            {activeTab === 'playoff' && activeCompetition.eventType !== 'MakeX Inspire' && (
              <PlayoffView
                eventType={activeCompetition.eventType}
                teamsData={teamsData}
                showNotification={showNotification}
              />
            )}

            {activeTab === 'focusSchedule' && activeCompetition.eventType === 'MakeX Explorer' && (
              <FocusScheduleView
                key={activeCompetition.id}
                competitionId={activeCompetition.id}
                showNotification={showNotification}
                teamTags={teamTags}
                tagOptions={teamTagOptions}
                onSetTeamTag={handleSetTeamTag}
                onAddTagOption={handleAddTeamTagOption}
              />
            )}

            <Footer lastUpdate={activeCompetition.lastUpdate} storageMode={storageMode} />
          </>
        ) : null}
      </div>

      {(authPanelOpen || viewMode === 'login') && (
        <AuthPanel
          authAvailable={authEnabled}
          currentUser={viewMode === 'login' ? null : authUser}
          managedUsers={managedUsers}
          busy={authBusy}
          onClose={() => {
            setAuthPanelOpen(false);
            if (!authUser) {
              setViewMode('home');
            }
          }}
          onLogin={handleLogin}
          onLogout={handleLogout}
          onBootstrapAdmin={handleBootstrapAdmin}
          onCreateUser={handleCreateManagedUser}
          onUpdateUser={handleUpdateManagedUser}
          onResetPassword={handleResetManagedUserPassword}
          onDeleteUser={handleDeleteManagedUser}
          onToggleUserActive={handleToggleUserActive}
        />
      )}

      <NotificationContainer notifications={notifications} />
    </div>
  );
}
