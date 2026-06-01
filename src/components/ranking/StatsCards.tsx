import type { EventType, TeamRanked } from '../../types';
import { formatSecondsAsClock } from '../../utils/time';
import styles from './StatsCards.module.css';

interface Props {
  eventType: EventType;
  highestSingleMatchScore?: number;
  teamCount?: number;
  teams: TeamRanked[];
}

export function StatsCards({ eventType, highestSingleMatchScore = 0, teamCount, teams }: Props) {
  const totalTeams = teamCount ?? teams.length;
  const isInspire = eventType === 'MakeX Inspire';
  const totalMatches = isInspire
    ? teams.reduce((sum, team) => sum + team.totalMatches, 0)
    : teams.reduce((sum, t) => sum + t.totalMatches, 0) / 4;
  const highestEpa = teams.reduce((best, team) => {
    const current = Number.parseFloat(team.epa) || 0;
    return current > best ? current : best;
  }, 0);
  const fastestTimeSeconds =
    teams
      .filter((team) => (team.attempt1Score ?? 0) >= 800 && (team.attempt1TimeSeconds ?? 0) > 0)
      .map((team) => team.attempt1TimeSeconds)
      .filter((value): value is number => value != null)
      .sort((left, right) => left - right)[0] ?? null;
  const fastestRandomTimeSeconds =
    teams
      .filter((team) => (team.attempt2Score ?? 0) >= 200 && (team.attempt2TimeSeconds ?? 0) > 0)
      .map((team) => team.attempt2TimeSeconds)
      .filter((value): value is number => value != null)
      .sort((left, right) => left - right)[0] ?? null;

  return (
    <div className={styles.summary}>
      <div className={styles.card}>
        <div className={styles.value}>{totalTeams}</div>
        <div className={styles.label}>参赛队伍</div>
      </div>
      <div className={styles.card}>
        <div className={styles.value}>{Number.isInteger(totalMatches) ? totalMatches : totalMatches.toFixed(1)}</div>
        <div className={styles.label}>{isInspire ? '有效轮次' : '总比赛场次'}</div>
      </div>
      {isInspire ? (
        <>
          <div className={styles.card}>
            <div className={styles.value}>{formatSecondsAsClock(fastestTimeSeconds)}</div>
            <div className={styles.label}>常规任务用时最快</div>
          </div>
          <div className={styles.card}>
            <div className={styles.value}>{formatSecondsAsClock(fastestRandomTimeSeconds)}</div>
            <div className={styles.label}>随机任务用时最快</div>
          </div>
        </>
      ) : (
        <>
          <div className={styles.card}>
            <div className={styles.value}>{highestEpa.toFixed(2)}</div>
            <div className={styles.label}>最高 EPA</div>
          </div>
          <div className={styles.card}>
            <div className={styles.value}>{highestSingleMatchScore.toFixed(2)}</div>
            <div className={styles.label}>单场最高得分</div>
          </div>
        </>
      )}
    </div>
  );
}
