import { describe, expect, it } from 'vitest';
import { analyzePracticeTrend } from './practiceTrendAnalysis';

describe('analyzePracticeTrend', () => {
  it('requires at least three scored cards', () => {
    expect(analyzePracticeTrend([10, 20]).status).toBe('insufficient');
  });

  it('recognizes a consistent improvement using all points', () => {
    const result = analyzePracticeTrend([10, 20, 30, 40, 50]);
    expect(result.status).toBe('marked-rise');
    expect(result.slope).toBeCloseTo(10);
    expect(result.recentAverage).toBeCloseTo(40);
    expect(result.previousAverage).toBeCloseTo(15);
  });

  it('does not call opposing long and recent directions an improvement', () => {
    expect(analyzePracticeTrend([0, 100, 100, 60, 50, 40]).status).not.toMatch(/rise/);
  });

  it('recognizes a consistent decline', () => {
    expect(analyzePracticeTrend([50, 42, 34, 26, 18]).status).toBe('decline');
  });

  it('treats penalty values moving closer to zero as improvement', () => {
    const result = analyzePracticeTrend([-12, -10, -7, -5, -3]);
    expect(result.status).toMatch(/rise/);
    expect(result.slope).toBeGreaterThan(0);
  });

  it('reports regression residual volatility rather than endpoint change', () => {
    const result = analyzePracticeTrend([10, 50, 5, 60, 20, 75]);
    expect(result.status).toMatch(/volatile/);
    expect(result.volatility).toBeGreaterThan(10);
  });
});
