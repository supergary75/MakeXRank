import type { TeamRaw } from '../types';

export interface PracticeExplorerMatchRow {
  team: string;
  round: number;
  equity: number;
  bucket: number;
  flag: number;
  yellowBlock: number;
  redBlueBlock: number;
  yellowBall: number;
  onlineBall: number;
  fieldBall: number;
  penalty: number;
  redCard: number;
  epa: number;
  totalScore: number;
}

export interface PracticeExplorerInsight {
  team: string;
  matches: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  recentAverageScore: number;
  averageEpa: number;
  bestEpa: number;
  stabilityGap: number;
  consistencyScore: number;
  trainingType: string;
  strength: string;
  weakness: string;
  suggestion: string;
  practiceGoals: string[];
  practicePlan: string[];
  reviewPoint: string;
}

export interface PracticeExplorerMetricLeader {
  key: keyof PracticeExplorerMatchRow;
  label: string;
  team: string;
  value: number;
}

export interface PracticeExplorerMetricRanking {
  key: keyof PracticeExplorerMatchRow;
  label: string;
  teams: Array<{
    team: string;
    best: number;
    average: number;
    matches: number;
  }>;
}

type PracticeColumnKey =
  | 'round'
  | 'equity'
  | 'bucket'
  | 'flag'
  | 'yellowBlock'
  | 'redBlueBlock'
  | 'yellowBall'
  | 'onlineBall'
  | 'fieldBall'
  | 'penalty'
  | 'redCard'
  | 'epa'
  | 'totalScore';

const COLUMN_ALIASES: Record<PracticeColumnKey, string[]> = {
  round: ['场次'],
  equity: ['权益'],
  bucket: ['桶'],
  flag: ['旗帜', '旗帆'],
  yellowBlock: ['黄方块'],
  redBlueBlock: ['红蓝方块'],
  yellowBall: ['黄球'],
  onlineBall: ['红蓝球（网上）', '红蓝球(网上)', '红蓝球网上'],
  fieldBall: ['红蓝球（绿地）', '红蓝球(绿地)', '红蓝球绿地'],
  penalty: ['违规', '违例'],
  redCard: ['红牌'],
  epa: ['EPA'],
  totalScore: ['总分'],
};

const METRICS: Array<{ key: keyof PracticeExplorerMatchRow; label: string }> = [
  { key: 'totalScore', label: '单场总分' },
  { key: 'epa', label: 'EPA' },
  { key: 'onlineBall', label: '红蓝球（网上）' },
  { key: 'fieldBall', label: '红蓝球（绿地）' },
  { key: 'yellowBall', label: '黄球' },
  { key: 'bucket', label: '桶' },
  { key: 'yellowBlock', label: '黄方块' },
  { key: 'redBlueBlock', label: '红蓝方块' },
];

function normalizeCell(value: string): string {
  return value.replace(/\uFEFF/g, '').replace(/\r/g, '').trim();
}

function parseNumber(value: string): number {
  const normalized = normalizeCell(value).replace(/,/g, '');
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) || 0 : 0;
}

function splitRow(row: string): string[] {
  if (row.includes('\t')) {
    return row.split('\t').map(normalizeCell);
  }

  if (row.includes(',')) {
    return row.split(',').map(normalizeCell);
  }

  return row.split(/\s{2,}/).map(normalizeCell);
}

function isHeaderRow(cells: string[]): boolean {
  return cells.includes('场次') && (cells.includes('总分') || cells.includes('EPA'));
}

function findSingleTitle(cells: string[]): string {
  const nonEmpty = cells.filter(Boolean);
  if (nonEmpty.length !== 1) {
    return '';
  }

  const title = nonEmpty[0];
  if (isHeaderRow(nonEmpty) || /^\d+$/.test(title) || COLUMN_ALIASES.totalScore.includes(title)) {
    return '';
  }

  return title;
}

function resolvePracticeIndexes(header: string[]): Partial<Record<PracticeColumnKey, number>> {
  return (Object.keys(COLUMN_ALIASES) as PracticeColumnKey[]).reduce<Partial<Record<PracticeColumnKey, number>>>(
    (indexes, key) => {
      const headerIndex = header.findIndex((cell) => COLUMN_ALIASES[key].includes(normalizeCell(cell)));
      if (headerIndex >= 0) {
        indexes[key] = headerIndex;
      }
      return indexes;
    },
    {},
  );
}

function valueAt(cells: string[], indexes: Partial<Record<PracticeColumnKey, number>>, key: PracticeColumnKey): number {
  const index = indexes[key];
  return index == null ? 0 : parseNumber(cells[index] ?? '');
}

