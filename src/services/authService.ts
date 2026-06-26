import type { AuthUserProfile, EventType, UserRole } from '../types';

const AUTH_STORAGE_KEY = 'competitive-ranking-board::auth-session';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
const PROFILE_TABLE = import.meta.env.VITE_SUPABASE_PROFILE_TABLE?.trim() || 'user_profiles';
const USERNAME_DOMAIN = import.meta.env.VITE_AUTH_USERNAME_DOMAIN?.trim() || 'makexrank.app';
const AUTH_FUNCTION_NAME = import.meta.env.VITE_SUPABASE_AUTH_FUNCTION?.trim() || 'manage-users';

interface AuthSessionPayload {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface AuthTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: {
    id: string;
  };
}

interface ProfileRow {
  auth_user_id: string;
  username: string;
  display_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  allowed_event_types?: EventType[] | null;
  allowed_competition_ids?: string[] | null;
}

interface ManagedUserFunctionResponse {
  profile?: ProfileRow;
  success?: boolean;
}

export interface ManagedUserInput {
  username: string;
  password: string;
  displayName: string;
  role: UserRole;
  allowedEventTypes?: EventType[] | null;
  allowedCompetitionIds?: string[] | null;
}

export interface ManagedUserUpdate {
  displayName?: string;
  role?: UserRole;
  isActive?: boolean;
  allowedEventTypes?: EventType[] | null;
  allowedCompetitionIds?: string[] | null;
}

type UserManagementAction = 'bootstrap_admin' | 'create_user' | 'reset_password' | 'delete_user';

function isConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

function buildHeaders(options?: {
  includeJson?: boolean;
  accessToken?: string;
}): HeadersInit {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${options?.accessToken ?? SUPABASE_ANON_KEY}`,
    ...(options?.includeJson ? { 'Content-Type': 'application/json' } : {}),
  };
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function buildLoginEmail(username: string): string {
  return `${normalizeUsername(username)}@${USERNAME_DOMAIN}`;
}

function normalizeEventTypes(eventTypes?: EventType[] | null): EventType[] | null {
  if (!eventTypes || eventTypes.length === 0) {
    return null;
  }

  return Array.from(new Set(eventTypes));
}

function normalizeCompetitionIds(competitionIds?: string[] | null): string[] | null {
  if (!competitionIds || competitionIds.length === 0) {
    return null;
  }

  const cleaned = competitionIds
    .map((id) => id.trim())
    .filter(Boolean);

  return cleaned.length ? Array.from(new Set(cleaned)) : null;
}

function toProfile(row: ProfileRow): AuthUserProfile {
  return {
    authUserId: row.auth_user_id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    isActive: row.is_active,
    createdAt: row.created_at,
    allowedEventTypes: normalizeEventTypes(row.allowed_event_types),
    allowedCompetitionIds: normalizeCompetitionIds(row.allowed_competition_ids),
  };
}

function saveSession(session: AuthSessionPayload): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

function readSession(): AuthSessionPayload | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<AuthSessionPayload>;
    if (
      typeof parsed.accessToken !== 'string'
      || typeof parsed.refreshToken !== 'string'
      || typeof parsed.expiresAt !== 'number'
    ) {
      return null;
    }

    return parsed as AuthSessionPayload;
  } catch {
    return null;
  }
}

function clearSession(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

function buildFunctionUrl(functionName = AUTH_FUNCTION_NAME): string {
  return `${SUPABASE_URL}/functions/v1/${functionName}`;
}

function humanizeAuthError(message: string): string {
  const normalized = message.trim();
  const lowerMessage = normalized.toLowerCase();

  if (lowerMessage.includes('invalid login credentials')) {
    return '用户名或密码不正确，或者这个账号还没有被成功创建。';
  }

  if (lowerMessage.includes('already been registered')) {
    return '这个用户名已经存在，请直接登录，或者换一个新的用户名。';
  }

  if (lowerMessage.includes('authentication required')) {
    return '当前登录状态失效，请重新登录管理员账号。';
  }

  if (lowerMessage.includes('only an active admin can create users')) {
    return '只有已启用的管理员账号可以继续分配用户。';
  }

  if (lowerMessage.includes('only an active admin can reset passwords')) {
    return '只有已启用的管理员账号可以重置别人的密码。';
  }

  if (lowerMessage.includes('only an active admin can delete users')) {
    return '只有已启用的管理员账号可以删除用户。';
  }

  if (lowerMessage.includes('admin account already exists')) {
    return '系统里已经存在管理员账号，请直接登录管理员。';
  }

  if (lowerMessage.includes('function') && lowerMessage.includes('not')) {
    return '账号管理函数还没有部署到 Supabase，请先部署 manage-users。';
  }

  if (lowerMessage.includes('duplicate key value') && lowerMessage.includes('username')) {
    return '这个用户名已经存在，请换一个新的用户名。';
  }

  return normalized;
}

async function parseError(response: Response): Promise<string> {
  try {
    const data = await response.json() as {
      msg?: string;
      message?: string;
      error_description?: string;
      error?: string;
    };

    return humanizeAuthError(
      data.msg || data.message || data.error_description || data.error || `HTTP ${response.status}`,
    );
  } catch {
    return `HTTP ${response.status}`;
  }
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function fetchProfileByUserId(
  authUserId: string,
  accessToken: string,
): Promise<AuthUserProfile | null> {
  const params = new URLSearchParams({
    select: '*',
    auth_user_id: `eq.${authUserId}`,
    limit: '1',
  });

  const rows = await requestJson<ProfileRow[]>(
    `${SUPABASE_URL}/rest/v1/${PROFILE_TABLE}?${params.toString()}`,
    {
      headers: buildHeaders({ accessToken }),
    },
  );

  if (!rows.length) {
    return null;
  }

  return toProfile(rows[0]);
}

async function refreshAuthSession(refreshToken: string): Promise<AuthSessionPayload> {
  const response = await requestJson<AuthTokenResponse>(
    `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
    {
      method: 'POST',
      headers: buildHeaders({ includeJson: true }),
      body: JSON.stringify({ refresh_token: refreshToken }),
    },
  );

  const session = {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: Date.now() + response.expires_in * 1000,
  };
  saveSession(session);
  return session;
}

