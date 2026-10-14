import { expect, it } from 'vitest';
import { personalRadarAxes, personalRadarTargets } from './personalRadarTargets';
import { personalAbilities } from './personalAbilities';
it('has seven bounded eight-axis curriculum targets and aligned evidence', () => {
  expect(personalRadarTargets).toHaveLength(7);
  expect(personalRadarAxes).toHaveLength(8);
  for (const row of personalRadarTargets) {
    expect(row.values).toHaveLength(8);
    row.values.forEach(value => { expect(Number.isInteger(value)).toBe(true); expect(value).toBeGreaterThanOrEqual(1); expect(value).toBeLessThanOrEqual(4); });
    expect(row.focus).toContain(6);
    expect(row.focus.every(i => i >= 0 && i < 8)).toBe(true);
  }
  personalRadarAxes.forEach((label,i) => { if (i !== 6) expect(personalAbilities[i === 7 ? 6 : i].name).toBe(label); });
  expect(personalRadarTargets[6].values.every(value => value === 4)).toBe(false);
});
