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

const DEFAULT_EVENT_TYPE: EventType = 'MakeX Inspire';
const EVENT_TYPES: EventType[] = ['MakeX Inspire', 'MakeX Explorer', 'MakeX Challenge'];
const PRACTICE_EXPLORER_STORAGE_KEY = 'competitive-ranking-board::practice-explorer';
const LOGISTICS_EVENTS_STORAGE_KEY = 'competitive-ranking-board::logistics-events';

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

  const pasteAreaRef = useRef<HTMLTextAreaElement>(null);
  const practiceExplorerPasteAreaRef = useRef<HTMLTextAreaElement>(null);
  const { notifications, showNotification } = useNotification();
  const { featuredTeams, addTeam, removeTeam, toggleTeam } = useFeaturedTeams();

  const activeCompetition =
    competitions.find((competition) => competition.id === activeCompetitionId) ?? null;
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
              subtitle="先在首页登录，再根据工作内容进入对应入口。当前已提供赛事后勤管理与赛事数据分析两个工作台入口。"
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
