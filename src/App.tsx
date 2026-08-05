import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import * as XLSX from 'xlsx';
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
  DEFAULT_TEAM_TAG_OPTIONS,
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
import { SimulationSystem } from './components/simulation/SimulationSystem';
import { ExplorerScheduleGenerator, PracticeEventHub } from './components/practice/PracticeEventHub';
import { ScoreCalculator } from './components/scoring/ScoreCalculator';
import {
  INSTALL_READY_EVENT,
  canPromptPwaInstall,
  getPwaInstallInstructions,
  isStandalonePwa,
  requestPwaInstall,
} from './pwaInstall';

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
const LOGISTICS_ROSTER_STORAGE_KEY = 'competitive-ranking-board::logistics-master-roster';
const TRAINING_EVENTS_STORAGE_KEY = 'competitive-ranking-board::training-events';
const TRAINING_SCHEDULES_STORAGE_KEY = 'competitive-ranking-board::training-schedules';
const LOGISTICS_EVENT_ITEM_OPTIONS = ['MakeX Inspire', 'MakeX Explorer', 'MakeX Challenge', 'FRC'];
const LOGISTICS_PARTICIPANT_ROLES = ['教练', '队员', '家长', '领队'];
const LOGISTICS_ID_DOCUMENT_OPTIONS = ['身份证', '回乡证', '外籍护照', '中国护照'];
const LOGISTICS_ROOM_NOTE_OPTIONS = ['男生房', '女生房', '教练开会房间'];
const LOGISTICS_ATTENDANCE_STATUS = ['未到达', '已到达'] as const;
const FIXED_LOGISTICS_STAFF = [
  { name: '温宇', role: '教练' },
  { name: '张珈硕', role: '教练' },
  { name: '曹伟铭', role: '教练' },
  { name: '尹培阳', role: '教练' },
  { name: '王艳平', role: '领队' },
  { name: '甄珍', role: '领队' },
] as const;
const LOGISTICS_ROSTER_ACCESS_PASSWORD =
  import.meta.env.VITE_LOGISTICS_ROSTER_PASSWORD?.trim() || 'FV7509';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
const TRAINING_SYNC_TABLE = import.meta.env.VITE_SUPABASE_TRAINING_SYNC_TABLE?.trim() || 'training_sync';
const TRAINING_SYNC_ID = 'global';
const TEAM_TAG_SYNC_TABLE = import.meta.env.VITE_SUPABASE_TEAM_TAG_SYNC_TABLE?.trim() || 'team_tag_sync';
const TEAM_TAG_SYNC_ID = 'global';
const LOGISTICS_SYNC_TABLE = import.meta.env.VITE_SUPABASE_LOGISTICS_SYNC_TABLE?.trim() || 'logistics_sync';
const LOGISTICS_SYNC_ID = 'global';

interface PracticeExplorerState {
  sourceText: string;
  teamsData: TeamRaw[];
  rows: PracticeExplorerMatchRow[];
  lastUpdate: string;
}

interface TeamTagCloudState {
  tags: TeamTagMap;
  options: string[];
}

interface TeamTagSyncRow {
  id: string;
  tags: unknown;
  options: unknown;
  updated_at: string;
}

interface LogisticsCloudState {
  events: LogisticsEventRecord[];
}

interface LogisticsSyncRow {
  id: string;
  events: unknown;
  updated_at: string;
}

type LogisticsAttendanceStatus = typeof LOGISTICS_ATTENDANCE_STATUS[number];
type LogisticsTimeAlertStatus = 'normal' | 'soon' | 'due';

function normalizeFixedStaffName(value: string): string {
  return value.trim().replace(/\s+/g, '');
}

function getFixedLogisticsStaffRole(name: string): string | null {
  const normalizedName = normalizeFixedStaffName(name);
  const staff = FIXED_LOGISTICS_STAFF.find((item) => normalizeFixedStaffName(item.name) === normalizedName);
  return staff?.role ?? null;
}

function getLogisticsEventItemBadgeClass(eventItem: string): string {
  const normalized = eventItem.trim().toLowerCase();
  if (normalized.includes('inspire') || normalized === 'ins') {
    return styles.eventItemBadgeInspire;
  }
  if (normalized.includes('explorer') || normalized === 'exp') {
    return styles.eventItemBadgeExplorer;
  }
  if (normalized.includes('challenge') || normalized === 'cha') {
    return styles.eventItemBadgeChallenge;
  }
  if (normalized.includes('frc')) {
    return styles.eventItemBadgeFrc;
  }
  return styles.eventItemBadgeDefault;
}

function getLogisticsEventItemLabel(eventItem: string): string {
  const normalized = eventItem.trim().toLowerCase();
  if (normalized.includes('inspire') || normalized === 'ins') {
    return 'INSPIRE';
  }
  if (normalized.includes('explorer') || normalized === 'exp') {
    return 'EXPLORER';
  }
  if (normalized.includes('challenge') || normalized === 'cha') {
    return 'CHALLENGE';
  }
  if (normalized.includes('frc')) {
    return 'FRC';
  }
  return eventItem.trim();
}

function renderLogisticsEventItemBadges(eventItem: string) {
  const tokens = eventItem
    .split(/[\/,，、;；]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return <span className={`${styles.eventItemBadge} ${styles.eventItemBadgeDefault}`}>无</span>;
  }

  return (
    <span className={styles.eventItemBadgeGroup}>
      {tokens.map((token) => (
        <span
          key={token}
          className={`${styles.eventItemBadge} ${getLogisticsEventItemBadgeClass(token)}`}
        >
          {getLogisticsEventItemLabel(token)}
        </span>
      ))}
    </span>
  );
}

interface LogisticsParticipant {
  id: string;
  name: string;
  englishName: string;
  gender: string;
  role: string;
  eventItem: string;
  teamNo: string;
  teamName: string;
  fieldPosition: string;
  phone: string;
  guardian: string;
  guardianPhone: string;
  allergy: string;
  idNumber: string;
  notes: string;
  idDocumentImage: string;
  mentorId: string;
}

interface LogisticsParticipantForm {
  name: string;
  englishName: string;
  gender: string;
  role: string;
  eventItem: string;
  teamNo: string;
  teamName: string;
  fieldPosition: string;
  phone: string;
  guardian: string;
  guardianPhone: string;
  allergy: string;
  idNumber: string;
  notes: string;
  idDocumentImage: string;
  mentorId: string;
}

interface LogisticsTimelineItem {
  id: string;
  date: string;
  time: string;
  title: string;
  location: string;
  owner: string;
  notes: string;
  rollCallEnabled: boolean;
}

interface LogisticsTimelineForm {
  date: string;
  time: string;
  title: string;
  location: string;
  owner: string;
  notes: string;
  rollCallEnabled: boolean;
}

interface LogisticsRoomAssignment {
  id: string;
  roomNo: string;
  participantIds: string[];
  notes: string;
}

interface LogisticsRoomForm {
  roomNo: string;
  participantIds: string[];
  notes: string;
}

type LogisticsAttendanceMap = Record<string, Record<string, LogisticsAttendanceStatus>>;

interface LogisticsEventRecord {
  id: string;
  name: string;
  date: string;
  venue: string;
  group: string;
  notes: string;
  createdAt: string;
  participants: LogisticsParticipant[];
  timeline: LogisticsTimelineItem[];
  rooms: LogisticsRoomAssignment[];
  attendance: LogisticsAttendanceMap;
}

interface PersonalLogisticsTask {
  event: LogisticsEventRecord;
  node: LogisticsTimelineItem;
  students: LogisticsParticipant[];
  arrivedCount: number;
  totalCount: number;
  isComplete: boolean;
  timeAlertStatus: LogisticsTimeAlertStatus;
  timeAlertLabel: string;
}

interface LogisticsEventForm {
  name: string;
  date: string;
  venue: string;
  group: string;
  notes: string;
}

const DEFAULT_LOGISTICS_PARTICIPANT_FORM: LogisticsParticipantForm = {
  name: '',
  englishName: '',
  gender: '',
  role: '队员',
  eventItem: '',
  teamNo: '',
  teamName: '',
  fieldPosition: '',
  phone: '',
  guardian: '',
  guardianPhone: '',
  allergy: '',
  idNumber: '',
  notes: '身份证',
  idDocumentImage: '',
  mentorId: '',
};

const DEFAULT_LOGISTICS_TIMELINE_FORM: LogisticsTimelineForm = {
  date: '',
  time: '',
  title: '',
  location: '',
  owner: '',
  notes: '',
  rollCallEnabled: true,
};

const DEFAULT_LOGISTICS_ROOM_FORM: LogisticsRoomForm = {
  roomNo: '',
  participantIds: [],
  notes: '',
};

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

interface TrainingEventEditForm extends TrainingEventForm {
  createdAt: string;
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

function normalizeLogisticsAttendanceStatus(value: unknown): LogisticsAttendanceStatus {
  if (value === '已到达' || value === '已到') {
    return '已到达';
  }

  return '未到达';
}

function getLogisticsTimelineDateTime(date: string, time: string): Date | null {
  const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = time.match(/^(\d{2}):(\d{2})$/);

  if (!dateMatch || !timeMatch) {
    return null;
  }

  const [, year, month, day] = dateMatch;
  const [, hour, minute] = timeMatch;
  const result = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );

  return Number.isNaN(result.getTime()) ? null : result;
}

function getLogisticsTimeAlertStatus(date: string, time: string, now: Date): LogisticsTimeAlertStatus {
  const target = getLogisticsTimelineDateTime(date, time);

  if (!target) {
    return 'normal';
  }

  const diffMs = target.getTime() - now.getTime();

  if (diffMs <= 0) {
    return 'due';
  }

  return diffMs <= 5 * 60 * 1000 ? 'soon' : 'normal';
}

function getLogisticsTimeAlertLabel(status: LogisticsTimeAlertStatus): string {
  if (status === 'soon') {
    return '5分钟内';
  }

  if (status === 'due') {
    return '到点提醒';
  }

  return '';
}

function normalizeIdentityKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s._\-·•/\\|]+/g, '');
}

function expandIdentityKeys(value: string): string[] {
  const key = normalizeIdentityKey(value);
  if (!key) {
    return [];
  }

  const keys = new Set<string>([key]);
  const withoutDigits = key.replace(/\d+$/g, '');
  const withoutTrailingLetter = key.replace(/[a-z]$/g, '');

  if (withoutDigits.length >= 2) {
    keys.add(withoutDigits);
  }

  if (withoutTrailingLetter.length >= 2) {
    keys.add(withoutTrailingLetter);
  }

  if (key.startsWith('super') && key.length > 5) {
    keys.add(key.slice(5));
  }

  return [...keys];
}

function getAuthIdentityKeys(authUser: AuthUserProfile | null): string[] {
  if (!authUser) {
    return [];
  }

  return [...new Set([
    ...expandIdentityKeys(authUser.username),
    ...expandIdentityKeys(authUser.displayName),
  ])];
}

function matchesIdentityValue(value: string, identityKeys: string[]): boolean {
  const key = normalizeIdentityKey(value);

  if (!key) {
    return false;
  }

  return identityKeys.some((identityKey) => identityKey === key || (identityKey.length >= 3 && key.includes(identityKey)));
}

function participantMatchesIdentity(participant: LogisticsParticipant, identityKeys: string[]): boolean {
  return [
    participant.name,
    participant.englishName,
    participant.phone,
  ].some((value) => matchesIdentityValue(value, identityKeys));
}

function getPersonalLogisticsTasks(
  authUser: AuthUserProfile | null,
  logisticsEvents: LogisticsEventRecord[],
  now: Date,
): PersonalLogisticsTask[] {
  const identityKeys = getAuthIdentityKeys(authUser);

  if (identityKeys.length === 0) {
    return [];
  }

  return logisticsEvents
    .flatMap((event) => {
      const mentors = event.participants.filter((participant) =>
        participant.role === LOGISTICS_PARTICIPANT_ROLES[0] || participant.role === LOGISTICS_PARTICIPANT_ROLES[3]);
      const students = event.participants.filter((participant) => participant.role === LOGISTICS_PARTICIPANT_ROLES[1]);
      const matchedMentors = mentors.filter((mentor) => participantMatchesIdentity(mentor, identityKeys));
      const matchedMentorIds = new Set(matchedMentors.map((mentor) => mentor.id));
      const assignedStudents = students.filter((student) => matchedMentorIds.has(student.mentorId));

      return event.timeline
        .filter((node) => node.rollCallEnabled)
        .flatMap((node) => {
          const nodeOwner = mentors.find((mentor) => mentor.id === node.owner);
          const ownsNode = Boolean(
            (nodeOwner && participantMatchesIdentity(nodeOwner, identityKeys))
            || matchesIdentityValue(node.owner, identityKeys),
          );

          if (!ownsNode && assignedStudents.length === 0) {
            return [];
          }

          const visibleStudents = assignedStudents.length > 0 ? assignedStudents : students;
          const arrivedCount = visibleStudents.filter((student) =>
            normalizeLogisticsAttendanceStatus(event.attendance[node.id]?.[student.id]) === LOGISTICS_ATTENDANCE_STATUS[1]).length;
          const totalCount = visibleStudents.length;
          const isComplete = totalCount > 0 && arrivedCount === totalCount;
          const timeAlertStatus = isComplete ? 'normal' : getLogisticsTimeAlertStatus(node.date, node.time, now);

          return [{
            event,
            node,
            students: visibleStudents,
            arrivedCount,
            totalCount,
            isComplete,
            timeAlertStatus,
            timeAlertLabel: getLogisticsTimeAlertLabel(timeAlertStatus),
          }];
        });
    })
    .sort((left, right) => {
      const leftTime = getLogisticsTimelineDateTime(left.node.date, left.node.time)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightTime = getLogisticsTimelineDateTime(right.node.date, right.node.time)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime;
    });
}

function normalizeLogisticsEventItem(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchesLogisticsEventItem(value: string, selectedItem: string): boolean {
  const normalizedValue = normalizeLogisticsEventItem(value);
  const normalizedSelected = normalizeLogisticsEventItem(selectedItem);

  if (!normalizedValue) {
    return false;
  }

  return normalizedValue.includes(normalizedSelected)
    || normalizedSelected.includes(normalizedValue)
    || (normalizedSelected === 'makexinspire' && normalizedValue.includes('ins'))
    || (normalizedSelected === 'makexexplorer' && normalizedValue.includes('exp'))
    || (normalizedSelected === 'makexchallenge' && normalizedValue.includes('cha'))
    || (normalizedSelected === 'frc' && normalizedValue.includes('frc'));
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseLogisticsRosterText(text: string): string[][] {
  const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalizedText) {
    return [];
  }

  const delimiter = normalizedText.includes('\t') ? '\t' : ',';
  return normalizedText
    .split('\n')
    .map((line) => parseDelimitedLine(line, delimiter))
    .filter((row) => row.some(Boolean));
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function createCompressedImageDataUrl(file: File): Promise<string> {
  const sourceUrl = await readFileAsDataUrl(file);
  const image = new Image();
  image.src = sourceUrl;

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Image load failed'));
  });

  const maxSize = 1200;
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');

  if (!context) {
    return sourceUrl;
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.82);
}

function normalizeLogisticsParticipant(item: unknown): LogisticsParticipant | null {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const source = item as Partial<LogisticsParticipant>;
  const name = typeof source.name === 'string' ? source.name.trim() : '';
  if (!name) {
    return null;
  }
  const fixedRole = getFixedLogisticsStaffRole(name);
  const role = fixedRole ?? (typeof source.role === 'string' ? source.role : '队员');
  const isTeamMember = role === '队员';

  return {
    id: typeof source.id === 'string' ? source.id : `participant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    englishName: typeof source.englishName === 'string' ? source.englishName : '',
    gender: typeof source.gender === 'string' ? source.gender : '',
    role,
    eventItem: isTeamMember && typeof source.eventItem === 'string' ? source.eventItem : '',
    teamNo: isTeamMember && typeof source.teamNo === 'string' ? source.teamNo : '',
    teamName: isTeamMember && typeof source.teamName === 'string' ? source.teamName : '',
    fieldPosition: isTeamMember && typeof source.fieldPosition === 'string' ? source.fieldPosition : '',
    phone: typeof source.phone === 'string' ? source.phone : '',
    guardian: isTeamMember && typeof source.guardian === 'string' ? source.guardian : '',
    guardianPhone: isTeamMember && typeof source.guardianPhone === 'string' ? source.guardianPhone : '',
    allergy: typeof source.allergy === 'string' ? source.allergy : '',
    idNumber: typeof source.idNumber === 'string' ? source.idNumber : '',
    notes: typeof source.notes === 'string' ? source.notes : '',
    idDocumentImage: typeof source.idDocumentImage === 'string' ? source.idDocumentImage : '',
    mentorId: isTeamMember && typeof source.mentorId === 'string' ? source.mentorId : '',
  };
}

function normalizeLogisticsTimelineItem(item: unknown): LogisticsTimelineItem | null {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const source = item as Partial<LogisticsTimelineItem>;
  const title = typeof source.title === 'string' ? source.title.trim() : '';
  if (!title) {
    return null;
  }

  return {
    id: typeof source.id === 'string' ? source.id : `timeline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: typeof source.date === 'string' ? source.date : '',
    time: typeof source.time === 'string' ? source.time : '',
    title,
    location: typeof source.location === 'string' ? source.location : '',
    owner: typeof source.owner === 'string' ? source.owner : '',
    notes: typeof source.notes === 'string' ? source.notes : '',
    rollCallEnabled: typeof source.rollCallEnabled === 'boolean' ? source.rollCallEnabled : true,
  };
}

function normalizeLogisticsRoomAssignment(item: unknown): LogisticsRoomAssignment | null {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const source = item as Partial<LogisticsRoomAssignment>;
  const roomNo = typeof source.roomNo === 'string' ? source.roomNo.trim() : '';
  if (!roomNo) {
    return null;
  }

  return {
    id: typeof source.id === 'string' ? source.id : `room-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    roomNo,
    participantIds: Array.isArray(source.participantIds)
      ? source.participantIds.filter((id): id is string => typeof id === 'string')
      : [],
    notes: typeof source.notes === 'string' ? source.notes : '',
  };
}

function normalizeLogisticsAttendance(value: unknown): LogisticsAttendanceMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const normalized: LogisticsAttendanceMap = {};
  Object.entries(value as Record<string, unknown>).forEach(([timelineId, rows]) => {
    if (!rows || typeof rows !== 'object' || Array.isArray(rows)) {
      return;
    }

    normalized[timelineId] = {};
    Object.entries(rows as Record<string, unknown>).forEach(([participantId, status]) => {
      normalized[timelineId][participantId] = normalizeLogisticsAttendanceStatus(status);
    });
  });

  return normalized;
}

function normalizeLogisticsEvents(input: unknown): LogisticsEventRecord[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((item): item is Partial<LogisticsEventRecord> => item && typeof item === 'object')
    .map((item) => {
      const participants = Array.isArray(item.participants)
        ? item.participants
          .map(normalizeLogisticsParticipant)
          .filter((participant): participant is LogisticsParticipant => Boolean(participant))
        : [];

      return {
        id: typeof item.id === 'string' ? item.id : `logistics-${Date.now()}`,
        name: typeof item.name === 'string' ? item.name : '',
        date: typeof item.date === 'string' ? item.date : '',
        venue: typeof item.venue === 'string' ? item.venue : '',
        group: typeof item.group === 'string' ? item.group : '',
        notes: typeof item.notes === 'string' ? item.notes : '',
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
        participants: mergeLogisticsEventParticipantsUnique([], participants).participants,
        timeline: Array.isArray(item.timeline)
          ? item.timeline.map(normalizeLogisticsTimelineItem).filter((timeline): timeline is LogisticsTimelineItem => Boolean(timeline))
          : [],
        rooms: Array.isArray(item.rooms)
          ? item.rooms.map(normalizeLogisticsRoomAssignment).filter((room): room is LogisticsRoomAssignment => Boolean(room))
          : [],
        attendance: normalizeLogisticsAttendance(item.attendance),
      };
    })
    .filter((item) => item.name.trim());
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

    return normalizeLogisticsEvents(parsed);
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

function loadLogisticsMasterRoster(): LogisticsParticipant[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(LOGISTICS_ROSTER_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(normalizeLogisticsParticipant)
      .filter((participant): participant is LogisticsParticipant => Boolean(participant));
  } catch {
    return [];
  }
}

function saveLogisticsMasterRoster(participants: LogisticsParticipant[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(LOGISTICS_ROSTER_STORAGE_KEY, JSON.stringify(participants));
}

function normalizeRosterIdentity(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function normalizeRosterPhone(value: string): string {
  return value.replace(/\D/g, '');
}

function getLogisticsParticipantRosterKey(participant: LogisticsParticipant): string {
  const role = normalizeRosterIdentity(participant.role || '队员');
  const phone = normalizeRosterPhone(participant.phone || participant.guardianPhone);
  if (phone.length >= 6) {
    return `${role}:phone:${phone}`;
  }

  const name = normalizeRosterIdentity(participant.name);
  const englishName = normalizeRosterIdentity(participant.englishName);
  const teamNo = normalizeRosterIdentity(participant.teamNo);

  if (name && teamNo) {
    return `${role}:name:${name}:team:${teamNo}`;
  }

  if (name && englishName) {
    return `${role}:name:${name}:en:${englishName}`;
  }

  return `${role}:name:${name}`;
}

function normalizeRosterDocument(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]/g, '');
}

function getLogisticsParticipantRosterKeys(participant: LogisticsParticipant): string[] {
  const role = normalizeRosterIdentity(participant.role || '队员');
  const name = normalizeRosterIdentity(participant.name);
  const englishName = normalizeRosterIdentity(participant.englishName);
  const phone = normalizeRosterPhone(participant.phone || participant.guardianPhone);
  const documentNumber = normalizeRosterDocument(participant.idNumber);
  const keys = new Set<string>();

  if (documentNumber.length >= 6 && !documentNumber.includes('#n/a')) {
    keys.add(`doc:${documentNumber}`);
  }

  if (phone.length >= 6) {
    keys.add(`phone:${phone}`);
    keys.add(`${role}:phone:${phone}`);
  }

  if (name) {
    keys.add(`name:${name}`);
    keys.add(`${role}:name:${name}`);
  }

  if (name && englishName) {
    keys.add(`name:${name}:en:${englishName}`);
    keys.add(`${role}:name:${name}:en:${englishName}`);
  }

  return keys.size > 0 ? Array.from(keys) : [getLogisticsParticipantRosterKey(participant)];
}

function indexLogisticsParticipantKeys(
  keyToIndex: Map<string, number>,
  participant: LogisticsParticipant,
  index: number,
): void {
  getLogisticsParticipantRosterKeys(participant).forEach((key) => {
    keyToIndex.set(key, index);
  });
}

function findLogisticsParticipantIndex(
  keyToIndex: Map<string, number>,
  participant: LogisticsParticipant,
): number | undefined {
  for (const key of getLogisticsParticipantRosterKeys(participant)) {
    const existingIndex = keyToIndex.get(key);
    if (existingIndex !== undefined) {
      return existingIndex;
    }
  }

  return undefined;
}

function mergeRosterText(left: string, right: string): string {
  const values = [left, right]
    .flatMap((value) => value.split('/'))
    .map((value) => value.trim())
    .filter(Boolean);
  return Array.from(new Set(values)).join(' / ');
}

function mergeLogisticsParticipantRecord(
  existing: LogisticsParticipant,
  incoming: LogisticsParticipant,
): LogisticsParticipant {
  return {
    ...existing,
    englishName: existing.englishName || incoming.englishName,
    gender: existing.gender || incoming.gender,
    role: existing.role || incoming.role,
    eventItem: mergeRosterText(existing.eventItem, incoming.eventItem),
    teamNo: '',
    teamName: '',
    fieldPosition: '',
    phone: existing.phone || incoming.phone,
    guardian: existing.guardian || incoming.guardian,
    guardianPhone: existing.guardianPhone || incoming.guardianPhone,
    allergy: mergeRosterText(existing.allergy, incoming.allergy),
    idNumber: existing.idNumber || incoming.idNumber,
    notes: existing.notes || incoming.notes,
    idDocumentImage: existing.idDocumentImage || incoming.idDocumentImage,
    mentorId: existing.mentorId || incoming.mentorId,
  };
}

function mergeLogisticsEventParticipantRecord(
  existing: LogisticsParticipant,
  incoming: LogisticsParticipant,
): LogisticsParticipant {
  const fixedRole = getFixedLogisticsStaffRole(existing.name) ?? getFixedLogisticsStaffRole(incoming.name);
  const role = fixedRole ?? (existing.role || incoming.role || '队员');
  const isTeamMember = role === '队员';

  return {
    ...existing,
    englishName: existing.englishName || incoming.englishName,
    gender: existing.gender || incoming.gender,
    role,
    eventItem: isTeamMember ? mergeRosterText(existing.eventItem, incoming.eventItem) : '',
    teamNo: isTeamMember ? existing.teamNo || incoming.teamNo : '',
    teamName: isTeamMember ? existing.teamName || incoming.teamName : '',
    fieldPosition: isTeamMember ? existing.fieldPosition || incoming.fieldPosition : '',
    phone: existing.phone || incoming.phone,
    guardian: isTeamMember ? existing.guardian || incoming.guardian : '',
    guardianPhone: isTeamMember ? existing.guardianPhone || incoming.guardianPhone : '',
    allergy: mergeRosterText(existing.allergy, incoming.allergy),
    idNumber: existing.idNumber || incoming.idNumber,
    notes: existing.notes || incoming.notes,
    idDocumentImage: existing.idDocumentImage || incoming.idDocumentImage,
    mentorId: isTeamMember ? existing.mentorId || incoming.mentorId : '',
  };
}

function createMasterRosterParticipant(participant: LogisticsParticipant): LogisticsParticipant {
  return {
    ...participant,
    teamNo: '',
    teamName: '',
    fieldPosition: '',
  };
}

function createFixedLogisticsStaffParticipants(idPrefix: string): LogisticsParticipant[] {
  return FIXED_LOGISTICS_STAFF.map((staff, index) => ({
    id: `${idPrefix}-${staff.role}-${index}-${Date.now()}`,
    name: staff.name,
    englishName: '',
    gender: '',
    role: staff.role,
    eventItem: '',
    teamNo: '',
    teamName: '',
    fieldPosition: '',
    phone: '',
    guardian: '',
    guardianPhone: '',
    allergy: '',
    idNumber: '',
    notes: '',
    idDocumentImage: '',
    mentorId: '',
  }));
}

function mergeLogisticsEventParticipantsUnique(
  existingParticipants: LogisticsParticipant[],
  incomingParticipants: LogisticsParticipant[],
): {
  participants: LogisticsParticipant[];
  added: number;
  merged: number;
} {
  let added = 0;
  let merged = 0;
  const participants = existingParticipants
    .map(normalizeLogisticsParticipant)
    .filter((participant): participant is LogisticsParticipant => Boolean(participant));
  const keyToIndex = new Map<string, number>();
  participants.forEach((participant, index) => indexLogisticsParticipantKeys(keyToIndex, participant, index));

  incomingParticipants.forEach((participant) => {
    const normalizedParticipant = normalizeLogisticsParticipant(participant);
    if (!normalizedParticipant) {
      return;
    }

    const existingIndex = findLogisticsParticipantIndex(keyToIndex, normalizedParticipant);
    if (existingIndex === undefined) {
      participants.push(normalizedParticipant);
      indexLogisticsParticipantKeys(keyToIndex, normalizedParticipant, participants.length - 1);
      added += 1;
      return;
    }

    participants[existingIndex] = mergeLogisticsEventParticipantRecord(participants[existingIndex], normalizedParticipant);
    indexLogisticsParticipantKeys(keyToIndex, participants[existingIndex], existingIndex);
    merged += 1;
  });

  return { participants, added, merged };
}

function mergeLogisticsParticipantsUnique(
  existingParticipants: LogisticsParticipant[],
  incomingParticipants: LogisticsParticipant[],
): {
  participants: LogisticsParticipant[];
  added: number;
  merged: number;
} {
  let added = 0;
  let merged = 0;
  const participants = existingParticipants
    .map(normalizeLogisticsParticipant)
    .filter((participant): participant is LogisticsParticipant => Boolean(participant));
  const keyToIndex = new Map<string, number>();
  participants.forEach((participant, index) => indexLogisticsParticipantKeys(keyToIndex, participant, index));

  incomingParticipants.forEach((participant) => {
    const normalizedParticipant = normalizeLogisticsParticipant(participant);
    if (!normalizedParticipant) {
      return;
    }

    const existingIndex = findLogisticsParticipantIndex(keyToIndex, normalizedParticipant);

    if (existingIndex === undefined) {
      participants.push({
        ...createMasterRosterParticipant(normalizedParticipant),
        id: `master-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      });
      indexLogisticsParticipantKeys(keyToIndex, participants[participants.length - 1], participants.length - 1);
      added += 1;
      return;
    }

    participants[existingIndex] = mergeLogisticsParticipantRecord(participants[existingIndex], normalizedParticipant);
    indexLogisticsParticipantKeys(keyToIndex, participants[existingIndex], existingIndex);
    merged += 1;
  });

  return { participants, added, merged };
}

