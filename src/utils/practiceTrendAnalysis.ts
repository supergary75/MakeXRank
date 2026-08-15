export type PracticeTrendDirection =
  | 'insufficient'
  | 'marked-rise'
  | 'steady-rise'
  | 'stable'
  | 'decline'
  | 'volatile-rise'
  | 'volatile-decline'
  | 'volatile';

export interface PracticeTrendAssessment {
  status: PracticeTrendDirection;
  count: number;
  slope: number;
  recentAverage: number;
  previousAverage: number;
  volatility: number;
  label: string;
  detail: string;
}

const average = (values: number[]) =>
  values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

const signed = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}/卡`;

/**
 * 使用全部赛程卡的一元线性回归斜率判断长期方向，再用近期均值验证方向。
 * 波动采用回归残差的均方根，避免稳定斜坡被误判成“波动大”。
 * 判罚扣分直接传入负数即可：-10 到 -5 的斜率为正，自动视为改善。
 */
export function analyzePracticeTrend(rawValues: number[]): PracticeTrendAssessment {
  const values = rawValues.filter(Number.isFinite);
  const count = values.length;
  if (count < 3) {
    return {
      status: 'insufficient',
      count,
      slope: 0,
      recentAverage: average(values),
      previousAverage: 0,
      volatility: 0,
      label: '数据不足',
      detail: `当前仅有 ${count} 张已计分赛程卡，至少需要 3 张才能判断趋势。`,
    };
  }

  const xMean = (count - 1) / 2;
  const yMean = average(values);
  let numerator = 0;
  let denominator = 0;
  values.forEach((value, index) => {
    numerator += (index - xMean) * (value - yMean);
    denominator += (index - xMean) ** 2;
  });
  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = yMean - slope * xMean;
  const volatility = Math.sqrt(
    average(values.map((value, index) => (value - (intercept + slope * index)) ** 2)),
  );

  const recentCount = count >= 4 ? 3 : 2;
  const recentAverage = average(values.slice(-recentCount));
  const previousAverage = average(values.slice(0, -recentCount));
  const recentChange = recentAverage - previousAverage;
  const scale = Math.max(1, Math.abs(yMean));
  const slopeThreshold = Math.max(0.1, scale * 0.01);
  const recentThreshold = Math.max(0.2, scale * 0.02);
  const markedThreshold = Math.max(3, scale * 0.04);
  const highVolatility = volatility > Math.max(1, scale * 0.15, Math.abs(slope) * 2.5);
  const slopeDirection = slope > slopeThreshold ? 1 : slope < -slopeThreshold ? -1 : 0;
  const recentDirection = recentChange > recentThreshold ? 1 : recentChange < -recentThreshold ? -1 : 0;

  let status: PracticeTrendDirection;
  let label: string;
  if (slopeDirection > 0 && recentDirection > 0) {
    if (highVolatility) {
      status = 'volatile-rise';
      label = `⚠ 波动上升 ${signed(slope)}`;
    } else if (slope >= markedThreshold) {
      status = 'marked-rise';
      label = `↑ 明显提升 ${signed(slope)}`;
    } else {
      status = 'steady-rise';
      label = `↗ 稳步提升 ${signed(slope)}`;
    }
  } else if (slopeDirection < 0 && recentDirection < 0) {
    if (highVolatility) {
      status = 'volatile-decline';
      label = `⚠ 波动回落 ${signed(slope)}`;
    } else {
      status = 'decline';
      label = `↘ 近期回落 ${signed(slope)}`;
    }
  } else if (highVolatility || (slopeDirection !== 0 && recentDirection !== 0)) {
    status = 'volatile';
    label = `⚠ 波动较大 ${signed(slope)}`;
  } else {
    status = 'stable';
    label = `→ 基本稳定 ${signed(slope)}`;
  }

  return {
    status,
    count,
    slope,
    recentAverage,
    previousAverage,
    volatility,
    label,
    detail: `近${recentCount}卡平均 ${recentAverage.toFixed(1)}｜前期平均 ${previousAverage.toFixed(1)}｜波动 ${volatility.toFixed(1)}`,
  };
}
