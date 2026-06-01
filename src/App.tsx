import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CompetitionRecord,
  CompetitionTopTeam,
  EventType,
  SortField,
  SortOrder,
  TabName,
  TeamRanked,
  TeamRaw,
  ViewMode,
} from './types';
import {
  countTeamsFromSourceText,
  getHighestSingleMatchScoreFromSourceText,
  parseTableData,
} from './utils/dataParser';
import { calculateRanking, sortTeams } from './utils/rankingAlgorithm';
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
import { NotificationContainer } from './components/ui/Notification';

import styles from './App.module.css';

const STORAGE_KEY = 'competitive-ranking-board::competitions';
const DEFAULT_EVENT_TYPE: EventType = 'MakeX Inspire';
const EVENT_TYPES: EventType[] = ['MakeX Inspire', 'MakeX Explorer', 'MakeX Challenge'];

function isEventType(value: unknown): value is EventType {
  return typeof value === 'string' && EVENT_TYPES.includes(value as EventType);
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

function loadCompetitions(): CompetitionRecord[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is CompetitionRecord => {
        return (
          item &&
          typeof item.id === 'string' &&
          (typeof item.eventType === 'undefined' || isEventType(item.eventType)) &&
          typeof item.name === 'string' &&
          typeof item.createdAt === 'string' &&
          typeof item.updatedAt === 'string' &&
          typeof item.lastUpdate === 'string' &&
          typeof item.sourceText === 'string' &&
          Array.isArray(item.teamsData)
        );
      })
      .map((item) => ({
        ...item,
        eventType: isEventType(item.eventType) ? item.eventType : DEFAULT_EVENT_TYPE,
        teamsData: item.teamsData as TeamRaw[],
      }));
  } catch {
    return [];
  }
}

