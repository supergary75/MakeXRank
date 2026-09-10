import { expect, it } from 'vitest';
import { personalAbilities } from './personalAbilities';
it('provides all 49 non-mindset level tasks with distinct evidence', () => {
  expect(personalAbilities).toHaveLength(7);
  expect(new Set(personalAbilities.map(a => a.name)).size).toBe(7);
  for (const ability of personalAbilities) {
    expect(ability.steps).toHaveLength(7);
    expect(new Set(ability.steps.map(s => s.goal)).size).toBe(7);
    for (const step of ability.steps) for (const value of Object.values(step)) expect(value.trim().length).toBeGreaterThan(0);
  }
});
