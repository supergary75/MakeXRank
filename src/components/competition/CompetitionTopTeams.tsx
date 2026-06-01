import styles from './CompetitionTopTeams.module.css';
import type { EventType } from '../../types';
import { formatSecondsAsClock } from '../../utils/time';

interface CompetitionTopTeam {
  attempt1Score?: number;
  attempt1TimeSeconds?: number | null;
  attempt1TimeText?: string;
  attempt2Score?: number;
  attempt2TimeSeconds?: number | null;
  attempt2TimeText?: string;
  bestTimeSeconds?: number | null;
  bestTimeText?: string;
  competitionId: string;
  competitionName: string;
  draws: number;
  epa: string;
  losses: number;
  netScore: number;
  rankInCompetition: number;
  team: string;
  totalScore: number;
  totalWinLossScore: number;
  wins: number;
}

interface Props {
  eventType: EventType;
  teams: CompetitionTopTeam[];
}

export function CompetitionTopTeams({ eventType, teams }: Props) {
  const isInspire = eventType === 'MakeX Inspire';

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Event Board</p>
          <h3>{isInspire ? `${eventType} 常规任务前 20` : `${eventType} EPA 前 20`}</h3>
        </div>
        <span className={styles.count}>{teams.length} 个席位</span>
      </div>

      {teams.length === 0 ? (
        <div className={styles.emptyState}>
          <p>{eventType} 赛项下还没有可统计的赛事数据。</p>
          <p>先进入这个赛项里的任意比赛导入表格，这里就会自动生成该赛项的 EPA 榜单。</p>
        </div>
      ) : (
        <div className={styles.list}>
          {teams.map((team, index) => (
            <article key={`${team.competitionId}-${team.team}-${index}`} className={styles.card}>
              <div className={styles.rankPill}>#{index + 1}</div>

              <div className={styles.cardBody}>
                <div className={styles.topRow}>
                  <div>
                    <h4>{team.team}</h4>
                    <p className={styles.competitionName}>{team.competitionName}</p>
                  </div>
                  <div className={styles.epaBlock}>
                    <span className={styles.epaLabel}>{isInspire ? '常规任务最高分' : 'EPA'}</span>
                    <strong>{isInspire ? (team.attempt1Score ?? 0) : team.epa}</strong>
                  </div>
                </div>

                <div className={styles.metaRow}>
                  <span>赛事内排名 #{team.rankInCompetition}</span>
                  {isInspire ? (
                    <>
                      <span>常规任务 {team.attempt1Score ?? 0} 分 / {team.attempt1TimeText || formatSecondsAsClock(team.attempt1TimeSeconds)}</span>
                      <span>随机任务 {team.attempt2Score ?? 0} 分 / {team.attempt2TimeText || formatSecondsAsClock(team.attempt2TimeSeconds)}</span>
                      <span>总得分 {team.totalScore}</span>
                      <span>总用时 {team.bestTimeText || formatSecondsAsClock(team.bestTimeSeconds)}</span>
                    </>
                  ) : (
                    <>
                      <span>
                        {team.wins} 胜 {team.draws} 平 {team.losses} 负
                      </span>
                      <span>胜负分 {team.totalWinLossScore}</span>
                      <span>
                        净胜分 {team.netScore > 0 ? '+' : ''}
                        {team.netScore}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
