import { describe, expect, it } from 'vitest';
import { normalizeSpreadsheetCell } from './spreadsheetReader';

describe('normalizeSpreadsheetCell', () => {
  it('normalizes empty, textual, numeric and boolean cells', () => {
    expect(normalizeSpreadsheetCell(null)).toBe('');
    expect(normalizeSpreadsheetCell('  Explorer  ')).toBe('Explorer');
    expect(normalizeSpreadsheetCell(98404)).toBe('98404');
    expect(normalizeSpreadsheetCell(true)).toBe('true');
  });

  it('formats workbook date cells consistently', () => {
    expect(normalizeSpreadsheetCell(new Date(2026, 7, 5))).toBe('2026-08-05');
  });
});
