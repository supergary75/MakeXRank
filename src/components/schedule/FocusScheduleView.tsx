import { useEffect, useState } from 'react';
import type { NotificationType } from '../../types';
import type { FocusTeamSchedule, ScheduleAllianceTeam } from '../../utils/focusScheduleParser';
import { buildFocusTeamSchedules, countScheduleRows } from '../../utils/focusScheduleParser';
import { getTeamTag, getTeamTagKey } from '../../utils/teamTags';
import styles from './FocusScheduleView.module.css';

interface Props {
  competitionId: string;
  showNotification: (msg: string, type: NotificationType) => void;
  teamTags?: Record<string, string>;
  tagOptions?: string[];
  onSetTeamTag?: (teamNumber: string, teamName: string, tag: string) => void;
  onAddTagOption?: (tag: string) => void;
}

interface FocusIdentity {
  number: string;
  name: string;
}

interface FocusScheduleCache {
  focusInput: string;
  scheduleInput: string;
  schedules: FocusTeamSchedule[];
  rowCount: number;
}

const STORAGE_PREFIX = 'competitive-ranking-board::focus-schedule::';

function getStorageKey(competitionId: string): string {
  return `${STORAGE_PREFIX}${competitionId}`;
}

function isFocusScheduleArray(value: unknown): value is FocusTeamSchedule[] {
  return Array.isArray(value);
}

function loadCachedSchedule(competitionId: string): FocusScheduleCache {
  if (typeof window === 'undefined') {
    return {
      focusInput: '',
      scheduleInput: '',
      schedules: [],
      rowCount: 0,
    };
  }

  try {
    const raw = window.localStorage.getItem(getStorageKey(competitionId));
    if (!raw) {
      return {
        focusInput: '',
        scheduleInput: '',
        schedules: [],
        rowCount: 0,
      };
    }

    const parsed = JSON.parse(raw) as Partial<FocusScheduleCache>;
    return {
      focusInput: typeof parsed.focusInput === 'string' ? parsed.focusInput : '',
      scheduleInput: typeof parsed.scheduleInput === 'string' ? parsed.scheduleInput : '',
      schedules: isFocusScheduleArray(parsed.schedules) ? parsed.schedules : [],
      rowCount: typeof parsed.rowCount === 'number' ? parsed.rowCount : 0,
    };
  } catch {
    return {
      focusInput: '',
      scheduleInput: '',
      schedules: [],
      rowCount: 0,
    };
  }
}

function formatTeam(number: string, name: string): string {
  if (number && name) {
    return `${number} ${name}`;
  }

  return number || name || '未识别';
}

function formatSeatTeam(seatLabel: string, name: string): string {
  if (seatLabel && name) {
    return `${seatLabel} ${name}`;
  }

  return seatLabel || name || '未识别';
}

function getMatchCountClass(matchCount: number): string {
  if (matchCount === 4) {
    return styles.complete;
  }

  if (matchCount === 0) {
    return styles.empty;
  }

  return styles.warning;
}

function isFocusTeam(team: ScheduleAllianceTeam, number: string, name: string): boolean {
  return Boolean(
    (number && team.number === number)
    || (name && team.name === name),
  );
}

function countFocusTeams(teams: ScheduleAllianceTeam[], focusTeams: FocusIdentity[]): number {
  return teams.filter((team) =>
    focusTeams.some((focusTeam) => isFocusTeam(team, focusTeam.number, focusTeam.name)),
  ).length;
}

