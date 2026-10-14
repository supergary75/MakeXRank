import { expect, it } from 'vitest';
import { parseTrainingCoaches } from './TrainingCoachPicker';
it('supports single and multiple coaches without duplicates', () => {
  expect(parseTrainingCoaches('Gary')).toEqual(['Gary']);
  expect(parseTrainingCoaches('Gary、Vincent、Brook、Jason、Lyu、Gary')).toEqual(['Gary', 'Vincent', 'Brook', 'Jason', 'Lyu']);
  expect(parseTrainingCoaches('')).toEqual([]);
});
