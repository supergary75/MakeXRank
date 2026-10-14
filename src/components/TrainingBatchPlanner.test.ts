import { describe, expect, it } from 'vitest';
import { weeklyDates } from './TrainingBatchPlanner';
describe('weeklyDates', () => {
  it('repeats weekly across year boundaries', () => expect(weeklyDates('2026-12-26', 3)).toEqual(['2026-12-26', '2027-01-02', '2027-01-09']));
  it('rejects invalid dates and excessive batches', () => {
    expect(weeklyDates('2026-02-30', 2)).toEqual([]);
    expect(weeklyDates('', 2)).toEqual([]);
    expect(weeklyDates('2026-09-23', 17)).toEqual([]);
  });
});
