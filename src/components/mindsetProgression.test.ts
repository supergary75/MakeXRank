import { expect, it } from 'vitest';
import { mindsetProgression } from './mindsetCurriculum';
it('provides seven distinct stages with before/during/after targets and support evidence', () => {
  expect(mindsetProgression.map(row => row.level)).toEqual(['U9','U12B','U12A','U15B','U15A','U18B','U18A']);
  for (const row of mindsetProgression) {
    for (const value of Object.values(row)) expect(value.trim().length).toBeGreaterThan(0);
    expect(row.before).toBeTruthy();
    expect(row.during).toBeTruthy();
    expect(row.after).toBeTruthy();
    expect(row.evidence).toBeTruthy();
    expect(row.coach).toBeTruthy();
  }
});
