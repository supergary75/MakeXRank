import type { CompetitionRecord, EventType, StorageMode, TeamRaw } from '../types';

const STORAGE_KEY = 'competitive-ranking-board::competitions';
const DEFAULT_EVENT_TYPE: EventType = 'MakeX Inspire';
const EVENT_TYPES: EventType[] = ['MakeX Inspire', 'MakeX Explorer', 'MakeX Challenge'];
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
const SUPABASE_TABLE = import.meta.env.VITE_SUPABASE_COMPETITIONS_TABLE?.trim() || 'competitions';

interface CompetitionRow {
  id: string;
  event_type: string;
  name: string;
  created_at: string;
  updated_at: string;
  last_update: string;
  source_text: string;
  teams_data: TeamRaw[];
}

function isEventType(value: unknown): value is EventType {
  return typeof value === 'string' && EVENT_TYPES.includes(value as EventType);
}

function normalizeCompetitionRecord(input: unknown): CompetitionRecord | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const item = input as Record<string, unknown>;
  if (
    typeof item.id !== 'string' ||
    typeof item.name !== 'string' ||
    typeof item.createdAt !== 'string' ||
    typeof item.updatedAt !== 'string' ||
    typeof item.lastUpdate !== 'string' ||
    typeof item.sourceText !== 'string' ||
    !Array.isArray(item.teamsData)
  ) {
    return null;
  }

  return {
    id: item.id,
    eventType: isEventType(item.eventType) ? item.eventType : DEFAULT_EVENT_TYPE,
    name: item.name,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    lastUpdate: item.lastUpdate,
    sourceText: item.sourceText,
    teamsData: item.teamsData as TeamRaw[],
  };
}

function fromRow(row: CompetitionRow): CompetitionRecord | null {
  return normalizeCompetitionRecord({
    id: row.id,
    eventType: row.event_type,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUpdate: row.last_update,
    sourceText: row.source_text,
    teamsData: row.teams_data,
  });
}

function toRow(record: CompetitionRecord): CompetitionRow {
  return {
    id: record.id,
    event_type: record.eventType,
    name: record.name,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    last_update: record.lastUpdate,
    source_text: record.sourceText,
    teams_data: record.teamsData,
  };
}

function getSupabaseHeaders(includeJsonBody = false): HeadersInit {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    ...(includeJsonBody ? { 'Content-Type': 'application/json' } : {}),
  };
}

async function readSupabase<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}${path}`, init);

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function getPreferredStorageMode(): StorageMode {
  return isSupabaseConfigured() ? 'supabase' : 'local';
}

export function loadCachedCompetitions(): CompetitionRecord[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => normalizeCompetitionRecord(item))
      .filter((item): item is CompetitionRecord => item !== null);
  } catch {
    return [];
  }
}

export function cacheCompetitionsLocally(competitions: CompetitionRecord[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(competitions));
}

export async function fetchRemoteCompetitions(): Promise<CompetitionRecord[]> {
  const params = new URLSearchParams({
    select: '*',
    order: 'created_at.desc',
  });

  const rows = await readSupabase<CompetitionRow[]>(
    `/rest/v1/${SUPABASE_TABLE}?${params.toString()}`,
    {
      headers: getSupabaseHeaders(),
    },
  );

  return rows
    .map((row) => fromRow(row))
    .filter((item): item is CompetitionRecord => item !== null);
}

export async function saveCompetitionRecord(record: CompetitionRecord): Promise<void> {
  const params = new URLSearchParams({ on_conflict: 'id' });

  await readSupabase<CompetitionRow[]>(
    `/rest/v1/${SUPABASE_TABLE}?${params.toString()}`,
    {
      method: 'POST',
      headers: {
        ...getSupabaseHeaders(true),
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(toRow(record)),
    },
  );
}

export async function deleteCompetitionRecord(id: string): Promise<void> {
  const params = new URLSearchParams({
    id: `eq.${id}`,
  });

  await readSupabase<void>(
    `/rest/v1/${SUPABASE_TABLE}?${params.toString()}`,
    {
      method: 'DELETE',
      headers: {
        ...getSupabaseHeaders(),
        Prefer: 'return=minimal',
      },
    },
  );
}
