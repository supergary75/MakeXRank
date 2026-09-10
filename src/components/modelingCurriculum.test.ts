import { describe, expect, it } from 'vitest';
import { modelingAxes, modelingLevels } from './modelingCurriculum';
describe('modeling progression', () => {
  it('has seven levels and eight bounded progressive targets', () => {
    expect(modelingAxes).toHaveLength(8);
    expect(modelingLevels.map(row => row.level)).toEqual(['U9','U12B','U12A','U15B','U15A','U18B','U18A']);
    modelingLevels.forEach((row,index) => {
      expect(row.scores).toHaveLength(8);
      row.scores.forEach((score,axis) => {
        expect(Number.isInteger(score)).toBe(true);
        expect(score).toBeGreaterThanOrEqual(index ? modelingLevels[index-1].scores[axis] : 0);
        expect(score).toBeLessThanOrEqual(5);
      });
      expect(row.methods.length).toBeGreaterThan(0);
      expect(row.evidence.length).toBeGreaterThan(0);
      expect(row.boundary).toBeTruthy();
    });
    expect(modelingLevels[6].scores).toEqual(Array(8).fill(5));
  });
});
