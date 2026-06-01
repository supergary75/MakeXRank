import { useState } from 'react';
import type { EventType, TeamRanked } from '../../types';
import { formatSecondsAsClock } from '../../utils/time';
import { Modal } from '../ui/Modal';
import styles from './FeaturedTeams.module.css';

interface Props {
  eventType: EventType;
  teams: TeamRanked[];
  featuredNames: string[];
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
  allTeamNames: string[];
}

export function FeaturedTeams({
  eventType,
  teams,
  featuredNames,
  onAdd,
  onRemove,
  allTeamNames,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [input, setInput] = useState('');
  const isInspire = eventType === 'MakeX Inspire';

  const featuredData = featuredNames
    .map((name) => {
      const team = teams.find((t) => t.team === name);
      if (!team) return null;
      const rank = teams.indexOf(team) + 1;
      return { team, rank };
    })
    .filter(Boolean) as { team: TeamRanked; rank: number }[];

  if (featuredData.length === 0 && featuredNames.length === 0) return null;

  const handleAdd = () => {
    const name = input.trim();
    if (!name) return;
    onAdd(name);
    setInput('');
  };

  return (
    <>
      <div className={styles.container}>
        <div className={styles.header}>
          <h2>⭐ 重点关注战队</h2>
          <button className={styles.manageBtn} onClick={() => setModalOpen(true)}>
            ⚙️ 管理关注
          </button>
        </div>
        {featuredData.length > 0 && (
          <div className={styles.grid}>
            {featuredData.map(({ team, rank }) => {
              const rankColor = rank === 1 ? '#ffd700' : rank === 2 ? '#c0c0c0' : rank === 3 ? '#cd7f32' : '#667eea';
              const netColor = team.netScore >= 0 ? '#28a745' : '#dc3545';
              const netText = team.netScore > 0 ? `+${team.netScore}` : String(team.netScore);

              return (
                <div key={team.team} className={styles.card}>
                  <div className={styles.cardHeader}>
                    <h3>🌟 {team.team}</h3>
                    <div className={styles.rank} style={{ color: rankColor }}>
                      排名: <span>{rank}</span>
                    </div>
                  </div>
                  <div className={styles.stats}>
                    {isInspire ? (
                      <>
                        <div className={styles.statItem}>
                          <span className={styles.statLabel}>常规任务最高分</span>
                          <span className={`${styles.statValue} ${styles.highlight}`}>{team.attempt1Score ?? 0}</span>
                        </div>
                        <div className={styles.statItem}>
                          <span className={styles.statLabel}>常规任务用时</span>
                          <span className={styles.statValue}>
                            {team.attempt1TimeText || formatSecondsAsClock(team.attempt1TimeSeconds)}
                          </span>
                        </div>
                        <div className={styles.statItem}>
                          <span className={styles.statLabel}>随机任务最高分</span>
                          <span className={`${styles.statValue} ${styles.highlight}`}>{team.attempt2Score ?? 0}</span>
                        </div>
                        <div className={styles.statItem}>
                          <span className={styles.statLabel}>随机任务用时</span>
                          <span className={styles.statValue}>
                            {team.attempt2TimeText || formatSecondsAsClock(team.attempt2TimeSeconds)}
                          </span>
                        </div>
                        <div className={styles.statItem}>
                          <span className={styles.statLabel}>总得分</span>
                          <span className={`${styles.statValue} ${styles.highlight}`}>{team.totalScore}</span>
                        </div>
                        <div className={styles.statItem}>
                          <span className={styles.statLabel}>总用时</span>
                          <span className={styles.statValue} style={{ color: '#667eea', fontWeight: 600 }}>
                            {team.bestTimeText || formatSecondsAsClock(team.bestTimeSeconds)}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className={styles.statItem}>
                          <span className={styles.statLabel}>胜负分</span>
                          <span className={`${styles.statValue} ${styles.highlight}`}>{team.totalWinLossScore}</span>
                        </div>
                        <div className={styles.statItem}>
                          <span className={styles.statLabel}>净胜分</span>
                          <span className={styles.statValue} style={{ color: netColor }}>{netText}</span>
                        </div>
                        <div className={styles.statItem}>
                          <span className={styles.statLabel}>胜场</span>
                          <span className={styles.statValue}>{team.wins}</span>
                        </div>
                        <div className={styles.statItem}>
                          <span className={styles.statLabel}>负场</span>
                          <span className={styles.statValue}>{team.losses}</span>
                        </div>
                        <div className={styles.statItem}>
                          <span className={styles.statLabel}>平局场</span>
                          <span className={styles.statValue}>{team.draws}</span>
                        </div>
                        <div className={styles.statItem}>
                          <span className={styles.statLabel}>胜率</span>
                          <span className={styles.statValue}>{team.winRate}%</span>
                        </div>
                        <div className={styles.statItem}>
                          <span className={styles.statLabel}>EPA</span>
                          <span className={styles.statValue} style={{ color: '#667eea', fontWeight: 600 }}>{team.epa}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="🎯 管理关注战队">
        <div className={styles.addSection}>
          <h4>添加关注战队</h4>
          <div className={styles.addControls}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="输入战队名称..."
              list="teamSuggestions"
              className={styles.teamInput}
            />
            <datalist id="teamSuggestions">
              {allTeamNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <button className={styles.addBtn} onClick={handleAdd}>➕ 添加</button>
          </div>
          <div className={styles.inputHint}>提示：可以手动输入任意战队名称</div>
        </div>
        <div>
          <h4>已关注的战队</h4>
          <ul className={styles.list}>
            {featuredNames.length === 0 ? (
              <li className={styles.empty}>暂无关注的战队</li>
            ) : (
              featuredNames.map((name) => (
                <li key={name} className={styles.listItem}>
                  <span>{name}</span>
                  <button className={styles.removeBtn} onClick={() => onRemove(name)}>×</button>
                </li>
              ))
            )}
          </ul>
        </div>
      </Modal>
    </>
  );
}
