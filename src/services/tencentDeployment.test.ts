import { describe, expect, it } from 'vitest';
import environment from '../../.env.tencent?raw';

describe('Tencent deployment routing', () => {
  it('keeps authentication and academic data on the project API, not another hosted app', () => {
    const values = Object.fromEntries(environment.trim().split(/\r?\n/).map(line => {
      const separator = line.indexOf('=');
      return [line.slice(0, separator), line.slice(separator + 1)];
    }));
    expect(values.VITE_SUPABASE_URL).toBe('/MakeXRank/api');
    expect(values.VITE_ACADEMIC_API_URL).toBe(values.VITE_SUPABASE_URL);
    expect(values.VITE_INTERVIEW_API_URL).toBe(values.VITE_SUPABASE_URL);
    expect(values.VITE_CURRICULUM_API_URL).toBe(values.VITE_SUPABASE_URL);
  });
});