export function parsePracticeExplorerData(text: string): { rows: PracticeExplorerMatchRow[]; teamsData: TeamRaw[] } {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim());
  const rows: PracticeExplorerMatchRow[] = [];
  let currentTeam = '';
  let currentIndexes: Partial<Record<PracticeColumnKey, number>> = {};

  lines.forEach((line) => {
    const cells = splitRow(line);
    const title = findSingleTitle(cells);
    if (title) {
      currentTeam = title;
      currentIndexes = {};
      return;
    }

    if (isHeaderRow(cells)) {
      currentIndexes = resolvePracticeIndexes(cells);
      return;
    }

    if (!currentTeam || currentIndexes.round == null) {
      return;
    }

    const round = valueAt(cells, currentIndexes, 'round');
    const totalScore = valueAt(cells, currentIndexes, 'totalScore');
    const epa = valueAt(cells, currentIndexes, 'epa');
    const hasScore = totalScore > 0 || epa > 0;

    if (!round || !hasScore) {
      return;
    }

    rows.push({
      team: currentTeam,
      round,
      equity: valueAt(cells, currentIndexes, 'equity'),
      bucket: valueAt(cells, currentIndexes, 'bucket'),
      flag: valueAt(cells, currentIndexes, 'flag'),
      yellowBlock: valueAt(cells, currentIndexes, 'yellowBlock'),
      redBlueBlock: valueAt(cells, currentIndexes, 'redBlueBlock'),
      yellowBall: valueAt(cells, currentIndexes, 'yellowBall'),
      onlineBall: valueAt(cells, currentIndexes, 'onlineBall'),
      fieldBall: valueAt(cells, currentIndexes, 'fieldBall'),
      penalty: valueAt(cells, currentIndexes, 'penalty'),
      redCard: valueAt(cells, currentIndexes, 'redCard'),
      epa,
      totalScore,
    });
  });

  const teamMap = new Map<string, TeamRaw>();
  rows.forEach((row) => {
    const team = teamMap.get(row.team) ?? {
      team: row.team,
      wins: 0,
      losses: 0,
      points: 0,
      totalScore: 0,
      netScore: 0,
      matches: 0,
    };

    team.matches += 1;
    team.points += row.totalScore;
    team.totalScore += row.totalScore;
    team.netScore += row.totalScore + row.penalty;
    if (row.totalScore >= 400) {
      team.wins += 1;
    } else if (row.totalScore < 300) {
      team.losses += 1;
    }

    teamMap.set(row.team, team);
  });

  return { rows, teamsData: Array.from(teamMap.values()) };
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function formatNumber(value: number): string {
  return String(Math.round(value));
}

function getAverageMetric(rows: PracticeExplorerMatchRow[], key: keyof PracticeExplorerMatchRow): number {
  return average(rows.map((row) => Number(row[key]) || 0));
}

function getStrength(rows: PracticeExplorerMatchRow[]): string {
  const metricScores = [
    { label: '红蓝球（网上）', value: getAverageMetric(rows, 'onlineBall') / 280 },
    { label: '黄球', value: getAverageMetric(rows, 'yellowBall') / 180 },
    { label: '红蓝球（绿地）', value: getAverageMetric(rows, 'fieldBall') / 100 },
    { label: '桶', value: getAverageMetric(rows, 'bucket') / 40 },
    { label: '方块任务', value: (getAverageMetric(rows, 'yellowBlock') + getAverageMetric(rows, 'redBlueBlock')) / 65 },
  ];
  const best = metricScores.sort((left, right) => right.value - left.value)[0];
  return best ? best.label : '暂无明显强项';
}

function getWeakness(rows: PracticeExplorerMatchRow[]): string {
  const penalties = rows.reduce((sum, row) => sum + Math.min(row.penalty, 0), 0);
  if (penalties < 0) {
    return '先减少违规扣分';
  }

  const candidates = [
    { label: '红蓝球（网上）', value: getAverageMetric(rows, 'onlineBall'), target: 210 },
    { label: '黄球', value: getAverageMetric(rows, 'yellowBall'), target: 120 },
    { label: '红蓝球（绿地）', value: getAverageMetric(rows, 'fieldBall'), target: 60 },
    { label: '桶', value: getAverageMetric(rows, 'bucket'), target: 20 },
    { label: '方块任务', value: getAverageMetric(rows, 'yellowBlock') + getAverageMetric(rows, 'redBlueBlock'), target: 45 },
  ];
  const weakest = candidates
    .map((item) => ({ ...item, gap: item.target - item.value }))
    .sort((left, right) => right.gap - left.gap)[0];

  return weakest && weakest.gap > 0 ? `${weakest.label}偏低` : '保持路线稳定性';
}

