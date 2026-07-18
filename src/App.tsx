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

  const pasteAreaRef = useRef<HTMLTextAreaElement>(null);
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

  const handleBackToHome = useCallback(() => {
    setViewMode('home');
    setActiveCompetitionId(null);
    setSearchKeyword('');
    setAwaitingPaste(false);
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

              <div className={styles.portalGrid}>
                <article className={styles.portalCard}>
                  <div className={styles.portalCardTop}>
                    <div>
                      <p className={styles.portalCardLabel}>当前状态</p>
                      <h3>模块已预留</h3>
                    </div>
                    <span className={styles.portalBadge}>Coming Next</span>
                  </div>
                  <p className={styles.portalCardText}>
                    你后面如果要做后勤系统，我可以直接继续在这个二级页里补卡片、表单、清单、状态流转和上传能力。
                  </p>
                  <button className={styles.portalButton} onClick={handleBackToHome}>
                    返回首页
                  </button>
                </article>
              </div>
            </section>

            <Footer lastUpdate="" isLobby storageMode={storageMode} />
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
