import { expect, it } from 'vitest';
import { parseTrainingVenues } from './TrainingVenuePicker';
it('supports multiple venues and removes duplicates', () => {
  expect(parseTrainingVenues('206-1、206-2、206大厅、良基、206-1')).toEqual(['206-1', '206-2', '206大厅', '良基']);
});
it('preserves legacy venues and supports empty selection', () => {
  expect(parseTrainingVenues('原有场馆 A 区')).toEqual(['原有场馆 A 区']);
  expect(parseTrainingVenues('')).toEqual([]);
});
