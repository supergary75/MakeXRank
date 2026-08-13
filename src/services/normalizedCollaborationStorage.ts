import { getStoredAccessToken } from './authService';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
export const isNormalizedCollaborationEnabled =
  import.meta.env.VITE_SUPABASE_NORMALIZED_SYNC_ENABLED?.trim().toLowerCase() === 'true';

export interface LogisticsEventLike {
  id: string; name?: string; date?: string; venue?: string; group?: string;
  timeline?: unknown[]; rooms?: unknown[];
}

export async function mirrorLogisticsEventsToNormalizedTables(
  events: LogisticsEventLike[],
  deletedEventIds: string[],
): Promise<void> {
  if (!isNormalizedCollaborationEnabled || !SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  const token = getStoredAccessToken();
  if (!token) return;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/mirror_logistics_snapshot`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ event_rows: events, deleted_event_ids: deletedEventIds }),
  });
  if (!response.ok) throw new Error(`normalized logistics: ${response.status} ${await response.text()}`);
}
