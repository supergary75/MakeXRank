import type { TeamRaw } from '../types';
import { parseTableData } from './dataParser';

const CORS_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?',
];

/**
 * Extract file ID from various KDocs URL formats:
 * - https://www.kdocs.cn/l/xxxxx
 * - https://kdocs.cn/l/xxxxx
 * - https://www.kdocs.cn/p/xxxxx
 */
export function extractKDocsId(url: string): string | null {
  const trimmed = url.trim();
  const match = trimmed.match(/kdocs\.cn\/[lp]\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

export function isValidKDocsUrl(url: string): boolean {
  return /^https?:\/\/(www\.)?kdocs\.cn\/[lp]\/[a-zA-Z0-9_-]+/.test(url.trim());
}

/**
 * Attempt to fetch spreadsheet content from a KDocs public share URL
 * using CORS proxy services.
 */
async function fetchViaProxy(url: string): Promise<string> {
  let lastError: Error | null = null;

  for (const proxy of CORS_PROXIES) {
    try {
      const proxyUrl = proxy + encodeURIComponent(url);
      const response = await fetch(proxyUrl, {
        headers: { 'Accept': 'text/html,application/json,text/plain,*/*' },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.text();
    } catch (err) {
      lastError = err as Error;
    }
  }

  throw lastError ?? new Error('All CORS proxies failed');
}

/**
 * Try to extract table data from KDocs HTML page content.
 * KDocs pages embed data in various formats - we try multiple strategies.
 */
function extractTableFromHtml(html: string): string | null {
  // Strategy 1: Look for <table> elements with data rows
  const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/gi);
  if (tableMatch) {
    for (const table of tableMatch) {
      const rows = table.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
      if (rows && rows.length > 3) {
        const tsvRows = rows.map((row) => {
          const cells = row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || [];
          return cells.map((cell) => cell.replace(/<[^>]+>/g, '').trim()).join('\t');
        });
        return tsvRows.join('\n');
      }
    }
  }

  // Strategy 2: Look for JSON data embedded in scripts
  const jsonPatterns = [
    /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/,
    /window\.__DATA__\s*=\s*({[\s\S]*?});/,
    /"data"\s*:\s*(\[[\s\S]*?\])\s*[,}]/,
  ];

  for (const pattern of jsonPatterns) {
    const match = html.match(pattern);
    if (match) {
      try {
        const data = JSON.parse(match[1]);
        if (Array.isArray(data)) {
          return data.map((row: unknown[]) => row.join('\t')).join('\n');
        }
      } catch {
        // JSON parse failed, try next pattern
      }
    }
  }

  return null;
}

export interface FetchResult {
  success: boolean;
  teams: TeamRaw[];
  message: string;
}

/**
 * Main entry: fetch data from a KDocs URL and parse into TeamRaw[].
 */
export async function fetchKDocsData(url: string): Promise<FetchResult> {
  if (!isValidKDocsUrl(url)) {
    return {
      success: false,
      teams: [],
      message: '无效的金山文档链接，请输入 kdocs.cn/l/xxx 格式的链接',
    };
  }

  try {
    const html = await fetchViaProxy(url);

    // Try to extract table data from the fetched content
    const tableText = extractTableFromHtml(html);
    if (tableText) {
      const teams = parseTableData(tableText, 'MakeX Explorer');
      if (teams.length > 0) {
        return {
          success: true,
          teams,
          message: `成功从链接获取并解析 ${teams.length} 支队伍数据`,
        };
      }
    }

    // If direct parsing fails, the page might be a SPA that loads data dynamically
    return {
      success: false,
      teams: [],
      message: '无法直接解析该链接的数据。金山文档使用动态加载，请使用剪贴板粘贴方式导入。',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      teams: [],
      message: `网络请求失败: ${msg}。请检查链接是否公开共享，或使用剪贴板粘贴方式导入。`,
    };
  }
}
