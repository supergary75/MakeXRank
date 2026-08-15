export function isExplorerEventType(eventType: string): boolean {
  const normalized = eventType.trim().replace(/\s+/g, ' ').toLowerCase();
  return normalized.includes('explorer') && !normalized.includes('inspire');
}

function roundToOneDecimal(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

export function getExplorerHistoricalContributionRank(
  currentAverageContribution: number,
  historicalAverageContributions: number[],
): number | null {
  if (!Number.isFinite(currentAverageContribution)) return null;

  const validHistoricalValues = historicalAverageContributions.filter(Number.isFinite);
  if (validHistoricalValues.length === 0) return null;

  const currentValue = roundToOneDecimal(currentAverageContribution);
  return 1 + validHistoricalValues.filter(
    (value) => roundToOneDecimal(value) > currentValue,
  ).length;
}
