import { expect, it } from 'vitest';
import source from './WeeklyRollCall.tsx?raw';

it('labels the student-side entry as leave without changing historical attendance statuses', () => {
  expect(source).toContain("{editing===r.id ? '收起' : '请假'}");
  expect(source).toContain('aria-label={`${r.name} 请假`}');
  expect(source).not.toContain('迟到/请假');
  expect(source).not.toContain('迟到请假更正');
  expect(source).toContain('<option value="late">迟到</option>');
  expect(source).toContain("['present','late'].includes(r.status)");
});