async function fetchCurrentAuthUser(accessToken: string): Promise<{ id: string }> {
  return requestJson<{ id: string }>(
    `${SUPABASE_URL}/auth/v1/user`,
    {
      headers: buildHeaders({ accessToken }),
    },
  );
}

async function callUserManagementFunction(
  action: UserManagementAction,
  options: {
    accessToken?: string;
    authUserId?: string;
    password?: string;
    input?: ManagedUserInput;
  },
): Promise<ManagedUserFunctionResponse> {
  const payload =
    action === 'reset_password' || action === 'delete_user'
      ? {
        action,
        authUserId: options.authUserId,
        password: options.password,
      }
      : {
        action,
        username: options.input?.username,
        password: options.input?.password,
        displayName: options.input?.displayName,
        role: action === 'bootstrap_admin' ? 'admin' : options.input?.role,
        allowedEventTypes: normalizeEventTypes(options.input?.allowedEventTypes),
        allowedCompetitionIds: normalizeCompetitionIds(options.input?.allowedCompetitionIds),
      };

  return requestJson<ManagedUserFunctionResponse>(
    buildFunctionUrl(),
    {
      method: 'POST',
      headers: buildHeaders({
        includeJson: true,
        accessToken: options.accessToken,
      }),
      body: JSON.stringify(payload),
    },
  );
}

export function isAuthAvailable(): boolean {
  return isConfigured();
}

export async function restoreAuthUser(): Promise<AuthUserProfile | null> {
  if (!isConfigured()) {
    return null;
  }

  const cachedSession = readSession();
  if (!cachedSession) {
    return null;
  }

  try {
    const accessToken =
      cachedSession.expiresAt > Date.now()
        ? cachedSession.accessToken
        : (await refreshAuthSession(cachedSession.refreshToken)).accessToken;

    const authUser = await fetchCurrentAuthUser(accessToken);
    const profile = await fetchProfileByUserId(authUser.id, accessToken);
    if (!profile || !profile.isActive) {
      clearSession();
      return null;
    }

    return profile;
  } catch {
    clearSession();
    return null;
  }
}