function aggregateLogisticsParticipantsFromEvents(events: LogisticsEventRecord[]): LogisticsParticipant[] {
  const participants: LogisticsParticipant[] = [];
  const keyToIndex = new Map<string, number>();

  events.forEach((event) => {
    event.participants.forEach((participant) => {
      const normalizedParticipant = normalizeLogisticsParticipant(participant);
      if (!normalizedParticipant) {
        return;
      }

      const existingIndex = findLogisticsParticipantIndex(keyToIndex, normalizedParticipant);

      if (existingIndex === undefined) {
        participants.push({
          ...createMasterRosterParticipant(normalizedParticipant),
          id: `aggregate-${event.id}-${participant.id}`,
        });
        indexLogisticsParticipantKeys(keyToIndex, participants[participants.length - 1], participants.length - 1);
        return;
      }

      participants[existingIndex] = mergeLogisticsParticipantRecord(participants[existingIndex], normalizedParticipant);
      indexLogisticsParticipantKeys(keyToIndex, participants[existingIndex], existingIndex);
    });
  });

  return participants;
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

function getTrainingSyncHeaders(accessToken?: string, includeJson = false): HeadersInit {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
  };
}

async function requestTrainingSync<T>(path: string, accessToken?: string, init?: RequestInit): Promise<T> {
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

function parseTrainingScheduleKey(key: string): { eventId: string; dateKey: string } | null {
  const separatorIndex = key.lastIndexOf('::');
  if (separatorIndex <= 0) {
    return null;
  }

  const eventId = key.slice(0, separatorIndex);
  const dateKey = key.slice(separatorIndex + 2);
  if (!eventId || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return null;
  }

  return { eventId, dateKey };
}

function hydrateTrainingEventsFromSchedules(
  events: TrainingEventRecord[],
  schedules: TrainingScheduleMap,
): TrainingEventRecord[] {
  if (Object.keys(schedules).length === 0) {
    return events;
  }

  return events.map((event) => {
    const dateSet = new Set(getTrainingEventCalendarDates(event));
    const nextModes: Record<string, TrainingDateMode> = { ...event.calendarDateModes };
    const nextTimes: Record<string, string> = { ...event.calendarDateTimes };
    let changed = false;

    Object.entries(schedules).forEach(([scheduleKey, rows]) => {
      const parsedKey = parseTrainingScheduleKey(scheduleKey);
      if (!parsedKey || parsedKey.eventId !== event.id || rows.length === 0) {
        return;
      }

      if (!dateSet.has(parsedKey.dateKey)) {
        dateSet.add(parsedKey.dateKey);
        changed = true;
      }

      if (!isTrainingDateMode(nextModes[parsedKey.dateKey])) {
        nextModes[parsedKey.dateKey] = DEFAULT_TRAINING_DATE_MODE;
        changed = true;
      }

      const firstTime = rows[0]?.time?.trim();
      if (firstTime && !nextTimes[parsedKey.dateKey]) {
        nextTimes[parsedKey.dateKey] = firstTime;
        changed = true;
      }
    });

    if (!changed) {
      return event;
    }

    const calendarDates = Array.from(dateSet).sort();
    return {
      ...event,
      date: event.date || calendarDates[0] || '',
      calendarDates,
      calendarDateModes: normalizeTrainingDateModes(calendarDates, nextModes),
      calendarDateTimes: normalizeTrainingDateTimes(calendarDates, nextTimes),
    };
  });
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

  const schedules = normalizeTrainingSchedules(rows[0].schedules);
  const events = hydrateTrainingEventsFromSchedules(normalizeTrainingEvents(rows[0].events), schedules);

  return {
    events,
    schedules,
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

function normalizeTeamTagCloudMap(input: unknown): TeamTagMap {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>)
      .map(([key, value]) => [key.trim(), typeof value === 'string' ? value.trim() : ''])
      .filter(([key, value]) => key && value),
  );
}

function normalizeTeamTagCloudOptions(input: unknown): string[] {
  const options = Array.isArray(input) ? input.filter((item): item is string => typeof item === 'string') : [];
  return Array.from(new Set([...DEFAULT_TEAM_TAG_OPTIONS, ...options].map((item) => item.trim()).filter(Boolean)));
}

async function fetchRemoteTeamTagState(accessToken?: string): Promise<TeamTagCloudState | null> {
  const params = new URLSearchParams({
    select: 'id,tags,options,updated_at',
    id: `eq.${TEAM_TAG_SYNC_ID}`,
    limit: '1',
  });

  const rows = await requestTrainingSync<TeamTagSyncRow[]>(
    `/rest/v1/${TEAM_TAG_SYNC_TABLE}?${params.toString()}`,
    accessToken,
  );

  if (!rows.length) {
    return null;
  }

  return {
    tags: normalizeTeamTagCloudMap(rows[0].tags),
    options: normalizeTeamTagCloudOptions(rows[0].options),
  };
}

async function saveRemoteTeamTagState(tags: TeamTagMap, options: string[], accessToken?: string): Promise<void> {
  const params = new URLSearchParams({ on_conflict: 'id' });
  await requestTrainingSync<TeamTagSyncRow[]>(
    `/rest/v1/${TEAM_TAG_SYNC_TABLE}?${params.toString()}`,
    accessToken,
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify({
        id: TEAM_TAG_SYNC_ID,
        tags,
        options: normalizeTeamTagCloudOptions(options),
        updated_at: new Date().toISOString(),
      }),
    },
  );
}

function mergeTeamTagState(localState: TeamTagCloudState, remoteState: TeamTagCloudState | null): TeamTagCloudState {
  if (!remoteState) {
    return localState;
  }

  return {
    tags: {
      ...remoteState.tags,
      ...localState.tags,
    },
    options: Array.from(new Set([...remoteState.options, ...localState.options].map((item) => item.trim()).filter(Boolean))),
  };
}

function getLogisticsAttendanceCount(attendance: LogisticsAttendanceMap): number {
  return Object.values(attendance).reduce((total, rows) => total + Object.keys(rows).length, 0);
}

function getLogisticsEventCompletenessScore(event: LogisticsEventRecord): number {
  return (
    event.participants.length * 100
    + event.timeline.length * 60
    + event.rooms.length * 60
    + getLogisticsAttendanceCount(event.attendance) * 20
    + (event.date ? 8 : 0)
    + (event.venue ? 4 : 0)
    + (event.group ? 4 : 0)
    + (event.notes ? 2 : 0)
  );
}

async function fetchRemoteLogisticsState(accessToken: string): Promise<LogisticsCloudState | null> {
  const params = new URLSearchParams({
    select: 'id,events,updated_at',
    id: `eq.${LOGISTICS_SYNC_ID}`,
    limit: '1',
  });

  const rows = await requestTrainingSync<LogisticsSyncRow[]>(
    `/rest/v1/${LOGISTICS_SYNC_TABLE}?${params.toString()}`,
    accessToken,
  );

  if (!rows.length) {
    return null;
  }

  return {
    events: normalizeLogisticsEvents(rows[0].events),
  };
}

async function saveRemoteLogisticsState(events: LogisticsEventRecord[], accessToken: string): Promise<void> {
  const params = new URLSearchParams({ on_conflict: 'id' });

  await requestTrainingSync<LogisticsSyncRow[]>(
    `/rest/v1/${LOGISTICS_SYNC_TABLE}?${params.toString()}`,
    accessToken,
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify({
        id: LOGISTICS_SYNC_ID,
        events: normalizeLogisticsEvents(events),
        updated_at: new Date().toISOString(),
      }),
    },
  );
}

