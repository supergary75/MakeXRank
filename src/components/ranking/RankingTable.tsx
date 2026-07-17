import { useState } from 'react';
import type { EventType, SortField, SortOrder, TeamRanked } from '../../types';
import { getTeamNumberFromName, getTeamTag, getTeamTagKey } from '../../utils/teamTags';
import { formatSecondsAsClock } from '../../utils/time';
import styles from './RankingTable.module.css';

interface Props {
  eventType: EventType;
  teams: TeamRanked[];
  sortField: SortField;
  sortOrder: SortOrder;
  onSort: (field: SortField) => void;
  searchKeyword: string;
  featuredNames: string[];
  onTeamClick: (name: string) => void;
  teamTags?: Record<string, string>;
  tagOptions?: string[];
  onSetTeamTag?: (teamNumber: string, teamName: string, tag: string) => void;
  onAddTagOption?: (tag: string) => void;
}

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

const ALLIANCE_COLUMNS: Array<{ field: SortField; label: string }> = [
  { field: 'wins', label: '胜场' },
  { field: 'draws', label: '平局场' },
  { field: 'losses', label: '负场' },
  { field: 'totalMatches', label: '总场次' },
  { field: 'winRate', label: '胜率' },
  { field: 'totalWinLossScore', label: '胜负分' },
  { field: 'netScore', label: '净胜分' },
  { field: 'totalScore', label: '总分' },
  { field: 'epa', label: 'EPA' },
];

const INSPIRE_COLUMNS: Array<{ field: SortField; label: string }> = [
  { field: 'attempt1Score', label: '常规任务最高分' },
  { field: 'attempt1TimeSeconds', label: '常规任务用时' },
  { field: 'attempt2Score', label: '随机任务最高分' },
  { field: 'attempt2TimeSeconds', label: '随机任务用时' },
  { field: 'totalScore', label: '总得分' },
  { field: 'bestTimeSeconds', label: '总用时' },
];

function renderInspireCell(team: TeamRanked, field: SortField) {
  switch (field) {
    case 'attempt1Score':
      return team.attempt1Score ?? 0;
    case 'attempt1TimeSeconds':
      return team.attempt1TimeText || formatSecondsAsClock(team.attempt1TimeSeconds);
    case 'attempt2Score':
      return team.attempt2Score ?? 0;
    case 'attempt2TimeSeconds':
      return team.attempt2TimeText || formatSecondsAsClock(team.attempt2TimeSeconds);
    case 'totalScore':
      return <strong>{team.totalScore}</strong>;
    case 'bestTimeSeconds':
      return <strong>{team.bestTimeText || formatSecondsAsClock(team.bestTimeSeconds)}</strong>;
    default:
      return '--';
  }
}

export function RankingTable({
  eventType,
  teams,
  sortField,
  sortOrder,
  onSort,
  searchKeyword,
  featuredNames,
  onTeamClick,
  teamTags = {},
  tagOptions = [],
  onSetTeamTag,
  onAddTagOption,
}: Props) {
  const [activeTagKey, setActiveTagKey] = useState('');
  const [customTag, setCustomTag] = useState('');
  const normalizedKeyword = searchKeyword.trim().toLowerCase();
  const filtered = normalizedKeyword
    ? teams.filter((team) => team.team.toLowerCase().includes(normalizedKeyword))
    : teams;
  const isInspire = eventType === 'MakeX Inspire';
  const isExplorer = eventType === 'MakeX Explorer';
  const columns = isInspire ? INSPIRE_COLUMNS : ALLIANCE_COLUMNS;

  const renderTagPicker = (teamNumber: string, teamName: string) => {
    if (!isExplorer || !onSetTeamTag) {
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

  return (
    <div className={styles.container}>
      {normalizedKeyword && (
        <div className={styles.searchResult}>
          {filtered.length > 0 ? `找到 ${filtered.length} 支战队` : '未找到匹配的战队'}
        </div>
      )}

      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.rankCol}>排名</th>
            <th className={styles.teamCol}>队伍名称</th>
            {columns.map((column) => (
              <th
                key={column.field}
                className={`${styles.numberCol} ${styles.sortable} ${sortField === column.field ? styles.active : ''}`}
                onClick={() => onSort(column.field)}
              >
                {column.label}
                <span className={styles.sortIcon}>
                  {sortField === column.field ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </span>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={columns.length + 2} className={styles.noData}>
                暂无数据，请先粘贴表格并点击“解析剪贴板”。
              </td>
            </tr>
          ) : (
            filtered.map((team) => {
              const rank = teams.indexOf(team) + 1;
              const rankClass =
                rank === 1 ? styles.rank1 : rank === 2 ? styles.rank2 : rank === 3 ? styles.rank3 : '';
              const teamNumber = getTeamNumberFromName(team.team);
              const teamTag = getTeamTag(teamTags, teamNumber, team.team);
              const tagKey = getTeamTagKey(teamNumber, team.team);

              return (
                <tr key={team.team} className={rankClass}>
                  <td className={styles.rankCol}>{MEDAL[rank] || rank}</td>
                  <td
                    className={styles.teamClickable}
                    onClick={() => {
                      if (isExplorer && onSetTeamTag) {
                        setActiveTagKey((previous) => (previous === tagKey ? '' : tagKey));
                        return;
                      }

                      onTeamClick(team.team);
                    }}
                    title={isExplorer ? '点击给赛队打标签' : featuredNames.includes(team.team) ? '点击取消关注' : '点击加入关注'}
                  >
                    <div className={styles.teamNameLine}>
                      <span>{team.team}</span>
                      {teamTag && <span className={styles.teamTag}>{teamTag}</span>}
                      {!isExplorer && featuredNames.includes(team.team) && <span className={styles.badge}>★</span>}
                    </div>
                    {activeTagKey === tagKey && renderTagPicker(teamNumber, team.team)}
                  </td>
                  {isInspire ? (
                    columns.map((column) => (
                      <td key={`${team.team}-${column.field}`} className={styles.numberCol}>
                        {renderInspireCell(team, column.field)}
                      </td>
                    ))
                  ) : (
                    <>
                      <td className={styles.numberCol}>{team.wins}</td>
                      <td className={styles.numberCol}>{team.draws}</td>
                      <td className={styles.numberCol}>{team.losses}</td>
                      <td className={styles.numberCol}>{team.totalMatches}</td>
                      <td className={styles.numberCol}>{team.winRate}%</td>
                      <td className={styles.scoreCol}>
                        <strong>{team.totalWinLossScore}</strong>
                      </td>
                      <td
                        className={styles.numberCol}
                        style={{ color: team.netScore >= 0 ? '#28a745' : '#dc3545' }}
                      >
                        <strong>
                          {team.netScore > 0 ? '+' : ''}
                          {team.netScore}
                        </strong>
                      </td>
                      <td className={styles.numberCol}>{team.totalScore}</td>
                      <td className={styles.epaCol}>
                        <strong>{team.epa}</strong>
                      </td>
                    </>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