function getTrainingType(averageScore: number, highestScore: number, stabilityGap: number, recentAverageScore: number) {
  if (highestScore >= 600 && averageScore >= 380) {
    return '冲冠型';
  }

  if (stabilityGap <= 130 && averageScore >= 330) {
    return '稳定型';
  }

  if (recentAverageScore >= averageScore + 25) {
    return '上升型';
  }

  return '提升型';
}

function getMetricAverageMap(rows: PracticeExplorerMatchRow[]) {
  return {
    onlineBall: getAverageMetric(rows, 'onlineBall'),
    fieldBall: getAverageMetric(rows, 'fieldBall'),
    yellowBall: getAverageMetric(rows, 'yellowBall'),
    bucket: getAverageMetric(rows, 'bucket'),
    block: getAverageMetric(rows, 'yellowBlock') + getAverageMetric(rows, 'redBlueBlock'),
    penalty: rows.reduce((sum, row) => sum + Math.min(row.penalty, 0), 0),
  };
}

function buildPracticePlan(
  rows: PracticeExplorerMatchRow[],
  trainingType: string,
  strength: string,
  weakness: string,
  averageScore: number,
  highestScore: number,
  recentAverageScore: number,
  stabilityGap: number,
): Pick<PracticeExplorerInsight, 'practiceGoals' | 'practicePlan' | 'reviewPoint'> {
  const metrics = getMetricAverageMap(rows);
  const goals: string[] = [];
  const plan: string[] = [];
  const safeFloorTarget = Math.max(180, Math.round(averageScore - 30));
  const scoreTarget = Math.round(Math.max(highestScore, averageScore + 60));
  const routeTarget = Math.max(280, Math.round(averageScore));

  if (stabilityGap > 220) {
    goals.push(`最低分目标：连续 3 轮都不低于 ${safeFloorTarget} 分`);
    plan.push(`保守完整路线跑 4 轮：每轮必须完成 2 个主得分任务，总分低于 ${safeFloorTarget} 分就重跑 1 轮。`);
  } else {
    goals.push(`稳定性目标：4 轮练习中最高分和最低分差不超过 ${Math.max(100, Math.round(stabilityGap))} 分`);
    plan.push(`正式节奏完整路线跑 4 轮：每轮记录总分，要求至少 3 轮达到 ${routeTarget} 分以上。`);
  }

  if (recentAverageScore < averageScore - 20) {
    goals.push('状态恢复目标：近三场平均分回到历史平均分以上');
    plan.push('最近掉分动作专项 12 次：只练一个最容易失误的动作，成功 9 次以上再进入完整路线。');
  } else if (recentAverageScore > averageScore + 20) {
    goals.push(`巩固目标：连续 3 轮达到 ${Math.round(recentAverageScore)} 分附近`);
    plan.push(`高分路线复现 3 轮：每轮目标不低于 ${Math.round(recentAverageScore - 20)} 分，低于目标则复盘掉分点后补跑 1 轮。`);
  } else {
    goals.push(`冲分目标：下一轮冲击 ${scoreTarget} 分`);
  }

  if (metrics.penalty < 0) {
    plan.push('无违规专项 5 轮：每轮只计算是否违规，目标 5 轮中至少 4 轮零违规；出现红牌或违规直接重跑。');
  }

  if (weakness.includes('网上') || metrics.onlineBall < 210) {
    plan.push('红蓝球网上专项 10 次：目标成功上网 8 次以上；每次记录是否取球成功、是否投放成功、是否碰撞卡住。');
  } else if (weakness.includes('黄球') || metrics.yellowBall < 120) {
    plan.push('黄球专项 10 次：固定入球角度，目标命中 7 次以上；如果低于 7 次，只调整机械角度，不改整条路线。');
  } else if (weakness.includes('绿地') || metrics.fieldBall < 60) {
    plan.push('绿地球专项 8 次：A/B 两条路线各跑 4 次，选择成功率更高的一条进入正式路线。');
  } else if (weakness.includes('桶') || metrics.bucket < 20) {
    plan.push('桶任务专项 8 次：拆成取桶、放桶、撤离三段，目标完整成功 6 次以上，且撤离不压线。');
  } else if (weakness.includes('方块') || metrics.block < 45) {
    plan.push('方块任务专项 12 次：黄方块 6 次、红蓝方块 6 次，分别要求成功 4 次以上，再合并跑 3 轮。');
  }

  if (trainingType === '冲冠型') {
    plan.push(`冲冠加分测试 6 次：保留 ${strength} 强项路线，新增 1 个高风险加分动作；若成功率低于 50%，正式赛先不使用。`);
  } else if (trainingType === '稳定型') {
    plan.push('临场流程训练 3 轮：按正式比赛倒计时启动，要求每轮赛前检查、启动、复位、沟通都不漏项。');
  } else if (trainingType === '上升型') {
    plan.push('上升路线固化 4 轮：不改路线，只重复最近高分方案；4 轮中至少 3 轮达到近三场均分。');
  } else {
    plan.push('基础得分路线 5 轮：只保留 2 个最稳任务，目标 5 轮中至少 4 轮完成基础得分，再增加第 3 个任务。');
  }

  return {
    practiceGoals: goals.slice(0, 3),
    practicePlan: plan.slice(0, 5),
    reviewPoint: `复盘时记录 3 个数字：专项成功次数、完整路线达标轮数、最低分。重点看 ${weakness} 是否改善，以及 ${strength} 能否稳定复现。`,
  };
}

