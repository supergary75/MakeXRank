function formatSpreadsheetDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function normalizeSpreadsheetCell(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return formatSpreadsheetDate(value);
  return String(value).trim();
}

export async function readXlsxRows(file: File, preferredSheetName = '队员信息表'): Promise<string[][]> {
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    throw new Error('当前仅支持安全的 .xlsx 工作簿格式');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('工作簿超过 10 MB，请拆分后再导入');
  }

  // Lazy loading keeps the spreadsheet parser out of the initial application bundle.
  const { default: readXlsxFile } = await import('read-excel-file/browser');
  const sheets = await readXlsxFile(file);
  const normalizedPreferredName = preferredSheetName.replace(/\s+/g, '');
  const selectedSheet = sheets.find((sheet) => sheet.sheet.replace(/\s+/g, '') === normalizedPreferredName)
    ?? sheets[0];

  if (!selectedSheet) {
    throw new Error('工作簿中没有可读取的工作表');
  }

  if (selectedSheet.data.length > 5000) {
    throw new Error('工作表超过 5000 行，请拆分后再导入');
  }

  return selectedSheet.data.map((row) => row.map(normalizeSpreadsheetCell));
}
