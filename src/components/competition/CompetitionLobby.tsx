import { useState } from 'react';
import type { CompetitionRecord, CompetitionTopTeam, EventType } from '../../types';
import { CompetitionTopTeams } from './CompetitionTopTeams';
import styles from './CompetitionLobby.module.css';

interface Props {
  competitions: CompetitionRecord[];
  eventType: EventType;
  onCreateCompetition: (name: string) => void;
  onOpenCompetition: (id: string) => void;
  onDeleteCompetition: (id: string) => void;
  topEpaTeams: CompetitionTopTeam[];
  canCreateCompetition?: boolean;
  canDeleteCompetition?: boolean;
}

function formatCardTime(value: string): string {
  if (!value) return '刚刚创建';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CompetitionLobby({
  competitions,
  eventType,
  onCreateCompetition,
  onOpenCompetition,
  onDeleteCompetition,
  topEpaTeams,
  canCreateCompetition = true,
  canDeleteCompetition = false,
}: Props) {
  const [competitionName, setCompetitionName] = useState('');

  const handleCreate = () => {
    onCreateCompetition(competitionName);
    if (competitionName.trim()) {
      setCompetitionName('');
    }
  };

  return (
    <section className={styles.lobby}>
      <div className={styles.creator}>
        <div className={styles.creatorCopy}>
          <p className={styles.creatorEyebrow}>新建赛事</p>
          <h2>{eventType} 赛事大厅</h2>
          <p className={styles.creatorHint}>
            同一赛项下的每场比赛都会独立建卡，后续粘贴进来的表格数据会保存在对应卡片里。
          </p>
        </div>

        <div className={styles.creatorForm}>
          <input
            className={styles.nameInput}
            type="text"
            value={competitionName}
            disabled={!canCreateCompetition}
            placeholder={`输入 ${eventType} 比赛名称，例如：广东区域赛 2026`}
            onChange={(event) => setCompetitionName(event.target.value)}
            onKeyDown={(event) => {
              if (!canCreateCompetition) {
                return;
              }

              if (event.key === 'Enter') {
                handleCreate();
              }
            }}
          />
          <button
            className={styles.createButton}
            disabled={!canCreateCompetition}
            onClick={handleCreate}
          >
            生成比赛卡片
          </button>
        </div>
      </div>

      <div className={styles.sectionTitle}>
        <h3>赛事卡片</h3>
        <span>{competitions.length} 个项目</span>
      </div>

      {competitions.length === 0 ? (
        <div className={styles.emptyState}>
          <p>当前还没有 {eventType} 的赛事卡片。</p>
          <p>先在上方输入比赛名称，生成这个赛项下的第一张卡片。</p>
        </div>
      ) : (
        <div className={styles.cardGrid}>
          {competitions.map((competition) => (
            <article key={competition.id} className={styles.card}>
              <div className={styles.cardTop}>
                <div>
                  <p className={styles.cardLabel}>比赛名称</p>
                  <h4>{competition.name}</h4>
                </div>
                <button
                  className={styles.deleteButton}
                  disabled={!canDeleteCompetition}
                  onClick={() => onDeleteCompetition(competition.id)}
                  title="删除赛事卡片"
                >
                  删除
                </button>
              </div>

              <div className={styles.cardMeta}>
                <span>{competition.teamsData.length} 支队伍</span>
                <span>{competition.lastUpdate ? `最近更新：${competition.lastUpdate}` : '尚未导入数据'}</span>
                <span>创建于 {formatCardTime(competition.createdAt)}</span>
              </div>

              <div className={styles.workspacePreview}>
                <p className={styles.previewTitle}>已接入工作台</p>
                <div className={styles.previewTags}>
                  <span>剪贴板导入</span>
                  <span>排行榜</span>
                  <span>淘汰赛预测</span>
                </div>
              </div>

              <div className={styles.cardActions}>
                <button className={styles.enterButton} onClick={() => onOpenCompetition(competition.id)}>
                  进入这个比赛
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <CompetitionTopTeams eventType={eventType} teams={topEpaTeams} />
    </section>
  );
}