export function buildPracticeExplorerInsights(rows: PracticeExplorerMatchRow[]): PracticeExplorerInsight[] {
  const grouped = new Map<string, PracticeExplorerMatchRow[]>();
  rows.forEach((row) => {
    grouped.set(row.team, [...(grouped.get(row.team) ?? []), row]);
  });

  return Array.from(grouped.entries())
    .map(([team, teamRows]) => {
      const sortedRows = [...teamRows].sort((left, right) => left.round - right.round);
      const scores = sortedRows.map((row) => row.totalScore);
      const epas = sortedRows.map((row) => row.epa);
      const averageScore = average(scores);
      const highestScore = Math.max(...scores);
      const lowestScore = Math.min(...scores);
      const stabilityGap = highestScore - lowestScore;
      const recentAverageScore = average(sortedRows.slice(-3).map((row) => row.totalScore));
      const weakness = getWeakness(sortedRows);
      const strength = getStrength(sortedRows);
      const trainingType = getTrainingType(averageScore, highestScore, stabilityGap, recentAverageScore);
      const practicePlan = buildPracticePlan(
        sortedRows,
        trainingType,
        strength,
        weakness,
        averageScore,
        highestScore,
        recentAverageScore,
        stabilityGap,
      );

      return {
        team,
        matches: sortedRows.length,
        averageScore,
        highestScore,
        lowestScore,
        recentAverageScore,
        averageEpa: average(epas),
        bestEpa: Math.max(...epas),
        stabilityGap,
        consistencyScore: Math.max(0, 100 - stabilityGap / 4),
        trainingType,
        strength,
        weakness,
        suggestion: `${strength}是当前强项，${weakness}；近三场均分 ${formatNumber(recentAverageScore)}，建议下一轮训练优先验证稳定路线。`,
        ...practicePlan,
      };
    })
    .sort((left, right) => {
      if (right.averageScore !== left.averageScore) {
        return right.averageScore - left.averageScore;
      }

      return right.highestScore - left.highestScore;
    });
}

export function getPracticeExplorerMetricLeaders(rows: PracticeExplorerMatchRow[]): PracticeExplorerMetricLeader[] {
  return METRICS.flatMap(({ key, label }) => {
    const best = rows.reduce<PracticeExplorerMatchRow | null>((leader, row) => {
      if (!leader) {
        return row;
      }

      return (Number(row[key]) || 0) > (Number(leader[key]) || 0) ? row : leader;
    }, null);

    return best ? [{ key, label, team: best.team, value: Number(best[key]) || 0 }] : [];
  });
}

export function getPracticeExplorerMetricRankings(rows: PracticeExplorerMatchRow[]): PracticeExplorerMetricRanking[] {
  const grouped = new Map<string, PracticeExplorerMatchRow[]>();
  rows.forEach((row) => {
    grouped.set(row.team, [...(grouped.get(row.team) ?? []), row]);
  });

  return METRICS.map(({ key, label }) => ({
    key,
    label,
    teams: Array.from(grouped.entries())
      .map(([team, teamRows]) => {
        const values = teamRows.map((row) => Number(row[key]) || 0);
        return {
          team,
          best: Math.max(...values),
          average: average(values),
          matches: teamRows.length,
        };
      })
      .sort((left, right) => {
        if (right.best !== left.best) {
          return right.best - left.best;
        }

        if (right.average !== left.average) {
          return right.average - left.average;
        }

        return left.team.localeCompare(right.team, 'zh-CN');
      }),
  })).filter((ranking) => ranking.teams.length > 0);
}
