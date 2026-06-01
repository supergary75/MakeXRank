export function parseTimeToSeconds(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const timeMatch = normalized.match(/(\d+):(\d{1,2})(?:\.(\d+))?/);
  if (timeMatch) {
    const minutes = Number(timeMatch[1]) || 0;
    const seconds = Number(timeMatch[2]) || 0;
    const fractionRaw = timeMatch[3] ?? '';
    const fraction = fractionRaw ? Number(`0.${fractionRaw}`) : 0;
    return minutes * 60 + seconds + fraction;
  }

  const plainNumber = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!plainNumber) {
    return null;
  }

  const seconds = Number(plainNumber[0]);
  return Number.isFinite(seconds) ? seconds : null;
}

export function formatSecondsAsClock(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return '--';
  }

  const totalSeconds = Math.max(value, 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  const secondsText = seconds.toFixed(2).padStart(5, '0');

  if (minutes <= 0) {
    return `${seconds.toFixed(2)}s`;
  }

  return `${minutes}:${secondsText}`;
}