export async function signInWithUsername(
  username: string,
  password: string,
): Promise<AuthUserProfile> {
  if (!isConfigured()) {
    throw new Error('Supabase 尚未配置，暂时无法启用登录。');
  }

  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername || !password) {
    throw new Error('请输入用户名和密码。');
  }

  const tokenResponse = await requestJson<AuthTokenResponse>(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: buildHeaders({ includeJson: true }),
      body: JSON.stringify({
        email: buildLoginEmail(normalizedUsername),
        password,
      }),
    },
  );

  const session = {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    expiresAt: Date.now() + tokenResponse.expires_in * 1000,
  };
  saveSession(session);

  const profile = await fetchProfileByUserId(tokenResponse.user.id, session.accessToken);
  if (!profile) {
    clearSession();
    throw new Error('这个账号已经存在于 Auth，但还没有对应的用户资料。请先在 SQL Editor 里补 user_profiles 档案。');
  }

  if (!profile.isActive) {
    clearSession();
    throw new Error('这个账号已被停用。');
  }

  return profile;
}

export async function signOutCurrentUser(): Promise<void> {
  const cachedSession = readSession();
  clearSession();

  if (!cachedSession || !isConfigured()) {
    return;
  }

  try {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: buildHeaders({ accessToken: cachedSession.accessToken }),
    });
  } catch {
    // Ignore transport errors and clear local session regardless.
  }
}

export async function fetchManagedUsers(accessToken: string): Promise<AuthUserProfile[]> {
  const params = new URLSearchParams({
    select: '*',
    order: 'created_at.desc',
  });

  const rows = await requestJson<ProfileRow[]>(
    `${SUPABASE_URL}/rest/v1/${PROFILE_TABLE}?${params.toString()}`,
    {
      headers: buildHeaders({ accessToken }),
    },
  );

  return rows.map(toProfile);
}

export async function bootstrapAdminUser(input: ManagedUserInput): Promise<AuthUserProfile> {
  const profile = await callUserManagementFunction('bootstrap_admin', { input });
  if (!profile.profile) {
    throw new Error('首个管理员创建成功，但未返回用户资料。');
  }

  await signInWithUsername(input.username, input.password);
  return toProfile(profile.profile);
}

export async function createManagedUser(
  accessToken: string,
  input: ManagedUserInput,
): Promise<AuthUserProfile> {
  const response = await callUserManagementFunction('create_user', {
    accessToken,
    input,
  });

  if (!response.profile) {
    throw new Error('账号创建成功，但未返回用户资料。');
  }

  return toProfile(response.profile);
}

export async function resetManagedUserPassword(
  accessToken: string,
  authUserId: string,
  nextPassword: string,
): Promise<void> {
  if (!nextPassword.trim()) {
    throw new Error('请输入新的密码。');
  }

  await callUserManagementFunction('reset_password', {
    accessToken,
    authUserId,
    password: nextPassword,
  });
}

export async function deleteManagedUser(
  accessToken: string,
  authUserId: string,
): Promise<void> {
  if (!authUserId.trim()) {
    throw new Error('缺少要删除的用户 ID。');
  }

  await callUserManagementFunction('delete_user', {
    accessToken,
    authUserId,
  });
}

export async function updateManagedUser(
  accessToken: string,
  authUserId: string,
  updates: ManagedUserUpdate,
): Promise<void> {
  const body: Record<string, unknown> = {};

  if (typeof updates.displayName === 'string') {
    body.display_name = updates.displayName.trim();
  }

  if (updates.role) {
    body.role = updates.role;
  }

  if (typeof updates.isActive === 'boolean') {
    body.is_active = updates.isActive;
  }

  if ('allowedEventTypes' in updates) {
    body.allowed_event_types = normalizeEventTypes(updates.allowedEventTypes);
  }

  if ('allowedCompetitionIds' in updates) {
    body.allowed_competition_ids = normalizeCompetitionIds(updates.allowedCompetitionIds);
  }

  if (Object.keys(body).length === 0) {
    return;
  }

  const params = new URLSearchParams({
    auth_user_id: `eq.${authUserId}`,
  });

  await requestJson<void>(
    `${SUPABASE_URL}/rest/v1/${PROFILE_TABLE}?${params.toString()}`,
    {
      method: 'PATCH',
      headers: {
        ...buildHeaders({ includeJson: true, accessToken }),
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
    },
  );
}

export function getStoredAccessToken(): string | null {
  return readSession()?.accessToken ?? null;
}