export default function App() {
  const [competitions, setCompetitions] = useState<CompetitionRecord[]>(() => loadCompetitions());
  const [viewMode, setViewMode] = useState<ViewMode>('event-types');
  const [activeCompetitionId, setActiveCompetitionId] = useState<string | null>(null);
  const [selectedEventType, setSelectedEventType] = useState<EventType | null>(null);
  const [sortField, setSortField] = useState<SortField>('totalWinLossScore');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [activeTab, setActiveTab] = useState<TabName>('ranking');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [awaitingPaste, setAwaitingPaste] = useState(false);

  const pasteAreaRef = useRef<HTMLTextAreaElement>(null);
  const { notifications, showNotification } = useNotification();
  const { featuredTeams, addTeam, removeTeam, toggleTeam } = useFeaturedTeams();

  const activeCompetition =
    competitions.find((competition) => competition.id === activeCompetitionId) ?? null;
  const activeEventType = activeCompetition?.eventType ?? selectedEventType ?? DEFAULT_EVENT_TYPE;
  const lobbyCompetitions = selectedEventType
    ? competitions.filter((competition) => competition.eventType === selectedEventType)
    : [];
  const competitionCounts = EVENT_TYPES.reduce<Record<EventType, number>>((counts, eventType) => {
    counts[eventType] = competitions.filter((competition) => competition.eventType === eventType).length;
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
    .filter((team) => !selectedEventType || team.eventType === selectedEventType)
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
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(competitions));
    }
  }, [competitions]);

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

  const updateActiveCompetition = useCallback(
    (updater: (competition: CompetitionRecord) => CompetitionRecord) => {
      if (!activeCompetitionId) {
        return;
      }

      setCompetitions((previous) =>
        previous.map((competition) =>
          competition.id === activeCompetitionId ? updater(competition) : competition,
        ),
      );
    },
    [activeCompetitionId],
  );

  const handleCreateCompetition = useCallback(
    (name: string) => {
      if (!selectedEventType) {
        showNotification('请先选择一个赛项。', 'error');
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
      showNotification(`已在 ${selectedEventType} 下创建比赛卡片：${trimmedName}`, 'success');
    },
    [selectedEventType, showNotification],
  );

  const handleOpenCompetition = useCallback(
    (id: string) => {
      const competition = competitions.find((item) => item.id === id);
      if (!competition) {
        showNotification('没有找到这场比赛。', 'error');
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
    [competitions, showNotification],
  );

  const handleSelectEventType = useCallback((eventType: EventType) => {
    setSelectedEventType(eventType);
    setSortField(getDefaultSortField(eventType));
    setSortOrder('desc');
    setViewMode('lobby');
    setActiveCompetitionId(null);
    setSearchKeyword('');
    setAwaitingPaste(false);
  }, []);

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

  const handleDeleteCompetition = useCallback(
    (id: string) => {
      const competition = competitions.find((item) => item.id === id);
      setCompetitions((previous) => previous.filter((item) => item.id !== id));

      if (activeCompetitionId === id) {
        setActiveCompetitionId(null);
        setViewMode('lobby');
      }

      showNotification(
        competition ? `已删除比赛卡片：${competition.name}` : '比赛卡片已删除。',
        'info',
      );
    },
    [activeCompetitionId, competitions, showNotification],
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
      if (awaitingPaste && text.trim()) {
        setAwaitingPaste(false);
      }

      updateActiveCompetition((competition) => ({
        ...competition,
        sourceText: text,
        updatedAt: new Date().toISOString(),
      }));
    },
    [awaitingPaste, updateActiveCompetition],
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
  }, [activeCompetition, autoRefresh, showNotification, updateActiveCompetition]);

  const handleParseClipboard = useCallback(async () => {
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
  }, [activeCompetition, parseAndApplyTable, showNotification, updateActiveCompetition]);

  const handleRefresh = useCallback(() => {
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
  }, [activeCompetition, showNotification, updateActiveCompetition]);

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

  const handleAutoRefreshToggle = useCallback(
    (enabled: boolean) => {
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
    [activeCompetition, autoRefresh, showNotification],
  );

  return (
    <div className={styles.app}>
      <div className={styles.container}>
        {viewMode === 'event-types' ? (
          <>
            <Header
              eyebrow="Event Selection"
              title="赛项选择"
              subtitle="先选赛项，再进入对应的二级赛事大厅。每个赛项都会独立保存自己的比赛卡片和数据。"
            />

            <EventTypeSelector
              competitionCounts={competitionCounts}
              onSelect={handleSelectEventType}
            />

            <Footer lastUpdate="" isLobby />
          </>
        ) : viewMode === 'lobby' && selectedEventType ? (
          <>
            <Header
              eyebrow="Competition Hub"
              title={selectedEventType}
              subtitle="这里是该赛项的二级赛事大厅。先创建比赛卡片，再进入对应的排行榜工作台。"
              action={
                <button className={styles.backButton} onClick={handleBackToEventTypes}>
                  返回赛项选择
                </button>
              }
            />

            <CompetitionLobby
              competitions={lobbyCompetitions}
              eventType={selectedEventType}
              onCreateCompetition={handleCreateCompetition}
              onOpenCompetition={handleOpenCompetition}
              onDeleteCompetition={handleDeleteCompetition}
              topEpaTeams={topEpaTeams}
            />

            <Footer lastUpdate="" isLobby />
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
                <button className={styles.backButton} onClick={handleBackToLobby}>
                  返回赛事大厅
                </button>
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
            />

            <TabNavigation
              activeTab={activeTab}
              onTabChange={setActiveTab}
              showPlayoff={activeCompetition.eventType !== 'MakeX Inspire'}
            />

            {activeTab === 'ranking' && (
              <>
                <DataInputPanel
                  textValue={activeCompetition.sourceText}
                  onTextChange={handleSourceTextChange}
                  onClearData={handleClearCompetitionData}
                  awaitingPaste={awaitingPaste}
                  pasteAreaRef={pasteAreaRef}
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
                />
              </>
            )}

            {activeTab === 'playoff' && activeCompetition.eventType !== 'MakeX Inspire' && (
              <PlayoffView teamsData={teamsData} showNotification={showNotification} />
            )}

            <Footer lastUpdate={activeCompetition.lastUpdate} />
          </>
        ) : null}
      </div>

      <NotificationContainer notifications={notifications} />
    </div>
  );
}