function mergeLogisticsState(
  localState: LogisticsCloudState,
  remoteState: LogisticsCloudState | null,
): LogisticsCloudState {
  if (!remoteState) {
    return localState;
  }

  const byId = new Map<string, LogisticsEventRecord>();

  remoteState.events.forEach((event) => {
    byId.set(event.id, event);
  });

  localState.events.forEach((event) => {
    const remoteEvent = byId.get(event.id);
    if (!remoteEvent || getLogisticsEventCompletenessScore(event) > getLogisticsEventCompletenessScore(remoteEvent)) {
      byId.set(event.id, event);
    }
  });

  return {
    events: Array.from(byId.values()).sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  };
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
  const [activeLogisticsEventId, setActiveLogisticsEventId] = useState<string | null>(null);
  const [activeLogisticsEventItem, setActiveLogisticsEventItem] = useState<string | null>(null);
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
  const [installGuideOpen, setInstallGuideOpen] = useState(false);
  const [pwaInstallAvailable, setPwaInstallAvailable] = useState(false);
  const [teamTags, setTeamTags] = useState<TeamTagMap>(() => loadTeamTags());
  const [teamTagOptions, setTeamTagOptions] = useState<string[]>(() => loadTeamTagOptions());
  const [teamTagCloudReady, setTeamTagCloudReady] = useState(false);
  const [practiceExplorer] = useState<PracticeExplorerState>(() => loadPracticeExplorerState());
  const [, setPracticeExplorerAwaitingPaste] = useState(false);
  const [logisticsEvents, setLogisticsEvents] = useState<LogisticsEventRecord[]>(() => loadLogisticsEvents());
  const [logisticsEventForm, setLogisticsEventForm] = useState<LogisticsEventForm>({
    name: '',
    date: '',
    venue: '',
    group: '',
    notes: '',
  });
  const [editingLogisticsEventId, setEditingLogisticsEventId] = useState<string | null>(null);
  const [editingLogisticsEventName, setEditingLogisticsEventName] = useState('');
  const [editingLogisticsEventDateId, setEditingLogisticsEventDateId] = useState<string | null>(null);
  const [editingLogisticsEventDate, setEditingLogisticsEventDate] = useState('');
  const [logisticsParticipantForm, setLogisticsParticipantForm] =
    useState<LogisticsParticipantForm>(DEFAULT_LOGISTICS_PARTICIPANT_FORM);
  const [logisticsTimelineForm, setLogisticsTimelineForm] =
    useState<LogisticsTimelineForm>(DEFAULT_LOGISTICS_TIMELINE_FORM);
  const [editingLogisticsTimelineId, setEditingLogisticsTimelineId] = useState<string | null>(null);
  const [editingLogisticsTimelineForm, setEditingLogisticsTimelineForm] =
    useState<LogisticsTimelineForm>(DEFAULT_LOGISTICS_TIMELINE_FORM);
  const [logisticsRoomForm, setLogisticsRoomForm] =
    useState<LogisticsRoomForm>(DEFAULT_LOGISTICS_ROOM_FORM);
  const [logisticsRoomNoteMode, setLogisticsRoomNoteMode] = useState('');
  const [logisticsRosterPaste, setLogisticsRosterPaste] = useState('');
  const [logisticsRosterInputOpen, setLogisticsRosterInputOpen] = useState(false);
  const [editingLogisticsParticipantId, setEditingLogisticsParticipantId] = useState<string | null>(null);
  const [editingLogisticsParticipantForm, setEditingLogisticsParticipantForm] =
    useState<LogisticsParticipantForm>(DEFAULT_LOGISTICS_PARTICIPANT_FORM);
  const [, setLogisticsMasterRoster] =
    useState<LogisticsParticipant[]>(() => loadLogisticsMasterRoster());
  const [logisticsMasterParticipantForm, setLogisticsMasterParticipantForm] =
    useState<LogisticsParticipantForm>(DEFAULT_LOGISTICS_PARTICIPANT_FORM);
  const [logisticsMasterRosterPaste, setLogisticsMasterRosterPaste] = useState('');
  const [logisticsMasterInputOpen, setLogisticsMasterInputOpen] = useState(false);
  const [logisticsRosterPassword, setLogisticsRosterPassword] = useState('');
  const [logisticsRosterUnlocked, setLogisticsRosterUnlocked] = useState(false);
  const [activeLogisticsRosterSourceId, setActiveLogisticsRosterSourceId] = useState<string | null>(null);
  const [logisticsAlertNow, setLogisticsAlertNow] = useState(() => new Date());
  const [trainingEvents, setTrainingEvents] = useState<TrainingEventRecord[]>(() => loadTrainingEvents());
  const [selectedTrainingLogisticsEventId, setSelectedTrainingLogisticsEventId] = useState('');
  const [trainingEventForm, setTrainingEventForm] = useState<TrainingEventForm>({
    name: '',
    date: '',
    venue: '',
    group: '',
    coach: '',
    notes: '',
  });
  const [editingTrainingEventId, setEditingTrainingEventId] = useState<string | null>(null);
  const [editingTrainingEventForm, setEditingTrainingEventForm] = useState<TrainingEventEditForm>({
    name: '',
    date: '',
    venue: '',
    group: '',
    coach: '',
    notes: '',
    createdAt: '',
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
  const [logisticsCloudReady, setLogisticsCloudReady] = useState(false);

  const pasteAreaRef = useRef<HTMLTextAreaElement>(null);
  const trainingCloudSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const teamTagCloudSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logisticsCloudSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logisticsFileInputRef = useRef<HTMLInputElement>(null);
  const logisticsDocumentImageInputRef = useRef<HTMLInputElement>(null);
  const logisticsMasterFileInputRef = useRef<HTMLInputElement>(null);
  const logisticsMasterDocumentImageInputRef = useRef<HTMLInputElement>(null);
  const { notifications, showNotification } = useNotification();
  const { featuredTeams, addTeam, removeTeam, toggleTeam } = useFeaturedTeams();

  useEffect(() => {
    const syncInstallAvailability = () => {
      setPwaInstallAvailable(canPromptPwaInstall());
    };

    syncInstallAvailability();
    window.addEventListener(INSTALL_READY_EVENT, syncInstallAvailability);
    return () => {
      window.removeEventListener(INSTALL_READY_EVENT, syncInstallAvailability);
    };
  }, []);

  const activeCompetition =
    competitions.find((competition) => competition.id === activeCompetitionId) ?? null;
  const activeLogisticsEvent =
    logisticsEvents.find((event) => event.id === activeLogisticsEventId) ?? null;
  const activeLogisticsRosterSourceEvent =
    logisticsEvents.find((event) => event.id === activeLogisticsRosterSourceId) ?? null;
  const logisticsParticipantsForSelectedItem = activeLogisticsEvent
    ? activeLogisticsEvent.participants.filter((participant) =>
      !activeLogisticsEventItem
      || participant.role !== '队员'
      || matchesLogisticsEventItem(participant.eventItem, activeLogisticsEventItem))
    : [];
  const logisticsMentors = activeLogisticsEvent
    ? activeLogisticsEvent.participants.filter((participant) =>
      ['教练', '领队'].includes(participant.role))
    : [];
  const logisticsStudents = activeLogisticsEvent
    ? activeLogisticsEvent.participants.filter((participant) =>
      participant.role === '队员'
      && (!activeLogisticsEventItem || matchesLogisticsEventItem(participant.eventItem, activeLogisticsEventItem)))
    : [];
  const logisticsRollCallNodes = activeLogisticsEvent
    ? activeLogisticsEvent.timeline.filter((item) => item.rollCallEnabled)
    : [];
  const logisticsRoomsForSelectedItem = activeLogisticsEvent
    ? activeLogisticsEvent.rooms.filter((room) =>
      room.participantIds.some((participantId) =>
        logisticsParticipantsForSelectedItem.some((participant) => participant.id === participantId)))
    : [];
  const logisticsRollCallTotal = logisticsRollCallNodes.length * logisticsStudents.length;
  const logisticsRollCallDone = activeLogisticsEvent
    ? logisticsRollCallNodes.reduce(
        (total, node) =>
        total + logisticsStudents.filter((student) =>
          normalizeLogisticsAttendanceStatus(activeLogisticsEvent.attendance[node.id]?.[student.id]) === '已到达').length,
        0,
      )
    : 0;
  const logisticsAggregatedRoster = aggregateLogisticsParticipantsFromEvents(logisticsEvents);
  const logisticsMasterStudents = logisticsAggregatedRoster.filter((participant) => participant.role === '队员');
  const logisticsMasterMentors = logisticsAggregatedRoster.filter((participant) =>
    participant.role === '教练' || participant.role === '领队');
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
  const personalLogisticsTasks = getPersonalLogisticsTasks(authUser, logisticsEvents, logisticsAlertNow);
  const personalTaskTotal = personalLogisticsTasks.reduce((total, task) => total + task.totalCount, 0);
  const personalTaskDone = personalLogisticsTasks.reduce((total, task) => total + task.arrivedCount, 0);
  const personalTaskWarningCount = personalLogisticsTasks.filter((task) => task.timeAlertStatus !== 'normal' && !task.isComplete).length;
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
    const timer = window.setInterval(() => {
      setLogisticsAlertNow(new Date());
    }, 30 * 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setLogisticsEvents((previous) => {
      let changed = false;
      const next = previous.map((event) => {
        const result = mergeLogisticsEventParticipantsUnique([], event.participants);
        if (result.participants.length !== event.participants.length || result.merged > 0) {
          changed = true;
          return {
            ...event,
            participants: result.participants,
          };
        }

        return event;
      });

      if (!changed) {
        return previous;
      }

      saveLogisticsEvents(next);
      return next;
    });
  }, []);

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
        const localSchedules = loadTrainingSchedules();
        const localState: TrainingCloudState = {
          events: hydrateTrainingEventsFromSchedules(loadTrainingEvents(), localSchedules),
          schedules: localSchedules,
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
    let cancelled = false;

    void (async () => {
      if (!authUser || !isSupabaseConfigured()) {
        setLogisticsCloudReady(false);
        return;
      }

      const accessToken = getStoredAccessToken();
      if (!accessToken) {
        setLogisticsCloudReady(false);
        return;
      }

      try {
        const localState: LogisticsCloudState = {
          events: loadLogisticsEvents(),
        };
        const remoteState = await fetchRemoteLogisticsState(accessToken);
        const mergedState = mergeLogisticsState(localState, remoteState);

        if (cancelled) {
          return;
        }

        setLogisticsEvents(mergedState.events);
        saveLogisticsEvents(mergedState.events);
        await saveRemoteLogisticsState(mergedState.events, accessToken);

        if (!cancelled) {
          setLogisticsCloudReady(true);
          showNotification('赛事后勤数据已连接 Supabase，登录设备会共享同一份后勤卡片。', 'success');
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        setLogisticsCloudReady(false);
        const message = error instanceof Error ? error.message : '未知错误';
        showNotification(`赛事后勤云端同步失败，暂时使用本地数据。原因：${message}`, 'error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authUser, showNotification]);

  useEffect(() => {
    if (!authUser || !logisticsCloudReady) {
      return;
    }

    const accessToken = getStoredAccessToken();
    if (!accessToken) {
      return;
    }

    if (logisticsCloudSaveTimerRef.current) {
      clearTimeout(logisticsCloudSaveTimerRef.current);
    }

    logisticsCloudSaveTimerRef.current = setTimeout(() => {
      void saveRemoteLogisticsState(logisticsEvents, accessToken).catch((error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        showNotification(`赛事后勤保存到 Supabase 失败：${message}`, 'error');
      });
    }, 500);

    return () => {
      if (logisticsCloudSaveTimerRef.current) {
        clearTimeout(logisticsCloudSaveTimerRef.current);
        logisticsCloudSaveTimerRef.current = null;
      }
    };
  }, [authUser, logisticsCloudReady, logisticsEvents, showNotification]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!isSupabaseConfigured()) {
        setTeamTagCloudReady(false);
        return;
      }

      const accessToken = getStoredAccessToken() ?? undefined;

      try {
        const localState: TeamTagCloudState = {
          tags: loadTeamTags(),
          options: loadTeamTagOptions(),
        };
        const remoteState = await fetchRemoteTeamTagState(accessToken);
        const mergedState = mergeTeamTagState(localState, remoteState);

        if (cancelled) {
          return;
        }

        setTeamTags(mergedState.tags);
        setTeamTagOptions(mergedState.options);
        saveTeamTags(mergedState.tags);
        saveTeamTagOptions(mergedState.options);

        await saveRemoteTeamTagState(mergedState.tags, mergedState.options, accessToken);

        if (!cancelled) {
          setTeamTagCloudReady(true);
          showNotification('赛队标注已连接 Supabase，同一账号体系下的设备会共享标签。', 'success');
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        setTeamTagCloudReady(false);
        const message = error instanceof Error ? error.message : '未知错误';
        showNotification(`赛队标注云同步失败，暂时只使用本地标签。原因：${message}`, 'error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authUser, showNotification]);

  useEffect(() => {
    if (!teamTagCloudReady) {
      return;
    }

    const accessToken = getStoredAccessToken() ?? undefined;

    if (teamTagCloudSaveTimerRef.current) {
      clearTimeout(teamTagCloudSaveTimerRef.current);
    }

    teamTagCloudSaveTimerRef.current = setTimeout(() => {
      void saveRemoteTeamTagState(teamTags, teamTagOptions, accessToken).catch((error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        showNotification(`赛队标注保存到 Supabase 失败：${message}`, 'error');
      });
    }, 500);

    return () => {
      if (teamTagCloudSaveTimerRef.current) {
        clearTimeout(teamTagCloudSaveTimerRef.current);
        teamTagCloudSaveTimerRef.current = null;
      }
    };
  }, [authUser, showNotification, teamTagCloudReady, teamTagOptions, teamTags]);

  useEffect(() => {
    if (!teamTagCloudReady) {
      return;
    }

    const refreshRemoteTeamTags = () => {
      const accessToken = getStoredAccessToken() ?? undefined;
      void fetchRemoteTeamTagState(accessToken)
        .then((remoteState) => {
          if (!remoteState) {
            return;
          }

          setTeamTags((previous) => {
            const next = normalizeTeamTagCloudMap(remoteState.tags);
            if (JSON.stringify(previous) === JSON.stringify(next)) {
              return previous;
            }

            saveTeamTags(next);
            return next;
          });

          setTeamTagOptions((previous) => {
            const next = normalizeTeamTagCloudOptions(remoteState.options);
            if (JSON.stringify(previous) === JSON.stringify(next)) {
              return previous;
            }

            saveTeamTagOptions(next);
            return next;
          });
        })
        .catch(() => {
          // Keep the UI quiet for transient background refresh failures.
        });
    };

    refreshRemoteTeamTags();
    const timer = window.setInterval(refreshRemoteTeamTags, 30 * 1000);

    return () => window.clearInterval(timer);
  }, [teamTagCloudReady]);

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
    if (
      (viewMode === 'logistics-event'
        || viewMode === 'logistics-event-roster'
        || viewMode === 'logistics-event-rooms')
      && !activeLogisticsEvent
    ) {
      setViewMode('logistics');
    }
  }, [viewMode, activeLogisticsEvent]);

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
    setActiveLogisticsEventItem(null);
    setSearchKeyword('');
    setAwaitingPaste(false);
  }, []);

  const handleOpenDataAnalysis = useCallback(() => {
    setViewMode('event-types');
    setActiveCompetitionId(null);
    setActiveLogisticsEventId(null);
    setSearchKeyword('');
    setAwaitingPaste(false);
  }, []);

  const handleOpenLogistics = useCallback(() => {
    setViewMode('logistics');
    setActiveCompetitionId(null);
    setActiveLogisticsEventId(null);
    setActiveLogisticsEventItem(null);
    setSearchKeyword('');
    setAwaitingPaste(false);
  }, []);

  const handleOpenMyTasks = useCallback(() => {
    setViewMode('my-tasks');
    setActiveCompetitionId(null);
    setActiveLogisticsEventId(null);
    setActiveLogisticsEventItem(null);
    setActiveLogisticsRosterSourceId(null);
    setActiveTrainingEventId(null);
    setSearchKeyword('');
    setAwaitingPaste(false);
    setPracticeExplorerAwaitingPaste(false);
  }, []);

  const handleInstallShortcut = useCallback(async () => {
    if (isStandalonePwa()) {
      showNotification('当前已经是桌面应用模式。', 'success');
      return;
    }

    const result = await requestPwaInstall();
    setPwaInstallAvailable(canPromptPwaInstall());

    if (result === 'prompted') {
      showNotification('已打开安装提示，请按浏览器提示确认。', 'success');
      return;
    }

    setInstallGuideOpen(true);
  }, [showNotification]);

  const handleOpenLogisticsRosterLibrary = useCallback(() => {
    setViewMode('logistics-roster');
    setActiveCompetitionId(null);
    setActiveLogisticsEventId(null);
    setActiveLogisticsEventItem(null);
    setActiveLogisticsRosterSourceId(null);
    setSearchKeyword('');
    setAwaitingPaste(false);
    setPracticeExplorerAwaitingPaste(false);
  }, []);

  const handleOpenLogisticsRosterSource = useCallback((eventId: string) => {
    const event = logisticsEvents.find((item) => item.id === eventId);
    if (!event) {
      showNotification('没有找到这场赛事。', 'error');
      return;
    }

    const detectedEventItem =
      LOGISTICS_EVENT_ITEM_OPTIONS.find((item) => matchesLogisticsEventItem(event.group, item)) || '';

    setActiveLogisticsRosterSourceId(eventId);
    setActiveLogisticsEventId(eventId);
    setActiveLogisticsEventItem(null);
    setLogisticsParticipantForm((previous) => ({
      ...previous,
      eventItem: detectedEventItem || previous.eventItem,
    }));
    setLogisticsRosterPaste('');
  }, [logisticsEvents, showNotification]);

  const handleBackToLogisticsRosterSources = useCallback(() => {
    setActiveLogisticsRosterSourceId(null);
    setActiveLogisticsEventId(null);
    setActiveLogisticsEventItem(null);
    setLogisticsRosterPaste('');
  }, []);

  const handleOpenLogisticsEvent = useCallback((id: string) => {
    setActiveLogisticsEventId(id);
    setActiveLogisticsEventItem(null);
    setViewMode('logistics-event');
    setActiveCompetitionId(null);
    setActiveTrainingEventId(null);
    setSearchKeyword('');
    setAwaitingPaste(false);
    setPracticeExplorerAwaitingPaste(false);
  }, []);

  const handleBackToLogistics = useCallback(() => {
    setViewMode('logistics');
    setActiveLogisticsEventId(null);
    setActiveLogisticsEventItem(null);
    setSearchKeyword('');
    setAwaitingPaste(false);
    setPracticeExplorerAwaitingPaste(false);
  }, []);

  const handleOpenTrainingPlan = useCallback(() => {
    const firstDatedEvent = trainingEvents.find((event) => event.date);
    if (firstDatedEvent) {
      setTrainingOverviewMonth(getMonthKey(firstDatedEvent.date));
    }
    setViewMode('training-plan');
    setActiveCompetitionId(null);
    setActiveLogisticsEventId(null);
    setActiveLogisticsEventItem(null);
    setActiveTrainingEventId(null);
    setSearchKeyword('');
    setAwaitingPaste(false);
    setPracticeExplorerAwaitingPaste(false);
  }, [trainingEvents]);

  const handleOpenSimulationSystem = useCallback(() => {
    setViewMode('simulation-system');
    setActiveCompetitionId(null);
    setActiveLogisticsEventId(null);
    setActiveLogisticsEventItem(null);
    setActiveTrainingEventId(null);
    setSearchKeyword('');
    setAwaitingPaste(false);
    setPracticeExplorerAwaitingPaste(false);
  }, []);

  const handleOpenScoreCalculator = useCallback(() => {
    setViewMode('score-calculator');
    setActiveCompetitionId(null);
    setActiveLogisticsEventId(null);
    setActiveLogisticsEventItem(null);
    setActiveTrainingEventId(null);
    setSearchKeyword('');
    setAwaitingPaste(false);
    setPracticeExplorerAwaitingPaste(false);
  }, []);

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
      participants: [],
      timeline: [],
      rooms: [],
      attendance: {},
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
      setActiveLogisticsEventId((currentId) => (currentId === id ? null : currentId));
      showNotification('已删除后勤赛事卡片。', 'info');
    },
    [canEdit, showNotification],
  );

  const handleStartEditLogisticsEventName = useCallback(
    (event: LogisticsEventRecord) => {
      if (!canEdit) {
        showNotification('当前账号没有编辑权限。', 'error');
        return;
      }

      setEditingLogisticsEventId(event.id);
      setEditingLogisticsEventName(event.name);
    },
    [canEdit, showNotification],
  );

  const handleCancelEditLogisticsEventName = useCallback(() => {
    setEditingLogisticsEventId(null);
    setEditingLogisticsEventName('');
  }, []);

  const handleSaveLogisticsEventName = useCallback(
    (id: string) => {
      if (!canEdit) {
        showNotification('当前账号没有编辑权限。', 'error');
        return;
      }

      const nextName = editingLogisticsEventName.trim();
      if (!nextName) {
        showNotification('赛事名称不能为空。', 'error');
        return;
      }

      setLogisticsEvents((previous) => {
        const next = previous.map((event) =>
          event.id === id
            ? {
              ...event,
              name: nextName,
            }
            : event,
        );
        saveLogisticsEvents(next);
        return next;
      });
      setEditingLogisticsEventId(null);
      setEditingLogisticsEventName('');
      showNotification('赛事名称已更新。', 'success');
    },
    [canEdit, editingLogisticsEventName, showNotification],
  );

  const handleStartEditLogisticsEventDate = useCallback(
    (event: LogisticsEventRecord) => {
      if (!canEdit) {
        showNotification('当前账号没有编辑权限。', 'error');
        return;
      }

      setEditingLogisticsEventDateId(event.id);
      setEditingLogisticsEventDate(event.date);
    },
    [canEdit, showNotification],
  );

  const handleCancelEditLogisticsEventDate = useCallback(() => {
    setEditingLogisticsEventDateId(null);
    setEditingLogisticsEventDate('');
  }, []);

  const handleSaveLogisticsEventDate = useCallback(
    (id: string) => {
      if (!canEdit) {
        showNotification('当前账号没有编辑权限。', 'error');
        return;
      }

      const nextDate = editingLogisticsEventDate.trim();
      setLogisticsEvents((previous) => {
        const next = previous.map((event) =>
          event.id === id
            ? {
              ...event,
              date: nextDate,
            }
            : event,
        );
        saveLogisticsEvents(next);
        return next;
      });
      setEditingLogisticsEventDateId(null);
      setEditingLogisticsEventDate('');
      showNotification(nextDate ? '赛事日期已更新。' : '赛事日期已清空。', 'success');
    },
    [canEdit, editingLogisticsEventDate, showNotification],
  );

  const updateActiveLogisticsEvent = useCallback(
    (updater: (event: LogisticsEventRecord) => LogisticsEventRecord) => {
      if (!activeLogisticsEventId) {
        return;
      }

      setLogisticsEvents((previous) => {
        const next = previous.map((event) =>
          event.id === activeLogisticsEventId ? updater(event) : event,
        );
        saveLogisticsEvents(next);
        return next;
      });
    },
    [activeLogisticsEventId],
  );

  const handleLogisticsParticipantFormChange = useCallback(
    (field: keyof LogisticsParticipantForm, value: string) => {
      setLogisticsParticipantForm((previous) => ({
        ...previous,
        [field]: value,
      }));
    },
    [],
  );

  const handleEditingLogisticsParticipantFormChange = useCallback(
    (field: keyof LogisticsParticipantForm, value: string) => {
      setEditingLogisticsParticipantForm((previous) => ({
        ...previous,
        [field]: value,
      }));
    },
    [],
  );

  const handleLogisticsMasterParticipantFormChange = useCallback(
    (field: keyof LogisticsParticipantForm, value: string) => {
      setLogisticsMasterParticipantForm((previous) => ({
        ...previous,
        [field]: value,
      }));
    },
    [],
  );

  const handleUnlockLogisticsRoster = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (logisticsRosterPassword.trim() !== LOGISTICS_ROSTER_ACCESS_PASSWORD) {
        showNotification('统一管理库密码不正确。', 'error');
        return;
      }

      setLogisticsRosterUnlocked(true);
      setLogisticsRosterPassword('');
      showNotification('已解锁队员信息统一管理库。', 'success');
    },
    [logisticsRosterPassword, showNotification],
  );

  const handleLockLogisticsRoster = useCallback(() => {
    setLogisticsRosterUnlocked(false);
    setLogisticsRosterPassword('');
    showNotification('已锁定队员信息统一管理库。', 'info');
  }, [showNotification]);

  const updateLogisticsMasterRoster = useCallback((updater: (participants: LogisticsParticipant[]) => LogisticsParticipant[]) => {
    setLogisticsMasterRoster((previous) => {
      const next = updater(previous);
      saveLogisticsMasterRoster(next);
      return next;
    });
  }, []);

  const handleAddFixedLogisticsStaffToMaster = useCallback(() => {
    if (!canEdit) {
      showNotification('当前账号没有编辑权限。', 'error');
      return;
    }

    updateLogisticsMasterRoster((previous) => {
      const result = mergeLogisticsParticipantsUnique(
        previous,
        createFixedLogisticsStaffParticipants('fixed-master'),
      );
      showNotification(
        `固定教练/领队已同步到统一库：新增 ${result.added} 人，合并 ${result.merged} 人。`,
        'success',
      );
      return result.participants;
    });
  }, [canEdit, showNotification, updateLogisticsMasterRoster]);

  const handleLogisticsTimelineFormChange = useCallback(
    (field: keyof LogisticsTimelineForm, value: string | boolean) => {
      setLogisticsTimelineForm((previous) => ({
        ...previous,
        [field]: value,
      }));
    },
    [],
  );

  const handleEditingLogisticsTimelineFormChange = useCallback(
    (field: keyof LogisticsTimelineForm, value: string | boolean) => {
      setEditingLogisticsTimelineForm((previous) => ({
        ...previous,
        [field]: value,
      }));
    },
    [],
  );

  const handleLogisticsRoomFormChange = useCallback(
    (field: keyof LogisticsRoomForm, value: string | string[]) => {
      setLogisticsRoomForm((previous) => ({
        ...previous,
        [field]: value,
      }));
    },
    [],
  );

  const handleToggleLogisticsRoomParticipant = useCallback((participantId: string) => {
    setLogisticsRoomForm((previous) => ({
      ...previous,
      participantIds: previous.participantIds.includes(participantId)
        ? previous.participantIds.filter((id) => id !== participantId)
        : [...previous.participantIds, participantId],
    }));
  }, []);

  const handleLogisticsDocumentImageFile = useCallback(
    async (file: File | undefined) => {
      if (!file) {
        return;
      }

      if (!file.type.startsWith('image/')) {
        showNotification('请选择证件照片图片文件。', 'error');
        return;
      }

      try {
        const dataUrl = await createCompressedImageDataUrl(file);
        setLogisticsParticipantForm((previous) => ({
          ...previous,
          idDocumentImage: dataUrl,
        }));
        showNotification('证件图像已添加。', 'success');
      } catch {
        showNotification('证件图像读取失败，请重新拍照或选择图片。', 'error');
      } finally {
        if (logisticsDocumentImageInputRef.current) {
          logisticsDocumentImageInputRef.current.value = '';
        }
      }
    },
    [showNotification],
  );

  const handleLogisticsMasterDocumentImageFile = useCallback(
    async (file: File | undefined) => {
      if (!file) {
        return;
      }

      if (!file.type.startsWith('image/')) {
        showNotification('请选择证件照片图片文件。', 'error');
        return;
      }

      try {
        const dataUrl = await createCompressedImageDataUrl(file);
        setLogisticsMasterParticipantForm((previous) => ({
          ...previous,
          idDocumentImage: dataUrl,
        }));
        showNotification('统一库证件图像已添加。', 'success');
      } catch {
        showNotification('证件图像读取失败，请重新拍照或选择图片。', 'error');
      } finally {
        if (logisticsMasterDocumentImageInputRef.current) {
          logisticsMasterDocumentImageInputRef.current.value = '';
        }
      }
    },
    [showNotification],
  );

  const handleAddLogisticsParticipant = useCallback(() => {
    if (!canEdit) {
      showNotification('当前账号没有编辑权限。', 'error');
      return;
    }

    const name = logisticsParticipantForm.name.trim();
    if (!name) {
      showNotification('请先填写人员姓名。', 'error');
      return;
    }

    const resolvedRole = getFixedLogisticsStaffRole(name) ?? (logisticsParticipantForm.role.trim() || '队员');
    const isTeamMember = resolvedRole === '队员';
    const nextParticipant: LogisticsParticipant = {
      id: `participant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      englishName: logisticsParticipantForm.englishName.trim(),
      gender: logisticsParticipantForm.gender.trim(),
      role: resolvedRole,
      eventItem: isTeamMember
        ? logisticsParticipantForm.eventItem.trim()
        : '',
      teamNo: isTeamMember
        ? logisticsParticipantForm.teamNo.trim()
        : '',
      teamName: isTeamMember
        ? logisticsParticipantForm.teamName.trim()
        : '',
      fieldPosition: isTeamMember
        ? logisticsParticipantForm.fieldPosition.trim()
        : '',
      phone: logisticsParticipantForm.phone.trim(),
      guardian: isTeamMember
        ? logisticsParticipantForm.guardian.trim()
        : '',
      guardianPhone: isTeamMember
        ? logisticsParticipantForm.guardianPhone.trim()
        : '',
      allergy: logisticsParticipantForm.allergy.trim(),
      idNumber: logisticsParticipantForm.idNumber.trim(),
      notes: logisticsParticipantForm.notes.trim(),
      idDocumentImage: logisticsParticipantForm.idDocumentImage,
      mentorId: isTeamMember ? logisticsParticipantForm.mentorId : '',
    };

    updateActiveLogisticsEvent((event) => ({
      ...event,
      participants: mergeLogisticsEventParticipantsUnique(event.participants, [nextParticipant]).participants,
    }));
    setLogisticsParticipantForm({
      ...DEFAULT_LOGISTICS_PARTICIPANT_FORM,
      eventItem: logisticsParticipantForm.eventItem,
      mentorId: logisticsParticipantForm.mentorId,
    });
    showNotification(`已加入后勤人员：${name}`, 'success');
  }, [canEdit, logisticsParticipantForm, showNotification, updateActiveLogisticsEvent]);

  const handleAddLogisticsMasterParticipant = useCallback(() => {
    if (!canEdit) {
      showNotification('当前账号没有编辑权限。', 'error');
      return;
    }

    const name = logisticsMasterParticipantForm.name.trim();
    if (!name) {
      showNotification('请先填写人员姓名。', 'error');
      return;
    }

    const resolvedRole = getFixedLogisticsStaffRole(name) ?? (logisticsMasterParticipantForm.role.trim() || '队员');
    const isTeamMember = resolvedRole === '队员';
    const nextParticipant: LogisticsParticipant = {
      id: `participant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      englishName: logisticsMasterParticipantForm.englishName.trim(),
      gender: logisticsMasterParticipantForm.gender.trim(),
      role: resolvedRole,
      eventItem: isTeamMember
        ? logisticsMasterParticipantForm.eventItem.trim()
        : '',
      teamNo: isTeamMember
        ? logisticsMasterParticipantForm.teamNo.trim()
        : '',
      teamName: '',
      fieldPosition: '',
      phone: logisticsMasterParticipantForm.phone.trim(),
      guardian: isTeamMember
        ? logisticsMasterParticipantForm.guardian.trim()
        : '',
      guardianPhone: isTeamMember
        ? logisticsMasterParticipantForm.guardianPhone.trim()
        : '',
      allergy: logisticsMasterParticipantForm.allergy.trim(),
      idNumber: logisticsMasterParticipantForm.idNumber.trim(),
      notes: logisticsMasterParticipantForm.notes.trim(),
      idDocumentImage: logisticsMasterParticipantForm.idDocumentImage,
      mentorId: '',
    };

    updateLogisticsMasterRoster((previous) => [nextParticipant, ...previous]);
    setLogisticsMasterParticipantForm({
      ...DEFAULT_LOGISTICS_PARTICIPANT_FORM,
      role: logisticsMasterParticipantForm.role,
      eventItem: logisticsMasterParticipantForm.eventItem,
    });
    showNotification(`已加入统一管理库：${name}`, 'success');
  }, [canEdit, logisticsMasterParticipantForm, showNotification, updateLogisticsMasterRoster]);

  const handleStartEditLogisticsParticipant = useCallback((participant: LogisticsParticipant) => {
    if (!canEdit) {
      showNotification('当前账号没有编辑权限。', 'error');
      return;
    }

    setEditingLogisticsParticipantId(participant.id);
    setEditingLogisticsParticipantForm({
      name: participant.name,
      englishName: participant.englishName,
      gender: participant.gender,
      role: participant.role || '队员',
      eventItem: participant.eventItem,
      teamNo: participant.teamNo,
      teamName: participant.teamName,
      fieldPosition: participant.fieldPosition,
      phone: participant.phone,
      guardian: participant.guardian,
      guardianPhone: participant.guardianPhone,
      allergy: participant.allergy,
      idNumber: participant.idNumber,
      notes: participant.notes || '身份证',
      idDocumentImage: participant.idDocumentImage,
      mentorId: participant.mentorId,
    });
  }, [canEdit, showNotification]);

  const handleCancelEditLogisticsParticipant = useCallback(() => {
    setEditingLogisticsParticipantId(null);
    setEditingLogisticsParticipantForm(DEFAULT_LOGISTICS_PARTICIPANT_FORM);
  }, []);

  const handleSaveLogisticsParticipant = useCallback(() => {
    if (!canEdit) {
      showNotification('当前账号没有编辑权限。', 'error');
      return;
    }

    if (!editingLogisticsParticipantId) {
      return;
    }

    const name = editingLogisticsParticipantForm.name.trim();
    if (!name) {
      showNotification('人员中文名不能为空。', 'error');
      return;
    }

    const resolvedRole = getFixedLogisticsStaffRole(name) ?? (editingLogisticsParticipantForm.role.trim() || '队员');
    const isTeamMember = resolvedRole === '队员';
    const nextParticipant: LogisticsParticipant = {
      id: editingLogisticsParticipantId,
      name,
      englishName: editingLogisticsParticipantForm.englishName.trim(),
      gender: editingLogisticsParticipantForm.gender.trim(),
      role: resolvedRole,
      eventItem: isTeamMember ? editingLogisticsParticipantForm.eventItem.trim() : '',
      teamNo: isTeamMember ? editingLogisticsParticipantForm.teamNo.trim() : '',
      teamName: isTeamMember ? editingLogisticsParticipantForm.teamName.trim() : '',
      fieldPosition: isTeamMember ? editingLogisticsParticipantForm.fieldPosition.trim() : '',
      phone: editingLogisticsParticipantForm.phone.trim(),
      guardian: isTeamMember ? editingLogisticsParticipantForm.guardian.trim() : '',
      guardianPhone: isTeamMember ? editingLogisticsParticipantForm.guardianPhone.trim() : '',
      allergy: editingLogisticsParticipantForm.allergy.trim(),
      idNumber: editingLogisticsParticipantForm.idNumber.trim(),
      notes: editingLogisticsParticipantForm.notes.trim(),
      idDocumentImage: editingLogisticsParticipantForm.idDocumentImage,
      mentorId: isTeamMember ? editingLogisticsParticipantForm.mentorId : '',
    };

    updateActiveLogisticsEvent((event) => ({
      ...event,
      participants: event.participants.map((participant) =>
        participant.id === editingLogisticsParticipantId ? nextParticipant : participant,
      ),
    }));
    setEditingLogisticsParticipantId(null);
    setEditingLogisticsParticipantForm(DEFAULT_LOGISTICS_PARTICIPANT_FORM);
    showNotification(`已更新人员信息：${name}`, 'success');
  }, [
    canEdit,
    editingLogisticsParticipantForm,
    editingLogisticsParticipantId,
    showNotification,
    updateActiveLogisticsEvent,
  ]);

  const handleDeleteLogisticsParticipant = useCallback(
    (participantId: string) => {
      if (!canEdit) {
        showNotification('当前账号没有编辑权限。', 'error');
        return;
      }

      updateActiveLogisticsEvent((event) => {
        const attendance = Object.fromEntries(
          Object.entries(event.attendance).map(([nodeId, rows]) => {
            const { [participantId]: _removed, ...restRows } = rows;
            return [nodeId, restRows];
          }),
        );

        return {
          ...event,
          participants: event.participants
            .filter((participant) => participant.id !== participantId)
            .map((participant) => ({
              ...participant,
              mentorId: participant.mentorId === participantId ? '' : participant.mentorId,
            })),
          attendance,
        };
      });
    },
    [canEdit, showNotification, updateActiveLogisticsEvent],
  );

  const syncLogisticsEventParticipantsToMaster = useCallback(
    (events: LogisticsEventRecord[], sourceLabel: string) => {
      if (!canEdit) {
        showNotification('当前账号没有编辑权限。', 'error');
        return;
      }

      const incomingParticipants = events.flatMap((event) => event.participants);
      if (incomingParticipants.length === 0) {
        showNotification(`${sourceLabel}暂无可同步人员。`, 'error');
        return;
      }

      let added = 0;
      let merged = 0;
      updateLogisticsMasterRoster((previous) => {
        const result = mergeLogisticsParticipantsUnique(previous, incomingParticipants);
        added = result.added;
        merged = result.merged;
        return result.participants;
      });

      showNotification(`${sourceLabel}同步完成：新增 ${added} 人，合并去重 ${merged} 人。`, 'success');
    },
    [canEdit, showNotification, updateLogisticsMasterRoster],
  );

  const handleSyncSingleLogisticsEventToMaster = useCallback(
    (eventId: string) => {
      const event = logisticsEvents.find((item) => item.id === eventId);
      if (!event) {
        showNotification('没有找到这场赛事。', 'error');
        return;
      }

      syncLogisticsEventParticipantsToMaster([event], event.name);
    },
    [logisticsEvents, showNotification, syncLogisticsEventParticipantsToMaster],
  );

  const handleSyncAllLogisticsEventsToMaster = useCallback(() => {
    syncLogisticsEventParticipantsToMaster(logisticsEvents, '全部后勤赛事');
  }, [logisticsEvents, syncLogisticsEventParticipantsToMaster]);

  const handleAssignLogisticsMentor = useCallback(
    (participantId: string, mentorId: string) => {
      if (!canEdit) {
        showNotification('当前账号没有编辑权限。', 'error');
        return;
      }

      updateActiveLogisticsEvent((event) => ({
        ...event,
        participants: event.participants.map((participant) =>
          participant.id === participantId ? { ...participant, mentorId } : participant,
        ),
      }));
    },
    [canEdit, showNotification, updateActiveLogisticsEvent],
  );

  const handleAddLogisticsTimelineItem = useCallback(() => {
    if (!canEdit) {
      showNotification('当前账号没有编辑权限。', 'error');
      return;
    }

    const title = logisticsTimelineForm.title.trim();
    if (!title) {
      showNotification('请先填写时间节点事项。', 'error');
      return;
    }

    const nextItem: LogisticsTimelineItem = {
      id: `timeline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date: logisticsTimelineForm.date,
      time: logisticsTimelineForm.time,
      title,
      location: logisticsTimelineForm.location.trim(),
      owner: logisticsTimelineForm.owner.trim(),
      notes: logisticsTimelineForm.notes.trim(),
      rollCallEnabled: logisticsTimelineForm.rollCallEnabled,
    };

    updateActiveLogisticsEvent((event) => ({
      ...event,
      timeline: [...event.timeline, nextItem].sort((left, right) =>
        `${left.date} ${left.time}`.localeCompare(`${right.date} ${right.time}`)),
      attendance: {
        ...event.attendance,
        [nextItem.id]: {},
      },
    }));
    setLogisticsTimelineForm({
      ...DEFAULT_LOGISTICS_TIMELINE_FORM,
      date: logisticsTimelineForm.date,
      time: logisticsTimelineForm.time,
    });
    showNotification(`已添加行程节点：${title}`, 'success');
  }, [canEdit, logisticsTimelineForm, showNotification, updateActiveLogisticsEvent]);

  const handleStartEditLogisticsTimelineItem = useCallback((item: LogisticsTimelineItem) => {
    if (!canEdit) {
      showNotification('当前账号没有编辑权限。', 'error');
      return;
    }

    setEditingLogisticsTimelineId(item.id);
    setEditingLogisticsTimelineForm({
      date: item.date,
      time: item.time,
      title: item.title,
      location: item.location,
      owner: item.owner,
      notes: item.notes,
      rollCallEnabled: item.rollCallEnabled,
    });
  }, [canEdit, showNotification]);

  const handleCancelEditLogisticsTimelineItem = useCallback(() => {
    setEditingLogisticsTimelineId(null);
    setEditingLogisticsTimelineForm(DEFAULT_LOGISTICS_TIMELINE_FORM);
  }, []);

  const handleSaveLogisticsTimelineItem = useCallback(() => {
    if (!canEdit) {
      showNotification('当前账号没有编辑权限。', 'error');
      return;
    }

    if (!editingLogisticsTimelineId) {
      return;
    }

    const title = editingLogisticsTimelineForm.title.trim();
    if (!title) {
      showNotification('时间节点事项不能为空。', 'error');
      return;
    }

    updateActiveLogisticsEvent((event) => ({
      ...event,
      timeline: event.timeline
        .map((item) =>
          item.id === editingLogisticsTimelineId
            ? {
              ...item,
              date: editingLogisticsTimelineForm.date,
              time: editingLogisticsTimelineForm.time,
              title,
              location: editingLogisticsTimelineForm.location.trim(),
              owner: editingLogisticsTimelineForm.owner.trim(),
              notes: editingLogisticsTimelineForm.notes.trim(),
              rollCallEnabled: editingLogisticsTimelineForm.rollCallEnabled,
            }
            : item,
        )
        .sort((left, right) => `${left.date} ${left.time}`.localeCompare(`${right.date} ${right.time}`)),
    }));
    setEditingLogisticsTimelineId(null);
    setEditingLogisticsTimelineForm(DEFAULT_LOGISTICS_TIMELINE_FORM);
    showNotification(`已更新行程节点：${title}`, 'success');
  }, [
    canEdit,
    editingLogisticsTimelineForm,
    editingLogisticsTimelineId,
    showNotification,
    updateActiveLogisticsEvent,
  ]);

  const handleDeleteLogisticsTimelineItem = useCallback(
    (timelineId: string) => {
      if (!canEdit) {
        showNotification('当前账号没有编辑权限。', 'error');
        return;
      }

      updateActiveLogisticsEvent((event) => {
        const { [timelineId]: _removed, ...attendance } = event.attendance;
        return {
          ...event,
          timeline: event.timeline.filter((item) => item.id !== timelineId),
          attendance,
        };
      });
    },
    [canEdit, showNotification, updateActiveLogisticsEvent],
  );

  const handleAddLogisticsRoom = useCallback(() => {
    if (!canEdit) {
      showNotification('当前账号没有编辑权限。', 'error');
      return;
    }

    const roomNo = logisticsRoomForm.roomNo.trim();
    if (!roomNo) {
      showNotification('请先填写房间号。', 'error');
      return;
    }

    if (logisticsRoomForm.participantIds.length === 0) {
      showNotification('请至少选择 1 名入住人员。', 'error');
      return;
    }

    const nextRoom: LogisticsRoomAssignment = {
      id: `room-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      roomNo,
      participantIds: logisticsRoomForm.participantIds,
      notes: logisticsRoomForm.notes.trim(),
    };

    updateActiveLogisticsEvent((event) => ({
      ...event,
      rooms: [nextRoom, ...event.rooms],
    }));
    setLogisticsRoomForm((previous) => ({
      ...previous,
      roomNo: '',
      participantIds: [],
    }));
    showNotification(`已添加房间：${roomNo}`, 'success');
  }, [canEdit, logisticsRoomForm, showNotification, updateActiveLogisticsEvent]);

  const handleDeleteLogisticsRoom = useCallback(
    (roomId: string) => {
      if (!canEdit) {
        showNotification('当前账号没有编辑权限。', 'error');
        return;
      }

      updateActiveLogisticsEvent((event) => ({
        ...event,
        rooms: event.rooms.filter((room) => room.id !== roomId),
      }));
      showNotification('已删除住房分配。', 'info');
    },
    [canEdit, showNotification, updateActiveLogisticsEvent],
  );

  const handleToggleLogisticsRollCall = useCallback(
    (timelineId: string) => {
      if (!canEdit) {
        showNotification('当前账号没有编辑权限。', 'error');
        return;
      }

      updateActiveLogisticsEvent((event) => ({
        ...event,
        timeline: event.timeline.map((item) =>
          item.id === timelineId ? { ...item, rollCallEnabled: !item.rollCallEnabled } : item,
        ),
      }));
    },
    [canEdit, showNotification, updateActiveLogisticsEvent],
  );

  const handleLogisticsAttendanceChange = useCallback(
    (timelineId: string, participantId: string, status: LogisticsAttendanceStatus) => {
      if (!canEdit) {
        showNotification('当前账号没有编辑权限。', 'error');
        return;
      }

      updateActiveLogisticsEvent((event) => ({
        ...event,
        attendance: {
          ...event.attendance,
          [timelineId]: {
            ...(event.attendance[timelineId] ?? {}),
            [participantId]: status,
          },
        },
      }));
    },
    [canEdit, showNotification, updateActiveLogisticsEvent],
  );

  const handlePersonalLogisticsAttendanceChange = useCallback(
    (eventId: string, timelineId: string, participantId: string, status: LogisticsAttendanceStatus) => {
      if (!canEdit) {
        showNotification('当前账号没有编辑权限。', 'error');
        return;
      }

      setLogisticsEvents((previous) => {
        const next = previous.map((event) =>
          event.id === eventId
            ? {
                ...event,
                attendance: {
                  ...event.attendance,
                  [timelineId]: {
                    ...(event.attendance[timelineId] ?? {}),
                    [participantId]: status,
                  },
                },
              }
            : event,
        );
        saveLogisticsEvents(next);
        return next;
      });
    },
    [canEdit, showNotification],
  );

  const importLogisticsRosterRows = useCallback((rows: string[][], sourceLabel: string) => {
    if (!canEdit) {
      showNotification('当前账号没有编辑权限。', 'error');
      return false;
    }

    if (rows.length < 2) {
      showNotification(`请提供带表头的队员信息表。${sourceLabel} 没有识别到有效数据。`, 'error');
      return false;
    }

    const headers = rows[0].map((header) => header.trim());
    const findColumn = (...names: string[]) =>
      headers.findIndex((header) => names.some((name) => header.includes(name)));
    const column = {
      name: findColumn('中文名', '姓名'),
      englishName: findColumn('英文名'),
      gender: findColumn('性别'),
      role: findColumn('角色'),
      eventItem: findColumn('赛项', '组别'),
      teamNo: findColumn('队号', '战队编号'),
      teamName: findColumn('队名', '战队名称'),
      fieldPosition: findColumn('赛场位置', '场地位置', '座位号'),
      phone: findColumn('手机', '小天才'),
      guardian: findColumn('监护人'),
      guardianPhone: findColumn('监护人联系电话', '联系电话'),
      allergy: findColumn('过敏史'),
      idNumber: findColumn('证件号码', '证件号'),
      notes: findColumn('证件类型', '证件信息', '备注'),
    };

    const imported = rows.slice(1).map((row) => {
      const value = (index: number) => (index >= 0 ? (row[index] ?? '').trim() : '');
      const name = value(column.name);
      if (!name) {
        return null;
      }

      const rawRole = value(column.role);
      const resolvedRole = getFixedLogisticsStaffRole(name)
        ?? (LOGISTICS_PARTICIPANT_ROLES.includes(rawRole) ? rawRole : '队员');
      const isTeamMember = resolvedRole === '队员';

      return {
        id: `participant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        englishName: value(column.englishName),
        gender: value(column.gender),
        role: resolvedRole,
        eventItem: isTeamMember ? value(column.eventItem) || activeLogisticsEventItem || '' : '',
        teamNo: isTeamMember ? value(column.teamNo) : '',
        teamName: isTeamMember ? value(column.teamName) : '',
        fieldPosition: isTeamMember ? value(column.fieldPosition) : '',
        phone: value(column.phone),
        guardian: isTeamMember ? value(column.guardian) : '',
        guardianPhone: isTeamMember ? value(column.guardianPhone) : '',
        allergy: value(column.allergy),
        idNumber: value(column.idNumber),
        notes: value(column.notes),
        idDocumentImage: '',
        mentorId: isTeamMember ? '' : '',
      } satisfies LogisticsParticipant;
    }).filter((participant): participant is LogisticsParticipant => Boolean(participant));

    if (imported.length === 0) {
      showNotification('没有识别到可导入的队员姓名。', 'error');
      return false;
    }

    let added = 0;
    let merged = 0;
    updateActiveLogisticsEvent((event) => {
      const result = mergeLogisticsEventParticipantsUnique(event.participants, imported);
      added = result.added;
      merged = result.merged;
      return {
        ...event,
        participants: result.participants,
      };
    });
    showNotification(`已从${sourceLabel}导入 ${imported.length} 条人员信息：新增 ${added} 人，合并 ${merged} 人。`, 'success');
    return true;
  }, [activeLogisticsEventItem, canEdit, showNotification, updateActiveLogisticsEvent]);

  const handleImportLogisticsRoster = useCallback(() => {
    const imported = importLogisticsRosterRows(parseLogisticsRosterText(logisticsRosterPaste), '粘贴文本');
    if (imported) {
      setLogisticsRosterPaste('');
    }
  }, [importLogisticsRosterRows, logisticsRosterPaste]);

  const handleImportLogisticsRosterFromClipboard = useCallback(async () => {
    if (!navigator.clipboard?.readText) {
      showNotification('当前浏览器不支持直接读取剪切板，请使用下方粘贴框导入。', 'error');
      return;
    }

    try {
      const text = await navigator.clipboard.readText();
      setLogisticsRosterPaste(text);
      importLogisticsRosterRows(parseLogisticsRosterText(text), '剪切板');
    } catch {
      showNotification('读取剪切板失败。请确认浏览器权限，或直接 Ctrl+V 粘贴到输入框。', 'error');
    }
  }, [importLogisticsRosterRows, showNotification]);

  const handleImportLogisticsRosterFile = useCallback(
    async (file: File | undefined) => {
      if (!file) {
        return;
      }

      try {
        const fileName = file.name.toLowerCase();
        let rows: string[][] = [];

        if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
          const buffer = await file.arrayBuffer();
          const workbook = XLSX.read(buffer, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[firstSheetName];
          rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
            header: 1,
            raw: false,
            defval: '',
          }).map((row) => row.map((cell) => String(cell).trim()));
        } else {
          rows = parseLogisticsRosterText(await file.text());
        }

        importLogisticsRosterRows(rows, 'Excel 文件');
      } catch {
        showNotification('Excel 文件解析失败，请确认文件格式，或复制表格内容后用剪切板导入。', 'error');
      } finally {
        if (logisticsFileInputRef.current) {
          logisticsFileInputRef.current.value = '';
        }
      }
    },
    [importLogisticsRosterRows, showNotification],
  );

  const importLogisticsMasterRosterRows = useCallback((rows: string[][], sourceLabel: string) => {
    if (!canEdit) {
      showNotification('当前账号没有编辑权限。', 'error');
      return false;
    }

    if (rows.length < 2) {
      showNotification(`请提供带表头的队员信息表。${sourceLabel} 没有识别到有效数据。`, 'error');
      return false;
    }

    const headers = rows[0].map((header) => header.trim());
    const findColumn = (...names: string[]) =>
      headers.findIndex((header) => names.some((name) => header.includes(name)));
    const column = {
      name: findColumn('中文名', '姓名'),
      englishName: findColumn('英文名'),
      gender: findColumn('性别'),
      role: findColumn('角色', '身份'),
      eventItem: findColumn('赛项', '组别'),
      teamNo: findColumn('队号', '战队编号'),
      teamName: findColumn('队名', '战队名称'),
      phone: findColumn('手机'),
      guardian: findColumn('监护人'),
      guardianPhone: findColumn('监护人联系电话', '联系电话'),
      allergy: findColumn('过敏史'),
      idNumber: findColumn('证件号码', '证件号'),
      notes: findColumn('证件类型', '证件信息', '备注'),
    };

    const imported = rows.slice(1).map((row) => {
      const value = (index: number) => (index >= 0 ? (row[index] ?? '').trim() : '');
      const name = value(column.name);
      if (!name) {
        return null;
      }

      const rawRole = value(column.role);
      const role = getFixedLogisticsStaffRole(name) ?? (LOGISTICS_PARTICIPANT_ROLES.includes(rawRole)
        ? rawRole
        : '队员');
      const isTeamMember = role === '队员';

      return {
        id: `participant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        englishName: value(column.englishName),
        gender: value(column.gender),
        role,
        eventItem: isTeamMember ? value(column.eventItem) : '',
        teamNo: isTeamMember ? value(column.teamNo) : '',
        teamName: '',
        fieldPosition: '',
        phone: value(column.phone),
        guardian: isTeamMember ? value(column.guardian) : '',
        guardianPhone: isTeamMember ? value(column.guardianPhone) : '',
        allergy: value(column.allergy),
        idNumber: value(column.idNumber),
        notes: value(column.notes) || '身份证',
        idDocumentImage: '',
        mentorId: '',
      } satisfies LogisticsParticipant;
    }).filter((participant): participant is LogisticsParticipant => Boolean(participant));

    if (imported.length === 0) {
      showNotification('没有识别到可导入的人员姓名。', 'error');
      return false;
    }

    updateLogisticsMasterRoster((previous) => [...imported, ...previous]);
    showNotification(`已从${sourceLabel}导入 ${imported.length} 条统一库人员信息。`, 'success');
    return true;
  }, [canEdit, showNotification, updateLogisticsMasterRoster]);

  const handleImportLogisticsMasterRoster = useCallback(() => {
    const imported = importLogisticsMasterRosterRows(parseLogisticsRosterText(logisticsMasterRosterPaste), '粘贴文本');
    if (imported) {
      setLogisticsMasterRosterPaste('');
    }
  }, [importLogisticsMasterRosterRows, logisticsMasterRosterPaste]);

  const handleImportLogisticsMasterRosterFromClipboard = useCallback(async () => {
    if (!navigator.clipboard?.readText) {
      showNotification('当前浏览器不支持直接读取剪切板，请使用下方粘贴框导入。', 'error');
      return;
    }

    try {
      const text = await navigator.clipboard.readText();
      setLogisticsMasterRosterPaste(text);
      importLogisticsMasterRosterRows(parseLogisticsRosterText(text), '剪切板');
    } catch {
      showNotification('读取剪切板失败。请确认浏览器权限，或直接 Ctrl+V 粘贴到输入框。', 'error');
    }
  }, [importLogisticsMasterRosterRows, showNotification]);

  const handleImportLogisticsMasterRosterFile = useCallback(
    async (file: File | undefined) => {
      if (!file) {
        return;
      }

      try {
        const fileName = file.name.toLowerCase();
        let rows: string[][] = [];

        if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
          const buffer = await file.arrayBuffer();
          const workbook = XLSX.read(buffer, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[firstSheetName];
          rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
            header: 1,
            raw: false,
            defval: '',
          }).map((row) => row.map((cell) => String(cell).trim()));
        } else {
          rows = parseLogisticsRosterText(await file.text());
        }

        importLogisticsMasterRosterRows(rows, 'Excel 文件');
      } catch {
        showNotification('Excel 文件解析失败，请确认文件格式，或复制表格内容后用剪切板导入。', 'error');
      } finally {
        if (logisticsMasterFileInputRef.current) {
          logisticsMasterFileInputRef.current.value = '';
        }
      }
    },
    [importLogisticsMasterRosterRows, showNotification],
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

  const handleSelectTrainingLogisticsEvent = useCallback((eventId: string) => {
    setSelectedTrainingLogisticsEventId(eventId);
    const source = logisticsEvents.find((event) => event.id === eventId);
    if (!source) return;
    setTrainingEventForm((previous) => ({
      ...previous,
      name: source.name,
      date: source.date,
      venue: source.venue,
      group: source.group,
      notes: source.notes || previous.notes,
    }));
  }, [logisticsEvents]);

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
    setSelectedTrainingLogisticsEventId('');
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

  const handleStartEditTrainingEvent = useCallback(
    (event: TrainingEventRecord) => {
      if (!canEdit) {
        showNotification('当前账号没有编辑权限。', 'error');
        return;
      }

      setEditingTrainingEventId(event.id);
      setEditingTrainingEventForm({
        name: event.name,
        date: event.date,
        venue: event.venue,
        group: event.group,
        coach: event.coach,
        notes: event.notes,
        createdAt: event.createdAt.slice(0, 10),
      });
    },
    [canEdit, showNotification],
  );

  const handleEditTrainingEventFormChange = useCallback(
    (field: keyof TrainingEventEditForm, value: string) => {
      setEditingTrainingEventForm((previous) => ({
        ...previous,
        [field]: value,
      }));
    },
    [],
  );

  const handleCancelEditTrainingEvent = useCallback(() => {
    setEditingTrainingEventId(null);
    setEditingTrainingEventForm({
      name: '',
      date: '',
      venue: '',
      group: '',
      coach: '',
      notes: '',
      createdAt: '',
    });
  }, []);

  const handleSaveTrainingEvent = useCallback(
    (id: string) => {
      if (!canEdit) {
        showNotification('当前账号没有编辑权限。', 'error');
        return;
      }

      const nextName = editingTrainingEventForm.name.trim();
      if (!nextName) {
        showNotification('比赛名称不能为空。', 'error');
        return;
      }

      const nextDate = editingTrainingEventForm.date.trim();
      const nextCreatedDate = editingTrainingEventForm.createdAt.trim();
      setTrainingEvents((previous) => {
        const next = previous.map((event) => {
          if (event.id !== id) {
            return event;
          }

          const previousDate = event.date;
          const calendarDates = nextDate
            ? Array.from(new Set([
              nextDate,
              ...event.calendarDates.filter((date) => date && date !== previousDate),
            ])).sort()
            : event.calendarDates.filter((date) => date !== previousDate);
          const calendarDateModes = { ...event.calendarDateModes };
          const calendarDateTimes = { ...event.calendarDateTimes };

          if (previousDate && nextDate && previousDate !== nextDate) {
            calendarDateModes[nextDate] = calendarDateModes[previousDate] ?? DEFAULT_TRAINING_DATE_MODE;
            calendarDateTimes[nextDate] = calendarDateTimes[previousDate] ?? '';
            delete calendarDateModes[previousDate];
            delete calendarDateTimes[previousDate];
          }

          if (nextDate && !calendarDateModes[nextDate]) {
            calendarDateModes[nextDate] = DEFAULT_TRAINING_DATE_MODE;
          }

          return {
            ...event,
            name: nextName,
            date: nextDate,
            calendarDates,
            calendarDateModes: normalizeTrainingDateModes(calendarDates, calendarDateModes),
            calendarDateTimes: normalizeTrainingDateTimes(calendarDates, calendarDateTimes),
            venue: editingTrainingEventForm.venue.trim(),
            group: editingTrainingEventForm.group.trim(),
            coach: editingTrainingEventForm.coach.trim(),
            notes: editingTrainingEventForm.notes.trim(),
            createdAt: nextCreatedDate ? new Date(`${nextCreatedDate}T00:00:00`).toISOString() : event.createdAt,
          };
        });

        saveTrainingEvents(next);
        return next;
      });

      if (nextDate) {
        setTrainingOverviewMonth(getMonthKey(nextDate));
      }
      handleCancelEditTrainingEvent();
      showNotification('集训比赛卡片信息已更新。', 'success');
    },
    [canEdit, editingTrainingEventForm, handleCancelEditTrainingEvent, showNotification],
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
    setActiveLogisticsEventId(null);
    setActiveLogisticsEventItem(null);
    setSearchKeyword('');
    setAwaitingPaste(false);
    setPracticeExplorerAwaitingPaste(false);
  }, []);

  const handleOpenPracticeExplorer = useCallback(() => {
    setViewMode('practice-explorer');
    setActiveCompetitionId(null);
    setActiveLogisticsEventId(null);
    setActiveLogisticsEventItem(null);
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
    setActiveLogisticsEventId(null);
    setActiveLogisticsEventItem(null);
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
                  {accountAction}
                </div>
              }
            />

            <section className={styles.portalSection}>
              <article className={`${styles.portalCard} ${styles.portalPriorityCard}`}>
                <div className={styles.portalCardTop}>
                  <div>
                    <p className={styles.portalCardLabel}>个人入口</p>
                    <h3>我的任务</h3>
                  </div>
                  <span className={styles.portalBadge}>Tasks</span>
                </div>
                <p className={styles.portalCardText}>
                  登录后自动读取分配给自己的后勤点名节点，只显示自己需要负责确认的队员，适合教练和领队在手机端现场使用。
                </p>
                <button className={styles.portalButton} onClick={authUser ? handleOpenMyTasks : () => setViewMode('login')}>
                  查看我的任务
                </button>
              </article>

              <article className={styles.installShortcutCard}>
                <div>
                  <p className={styles.portalCardLabel}>Mobile Shortcut</p>
                  <h3>把 MakeXRank 添加到手机桌面</h3>
                  <p>
                    添加后可以像内部 App 一样从手机桌面直接打开，适合教练现场点名、查看任务和录入数据。
                  </p>
                </div>
                <button className={styles.portalButton} type="button" onClick={handleInstallShortcut}>
                  {pwaInstallAvailable ? '一键添加到桌面' : '查看添加方法'}
                </button>
              </article>

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
        ) : viewMode === 'my-tasks' ? (
          <>
            <Header
              eyebrow="My Tasks"
              title="我的任务"
              subtitle="这里会自动汇总当前账号负责的后勤点名节点。教练或领队只需要处理自己名下的队员。"
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
              {!authUser ? (
                <article className={styles.logisticsEmpty}>
                  请先登录个人账号，再查看分配给自己的节点任务。
                </article>
              ) : (
                <>
                  <div className={styles.logisticsSummaryGrid}>
                    <article className={styles.parameterCard}>
                      <span>任务节点</span>
                      <strong>{personalLogisticsTasks.length}</strong>
                      <small>来自后勤时间轴</small>
                    </article>
                    <article className={styles.parameterCard}>
                      <span>点名进度</span>
                      <strong>{personalTaskTotal ? `${personalTaskDone}/${personalTaskTotal}` : '0'}</strong>
                      <small>只统计当前账号负责队员</small>
                    </article>
                    <article className={styles.parameterCard}>
                      <span>时间提醒</span>
                      <strong>{personalTaskWarningCount}</strong>
                      <small>5 分钟内或已到时</small>
                    </article>
                    <article className={styles.parameterCard}>
                      <span>当前账号</span>
                      <strong>{authUser.displayName}</strong>
                      <small>{authUser.role}</small>
                    </article>
                  </div>

                  {personalLogisticsTasks.length === 0 ? (
                    <article className={styles.logisticsEmpty}>
                      暂时没有匹配到你的点名任务。请确认后勤人员表里的教练/领队中文名、英文名或手机号，与当前账号资料能够对应。
                    </article>
                  ) : (
                    <div className={styles.personalTaskList}>
                      {personalLogisticsTasks.map((task) => (
                        <article
                          key={`${task.event.id}-${task.node.id}`}
                          className={`${styles.rollCallNode} ${
                            task.timeAlertStatus === 'soon' ? styles.rollCallNodeSoon : ''
                          } ${task.timeAlertStatus === 'due' ? styles.rollCallNodeDue : ''}`}
                        >
                          <div className={styles.portalCardTop}>
                            <div>
                              <p className={`${styles.portalCardLabel} ${styles.rollCallTimeLabel}`}>
                                <span>{task.event.name}</span>
                                <strong>{task.node.date || '未定日期'} {task.node.time || '未定时间'}</strong>
                              </p>
                              <h3>{task.node.title || '未命名节点'}</h3>
                            </div>
                            <div className={styles.rollCallStatusStack}>
                              {task.timeAlertLabel && (
                                <span className={`${styles.rollCallTimeAlert} ${
                                  task.timeAlertStatus === 'soon' ? styles.rollCallTimeAlertSoon : styles.rollCallTimeAlertDue
                                }`}
                                >
                                  {task.timeAlertLabel}
                                </span>
                              )}
                              <span className={`${styles.portalBadge} ${styles.rollCallProgressBadge} ${
                                task.isComplete ? styles.rollCallProgressComplete : styles.rollCallProgressWarning
                              }`}
                              >
                                {task.arrivedCount}
                                /{task.totalCount}
                              </span>
                            </div>
                          </div>

                          <div className={styles.personalTaskMeta}>
                            {task.node.location && <span>地点：{task.node.location}</span>}
                            {task.node.notes && <span>备注：{task.node.notes}</span>}
                          </div>

                          <div className={styles.mentorRollCallBlock}>
                            <div className={styles.mentorRollCallTitle}>
                              <strong>我的负责队员</strong>
                              <span className={task.isComplete ? styles.rollCallProgressComplete : styles.rollCallProgressWarning}>
                                {task.arrivedCount}
                                /{task.totalCount}
                              </span>
                            </div>
                            {task.students.map((student) => {
                              const attendanceStatus = normalizeLogisticsAttendanceStatus(
                                task.event.attendance[task.node.id]?.[student.id],
                              );
                              const nextAttendanceStatus: LogisticsAttendanceStatus =
                                attendanceStatus === LOGISTICS_ATTENDANCE_STATUS[1]
                                  ? LOGISTICS_ATTENDANCE_STATUS[0]
                                  : LOGISTICS_ATTENDANCE_STATUS[1];

                              return (
                                <div key={student.id} className={styles.attendanceRow}>
                                  <div>
                                    <strong>{student.name}</strong>
                                    <small>{[student.englishName, student.eventItem, student.teamNo, student.teamName].filter(Boolean).join(' / ')}</small>
                                  </div>
                                  <button
                                    className={`${styles.attendanceToggleButton} ${
                                      attendanceStatus === LOGISTICS_ATTENDANCE_STATUS[1] ? styles.attendanceToggleButtonArrived : ''
                                    }`}
                                    type="button"
                                    onClick={() =>
                                      handlePersonalLogisticsAttendanceChange(
                                        task.event.id,
                                        task.node.id,
                                        student.id,
                                        nextAttendanceStatus,
                                      )}
                                    disabled={!canEdit}
                                  >
                                    {attendanceStatus}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>

            <Footer lastUpdate="" isLobby storageMode={storageMode} />
          </>
        ) : viewMode === 'event-types' ? (
          <>
            <Header
              eyebrow="Event Selection"
              title="赛项选择"
              subtitle="先选赛项，再进入对应的二级赛事大厅。每个赛项都会独立保存自己的比赛卡片和数据。"
              action={
                <div className={styles.headerActions}>
                  <button className={styles.backButton} onClick={handleBackToHome}>
                    返回首页
                  </button>
                  {accountAction}
                </div>
              }
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

              <article
                className={`${styles.logisticsEventCard} ${styles.clickableCard}`}
                onClick={handleOpenLogisticsRosterLibrary}
              >
                <div className={styles.portalCardTop}>
                  <div>
                    <p className={styles.portalCardLabel}>敏感信息库</p>
                    <h3>队员信息统一管理库</h3>
                  </div>
                  <span className={styles.portalBadge}>Password</span>
                </div>
                <p className={styles.portalCardText}>
                  集中保存队员、家长、教练和领队信息。进入后需要再次输入密码，适合存放证件、手机、监护人等重要资料。
                </p>
                <div className={styles.logisticsMeta}>
                  <span>人员：{logisticsAggregatedRoster.length}</span>
                  <span>队员：{logisticsMasterStudents.length}</span>
                  <span>教练/领队：{logisticsMasterMentors.length}</span>
                </div>
                <div className={styles.cardActionRow}>
                  <span className={styles.cardEnterHint}>点击进入统一管理库</span>
                </div>
              </article>

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
                  logisticsEvents.map((event) => {
                    const isEditingName = editingLogisticsEventId === event.id;
                    const isEditingDate = editingLogisticsEventDateId === event.id;

                    return (
                      <article
                        key={event.id}
                        className={`${styles.logisticsEventCard} ${styles.clickableCard}`}
                        onClick={() => {
                          if (!isEditingName && !isEditingDate) {
                            handleOpenLogisticsEvent(event.id);
                          }
                        }}
                      >
                        <div className={styles.portalCardTop}>
                          <div>
                            <p className={styles.portalCardLabel}>赛事卡片</p>
                            {isEditingName ? (
                              <input
                                className={styles.cardTitleInput}
                                value={editingLogisticsEventName}
                                onClick={(clickEvent) => clickEvent.stopPropagation()}
                                onChange={(changeEvent) => setEditingLogisticsEventName(changeEvent.target.value)}
                                onKeyDown={(keyEvent) => {
                                  if (keyEvent.key === 'Enter') {
                                    keyEvent.preventDefault();
                                    handleSaveLogisticsEventName(event.id);
                                  }
                                  if (keyEvent.key === 'Escape') {
                                    handleCancelEditLogisticsEventName();
                                  }
                                }}
                                disabled={!canEdit}
                                autoFocus
                              />
                            ) : (
                              <h3>{event.name}</h3>
                            )}
                          </div>
                          {isEditingDate ? (
                            <input
                              className={styles.cardDateInput}
                              type="date"
                              value={editingLogisticsEventDate}
                              onClick={(clickEvent) => clickEvent.stopPropagation()}
                              onChange={(changeEvent) => setEditingLogisticsEventDate(changeEvent.target.value)}
                              onKeyDown={(keyEvent) => {
                                if (keyEvent.key === 'Enter') {
                                  keyEvent.preventDefault();
                                  handleSaveLogisticsEventDate(event.id);
                                }
                                if (keyEvent.key === 'Escape') {
                                  handleCancelEditLogisticsEventDate();
                                }
                              }}
                              disabled={!canEdit}
                              autoFocus
                            />
                          ) : (
                            <button
                              className={styles.portalBadgeButton}
                              onClick={(clickEvent) => {
                                clickEvent.stopPropagation();
                                handleStartEditLogisticsEventDate(event);
                              }}
                              disabled={!canEdit}
                              title="修改赛事日期"
                            >
                              {event.date || '未定日期'}
                            </button>
                          )}
                        </div>
                        <div className={styles.logisticsMeta}>
                          <span>地点：{event.venue || '未填写'}</span>
                          <span>组别：{event.group || '未填写'}</span>
                          <span>创建：{new Date(event.createdAt).toLocaleDateString('zh-CN')}</span>
                        </div>
                        {event.notes && <p className={styles.portalCardText}>{event.notes}</p>}
                        <div className={styles.cardActionRow}>
                          <span className={styles.cardEnterHint}>
                            {isEditingName
                              ? '正在更改赛事名称'
                              : isEditingDate
                                ? '正在修改赛事日期'
                                : '点击进入后勤工作台'}
                          </span>
                          <div className={styles.inlineButtonGroup}>
                            {isEditingName ? (
                              <>
                                <button
                                  className={styles.secondaryButton}
                                  onClick={(clickEvent) => {
                                    clickEvent.stopPropagation();
                                    handleSaveLogisticsEventName(event.id);
                                  }}
                                  disabled={!canEdit}
                                >
                                  保存名称
                                </button>
                                <button
                                  className={styles.dangerButton}
                                  onClick={(clickEvent) => {
                                    clickEvent.stopPropagation();
                                    handleCancelEditLogisticsEventName();
                                  }}
                                >
                                  取消
                                </button>
                              </>
                            ) : isEditingDate ? (
                              <>
                                <button
                                  className={styles.secondaryButton}
                                  onClick={(clickEvent) => {
                                    clickEvent.stopPropagation();
                                    handleSaveLogisticsEventDate(event.id);
                                  }}
                                  disabled={!canEdit}
                                >
                                  保存日期
                                </button>
                                <button
                                  className={styles.dangerButton}
                                  onClick={(clickEvent) => {
                                    clickEvent.stopPropagation();
                                    handleCancelEditLogisticsEventDate();
                                  }}
                                >
                                  取消
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  className={styles.secondaryButton}
                                  onClick={(clickEvent) => {
                                    clickEvent.stopPropagation();
                                    handleStartEditLogisticsEventName(event);
                                  }}
                                  disabled={!canEdit}
                                >
                                  更改名称
                                </button>
                                <button
                                  className={styles.secondaryButton}
                                  onClick={(clickEvent) => {
                                    clickEvent.stopPropagation();
                                    handleStartEditLogisticsEventDate(event);
                                  }}
                                  disabled={!canEdit}
                                >
                                  修改日期
                                </button>
                                <button
                                  className={styles.dangerButton}
                                  onClick={(clickEvent) => {
                                    clickEvent.stopPropagation();
                                    handleDeleteLogisticsEvent(event.id);
                                  }}
                                >
                                  删除卡片
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </section>

            <Footer lastUpdate="" isLobby storageMode={storageMode} />
          </>
        ) : viewMode === 'logistics-roster' ? (
          <>
            <Header
              eyebrow="Secure Roster"
              title="队员信息统一管理库"
              subtitle="这里集中维护队员、家长、教练和领队的重要资料。进入查看和编辑前需要单独输入密码。"
              action={
                <div className={styles.headerActions}>
                  <button className={styles.backButton} onClick={handleOpenLogistics}>
                    返回后勤管理
                  </button>
                  <button className={styles.backButton} onClick={handleBackToHome}>
                    返回首页
                  </button>
                  {accountAction}
                </div>
              }
            />

            <section className={styles.portalSection}>
              {!logisticsRosterUnlocked ? (
                <article className={`${styles.logisticsFormPanel} ${styles.secureRosterPanel}`}>
                  <div className={styles.portalCardTop}>
                    <div>
                      <p className={styles.portalCardLabel}>Password Required</p>
                      <h3>输入统一管理库密码</h3>
                    </div>
                    <span className={styles.portalBadge}>Locked</span>
                  </div>
                  <p className={styles.portalCardText}>
                    这个库会显示手机、监护人、证件类型和证件图像等重要信息，所以需要二次密码确认。
                  </p>
                  <form className={styles.secureRosterForm} onSubmit={handleUnlockLogisticsRoster}>
                    <label className={styles.logisticsField}>
                      <span>访问密码</span>
                      <input
                        type="password"
                        value={logisticsRosterPassword}
                        onChange={(event) => setLogisticsRosterPassword(event.target.value)}
                        placeholder="请输入统一管理库密码"
                        autoComplete="off"
                      />
                    </label>
                    <button className={styles.portalButton} type="submit">
                      解锁查看
                    </button>
                  </form>
                </article>
              ) : (
                <>
                  <div className={styles.logisticsSummaryGrid}>
                    <article className={styles.parameterCard}>
                      <span>总人员</span>
                      <strong>{logisticsAggregatedRoster.length}</strong>
                      <small>从单场比赛读取</small>
                    </article>
                    <article className={styles.parameterCard}>
                      <span>队员</span>
                      <strong>{logisticsMasterStudents.length}</strong>
                      <small>包含赛项与队伍信息</small>
                    </article>
                    <article className={styles.parameterCard}>
                      <span>教练/领队</span>
                      <strong>{logisticsMasterMentors.length}</strong>
                      <small>后续可绑定队员点名</small>
                    </article>
                    <article className={styles.parameterCard}>
                      <span>证件图像</span>
                      <strong>{logisticsAggregatedRoster.filter((participant) => participant.idDocumentImage).length}</strong>
                      <small>来自单场人员分表</small>
                    </article>
                  </div>

                  <article className={styles.logisticsFormPanel} hidden>
                    <div className={styles.portalCardTop}>
                      <div>
                        <p className={styles.portalCardLabel}>Event Sources</p>
                        <h3>按赛事同步到总表</h3>
                      </div>
                      <button
                        className={styles.secondaryButton}
                        onClick={handleSyncAllLogisticsEventsToMaster}
                        disabled={!canEdit || logisticsEvents.length === 0}
                      >
                        一键同步全部赛事
                      </button>
                    </div>
                    {activeLogisticsRosterSourceEvent ? (
                      <>
                        <div className={styles.cardActionRow}>
                          <button className={styles.backButton} onClick={handleBackToLogisticsRosterSources}>
                            返回赛事来源
                          </button>
                          <button
                            className={styles.portalButton}
                            onClick={() => handleSyncSingleLogisticsEventToMaster(activeLogisticsRosterSourceEvent.id)}
                            disabled={!canEdit || activeLogisticsRosterSourceEvent.participants.length === 0}
                          >
                            同步这场到总表
                          </button>
                        </div>

                        <div className={styles.logisticsEventCard}>
                          <div className={styles.portalCardTop}>
                            <div>
                              <p className={styles.portalCardLabel}>当前录入赛事</p>
                              <h3>{activeLogisticsRosterSourceEvent.name}</h3>
                            </div>
                            <span className={styles.portalBadge}>{activeLogisticsRosterSourceEvent.date || '未定日期'}</span>
                          </div>
                          <div className={styles.logisticsMeta}>
                            <span>地点：{activeLogisticsRosterSourceEvent.venue || '未填写'}</span>
                            <span>组别：{activeLogisticsRosterSourceEvent.group || '未填写'}</span>
                            <span>当前人员：{activeLogisticsRosterSourceEvent.participants.length}</span>
                          </div>
                        </div>

                        <div className={styles.logisticsFormGrid}>
                          <label className={styles.logisticsField}>
                            <span>身份</span>
                            <select
                              value={logisticsParticipantForm.role}
                              onChange={(event) => handleLogisticsParticipantFormChange('role', event.target.value)}
                              disabled={!canEdit}
                            >
                              {LOGISTICS_PARTICIPANT_ROLES.map((role) => (
                                <option key={role} value={role}>{role}</option>
                              ))}
                            </select>
                          </label>
                          <label className={styles.logisticsField}>
                            <span>中文名</span>
                            <input
                              value={logisticsParticipantForm.name}
                              onChange={(event) => handleLogisticsParticipantFormChange('name', event.target.value)}
                              placeholder="姓名"
                              disabled={!canEdit}
                            />
                          </label>
                          <label className={styles.logisticsField}>
                            <span>英文名</span>
                            <input
                              value={logisticsParticipantForm.englishName}
                              onChange={(event) => handleLogisticsParticipantFormChange('englishName', event.target.value)}
                              placeholder="English name"
                              disabled={!canEdit}
                            />
                          </label>
                          <label className={styles.logisticsField}>
                            <span>性别</span>
                            <input
                              value={logisticsParticipantForm.gender}
                              onChange={(event) => handleLogisticsParticipantFormChange('gender', event.target.value)}
                              placeholder="男 / 女"
                              disabled={!canEdit}
                            />
                          </label>
                          <label className={styles.logisticsField}>
                            <span>手机</span>
                            <input
                              value={logisticsParticipantForm.phone}
                              onChange={(event) => handleLogisticsParticipantFormChange('phone', event.target.value)}
                              placeholder="联系电话"
                              disabled={!canEdit}
                            />
                          </label>

                          {logisticsParticipantForm.role === '队员' && (
                            <>
                              <label className={styles.logisticsField}>
                                <span>赛项</span>
                                <select
                                  value={logisticsParticipantForm.eventItem}
                                  onChange={(event) => handleLogisticsParticipantFormChange('eventItem', event.target.value)}
                                  disabled={!canEdit}
                                >
                                  <option value="">请选择赛项</option>
                                  {LOGISTICS_EVENT_ITEM_OPTIONS.map((item) => (
                                    <option key={item} value={item}>{item}</option>
                                  ))}
                                </select>
                              </label>
                              <label className={styles.logisticsField}>
                                <span>队号</span>
                                <input
                                  value={logisticsParticipantForm.teamNo}
                                  onChange={(event) => handleLogisticsParticipantFormChange('teamNo', event.target.value)}
                                  placeholder="战队编号"
                                  disabled={!canEdit}
                                />
                              </label>
                              <label className={styles.logisticsField}>
                                <span>队名</span>
                                <input
                                  value={logisticsParticipantForm.teamName}
                                  onChange={(event) => handleLogisticsParticipantFormChange('teamName', event.target.value)}
                                  placeholder="战队名称"
                                  disabled={!canEdit}
                                />
                              </label>
                              <label className={styles.logisticsField}>
                                <span>赛场位置</span>
                                <input
                                  value={logisticsParticipantForm.fieldPosition}
                                  onChange={(event) => handleLogisticsParticipantFormChange('fieldPosition', event.target.value)}
                                  placeholder="例如：GIN22 / XE09"
                                  disabled={!canEdit}
                                />
                              </label>
                              <label className={styles.logisticsField}>
                                <span>监护人</span>
                                <input
                                  value={logisticsParticipantForm.guardian}
                                  onChange={(event) => handleLogisticsParticipantFormChange('guardian', event.target.value)}
                                  placeholder="监护人姓名"
                                  disabled={!canEdit}
                                />
                              </label>
                              <label className={styles.logisticsField}>
                                <span>监护人电话</span>
                                <input
                                  value={logisticsParticipantForm.guardianPhone}
                                  onChange={(event) => handleLogisticsParticipantFormChange('guardianPhone', event.target.value)}
                                  placeholder="监护人联系电话"
                                  disabled={!canEdit}
                                />
                              </label>
                              <label className={styles.logisticsField}>
                                <span>过敏史</span>
                                <input
                                  value={logisticsParticipantForm.allergy}
                                  onChange={(event) => handleLogisticsParticipantFormChange('allergy', event.target.value)}
                                  placeholder="无 / 具体说明"
                                  disabled={!canEdit}
                                />
                              </label>
                              <label className={styles.logisticsField}>
                                <span>证件信息</span>
                                <select
                                  value={logisticsParticipantForm.notes}
                                  onChange={(event) => handleLogisticsParticipantFormChange('notes', event.target.value)}
                                  disabled={!canEdit}
                                >
                                  {LOGISTICS_ID_DOCUMENT_OPTIONS.map((documentType) => (
                                    <option key={documentType} value={documentType}>{documentType}</option>
                                  ))}
                                </select>
                              </label>
                              <label className={styles.logisticsField}>
                                <span>证件号码</span>
                                <input
                                  value={logisticsParticipantForm.idNumber}
                                  onChange={(event) => handleLogisticsParticipantFormChange('idNumber', event.target.value)}
                                  placeholder="证件号码"
                                  disabled={!canEdit}
                                />
                              </label>
                            </>
                          )}
                        </div>

                        <div className={styles.cardActionRow}>
                          <button className={styles.portalButton} onClick={handleAddLogisticsParticipant} disabled={!canEdit}>
                            新增到这场赛事
                          </button>
                          <input
                            ref={logisticsFileInputRef}
                            className={styles.hiddenFileInput}
                            type="file"
                            accept=".xlsx,.xls,.csv,.tsv,.txt"
                            onChange={(event) => handleImportLogisticsRosterFile(event.target.files?.[0])}
                            disabled={!canEdit}
                          />
                          <button
                            className={styles.secondaryButton}
                            onClick={() => logisticsFileInputRef.current?.click()}
                            disabled={!canEdit}
                          >
                            Excel 表格导入
                          </button>
                          <button
                            className={styles.secondaryButton}
                            onClick={handleImportLogisticsRosterFromClipboard}
                            disabled={!canEdit}
                          >
                            读取剪切板导入
                          </button>
                        </div>

                        <label className={`${styles.logisticsField} ${styles.logisticsWideField}`}>
                          <span>手动粘贴表格内容</span>
                          <textarea
                            value={logisticsRosterPaste}
                            onChange={(event) => setLogisticsRosterPaste(event.target.value)}
                            placeholder="从 Excel 复制包含“中文名、身份/角色、赛项、队号、队名、手机、监护人、过敏史、证件信息”等表头的区域后粘贴到这里"
                            disabled={!canEdit}
                          />
                        </label>
                        <button className={styles.secondaryButton} onClick={handleImportLogisticsRoster} disabled={!canEdit}>
                          解析粘贴框内容
                        </button>

                        <div className={styles.logisticsTableWrap}>
                          {activeLogisticsRosterSourceEvent.participants.length === 0 ? (
                            <div className={styles.logisticsEmpty}>这场赛事暂无人员。可以手动新增，也可以从剪切板或 Excel 表格导入。</div>
                          ) : (
                            <table className={styles.logisticsTable}>
                              <thead>
                                <tr>
                                  <th>中文名</th>
                                  <th>英文名</th>
                                  <th>性别</th>
                                  <th>身份</th>
                                  <th>赛项 / 队伍</th>
                                  <th>赛场位置</th>
                                  <th>手机</th>
                                  <th>监护信息</th>
                                  <th>证件 / 过敏史</th>
                                </tr>
                              </thead>
                              <tbody>
                                {activeLogisticsRosterSourceEvent.participants.map((participant) => (
                                  <tr key={participant.id}>
                                    <td><strong>{participant.name}</strong></td>
                                    <td>{participant.englishName || '未填'}</td>
                                    <td>{participant.gender || '未填'}</td>
                                    <td>{participant.role}</td>
                                    <td>
                                      {renderLogisticsEventItemBadges(participant.eventItem)}
                                      {(participant.teamNo || participant.teamName) && (
                                        <small>{[participant.teamNo, participant.teamName].filter(Boolean).join(' / ')}</small>
                                      )}
                                    </td>
                                    <td>{participant.fieldPosition || '未填'}</td>
                                    <td>{participant.phone || '未填'}</td>
                                    <td>
                                      {participant.guardian || '无'}
                                      {participant.guardianPhone && <small>{participant.guardianPhone}</small>}
                                    </td>
                                    <td>
                                      {participant.notes || '未填'}
                                      {participant.idNumber && <small>{participant.idNumber}</small>}
                                      {participant.allergy && <small>过敏史：{participant.allergy}</small>}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <p className={styles.portalCardText}>
                          下方卡片来自“后勤管理工作台”中创建的每一场比赛。点击卡片进入后，可以手动输入人员，也可以从剪切板或 Excel 表格导入，再同步到统一人员总表。
                        </p>

                        <div className={styles.logisticsCards}>
                          {logisticsEvents.length === 0 ? (
                            <div className={styles.logisticsEmpty}>
                              暂无赛事卡片。请先回到后勤管理工作台，填写赛事信息并生成比赛卡片。
                            </div>
                          ) : (
                            logisticsEvents.map((event) => {
                              const eventStudents = event.participants.filter((participant) => participant.role === '队员');
                              const eventMentors = event.participants.filter((participant) =>
                                participant.role === '教练' || participant.role === '领队');

                              return (
                                <article
                                  key={event.id}
                                  className={`${styles.logisticsEventCard} ${styles.clickableCard}`}
                                  onClick={() => handleOpenLogisticsRosterSource(event.id)}
                                >
                                  <div className={styles.portalCardTop}>
                                    <div>
                                      <p className={styles.portalCardLabel}>赛事人员来源</p>
                                      <h3>{event.name}</h3>
                                    </div>
                                    <span className={styles.portalBadge}>{event.date || '未定日期'}</span>
                                  </div>
                                  <div className={styles.logisticsMeta}>
                                    <span>地点：{event.venue || '未填写'}</span>
                                    <span>组别：{event.group || '未填写'}</span>
                                    <span>人员：{event.participants.length}</span>
                                    <span>队员：{eventStudents.length}</span>
                                    <span>教练/领队：{eventMentors.length}</span>
                                  </div>
                                  <div className={styles.cardActionRow}>
                                    <span className={styles.cardEnterHint}>点击录入 / 导入这场人员</span>
                                    <button
                                      className={styles.portalButton}
                                      onClick={(clickEvent) => {
                                        clickEvent.stopPropagation();
                                        handleSyncSingleLogisticsEventToMaster(event.id);
                                      }}
                                      disabled={!canEdit || event.participants.length === 0}
                                    >
                                      同步这场到总表
                                    </button>
                                  </div>
                                </article>
                              );
                            })
                          )}
                        </div>
                      </>
                    )}
                  </article>

                  <article className={styles.logisticsFormPanel} hidden>
                    <div className={styles.portalCardTop}>
                      <div>
                        <p className={styles.portalCardLabel}>Roster Input</p>
                        <h3>新增统一库人员</h3>
                      </div>
                      <div className={styles.timelineActions}>
                        <button
                          className={styles.secondaryButton}
                          onClick={handleAddFixedLogisticsStaffToMaster}
                          disabled={!canEdit}
                        >
                          同步固定教练/领队
                        </button>
                        <button
                          className={styles.secondaryButton}
                          onClick={() => setLogisticsMasterInputOpen((previous) => !previous)}
                        >
                          {logisticsMasterInputOpen ? '收起新增' : '展开新增'}
                        </button>
                        <button className={styles.ghostButton} onClick={handleLockLogisticsRoster}>
                          锁定
                        </button>
                      </div>
                    </div>
                    <p className={styles.portalCardText}>
                      需要单独录入人员时再展开。只有“队员”会显示赛项、队号、队名、监护人、证件图像等扩展信息。
                    </p>

                    {logisticsMasterInputOpen && (
                      <>
                        <div className={styles.logisticsFormGrid}>
                          <label className={styles.logisticsField}>
                            <span>身份</span>
                            <select
                              value={logisticsMasterParticipantForm.role}
                              onChange={(event) => handleLogisticsMasterParticipantFormChange('role', event.target.value)}
                              disabled={!canEdit}
                            >
                              {LOGISTICS_PARTICIPANT_ROLES.map((role) => (
                                <option key={role} value={role}>{role}</option>
                              ))}
                            </select>
                          </label>
                      <label className={styles.logisticsField}>
                        <span>中文名</span>
                        <input
                          value={logisticsMasterParticipantForm.name}
                          onChange={(event) => handleLogisticsMasterParticipantFormChange('name', event.target.value)}
                          placeholder="姓名"
                          disabled={!canEdit}
                        />
                      </label>
                      <label className={styles.logisticsField}>
                        <span>英文名</span>
                        <input
                          value={logisticsMasterParticipantForm.englishName}
                          onChange={(event) => handleLogisticsMasterParticipantFormChange('englishName', event.target.value)}
                          placeholder="English name"
                          disabled={!canEdit}
                        />
                      </label>
                      <label className={styles.logisticsField}>
                        <span>手机</span>
                        <input
                          value={logisticsMasterParticipantForm.phone}
                          onChange={(event) => handleLogisticsMasterParticipantFormChange('phone', event.target.value)}
                          placeholder="联系电话"
                          disabled={!canEdit}
                        />
                      </label>

                      {logisticsMasterParticipantForm.role === '队员' && (
                        <>
                          <label className={styles.logisticsField}>
                            <span>赛项</span>
                            <select
                              value={logisticsMasterParticipantForm.eventItem}
                              onChange={(event) => handleLogisticsMasterParticipantFormChange('eventItem', event.target.value)}
                              disabled={!canEdit}
                            >
                              <option value="">请选择赛项</option>
                              {LOGISTICS_EVENT_ITEM_OPTIONS.map((item) => (
                                <option key={item} value={item}>{item}</option>
                              ))}
                            </select>
                          </label>
                          <label className={styles.logisticsField}>
                            <span>队号</span>
                            <input
                              value={logisticsMasterParticipantForm.teamNo}
                              onChange={(event) => handleLogisticsMasterParticipantFormChange('teamNo', event.target.value)}
                              placeholder="战队编号"
                              disabled={!canEdit}
                            />
                          </label>
                          <label className={styles.logisticsField}>
                            <span>队名</span>
                            <input
                              value={logisticsMasterParticipantForm.teamName}
                              onChange={(event) => handleLogisticsMasterParticipantFormChange('teamName', event.target.value)}
                              placeholder="战队名称"
                              disabled={!canEdit}
                            />
                          </label>
                          <label className={styles.logisticsField}>
                            <span>监护人</span>
                            <input
                              value={logisticsMasterParticipantForm.guardian}
                              onChange={(event) => handleLogisticsMasterParticipantFormChange('guardian', event.target.value)}
                              placeholder="监护人姓名"
                              disabled={!canEdit}
                            />
                          </label>
                          <label className={styles.logisticsField}>
                            <span>监护人电话</span>
                            <input
                              value={logisticsMasterParticipantForm.guardianPhone}
                              onChange={(event) => handleLogisticsMasterParticipantFormChange('guardianPhone', event.target.value)}
                              placeholder="监护人联系电话"
                              disabled={!canEdit}
                            />
                          </label>
                          <label className={styles.logisticsField}>
                            <span>过敏史</span>
                            <input
                              value={logisticsMasterParticipantForm.allergy}
                              onChange={(event) => handleLogisticsMasterParticipantFormChange('allergy', event.target.value)}
                              placeholder="无 / 具体说明"
                              disabled={!canEdit}
                            />
                          </label>
                          <label className={styles.logisticsField}>
                            <span>证件信息</span>
                            <select
                              value={logisticsMasterParticipantForm.notes}
                              onChange={(event) => handleLogisticsMasterParticipantFormChange('notes', event.target.value)}
                              disabled={!canEdit}
                            >
                              {LOGISTICS_ID_DOCUMENT_OPTIONS.map((documentType) => (
                                <option key={documentType} value={documentType}>{documentType}</option>
                              ))}
                            </select>
                          </label>
                          <div className={`${styles.logisticsField} ${styles.logisticsWideField}`}>
                            <span>证件图像</span>
                            <input
                              ref={logisticsMasterDocumentImageInputRef}
                              className={styles.hiddenFileInput}
                              type="file"
                              accept="image/*"
                              capture="environment"
                              onChange={(event) => handleLogisticsMasterDocumentImageFile(event.target.files?.[0])}
                              disabled={!canEdit}
                            />
                            <div className={styles.documentImagePanel}>
                              {logisticsMasterParticipantForm.idDocumentImage ? (
                                <img src={logisticsMasterParticipantForm.idDocumentImage} alt="统一库证件图像预览" />
                              ) : (
                                <div className={styles.documentImagePlaceholder}>尚未上传证件图像</div>
                              )}
                              <div className={styles.documentImageActions}>
                                <button
                                  className={styles.secondaryButton}
                                  onClick={() => logisticsMasterDocumentImageInputRef.current?.click()}
                                  disabled={!canEdit}
                                >
                                  上传/拍照证件图像
                                </button>
                                {logisticsMasterParticipantForm.idDocumentImage && (
                                  <button
                                    className={styles.ghostButton}
                                    onClick={() => handleLogisticsMasterParticipantFormChange('idDocumentImage', '')}
                                    disabled={!canEdit}
                                  >
                                    移除图像
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    <div className={styles.cardActionRow}>
                      <button className={styles.portalButton} onClick={handleAddLogisticsMasterParticipant} disabled={!canEdit}>
                        新增到统一库
                      </button>
                      <input
                        ref={logisticsMasterFileInputRef}
                        className={styles.hiddenFileInput}
                        type="file"
                        accept=".xlsx,.xls,.csv,.tsv,.txt"
                        onChange={(event) => handleImportLogisticsMasterRosterFile(event.target.files?.[0])}
                        disabled={!canEdit}
                      />
                      <button
                        className={styles.secondaryButton}
                        onClick={() => logisticsMasterFileInputRef.current?.click()}
                        disabled={!canEdit}
                      >
                        Excel 表格导入
                      </button>
                      <button
                        className={styles.secondaryButton}
                        onClick={handleImportLogisticsMasterRosterFromClipboard}
                        disabled={!canEdit}
                      >
                        读取剪切板导入
                      </button>
                    </div>

                    <label className={`${styles.logisticsField} ${styles.logisticsWideField}`}>
                      <span>手动粘贴表格内容</span>
                      <textarea
                        value={logisticsMasterRosterPaste}
                        onChange={(event) => setLogisticsMasterRosterPaste(event.target.value)}
                        placeholder="从 Excel 复制包含“中文名、身份、赛项、队号、队名、手机、监护人、过敏史、证件信息”等表头的区域后粘贴到这里"
                        disabled={!canEdit}
                      />
                    </label>
                    <button className={styles.secondaryButton} onClick={handleImportLogisticsMasterRoster} disabled={!canEdit}>
                      解析粘贴框内容
                    </button>
                      </>
                    )}
                  </article>

                  <article className={styles.logisticsFormPanel}>
                    <div className={styles.portalCardTop}>
                      <div>
                        <p className={styles.portalCardLabel}>Master Roster</p>
                        <h3>统一人员信息表</h3>
                      </div>
                      <span className={styles.portalBadge}>{logisticsAggregatedRoster.length} 人</span>
                    </div>

                    {logisticsAggregatedRoster.length === 0 ? (
                      <div className={styles.logisticsEmpty}>暂无人员。请先进入某一场后勤赛事，在“本场人员分表”中录入或导入人员。</div>
                    ) : (
                      <div className={styles.logisticsTableWrap}>
                        <table className={styles.logisticsTable}>
                          <thead>
                            <tr>
                              <th>中文名</th>
                              <th>英文名</th>
                              <th>身份</th>
                              <th>赛项</th>
                              <th>手机</th>
                              <th>监护信息</th>
                              <th>证件 / 过敏史</th>
                            </tr>
                          </thead>
                          <tbody>
                            {logisticsAggregatedRoster.map((participant) => (
                              <tr key={participant.id}>
                                <td><strong>{participant.name}</strong></td>
                                <td>{participant.englishName || '未填'}</td>
                                <td>{participant.role}</td>
                                <td>
                                  {renderLogisticsEventItemBadges(participant.eventItem)}
                                </td>
                                <td>{participant.phone || '未填'}</td>
                                <td>
                                  {participant.guardian || '无'}
                                  {participant.guardianPhone && <small>{participant.guardianPhone}</small>}
                                </td>
                                <td>
                                  {participant.notes || '未填'}
                                  {participant.idNumber && <small>{participant.idNumber}</small>}
                                  {participant.allergy && <small>过敏史：{participant.allergy}</small>}
                                  {participant.idDocumentImage && (
                                    <img
                                      className={styles.documentThumb}
                                      src={participant.idDocumentImage}
                                      alt={`${participant.name} 证件图像`}
                                    />
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </article>
                </>
              )}
            </section>

            <Footer lastUpdate="" isLobby storageMode={storageMode} />
          </>
        ) : (
          viewMode === 'logistics-event'
          || viewMode === 'logistics-event-roster'
          || viewMode === 'logistics-event-rooms'
        ) && activeLogisticsEvent ? (
          <>
            <Header
              eyebrow={
                viewMode === 'logistics-event-roster'
                  ? 'Roster Sheet'
                  : viewMode === 'logistics-event-rooms'
                    ? 'Room Assignment'
                    : 'Logistics Event'
              }
              title={
                viewMode === 'logistics-event-roster'
                  ? '本场人员分表'
                  : viewMode === 'logistics-event-rooms'
                    ? '住房分配'
                    : activeLogisticsEvent.name
              }
              subtitle={
                viewMode === 'logistics-event-roster'
                  ? '在这里录入、导入和维护本场比赛人员。队名和赛场位置只保存在本场分表。'
                  : viewMode === 'logistics-event-rooms'
                    ? '在这里选择入住人员、生成房间记录，并统一查看本场住宿安排。'
                    : '这里是单场赛事的后勤二级工作台，可以继续承载物资、人员、场地、签到和任务分工。'
              }
              action={
                <div className={styles.headerActions}>
                  {viewMode === 'logistics-event-roster' || viewMode === 'logistics-event-rooms' ? (
                    <button className={styles.backButton} onClick={() => setViewMode('logistics-event')}>
                      返回单场后勤
                    </button>
                  ) : (
                    <button className={styles.backButton} onClick={handleBackToLogistics}>
                      返回后勤管理
                    </button>
                  )}
                  <button className={styles.backButton} onClick={handleBackToHome}>
                    返回首页
                  </button>
                  {accountAction}
                </div>
              }
            />

            <section className={styles.portalSection}>
              <article className={styles.logisticsEventCard}>
                <div className={styles.portalCardTop}>
                  <div>
                    <p className={styles.portalCardLabel}>赛事信息</p>
                    <h3>{activeLogisticsEvent.name}</h3>
                  </div>
                  <span className={styles.portalBadge}>{activeLogisticsEvent.date || '未定日期'}</span>
                </div>
                <div className={styles.logisticsMeta}>
                  <span>地点：{activeLogisticsEvent.venue || '未填写'}</span>
                  <span>组别/赛项：{activeLogisticsEvent.group || '未填写'}</span>
                  <span>创建：{new Date(activeLogisticsEvent.createdAt).toLocaleDateString('zh-CN')}</span>
                </div>
                {activeLogisticsEvent.notes && (
                  <p className={styles.portalCardText}>{activeLogisticsEvent.notes}</p>
                )}
              </article>

              {viewMode === 'logistics-event' && !activeLogisticsEventItem && (
                <article
                  className={`${styles.logisticsEventCard} ${styles.clickableCard}`}
                  onClick={() => setViewMode('logistics-event-roster')}
                >
                  <div className={styles.portalCardTop}>
                    <div>
                      <p className={styles.portalCardLabel}>Roster Sheet</p>
                      <h3>本场人员分表</h3>
                    </div>
                    <span className={styles.portalBadge}>{activeLogisticsEvent.participants.length} 人</span>
                  </div>
                  <p className={styles.portalCardText}>
                    录入、导入和维护本场比赛人员。队名、队号和赛场位置只保存在本场分表。
                  </p>
                  <div className={styles.cardActionRow}>
                    <span className={styles.cardEnterHint}>点击进入本场人员分表</span>
                    <button className={styles.portalButton} type="button">
                      进入人员分表
                    </button>
                  </div>
                </article>
              )}

              {viewMode === 'logistics-event' && !activeLogisticsEventItem && (
                <article
                  className={`${styles.logisticsEventCard} ${styles.clickableCard}`}
                  onClick={() => setViewMode('logistics-event-rooms')}
                >
                  <div className={styles.portalCardTop}>
                    <div>
                      <p className={styles.portalCardLabel}>住宿管理</p>
                      <h3>住房分配</h3>
                    </div>
                    <span className={styles.portalBadge}>{logisticsRoomsForSelectedItem.length} 间房</span>
                  </div>
                  <p className={styles.portalCardText}>
                    选择入住人员、生成房间号记录，并查看本场全部住宿安排。
                  </p>
                  <div className={styles.cardActionRow}>
                    <span className={styles.cardEnterHint}>点击进入住房分配</span>
                    <button className={styles.portalButton} type="button">
                      进入住房分配
                    </button>
                  </div>
                </article>
              )}

              {viewMode === 'logistics-event-roster' && !activeLogisticsEventItem && (
                <article className={styles.logisticsFormPanel}>
                  <div className={styles.portalCardTop}>
                    <div>
                      <p className={styles.portalCardLabel}>Roster Sheet</p>
                      <h3>本场人员分表</h3>
                    </div>
                    <div className={styles.timelineActions}>
                      <button
                        className={styles.portalButton}
                        onClick={() => handleSyncSingleLogisticsEventToMaster(activeLogisticsEvent.id)}
                        disabled={!canEdit || activeLogisticsEvent.participants.length === 0}
                      >
                        同步本场到统一总表
                      </button>
                      <button
                        className={styles.secondaryButton}
                        onClick={() => setLogisticsRosterInputOpen((previous) => !previous)}
                      >
                        {logisticsRosterInputOpen ? '收起录入' : '展开录入'}
                      </button>
                    </div>
                  </div>
                  <p className={styles.portalCardText}>
                    在这里录入或粘贴本场比赛人员表。队名和赛场位置只保存在本场分表，同步到统一总表时会自动过滤。
                  </p>

                  {logisticsRosterInputOpen && (
                    <>
                      <div className={styles.logisticsFormGrid}>
                        <label className={styles.logisticsField}>
                          <span>身份</span>
                          <select
                            value={logisticsParticipantForm.role}
                            onChange={(event) => handleLogisticsParticipantFormChange('role', event.target.value)}
                            disabled={!canEdit}
                          >
                            {LOGISTICS_PARTICIPANT_ROLES.map((role) => (
                              <option key={role} value={role}>{role}</option>
                            ))}
                          </select>
                        </label>
                        <label className={styles.logisticsField}>
                          <span>中文名</span>
                          <input
                            value={logisticsParticipantForm.name}
                            onChange={(event) => handleLogisticsParticipantFormChange('name', event.target.value)}
                            placeholder="姓名"
                            disabled={!canEdit}
                          />
                        </label>
                        <label className={styles.logisticsField}>
                          <span>英文名</span>
                          <input
                            value={logisticsParticipantForm.englishName}
                            onChange={(event) => handleLogisticsParticipantFormChange('englishName', event.target.value)}
                            placeholder="English name"
                            disabled={!canEdit}
                          />
                        </label>
                        <label className={styles.logisticsField}>
                          <span>性别</span>
                          <input
                            value={logisticsParticipantForm.gender}
                            onChange={(event) => handleLogisticsParticipantFormChange('gender', event.target.value)}
                            placeholder="男 / 女"
                            disabled={!canEdit}
                          />
                        </label>
                        <label className={styles.logisticsField}>
                          <span>手机</span>
                          <input
                            value={logisticsParticipantForm.phone}
                            onChange={(event) => handleLogisticsParticipantFormChange('phone', event.target.value)}
                            placeholder="联系电话"
                            disabled={!canEdit}
                          />
                        </label>

                        {logisticsParticipantForm.role === '队员' && (
                          <>
                            <label className={styles.logisticsField}>
                              <span>赛项</span>
                              <select
                                value={logisticsParticipantForm.eventItem}
                                onChange={(event) => handleLogisticsParticipantFormChange('eventItem', event.target.value)}
                                disabled={!canEdit}
                              >
                                <option value="">请选择赛项</option>
                                {LOGISTICS_EVENT_ITEM_OPTIONS.map((item) => (
                                  <option key={item} value={item}>{item}</option>
                                ))}
                              </select>
                            </label>
                            <label className={styles.logisticsField}>
                              <span>队号</span>
                              <input
                                value={logisticsParticipantForm.teamNo}
                                onChange={(event) => handleLogisticsParticipantFormChange('teamNo', event.target.value)}
                                placeholder="战队编号"
                                disabled={!canEdit}
                              />
                            </label>
                            <label className={styles.logisticsField}>
                              <span>队名</span>
                              <input
                                value={logisticsParticipantForm.teamName}
                                onChange={(event) => handleLogisticsParticipantFormChange('teamName', event.target.value)}
                                placeholder="只保存在本场分表"
                                disabled={!canEdit}
                              />
                            </label>
                            <label className={styles.logisticsField}>
                              <span>赛场位置</span>
                              <input
                                value={logisticsParticipantForm.fieldPosition}
                                onChange={(event) => handleLogisticsParticipantFormChange('fieldPosition', event.target.value)}
                                placeholder="例如：GIN22 / XE09"
                                disabled={!canEdit}
                              />
                            </label>
                            <label className={styles.logisticsField}>
                              <span>监护人</span>
                              <input
                                value={logisticsParticipantForm.guardian}
                                onChange={(event) => handleLogisticsParticipantFormChange('guardian', event.target.value)}
                                placeholder="监护人姓名"
                                disabled={!canEdit}
                              />
                            </label>
                            <label className={styles.logisticsField}>
                              <span>监护人电话</span>
                              <input
                                value={logisticsParticipantForm.guardianPhone}
                                onChange={(event) => handleLogisticsParticipantFormChange('guardianPhone', event.target.value)}
                                placeholder="监护人联系电话"
                                disabled={!canEdit}
                              />
                            </label>
                            <label className={styles.logisticsField}>
                              <span>过敏史</span>
                              <input
                                value={logisticsParticipantForm.allergy}
                                onChange={(event) => handleLogisticsParticipantFormChange('allergy', event.target.value)}
                                placeholder="无 / 具体说明"
                                disabled={!canEdit}
                              />
                            </label>
                            <label className={styles.logisticsField}>
                              <span>证件信息</span>
                              <select
                                value={logisticsParticipantForm.notes}
                                onChange={(event) => handleLogisticsParticipantFormChange('notes', event.target.value)}
                                disabled={!canEdit}
                              >
                                {LOGISTICS_ID_DOCUMENT_OPTIONS.map((documentType) => (
                                  <option key={documentType} value={documentType}>{documentType}</option>
                                ))}
                              </select>
                            </label>
                            <label className={styles.logisticsField}>
                              <span>证件号码</span>
                              <input
                                value={logisticsParticipantForm.idNumber}
                                onChange={(event) => handleLogisticsParticipantFormChange('idNumber', event.target.value)}
                                placeholder="证件号码"
                                disabled={!canEdit}
                              />
                            </label>
                          </>
                        )}
                      </div>

                      <div className={styles.cardActionRow}>
                        <button className={styles.portalButton} onClick={handleAddLogisticsParticipant} disabled={!canEdit}>
                          新增到本场
                        </button>
                        <input
                          ref={logisticsFileInputRef}
                          className={styles.hiddenFileInput}
                          type="file"
                          accept=".xlsx,.xls,.csv,.tsv,.txt"
                          onChange={(event) => handleImportLogisticsRosterFile(event.target.files?.[0])}
                          disabled={!canEdit}
                        />
                        <button
                          className={styles.secondaryButton}
                          onClick={() => logisticsFileInputRef.current?.click()}
                          disabled={!canEdit}
                        >
                          Excel 表格导入
                        </button>
                        <button
                          className={styles.secondaryButton}
                          onClick={handleImportLogisticsRosterFromClipboard}
                          disabled={!canEdit}
                        >
                          读取剪切板导入
                        </button>
                      </div>

                      <label className={`${styles.logisticsField} ${styles.logisticsWideField}`}>
                        <span>手动粘贴表格内容</span>
                        <textarea
                          value={logisticsRosterPaste}
                          onChange={(event) => setLogisticsRosterPaste(event.target.value)}
                          placeholder="从 Excel 复制三亚信息表后粘贴到这里，支持中文名、英文名、性别、证件类型、证件号码、手机、监护人、过敏史、赛项、队号、队名、赛场位置"
                          disabled={!canEdit}
                        />
                      </label>
                      <button className={styles.secondaryButton} onClick={handleImportLogisticsRoster} disabled={!canEdit}>
                        解析粘贴框内容
                      </button>
                    </>
                  )}

                  <div className={styles.logisticsTableWrap}>
                    {activeLogisticsEvent.participants.length === 0 ? (
                      <div className={styles.logisticsEmpty}>本场暂无人员。可以手动新增，也可以从剪切板或 Excel 表格导入。</div>
                    ) : (
                      <table className={styles.logisticsTable}>
                        <thead>
                          <tr>
                            <th>中文名</th>
                            <th>英文名</th>
                            <th>性别</th>
                            <th>身份</th>
                            <th>赛项 / 队伍</th>
                            <th>赛场位置</th>
                            <th>手机</th>
                            <th>监护信息</th>
                            <th>证件 / 过敏史</th>
                            <th>操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeLogisticsEvent.participants.map((participant) => {
                            const isEditing = editingLogisticsParticipantId === participant.id;
                            const editingRole = editingLogisticsParticipantForm.role;
                            const isEditingTeamMember = editingRole === '队员';

                            return (
                              <tr key={participant.id}>
                                <td>
                                  {isEditing ? (
                                    <input
                                      className={styles.tableInlineInput}
                                      value={editingLogisticsParticipantForm.name}
                                      onChange={(event) => handleEditingLogisticsParticipantFormChange('name', event.target.value)}
                                    />
                                  ) : (
                                    <strong>{participant.name}</strong>
                                  )}
                                </td>
                                <td>
                                  {isEditing ? (
                                    <input
                                      className={styles.tableInlineInput}
                                      value={editingLogisticsParticipantForm.englishName}
                                      onChange={(event) => handleEditingLogisticsParticipantFormChange('englishName', event.target.value)}
                                    />
                                  ) : (
                                    participant.englishName || '未填'
                                  )}
                                </td>
                                <td>
                                  {isEditing ? (
                                    <input
                                      className={styles.tableInlineInput}
                                      value={editingLogisticsParticipantForm.gender}
                                      onChange={(event) => handleEditingLogisticsParticipantFormChange('gender', event.target.value)}
                                      placeholder="男 / 女"
                                    />
                                  ) : (
                                    participant.gender || '未填'
                                  )}
                                </td>
                                <td>
                                  {isEditing ? (
                                    <select
                                      value={editingLogisticsParticipantForm.role}
                                      onChange={(event) => handleEditingLogisticsParticipantFormChange('role', event.target.value)}
                                    >
                                      {LOGISTICS_PARTICIPANT_ROLES.map((role) => (
                                        <option key={role} value={role}>{role}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    participant.role
                                  )}
                                </td>
                                <td>
                                  {isEditing ? (
                                    <div className={styles.tableEditorStack}>
                                      <select
                                        value={editingLogisticsParticipantForm.eventItem}
                                        onChange={(event) => handleEditingLogisticsParticipantFormChange('eventItem', event.target.value)}
                                        disabled={!isEditingTeamMember}
                                      >
                                        <option value="">请选择赛项</option>
                                        {LOGISTICS_EVENT_ITEM_OPTIONS.map((item) => (
                                          <option key={item} value={item}>{item}</option>
                                        ))}
                                      </select>
                                      <input
                                        className={styles.tableInlineInput}
                                        value={editingLogisticsParticipantForm.teamNo}
                                        onChange={(event) => handleEditingLogisticsParticipantFormChange('teamNo', event.target.value)}
                                        placeholder="队号"
                                        disabled={!isEditingTeamMember}
                                      />
                                      <input
                                        className={styles.tableInlineInput}
                                        value={editingLogisticsParticipantForm.teamName}
                                        onChange={(event) => handleEditingLogisticsParticipantFormChange('teamName', event.target.value)}
                                        placeholder="队名"
                                        disabled={!isEditingTeamMember}
                                      />
                                    </div>
                                  ) : (
                                    <>
                                      {renderLogisticsEventItemBadges(participant.eventItem)}
                                      {(participant.teamNo || participant.teamName) && (
                                        <small>{[participant.teamNo, participant.teamName].filter(Boolean).join(' / ')}</small>
                                      )}
                                    </>
                                  )}
                                </td>
                                <td>
                                  {isEditing ? (
                                    <input
                                      className={styles.tableInlineInput}
                                      value={editingLogisticsParticipantForm.fieldPosition}
                                      onChange={(event) => handleEditingLogisticsParticipantFormChange('fieldPosition', event.target.value)}
                                      placeholder="赛场位置"
                                      disabled={!isEditingTeamMember}
                                    />
                                  ) : (
                                    participant.fieldPosition || '未填'
                                  )}
                                </td>
                                <td>
                                  {isEditing ? (
                                    <input
                                      className={styles.tableInlineInput}
                                      value={editingLogisticsParticipantForm.phone}
                                      onChange={(event) => handleEditingLogisticsParticipantFormChange('phone', event.target.value)}
                                    />
                                  ) : (
                                    participant.phone || '未填'
                                  )}
                                </td>
                                <td>
                                  {isEditing ? (
                                    <div className={styles.tableEditorStack}>
                                      <input
                                        className={styles.tableInlineInput}
                                        value={editingLogisticsParticipantForm.guardian}
                                        onChange={(event) => handleEditingLogisticsParticipantFormChange('guardian', event.target.value)}
                                        placeholder="监护人"
                                        disabled={!isEditingTeamMember}
                                      />
                                      <input
                                        className={styles.tableInlineInput}
                                        value={editingLogisticsParticipantForm.guardianPhone}
                                        onChange={(event) => handleEditingLogisticsParticipantFormChange('guardianPhone', event.target.value)}
                                        placeholder="监护人电话"
                                        disabled={!isEditingTeamMember}
                                      />
                                    </div>
                                  ) : (
                                    <>
                                      {participant.guardian || '无'}
                                      {participant.guardianPhone && <small>{participant.guardianPhone}</small>}
                                    </>
                                  )}
                                </td>
                                <td>
                                  {isEditing ? (
                                    <div className={styles.tableEditorStack}>
                                      <select
                                        value={editingLogisticsParticipantForm.notes}
                                        onChange={(event) => handleEditingLogisticsParticipantFormChange('notes', event.target.value)}
                                      >
                                        {LOGISTICS_ID_DOCUMENT_OPTIONS.map((documentType) => (
                                          <option key={documentType} value={documentType}>{documentType}</option>
                                        ))}
                                      </select>
                                      <input
                                        className={styles.tableInlineInput}
                                        value={editingLogisticsParticipantForm.idNumber}
                                        onChange={(event) => handleEditingLogisticsParticipantFormChange('idNumber', event.target.value)}
                                        placeholder="证件号码"
                                      />
                                      <input
                                        className={styles.tableInlineInput}
                                        value={editingLogisticsParticipantForm.allergy}
                                        onChange={(event) => handleEditingLogisticsParticipantFormChange('allergy', event.target.value)}
                                        placeholder="过敏史"
                                      />
                                    </div>
                                  ) : (
                                    <>
                                      {participant.notes || '未填'}
                                      {participant.idNumber && <small>{participant.idNumber}</small>}
                                      {participant.allergy && <small>过敏史：{participant.allergy}</small>}
                                    </>
                                  )}
                                </td>
                                <td>
                                  {isEditing ? (
                                    <div className={styles.tableEditorStack}>
                                      <button
                                        className={styles.ghostButton}
                                        onClick={handleSaveLogisticsParticipant}
                                        disabled={!canEdit}
                                      >
                                        保存
                                      </button>
                                      <button
                                        className={styles.smallDangerButton}
                                        onClick={handleCancelEditLogisticsParticipant}
                                      >
                                        取消
                                      </button>
                                    </div>
                                  ) : (
                                    <div className={styles.tableEditorStack}>
                                      <button
                                        className={styles.ghostButton}
                                        onClick={() => handleStartEditLogisticsParticipant(participant)}
                                        disabled={!canEdit}
                                      >
                                        编辑
                                      </button>
                                      <button
                                        className={styles.smallDangerButton}
                                        onClick={() => handleDeleteLogisticsParticipant(participant.id)}
                                        disabled={!canEdit}
                                      >
                                        删除
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </article>
              )}

              {viewMode === 'logistics-event-rooms' && !activeLogisticsEventItem && (
                <article className={styles.logisticsFormPanel}>
                  <div className={styles.portalCardTop}>
                    <div>
                      <p className={styles.portalCardLabel}>住宿管理</p>
                      <h3>住房分配</h3>
                    </div>
                    <span className={styles.portalBadge}>Rooms</span>
                  </div>

                  <div className={styles.logisticsFormGrid}>
                    <label className={styles.logisticsField}>
                      <span>房间号</span>
                      <input
                        value={logisticsRoomForm.roomNo}
                        onChange={(event) => handleLogisticsRoomFormChange('roomNo', event.target.value)}
                        placeholder="例如：1208 / A301"
                        disabled={!canEdit}
                      />
                    </label>
                    <label className={styles.logisticsField}>
                      <span>备注</span>
                      <select
                        value={
                          logisticsRoomNoteMode
                          || (LOGISTICS_ROOM_NOTE_OPTIONS.includes(logisticsRoomForm.notes)
                            ? logisticsRoomForm.notes
                            : logisticsRoomForm.notes
                              ? '自定义输入'
                              : '')
                        }
                        onChange={(event) => {
                          const value = event.target.value;
                          setLogisticsRoomNoteMode(value);
                          handleLogisticsRoomFormChange('notes', value === '自定义输入' ? '' : value);
                        }}
                        disabled={!canEdit}
                      >
                        <option value="">请选择房间类型</option>
                        {LOGISTICS_ROOM_NOTE_OPTIONS.map((note) => (
                          <option key={note} value={note}>{note}</option>
                        ))}
                        <option value="自定义输入">自定义输入</option>
                      </select>
                      {(logisticsRoomNoteMode === '自定义输入'
                        || (!LOGISTICS_ROOM_NOTE_OPTIONS.includes(logisticsRoomForm.notes) && logisticsRoomForm.notes)) && (
                        <input
                          value={logisticsRoomForm.notes}
                          onChange={(event) => handleLogisticsRoomFormChange('notes', event.target.value)}
                          placeholder="请输入自定义备注"
                          disabled={!canEdit}
                        />
                      )}
                    </label>
                  </div>

                  <div className={styles.roomPicker}>
                    {logisticsParticipantsForSelectedItem.length === 0 ? (
                      <div className={styles.logisticsEmpty}>暂无可选入住人员。进入对应赛项后，先在队员基础信息库中新增人员。</div>
                    ) : (
                      logisticsParticipantsForSelectedItem.map((participant) => {
                        const isSelectedForRoom = logisticsRoomForm.participantIds.includes(participant.id);
                        const isAssignedToRoom = logisticsRoomsForSelectedItem.some((room) =>
                          room.participantIds.includes(participant.id));

                        return (
                          <label
                            key={participant.id}
                            className={[
                              styles.roomPersonChip,
                              isAssignedToRoom ? styles.roomPersonChipAssigned : '',
                              isSelectedForRoom ? styles.roomPersonChipSelected : '',
                            ].filter(Boolean).join(' ')}
                          >
                          <input
                            type="checkbox"
                            checked={isSelectedForRoom}
                            onChange={() => handleToggleLogisticsRoomParticipant(participant.id)}
                            disabled={!canEdit || isAssignedToRoom}
                          />
                          <span>{participant.name}</span>
                          <small>
                            {participant.englishName && `${participant.englishName} · `}
                            {participant.role}{participant.teamNo ? ` · ${participant.teamNo}` : ''}
                            {isAssignedToRoom ? ' · 已入住' : ''}
                          </small>
                        </label>
                        );
                      })
                    )}
                  </div>

                  <button className={styles.portalButton} onClick={handleAddLogisticsRoom} disabled={!canEdit}>
                    添加住房分配
                  </button>

                  <div className={styles.roomRecordHeader}>
                    <div>
                      <p className={styles.portalCardLabel}>住房记录表</p>
                      <h3>房间与入住人员</h3>
                    </div>
                    <span className={styles.portalBadge}>{logisticsRoomsForSelectedItem.length} 间房</span>
                  </div>

                  <div className={styles.logisticsTableWrap}>
                    {logisticsRoomsForSelectedItem.length === 0 ? (
                      <div className={styles.logisticsEmpty}>暂无住房分配。填写房间号并选择入住人员后生成记录。</div>
                    ) : (
                      <table className={styles.logisticsTable}>
                        <thead>
                          <tr>
                            <th>房间号</th>
                            <th>入住人员</th>
                            <th>人数</th>
                            <th>备注</th>
                            <th>操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {logisticsRoomsForSelectedItem.map((room) => {
                            const roomParticipants = room.participantIds
                              .map((participantId) => activeLogisticsEvent.participants.find((participant) => participant.id === participantId))
                              .filter((participant): participant is LogisticsParticipant => Boolean(participant));

                            return (
                              <tr key={room.id}>
                                <td><strong>{room.roomNo}</strong></td>
                                <td>
                                  <div className={styles.roomPeopleList}>
                                    {roomParticipants.map((participant) => (
                                      <span key={participant.id}>
                                        {participant.name}
                                        <small>{participant.role}{participant.teamNo ? ` · ${participant.teamNo}` : ''}</small>
                                      </span>
                                    ))}
                                  </div>
                                </td>
                                <td>{roomParticipants.length} 人</td>
                                <td>{room.notes || '无'}</td>
                                <td>
                                  <button
                                    className={styles.smallDangerButton}
                                    onClick={() => handleDeleteLogisticsRoom(room.id)}
                                    disabled={!canEdit}
                                  >
                                    删除
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </article>
              )}

              {viewMode === 'logistics-event' && (!activeLogisticsEventItem ? (
                <div className={styles.logisticsItemGrid}>
                  {LOGISTICS_EVENT_ITEM_OPTIONS.map((item) => {
                    const itemStudents = activeLogisticsEvent.participants.filter((participant) =>
                      participant.role === '队员' && matchesLogisticsEventItem(participant.eventItem, item));
                    const itemNodes = activeLogisticsEvent.timeline.filter((node) => node.rollCallEnabled);

                    return (
                      <button
                        key={item}
                        className={styles.logisticsItemCard}
                        onClick={() => {
                          setActiveLogisticsEventItem(item);
                          setLogisticsParticipantForm((previous) => ({
                            ...previous,
                            eventItem: item,
                          }));
                        }}
                      >
                        <span className={styles.portalCardLabel}>赛项后勤</span>
                        <strong>{item}</strong>
                        <small>
                          {itemStudents.length} 名队员 · {itemNodes.length} 个点名节点
                        </small>
                        <em>进入 {item} 后勤工作台</em>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <>
                  <div className={styles.cardActionRow}>
                    <button className={styles.backButton} onClick={() => setActiveLogisticsEventItem(null)}>
                      返回赛项选择
                    </button>
                    <span className={styles.portalBadge}>当前赛项：{activeLogisticsEventItem}</span>
                  </div>

              <div className={styles.logisticsSummaryGrid}>
                <article className={styles.parameterCard}>
                  <span>参赛队员</span>
                  <strong>{logisticsStudents.length}</strong>
                  <small>{activeLogisticsEventItem} 赛项队员，不含教练和领队</small>
                </article>
                <article className={styles.parameterCard}>
                  <span>已分配队员</span>
                  <strong>{logisticsStudents.filter((student) => student.mentorId).length}</strong>
                  <small>教练/领队负责关系</small>
                </article>
                <article className={styles.parameterCard}>
                  <span>点名节点</span>
                  <strong>{logisticsRollCallNodes.length}</strong>
                  <small>机场、登机口、大巴等</small>
                </article>
                <article className={styles.parameterCard}>
                  <span>点名完成</span>
                  <strong>{logisticsRollCallTotal ? `${logisticsRollCallDone}/${logisticsRollCallTotal}` : '0'}</strong>
                  <small>全部教练/领队合计</small>
                </article>
              </div>

              <article className={styles.logisticsFormPanel} hidden>
                <div className={styles.portalCardTop}>
                  <div>
                    <p className={styles.portalCardLabel}>Step 2</p>
                    <h3>队员基础信息库</h3>
                  </div>
                  <span className={styles.portalBadge}>Roster</span>
                </div>
                <p className={styles.portalCardText}>
                  这里先录入本场比赛所有人员。后面的教练分配、交通住宿和点名节点，都会从这个人员库里读取。
                </p>

                <div className={styles.logisticsFormGrid}>
                  <label className={styles.logisticsField}>
                    <span>身份</span>
                    <select
                      value={logisticsParticipantForm.role}
                      onChange={(event) => handleLogisticsParticipantFormChange('role', event.target.value)}
                      disabled={!canEdit}
                    >
                      {LOGISTICS_PARTICIPANT_ROLES.map((role) => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.logisticsField}>
                    <span>中文名</span>
                    <input
                      value={logisticsParticipantForm.name}
                      onChange={(event) => handleLogisticsParticipantFormChange('name', event.target.value)}
                      placeholder="例如：刘子颢 / Jason"
                      disabled={!canEdit}
                    />
                  </label>
                  <label className={styles.logisticsField}>
                    <span>英文名</span>
                    <input
                      value={logisticsParticipantForm.englishName}
                      onChange={(event) => handleLogisticsParticipantFormChange('englishName', event.target.value)}
                      placeholder="可选"
                      disabled={!canEdit}
                    />
                  </label>
                  <label className={styles.logisticsField}>
                    <span>手机</span>
                    <input
                      value={logisticsParticipantForm.phone}
                      onChange={(event) => handleLogisticsParticipantFormChange('phone', event.target.value)}
                      placeholder="现场联系号码"
                      disabled={!canEdit}
                    />
                  </label>
                  {logisticsParticipantForm.role === '队员' && (
                    <>
                      <label className={styles.logisticsField}>
                        <span>赛项</span>
                        <input
                          value={logisticsParticipantForm.eventItem}
                          onChange={(event) => handleLogisticsParticipantFormChange('eventItem', event.target.value)}
                          placeholder="INS / EXP / CHA / FRC"
                          disabled={!canEdit}
                        />
                      </label>
                      <label className={styles.logisticsField}>
                        <span>队号</span>
                        <input
                          value={logisticsParticipantForm.teamNo}
                          onChange={(event) => handleLogisticsParticipantFormChange('teamNo', event.target.value)}
                          placeholder="战队编号"
                          disabled={!canEdit}
                        />
                      </label>
                      <label className={styles.logisticsField}>
                        <span>队名</span>
                        <input
                          value={logisticsParticipantForm.teamName}
                          onChange={(event) => handleLogisticsParticipantFormChange('teamName', event.target.value)}
                          placeholder="战队名称"
                          disabled={!canEdit}
                        />
                      </label>
                      <label className={styles.logisticsField}>
                        <span>负责教练/领队</span>
                        <select
                          value={logisticsParticipantForm.mentorId}
                          onChange={(event) => handleLogisticsParticipantFormChange('mentorId', event.target.value)}
                          disabled={!canEdit}
                        >
                          <option value="">暂不分配</option>
                          {logisticsMentors.map((mentor) => (
                            <option key={mentor.id} value={mentor.id}>{mentor.name}</option>
                          ))}
                        </select>
                      </label>
                      <label className={styles.logisticsField}>
                        <span>监护人</span>
                        <input
                          value={logisticsParticipantForm.guardian}
                          onChange={(event) => handleLogisticsParticipantFormChange('guardian', event.target.value)}
                          placeholder="可选"
                          disabled={!canEdit}
                        />
                      </label>
                      <label className={styles.logisticsField}>
                        <span>监护人电话</span>
                        <input
                          value={logisticsParticipantForm.guardianPhone}
                          onChange={(event) => handleLogisticsParticipantFormChange('guardianPhone', event.target.value)}
                          placeholder="可选"
                          disabled={!canEdit}
                        />
                      </label>
                      <label className={styles.logisticsField}>
                        <span>过敏史</span>
                        <input
                          value={logisticsParticipantForm.allergy}
                          onChange={(event) => handleLogisticsParticipantFormChange('allergy', event.target.value)}
                          placeholder="无 / 具体说明"
                          disabled={!canEdit}
                        />
                      </label>
                      <label className={styles.logisticsField}>
                        <span>证件信息</span>
                        <select
                          value={logisticsParticipantForm.notes}
                          onChange={(event) => handleLogisticsParticipantFormChange('notes', event.target.value)}
                          disabled={!canEdit}
                        >
                          {LOGISTICS_ID_DOCUMENT_OPTIONS.map((documentType) => (
                            <option key={documentType} value={documentType}>{documentType}</option>
                          ))}
                        </select>
                      </label>
                      <div className={`${styles.logisticsField} ${styles.logisticsWideField}`}>
                        <span>证件图像</span>
                        <input
                          ref={logisticsDocumentImageInputRef}
                          className={styles.hiddenFileInput}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(event) => handleLogisticsDocumentImageFile(event.target.files?.[0])}
                          disabled={!canEdit}
                        />
                        <div className={styles.documentImagePanel}>
                          {logisticsParticipantForm.idDocumentImage ? (
                            <img src={logisticsParticipantForm.idDocumentImage} alt="证件图像预览" />
                          ) : (
                            <div className={styles.documentImagePlaceholder}>尚未上传证件图像</div>
                          )}
                          <div className={styles.documentImageActions}>
                            <button
                              className={styles.secondaryButton}
                              onClick={() => logisticsDocumentImageInputRef.current?.click()}
                              disabled={!canEdit}
                            >
                              上传/拍照证件图像
                            </button>
                            {logisticsParticipantForm.idDocumentImage && (
                              <button
                                className={styles.ghostButton}
                                onClick={() => handleLogisticsParticipantFormChange('idDocumentImage', '')}
                                disabled={!canEdit}
                              >
                                移除图像
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className={styles.cardActionRow}>
                  <button className={styles.portalButton} onClick={handleAddLogisticsParticipant} disabled={!canEdit}>
                    新增人员
                  </button>
                  <input
                    ref={logisticsFileInputRef}
                    className={styles.hiddenFileInput}
                    type="file"
                    accept=".xlsx,.xls,.csv,.tsv,.txt"
                    onChange={(event) => handleImportLogisticsRosterFile(event.target.files?.[0])}
                    disabled={!canEdit}
                  />
                  <button
                    className={styles.secondaryButton}
                    onClick={() => logisticsFileInputRef.current?.click()}
                    disabled={!canEdit}
                  >
                    Excel 表格导入
                  </button>
                  <button
                    className={styles.secondaryButton}
                    onClick={handleImportLogisticsRosterFromClipboard}
                    disabled={!canEdit}
                  >
                    读取剪切板导入
                  </button>
                </div>

                <label className={`${styles.logisticsField} ${styles.logisticsWideField}`}>
                  <span>手动粘贴表格内容</span>
                  <textarea
                    value={logisticsRosterPaste}
                    onChange={(event) => setLogisticsRosterPaste(event.target.value)}
                    placeholder="从 Excel 复制包含“中文名、角色、赛项、队号、队名、手机、监护人、过敏史、证件类型”等表头的区域后粘贴到这里"
                    disabled={!canEdit}
                  />
                </label>
                <button className={styles.secondaryButton} onClick={handleImportLogisticsRoster} disabled={!canEdit}>
                  解析粘贴框内容
                </button>
              </article>

              <article className={styles.logisticsFormPanel}>
                <div className={styles.portalCardTop}>
                  <div>
                    <p className={styles.portalCardLabel}>Step 3</p>
                    <h3>教练/领队分配</h3>
                  </div>
                  <span className={styles.portalBadge}>Mentor Map</span>
                </div>

                {logisticsParticipantsForSelectedItem.length === 0 ? (
                  <div className={styles.logisticsEmpty}>暂无人员。先在上方新增教练、领队和队员。</div>
                ) : (
                  <div className={styles.logisticsTableWrap}>
                    <table className={styles.logisticsTable}>
                      <thead>
                        <tr>
                          <th>中文名</th>
                          <th>英文名</th>
                          <th>角色</th>
                          <th>赛项 / 队伍</th>
                          <th>联系方式</th>
                          <th>负责教练/领队</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logisticsParticipantsForSelectedItem.map((participant) => {
                          const isEditing = editingLogisticsParticipantId === participant.id;
                          const isEditingTeamMember = editingLogisticsParticipantForm.role === '队员';
                          return (
                          <tr key={participant.id}>
                            <td>{isEditing ? <input className={styles.tableInlineInput} value={editingLogisticsParticipantForm.name} onChange={(event) => handleEditingLogisticsParticipantFormChange('name', event.target.value)} /> : <strong>{participant.name}</strong>}</td>
                            <td>{isEditing ? <input className={styles.tableInlineInput} value={editingLogisticsParticipantForm.englishName} onChange={(event) => handleEditingLogisticsParticipantFormChange('englishName', event.target.value)} /> : participant.englishName || '未填'}</td>
                            <td>{isEditing ? <select value={editingLogisticsParticipantForm.role} onChange={(event) => handleEditingLogisticsParticipantFormChange('role', event.target.value)}>{LOGISTICS_PARTICIPANT_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select> : participant.role}</td>
                            <td>
                              {isEditing ? <div className={styles.tableEditorStack}>
                                <select value={editingLogisticsParticipantForm.eventItem} onChange={(event) => handleEditingLogisticsParticipantFormChange('eventItem', event.target.value)} disabled={!isEditingTeamMember}><option value="">请选择赛项</option>{LOGISTICS_EVENT_ITEM_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}</select>
                                <input className={styles.tableInlineInput} value={editingLogisticsParticipantForm.teamNo} onChange={(event) => handleEditingLogisticsParticipantFormChange('teamNo', event.target.value)} placeholder="队号" disabled={!isEditingTeamMember} />
                                <input className={styles.tableInlineInput} value={editingLogisticsParticipantForm.teamName} onChange={(event) => handleEditingLogisticsParticipantFormChange('teamName', event.target.value)} placeholder="队名" disabled={!isEditingTeamMember} />
                              </div> : <>{renderLogisticsEventItemBadges(participant.eventItem)}{(participant.teamNo || participant.teamName) && <small>{[participant.teamNo, participant.teamName].filter(Boolean).join(' / ')}</small>}</>}
                            </td>
                            <td>
                              {isEditing ? <div className={styles.tableEditorStack}>
                                <input className={styles.tableInlineInput} value={editingLogisticsParticipantForm.phone} onChange={(event) => handleEditingLogisticsParticipantFormChange('phone', event.target.value)} placeholder="本人电话" />
                                <input className={styles.tableInlineInput} value={editingLogisticsParticipantForm.guardianPhone} onChange={(event) => handleEditingLogisticsParticipantFormChange('guardianPhone', event.target.value)} placeholder="监护人电话" disabled={!isEditingTeamMember} />
                              </div> : <>{participant.phone || '未填'}{participant.guardianPhone && <small>监护人：{participant.guardianPhone}</small>}</>}
                              {!isEditing && participant.idDocumentImage && (
                                <img
                                  className={styles.documentThumb}
                                  src={participant.idDocumentImage}
                                  alt={`${participant.name} 证件图像`}
                                />
                              )}
                            </td>
                            <td>
                              {(isEditing ? editingLogisticsParticipantForm.role : participant.role) === '队员' ? (
                                <select
                                  value={isEditing ? editingLogisticsParticipantForm.mentorId : participant.mentorId}
                                  onChange={(event) => isEditing
                                    ? handleEditingLogisticsParticipantFormChange('mentorId', event.target.value)
                                    : handleAssignLogisticsMentor(participant.id, event.target.value)}
                                  disabled={!canEdit}
                                >
                                  <option value="">未分配</option>
                                  {logisticsMentors.map((mentor) => (
                                    <option key={mentor.id} value={mentor.id}>{mentor.name}</option>
                                  ))}
                                </select>
                              ) : (
                                <span className={styles.statusPill}>可负责队员</span>
                              )}
                            </td>
                            <td>
                              <div className={styles.tableEditorStack}>
                                {isEditing ? <>
                                  <button className={styles.ghostButton} onClick={handleSaveLogisticsParticipant} disabled={!canEdit}>保存</button>
                                  <button className={styles.smallDangerButton} onClick={handleCancelEditLogisticsParticipant}>取消</button>
                                </> : <>
                                  <button className={styles.ghostButton} onClick={() => handleStartEditLogisticsParticipant(participant)} disabled={!canEdit}>修改</button>
                                  <button className={styles.smallDangerButton} onClick={() => handleDeleteLogisticsParticipant(participant.id)} disabled={!canEdit}>删除</button>
                                </>}
                              </div>
                            </td>
                          </tr>
                        );})}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>


              <article className={styles.logisticsFormPanel}>
                <div className={styles.portalCardTop}>
                  <div>
                    <p className={styles.portalCardLabel}>Step 4</p>
                    <h3>行程时间轴与点名节点</h3>
                  </div>
                  <span className={styles.portalBadge}>Roll Call</span>
                </div>

                <div className={styles.logisticsFormGrid}>
                  <label className={styles.logisticsField}>
                    <span>日期</span>
                    <input
                      type="date"
                      value={logisticsTimelineForm.date}
                      onChange={(event) => handleLogisticsTimelineFormChange('date', event.target.value)}
                      disabled={!canEdit}
                    />
                  </label>
                  <label className={styles.logisticsField}>
                    <span>时间</span>
                    <input
                      type="time"
                      value={logisticsTimelineForm.time}
                      onChange={(event) => handleLogisticsTimelineFormChange('time', event.target.value)}
                      disabled={!canEdit}
                    />
                  </label>
                  <label className={styles.logisticsField}>
                    <span>事项</span>
                    <input
                      value={logisticsTimelineForm.title}
                      onChange={(event) => handleLogisticsTimelineFormChange('title', event.target.value)}
                      placeholder="机场集合 / 登机口点名 / 大巴上车"
                      disabled={!canEdit}
                    />
                  </label>
                  <label className={styles.logisticsField}>
                    <span>位置</span>
                    <input
                      value={logisticsTimelineForm.location}
                      onChange={(event) => handleLogisticsTimelineFormChange('location', event.target.value)}
                      placeholder="首都机场 T2 / 到达出口 / 酒店大堂"
                      disabled={!canEdit}
                    />
                  </label>
                  <label className={styles.logisticsField}>
                    <span>节点负责人</span>
                    <select
                      value={logisticsTimelineForm.owner}
                      onChange={(event) => handleLogisticsTimelineFormChange('owner', event.target.value)}
                      disabled={!canEdit}
                    >
                      <option value="">
                        {logisticsMentors.length === 0 ? '请先录入教练/领队' : '请选择负责人'}
                      </option>
                      {logisticsMentors.map((mentor) => (
                        <option key={mentor.id} value={mentor.name}>
                          {mentor.name}{mentor.englishName ? ` / ${mentor.englishName}` : ''} · {mentor.role}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.logisticsField}>
                    <span>备注</span>
                    <input
                      value={logisticsTimelineForm.notes}
                      onChange={(event) => handleLogisticsTimelineFormChange('notes', event.target.value)}
                      placeholder="如：带证件、检查随身物品"
                      disabled={!canEdit}
                    />
                  </label>
                </div>
                <label className={styles.logisticsToggleLine}>
                  <input
                    type="checkbox"
                    checked={logisticsTimelineForm.rollCallEnabled}
                    onChange={(event) => handleLogisticsTimelineFormChange('rollCallEnabled', event.target.checked)}
                    disabled={!canEdit}
                  />
                  <span>这个时间节点需要点名</span>
                </label>
                <button className={styles.portalButton} onClick={handleAddLogisticsTimelineItem} disabled={!canEdit}>
                  添加时间节点
                </button>

                <div className={styles.timelineList}>
                  {activeLogisticsEvent.timeline.length === 0 ? (
                    <div className={styles.logisticsEmpty}>暂无行程节点。先添加机场集合、登机口、大巴、酒店等关键节点。</div>
                  ) : (
                    activeLogisticsEvent.timeline.map((item) => {
                      const isEditingTimelineItem = editingLogisticsTimelineId === item.id;

                      return (
                        <div key={item.id} className={styles.timelineItem}>
                          {isEditingTimelineItem ? (
                            <div className={styles.timelineEditGrid}>
                              <label>
                                <span>日期</span>
                                <input
                                  type="date"
                                  value={editingLogisticsTimelineForm.date}
                                  onChange={(event) => handleEditingLogisticsTimelineFormChange('date', event.target.value)}
                                  disabled={!canEdit}
                                />
                              </label>
                              <label>
                                <span>时间</span>
                                <input
                                  type="time"
                                  value={editingLogisticsTimelineForm.time}
                                  onChange={(event) => handleEditingLogisticsTimelineFormChange('time', event.target.value)}
                                  disabled={!canEdit}
                                />
                              </label>
                              <label>
                                <span>事项</span>
                                <input
                                  value={editingLogisticsTimelineForm.title}
                                  onChange={(event) => handleEditingLogisticsTimelineFormChange('title', event.target.value)}
                                  disabled={!canEdit}
                                />
                              </label>
                              <label>
                                <span>位置</span>
                                <input
                                  value={editingLogisticsTimelineForm.location}
                                  onChange={(event) => handleEditingLogisticsTimelineFormChange('location', event.target.value)}
                                  disabled={!canEdit}
                                />
                              </label>
                              <label>
                                <span>负责人</span>
                                <select
                                  value={editingLogisticsTimelineForm.owner}
                                  onChange={(event) => handleEditingLogisticsTimelineFormChange('owner', event.target.value)}
                                  disabled={!canEdit}
                                >
                                  <option value="">
                                    {logisticsMentors.length === 0 ? '请先录入教练/领队' : '请选择负责人'}
                                  </option>
                                  {logisticsMentors.map((mentor) => (
                                    <option key={mentor.id} value={mentor.name}>
                                      {mentor.name}{mentor.englishName ? ` / ${mentor.englishName}` : ''} · {mentor.role}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                <span>备注</span>
                                <input
                                  value={editingLogisticsTimelineForm.notes}
                                  onChange={(event) => handleEditingLogisticsTimelineFormChange('notes', event.target.value)}
                                  disabled={!canEdit}
                                />
                              </label>
                              <label className={styles.timelineEditToggle}>
                                <input
                                  type="checkbox"
                                  checked={editingLogisticsTimelineForm.rollCallEnabled}
                                  onChange={(event) =>
                                    handleEditingLogisticsTimelineFormChange('rollCallEnabled', event.target.checked)}
                                  disabled={!canEdit}
                                />
                                <span>需要点名</span>
                              </label>
                            </div>
                          ) : (
                            <div>
                              <strong>{item.date || '未定日期'} {item.time || ''}</strong>
                              <span>{item.title}</span>
                              <small>{[item.location, item.owner, item.notes].filter(Boolean).join(' · ')}</small>
                            </div>
                          )}
                          <div className={styles.timelineActions}>
                            {isEditingTimelineItem ? (
                              <>
                                <button
                                  className={styles.secondaryButton}
                                  onClick={handleSaveLogisticsTimelineItem}
                                  disabled={!canEdit}
                                >
                                  保存
                                </button>
                                <button
                                  className={styles.smallDangerButton}
                                  onClick={handleCancelEditLogisticsTimelineItem}
                                >
                                  取消
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  className={item.rollCallEnabled ? styles.secondaryButton : styles.ghostButton}
                                  onClick={() => handleToggleLogisticsRollCall(item.id)}
                                  disabled={!canEdit}
                                >
                                  {item.rollCallEnabled ? '已开启点名' : '开启点名'}
                                </button>
                                <button
                                  className={styles.ghostButton}
                                  onClick={() => handleStartEditLogisticsTimelineItem(item)}
                                  disabled={!canEdit}
                                >
                                  编辑
                                </button>
                                <button
                                  className={styles.smallDangerButton}
                                  onClick={() => handleDeleteLogisticsTimelineItem(item.id)}
                                  disabled={!canEdit}
                                >
                                  删除
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </article>

              <article className={styles.logisticsFormPanel}>
                <div className={styles.portalCardTop}>
                  <div>
                    <p className={styles.portalCardLabel}>Step 5</p>
                    <h3>教练/领队点名工作台</h3>
                  </div>
                  <span className={styles.portalBadge}>Attendance</span>
                </div>

                {logisticsRollCallNodes.length === 0 || logisticsStudents.length === 0 ? (
                  <div className={styles.logisticsEmpty}>
                    需要至少 1 个队员和 1 个开启点名的时间节点，才会生成点名表。
                  </div>
                ) : (
                  <div className={styles.rollCallGrid}>
                    {logisticsRollCallNodes.map((node) => {
                      const nodeArrivedCount = logisticsStudents.filter((student) =>
                        normalizeLogisticsAttendanceStatus(activeLogisticsEvent.attendance[node.id]?.[student.id]) === '已到达').length;
                      const isNodeComplete = logisticsStudents.length > 0 && nodeArrivedCount === logisticsStudents.length;
                      const timeAlertStatus = isNodeComplete
                        ? 'normal'
                        : getLogisticsTimeAlertStatus(node.date, node.time, logisticsAlertNow);
                      const timeAlertLabel = getLogisticsTimeAlertLabel(timeAlertStatus);

                      return (
                        <section
                          key={node.id}
                          className={`${styles.rollCallNode} ${
                            timeAlertStatus === 'soon' ? styles.rollCallNodeSoon : ''
                          } ${timeAlertStatus === 'due' ? styles.rollCallNodeDue : ''}`}
                        >
                          <div className={styles.portalCardTop}>
                            <div>
                              <p className={`${styles.portalCardLabel} ${styles.rollCallTimeLabel}`}>
                                <span>点名时间</span>
                                <strong>{node.date || '未定日期'} {node.time || '未定时间'}</strong>
                              </p>
                              <h3>{node.title}</h3>
                            </div>
                            <div className={styles.rollCallStatusStack}>
                              {timeAlertLabel && (
                                <span className={`${styles.rollCallTimeAlert} ${
                                  timeAlertStatus === 'soon' ? styles.rollCallTimeAlertSoon : styles.rollCallTimeAlertDue
                                }`}>
                                  {timeAlertLabel}
                                </span>
                              )}
                              <span className={`${styles.portalBadge} ${styles.rollCallProgressBadge} ${
                                isNodeComplete ? styles.rollCallProgressComplete : styles.rollCallProgressWarning
                              }`}>
                                {nodeArrivedCount}
                                /{logisticsStudents.length}
                              </span>
                            </div>
                          </div>
                          {node.location && <p className={styles.portalCardText}>地点：{node.location}</p>}

                          {[...logisticsMentors, {
                            id: '',
                            name: '未分配负责人',
                            englishName: '',
                            role: '领队',
                            eventItem: '',
                            teamNo: '',
                            teamName: '',
                            phone: '',
                            guardian: '',
                            guardianPhone: '',
                            allergy: '',
                            notes: '',
                            idDocumentImage: '',
                            mentorId: '',
                          }].map((mentor) => {
                            const students = logisticsStudents.filter((student) => student.mentorId === mentor.id);
                            if (students.length === 0) {
                              return null;
                            }
                            const mentorArrivedCount = students.filter((student) =>
                              normalizeLogisticsAttendanceStatus(activeLogisticsEvent.attendance[node.id]?.[student.id]) === '已到达').length;
                            const isMentorComplete = mentorArrivedCount === students.length;

                            return (
                              <div key={`${node.id}-${mentor.id || 'unassigned'}`} className={styles.mentorRollCallBlock}>
                                <div className={styles.mentorRollCallTitle}>
                                  <strong>{mentor.name}</strong>
                                  <span className={isMentorComplete ? styles.rollCallProgressComplete : styles.rollCallProgressWarning}>
                                    {mentorArrivedCount}
                                    /{students.length}
                                  </span>
                                </div>
                                {students.map((student) => {
                                  const attendanceStatus = normalizeLogisticsAttendanceStatus(
                                    activeLogisticsEvent.attendance[node.id]?.[student.id],
                                  );
                                  const nextAttendanceStatus: LogisticsAttendanceStatus =
                                    attendanceStatus === '已到达' ? '未到达' : '已到达';

                                  return (
                                    <div key={student.id} className={styles.attendanceRow}>
                                      <div>
                                        <strong>{student.name}</strong>
                                        <small>{[student.eventItem, student.teamNo, student.teamName].filter(Boolean).join(' / ')}</small>
                                      </div>
                                      <button
                                        className={`${styles.attendanceToggleButton} ${
                                          attendanceStatus === '已到达' ? styles.attendanceToggleButtonArrived : ''
                                        }`}
                                        type="button"
                                        onClick={() => handleLogisticsAttendanceChange(node.id, student.id, nextAttendanceStatus)}
                                        disabled={!canEdit}
                                      >
                                        {attendanceStatus}
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </section>
                      );
                    })}
                  </div>
                )}
              </article>
                </>
              ))}
            </section>

            <Footer lastUpdate="" isLobby storageMode={storageMode} />
          </>
        ) : viewMode === 'simulation-system' ? (
          <>
            <Header
              eyebrow="Competition Simulation"
              title="模拟赛事系统"
              subtitle="在正式比赛前完成队伍配置、赛程演练、现场计分和结果复盘。"
              action={
                <div className={styles.headerActions}>
                  <button className={styles.backButton} onClick={handleBackToPracticeAnalysis}>
                    返回练习赛数据分析
                  </button>
                  {accountAction}
                </div>
              }
            />

            <section className={styles.portalSection}>
              <SimulationSystem sourceEvents={logisticsEvents.map((event) => ({
                id: event.id,
                name: event.name,
                participants: event.participants.map((participant) => ({
                  id: participant.id,
                  name: participant.name,
                  role: participant.role,
                  eventItem: participant.eventItem,
                  teamNo: participant.teamNo,
                  teamName: participant.teamName,
                })),
              }))} />
            </section>

            <Footer lastUpdate="" isLobby storageMode={storageMode} />
          </>
        ) : viewMode === 'score-calculator' ? (
          <ScoreCalculator onBack={handleBackToPracticeAnalysis} />
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
                  <label className={`${styles.logisticsField} ${styles.logisticsWideField}`}>
                    <span>从后勤比赛卡片选择</span>
                    <select
                      value={selectedTrainingLogisticsEventId}
                      onChange={(event) => handleSelectTrainingLogisticsEvent(event.target.value)}
                      disabled={!canEdit}
                    >
                      <option value="">不调用后勤比赛，手动输入</option>
                      {logisticsEvents.map((event) => (
                        <option key={event.id} value={event.id}>
                          {event.name} · {event.date || '日期待定'} · {event.group || '赛项待定'}
                        </option>
                      ))}
                    </select>
                  </label>
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
                  trainingEvents.map((event) => {
                    const isEditingTrainingEvent = editingTrainingEventId === event.id;

                    return (
                    <article
                      key={event.id}
                      className={`${styles.logisticsEventCard} ${isEditingTrainingEvent ? '' : styles.clickableCard}`}
                      onClick={() => {
                        if (!isEditingTrainingEvent) {
                          handleOpenTrainingEvent(event.id);
                        }
                      }}
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
                      {isEditingTrainingEvent && (
                        <div
                          className={styles.cardEditPanel}
                          onClick={(clickEvent) => clickEvent.stopPropagation()}
                        >
                          <div className={styles.logisticsFormGrid}>
                            <label className={styles.logisticsField}>
                              <span>比赛名称</span>
                              <input
                                value={editingTrainingEventForm.name}
                                onChange={(changeEvent) =>
                                  handleEditTrainingEventFormChange('name', changeEvent.target.value)}
                                disabled={!canEdit}
                              />
                            </label>
                            <label className={styles.logisticsField}>
                              <span>比赛日期</span>
                              <input
                                type="date"
                                value={editingTrainingEventForm.date}
                                onChange={(changeEvent) =>
                                  handleEditTrainingEventFormChange('date', changeEvent.target.value)}
                                disabled={!canEdit}
                              />
                            </label>
                            <label className={styles.logisticsField}>
                              <span>创建日期</span>
                              <input
                                type="date"
                                value={editingTrainingEventForm.createdAt}
                                onChange={(changeEvent) =>
                                  handleEditTrainingEventFormChange('createdAt', changeEvent.target.value)}
                                disabled={!canEdit}
                              />
                            </label>
                            <label className={styles.logisticsField}>
                              <span>地点 / 场馆</span>
                              <input
                                value={editingTrainingEventForm.venue}
                                onChange={(changeEvent) =>
                                  handleEditTrainingEventFormChange('venue', changeEvent.target.value)}
                                disabled={!canEdit}
                              />
                            </label>
                            <label className={styles.logisticsField}>
                              <span>组别 / 赛项</span>
                              <select
                                value={editingTrainingEventForm.group}
                                onChange={(changeEvent) =>
                                  handleEditTrainingEventFormChange('group', changeEvent.target.value)}
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
                            <label className={styles.logisticsField}>
                              <span>教练</span>
                              <input
                                value={editingTrainingEventForm.coach}
                                onChange={(changeEvent) =>
                                  handleEditTrainingEventFormChange('coach', changeEvent.target.value)}
                                disabled={!canEdit}
                              />
                            </label>
                            <label className={`${styles.logisticsField} ${styles.logisticsWideField}`}>
                              <span>备注</span>
                              <textarea
                                value={editingTrainingEventForm.notes}
                                onChange={(changeEvent) =>
                                  handleEditTrainingEventFormChange('notes', changeEvent.target.value)}
                                disabled={!canEdit}
                              />
                            </label>
                          </div>
                        </div>
                      )}
                      <div className={styles.cardActionRow}>
                        <span className={styles.cardEnterHint}>点击进入比赛工作台</span>
                        {isEditingTrainingEvent ? (
                          <div className={styles.inlineButtonGroup} onClick={(clickEvent) => clickEvent.stopPropagation()}>
                            <button
                              className={styles.portalButton}
                              onClick={() => handleSaveTrainingEvent(event.id)}
                              disabled={!canEdit}
                            >
                              保存修改
                            </button>
                            <button className={styles.secondaryButton} onClick={handleCancelEditTrainingEvent}>
                              取消
                            </button>
                          </div>
                        ) : (
                          <button
                            className={styles.secondaryButton}
                            onClick={(clickEvent) => {
                              clickEvent.stopPropagation();
                              handleStartEditTrainingEvent(event);
                            }}
                            disabled={!canEdit}
                          >
                            编辑卡片
                          </button>
                        )}
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
                    );
                  })
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
              <PracticeEventHub
                accessToken={getStoredAccessToken() ?? undefined}
                logisticsEvents={logisticsEvents.map((event) => ({
                  id: event.id,
                  name: event.name,
                  date: event.date,
                  venue: event.venue,
                  participants: event.participants.map((participant) => ({ id: participant.id, name: participant.name, role: participant.role, eventItem: participant.eventItem, teamNo: participant.teamNo, teamName: participant.teamName })),
                }))}
                onOpenInspire={() => showNotification('MakeX Inspire 练习赛分析入口已预留。', 'info')}
                onOpenExplorer={handleOpenPracticeExplorer}
                onOpenSimulation={handleOpenSimulationSystem}
                onOpenScoreCalculator={handleOpenScoreCalculator}
              />
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
              <ExplorerScheduleGenerator />

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

      {installGuideOpen && (
        <div className={styles.installGuideOverlay} role="dialog" aria-modal="true" aria-label="添加到手机桌面">
          <article className={styles.installGuidePanel}>
            <div className={styles.portalCardTop}>
              <div>
                <p className={styles.portalCardLabel}>Install Guide</p>
                <h2>添加到手机桌面</h2>
              </div>
              <button
                className={styles.closeButton}
                type="button"
                onClick={() => setInstallGuideOpen(false)}
                aria-label="关闭添加说明"
              >
                ×
              </button>
            </div>
            <p className={styles.portalCardText}>
              当前浏览器没有直接弹出安装按钮，可以按下面步骤手动添加。添加后桌面会出现 MakeXRank 图标。
            </p>
            <ol className={styles.installGuideSteps}>
              {getPwaInstallInstructions().map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <button className={styles.portalButton} type="button" onClick={() => setInstallGuideOpen(false)}>
              我知道了
            </button>
          </article>
        </div>
      )}

      <NotificationContainer notifications={notifications} />
    </div>
  );
}
