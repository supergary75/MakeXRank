import { expect, it } from 'vitest';
import { classes } from './classRoster';
import { nextRegularClass, scheduleSlots, shanghaiDate, shanghaiMinutes } from './rollCallSchedule';

it('uses Shanghai dates across the UTC day boundary', () => {
  const now = new Date('2026-10-10T16:30:00Z');
  expect(shanghaiDate(now)).toBe('2026-10-11');
  expect(shanghaiMinutes(now)).toBe(30);
});
it('sorts same-day courses by starting time', () => {
  const slots = scheduleSlots(classes, '2026-10-11', 'day');
  expect(slots.map(slot => slot.c.id)).toEqual(['U18-01', 'U12A-04', 'U12B-09', 'U15B-06', 'U9B-05', 'U12B-08', 'U18-02']);
});
it('keeps a Sunday in the week starting on Monday across a month boundary', () => {
  const slots = scheduleSlots(classes, '2026-11-01', 'week');
  expect(slots.every(slot => slot.d >= '2026-10-26' && slot.d <= '2026-11-01')).toBe(true);
  expect(slots).toHaveLength(15);
});
it('does not render an invalid date or reintroduce the removed class', () => {
  for (const date of ['', '2026-02-30', 'bad-date']) expect(scheduleSlots(classes, date, 'extra')).toEqual([]);
  expect(scheduleSlots(classes, '2026-10-13', 'extra')).toHaveLength(15);
  expect(scheduleSlots(classes, '2026-10-13', 'extra').some(slot => slot.c.id === 'U12B-10')).toBe(false);
});
it('finds the next own course and skips whole-club holidays', () => {
  const own = classes.filter(c => c.coach === 'G');
  expect(nextRegularClass(own, '2026-10-13', ['2026-10-17'], new Date('2026-10-13T01:00:00Z'))?.c.id).toBe('U18-01');
  expect(nextRegularClass(own, '2026-10-11', [], new Date('2026-10-11T05:00:00Z'))?.c.id).toBe('U18-02');
});