export function FocusScheduleView({
  competitionId,
  showNotification,
  teamTags = {},
  tagOptions = [],
  onSetTeamTag,
  onAddTagOption,
}: Props) {
  const [initialCache] = useState(() => loadCachedSchedule(competitionId));
  const [focusInput, setFocusInput] = useState(initialCache.focusInput);
  const [scheduleInput, setScheduleInput] = useState(initialCache.scheduleInput);
  const [schedules, setSchedules] = useState<FocusTeamSchedule[]>(initialCache.schedules);
  const [rowCount, setRowCount] = useState(initialCache.rowCount);
  const [activeTagKey, setActiveTagKey] = useState('');
  const [customTag, setCustomTag] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      getStorageKey(competitionId),
      JSON.stringify({
        focusInput,
        scheduleInput,
        schedules,
        rowCount,
      }),
    );
  }, [competitionId, focusInput, rowCount, scheduleInput, schedules]);

  const generateSchedules = (sourceText = scheduleInput) => {
    const trimmedSource = sourceText.trim();
    const trimmedFocus = focusInput.trim();

    if (!trimmedFocus) {
      showNotification('请先输入 K CLUB 重点赛队名称或编号。', 'error');
      return;
    }

    if (!trimmedSource) {
      showNotification('请先粘贴或读取资格赛赛程表。', 'error');
      return;
    }

    const nextSchedules = buildFocusTeamSchedules(trimmedSource, trimmedFocus);
    const nextRowCount = countScheduleRows(trimmedSource);

    setSchedules(nextSchedules);
    setRowCount(nextRowCount);

    const foundCount = nextSchedules.filter((schedule) => schedule.matches.length > 0).length;
    showNotification(
      `已识别 ${nextRowCount} 场资格赛，为 ${foundCount}/${nextSchedules.length} 支重点队生成赛程。`,
      foundCount > 0 ? 'success' : 'error',
    );
  };

  const handleReadClipboard = async () => {
    if (!navigator.clipboard?.readText) {
      showNotification('当前浏览器不能直接读取剪切板，请把赛程表粘贴到输入框后再生成。', 'error');
      return;
    }

    try {
      const clipboardText = (await navigator.clipboard.readText()).trim();

      if (!clipboardText) {
        showNotification('剪切板为空，请先复制资格赛赛程表。', 'error');
        return;
      }

      setScheduleInput(clipboardText);
      generateSchedules(clipboardText);
    } catch (error) {
      const message = error instanceof Error ? error.message : '浏览器拒绝读取剪切板';
      showNotification(`读取剪切板失败，请改为手动粘贴到输入框。原因：${message}`, 'error');
    }
  };

  const handleClear = () => {
    setFocusInput('');
    setScheduleInput('');
    setSchedules([]);
    setRowCount(0);
    showNotification('已清空重点赛队赛程生成内容。', 'info');
  };

  const renderTagPicker = (teamNumber: string, teamName: string) => {
    if (!onSetTeamTag) {
      return null;
    }

    const currentTag = getTeamTag(teamTags, teamNumber, teamName);

    return (
      <div className={styles.tagPicker} onClick={(event) => event.stopPropagation()}>
        <div className={styles.tagPickerHeader}>
          <strong>给这支队打标签</strong>
          <button type="button" onClick={() => setActiveTagKey('')}>
            关闭
          </button>
        </div>
        <div className={styles.tagOptions}>
          {tagOptions.map((tag) => (
            <button
              key={tag}
              type="button"
              className={currentTag === tag ? styles.activeTagOption : ''}
              onClick={() => {
                onSetTeamTag(teamNumber, teamName, tag);
                setActiveTagKey('');
              }}
            >
              {tag}
            </button>
          ))}
          {currentTag && (
            <button
              type="button"
              className={styles.clearTagOption}
              onClick={() => {
                onSetTeamTag(teamNumber, teamName, '');
                setActiveTagKey('');
              }}
            >
              清除标签
            </button>
          )}
        </div>
        {onAddTagOption && (
          <div className={styles.customTagRow}>
            <input
              value={customTag}
              onChange={(event) => setCustomTag(event.target.value)}
              placeholder="输入自定义标签"
            />
            <button
              type="button"
              onClick={() => {
                const nextTag = customTag.trim();
                if (!nextTag) {
                  return;
                }

                onAddTagOption(nextTag);
                onSetTeamTag(teamNumber, teamName, nextTag);
                setCustomTag('');
                setActiveTagKey('');
              }}
            >
              添加并使用
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderAlliance = (
    teams: ScheduleAllianceTeam[],
    side: 'red' | 'blue',
    focusNumber: string,
    focusName: string,
    sideClassName: string,
    focusTeams: FocusIdentity[],
    relationClassName = '',
  ) => (
    <div className={`${styles.allianceTeams} ${relationClassName}`}>
      {teams.map((team, index) => {
        const isCurrentFocus = isFocusTeam(team, focusNumber, focusName);
        const isAnyFocus = focusTeams.some((focusTeam) =>
          isFocusTeam(team, focusTeam.number, focusTeam.name),
        );
        const teamTag = getTeamTag(teamTags, team.number, team.name);
        const tagKey = getTeamTagKey(team.number, team.name);
        const fallbackSeatLabel = `${side === 'red' ? '红' : '蓝'}${index + 1}`;
        const seatLabel = team.seatLabel || fallbackSeatLabel;

        return (
          <div
            key={`${seatLabel}-${team.number}-${team.name}-${index}`}
            className={styles.taggedTeam}
          >
            <button
              type="button"
              className={`${styles.teamPill} ${sideClassName} ${
                isCurrentFocus ? styles.focusTeam : ''
              } ${isAnyFocus && !isCurrentFocus ? styles.otherFocusTeam : ''}`}
              onClick={() => {
                if (!onSetTeamTag) {
                  return;
                }

                setActiveTagKey((previous) => (previous === tagKey ? '' : tagKey));
              }}
            >
              {formatSeatTeam(seatLabel, team.name)}
              {teamTag && <span className={styles.inlineTag}>{teamTag}</span>}
            </button>
            {activeTagKey === tagKey && renderTagPicker(team.number, team.name)}
          </div>
        );
      })}
    </div>
  );

  const totalMatches = schedules.reduce((total, schedule) => total + schedule.matches.length, 0);
  const focusTeams = schedules
    .filter((schedule) => schedule.teamNumber || schedule.teamName)
    .map((schedule) => ({
      number: schedule.teamNumber,
      name: schedule.teamName,
    }));

  return (
    <div className={styles.container}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Explorer Schedule Builder</p>
          <h2>重点赛队赛程生成</h2>
          <p className={styles.description}>
            从资格赛赛程表读取四队对阵信息，再按照每次输入的 K CLUB 重点赛队名称整理出每支队的四场资格赛安排。
          </p>
        </div>
        <div className={styles.heroStats}>
          <span>{rowCount} 场赛程</span>
          <span>{schedules.length} 支重点队</span>
          <span>{totalMatches} 条匹配</span>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h3>导入赛程表</h3>
            <p>复制 Excel 或表格中的资格赛赛程，点击读取剪切板；如果读取受限，就直接粘贴到下方输入框。</p>
          </div>
          <div className={styles.actions}>
            <button className={styles.secondaryButton} type="button" onClick={handleClear}>
              清空
            </button>
            <button className={styles.primaryButton} type="button" onClick={handleReadClipboard}>
              读取剪切板并生成
            </button>
          </div>
        </div>

        <div className={styles.inputGrid}>
          <label className={styles.inputBlock}>
            <span>K CLUB 重点赛队</span>
            <textarea
              className={styles.textarea}
              value={focusInput}
              onChange={(event) => setFocusInput(event.target.value)}
              placeholder={'每行一个队名或编号，例如：\nKB-乔斯达\n11309\n破晓者'}
            />
          </label>

          <label className={styles.inputBlock}>
            <span>资格赛赛程表</span>
            <textarea
              className={styles.textarea}
              value={scheduleInput}
              onChange={(event) => setScheduleInput(event.target.value)}
              placeholder="粘贴包含 场地、场次、红方战队1、红方战队2、蓝方战队1、蓝方战队2 的完整表格..."
            />
          </label>
        </div>

        <div className={styles.actionFooter}>
          <button className={styles.primaryButton} type="button" onClick={() => generateSchedules()}>
            生成重点队赛程
          </button>
        </div>
      </section>

      <section className={styles.resultPanel}>
        <div className={styles.panelHeader}>
          <div>
            <h3>赛程结果</h3>
            <p>点击任意赛队即可打标签；同一支队在其它位置再次出现时会自动显示这个标签。</p>
          </div>
        </div>

        {schedules.length === 0 ? (
          <div className={styles.emptyState}>还没有生成结果。先输入重点赛队并导入赛程表，就可以在这里查看四场赛程。</div>
        ) : (
          <div className={styles.scheduleList}>
            {schedules.map((schedule) => (
              <article key={schedule.query} className={styles.scheduleCard}>
                <div className={styles.scheduleHeader}>
                  <div>
                    <span className={styles.queryLabel}>输入：{schedule.query}</span>
                    <h4>{formatTeam(schedule.teamNumber, schedule.teamName)}</h4>
                  </div>
                  <span className={`${styles.matchBadge} ${getMatchCountClass(schedule.matches.length)}`}>
                    {schedule.matches.length}/4 场
                  </span>
                </div>

                {schedule.matches.length === 0 ? (
                  <p className={styles.notFound}>当前赛程表中没有找到这支队。请检查队名、队号或表格列是否完整。</p>
                ) : (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>场地</th>
                          <th>场次</th>
                          <th>红方联盟</th>
                          <th>对阵</th>
                          <th>蓝方联盟</th>
                        </tr>
                      </thead>
                      <tbody>
                        {schedule.matches.map((match) => {
                          const redFocusCount = countFocusTeams(match.redAlliance, focusTeams);
                          const blueFocusCount = countFocusTeams(match.blueAlliance, focusTeams);
                          const hasSameAllianceFocus = redFocusCount >= 2 || blueFocusCount >= 2;
                          const hasHeadToHeadFocus = redFocusCount > 0 && blueFocusCount > 0;
                          const redRelationClass = redFocusCount >= 2
                            ? styles.sameAllianceGroup
                            : hasHeadToHeadFocus && redFocusCount > 0 ? styles.headToHeadGroup : '';
                          const blueRelationClass = blueFocusCount >= 2
                            ? styles.sameAllianceGroup
                            : hasHeadToHeadFocus && blueFocusCount > 0 ? styles.headToHeadGroup : '';

                          return (
                            <tr
                              key={match.id}
                              className={
                                hasSameAllianceFocus
                                  ? styles.sameAllianceRow
                                  : hasHeadToHeadFocus ? styles.headToHeadRow : ''
                              }
                            >
                              <td>{match.field || '-'}</td>
                              <td>{match.matchNo || '-'}</td>
                              <td className={styles.redAllianceCell}>
                                {renderAlliance(
                                  match.redAlliance,
                                  'red',
                                  match.teamNumber,
                                  match.teamName,
                                  styles.redTeam,
                                  focusTeams,
                                  redRelationClass,
                                )}
                              </td>
                              <td className={styles.versusCell}>
                                <span className={hasHeadToHeadFocus ? styles.headToHeadBadge : ''}>VS</span>
                              </td>
                              <td className={styles.blueAllianceCell}>
                                {renderAlliance(
                                  match.blueAlliance,
                                  'blue',
                                  match.teamNumber,
                                  match.teamName,
                                  styles.blueTeam,
                                  focusTeams,
                                  blueRelationClass,
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
