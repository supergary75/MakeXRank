import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const profileTable = Deno.env.get('PROFILE_TABLE') ?? 'user_profiles';
const usernameDomain = Deno.env.get('AUTH_USERNAME_DOMAIN') ?? 'makexrank.app';

type UserRole = 'admin' | 'editor' | 'viewer';
type EventType = 'MakeX Inspire' | 'MakeX Explorer' | 'MakeX Challenge';

interface CreateLikeRequest {
  username: string;
  password: string;
  displayName: string;
  role?: UserRole;
  allowedEventTypes?: EventType[] | null;
  allowedCompetitionIds?: string[] | null;
}

interface ResetPasswordRequest {
  authUserId: string;
  password: string;
}

type ManageUserRequest =
  | ({ action: 'bootstrap_admin' } & CreateLikeRequest)
  | ({ action: 'create_user' } & CreateLikeRequest)
  | ({ action: 'reset_password' } & ResetPasswordRequest);

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function validateEnvironment(): string | null {
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return 'Supabase Edge Function 缺少必要环境变量，请检查 SUPABASE_URL、SUPABASE_ANON_KEY 和 SUPABASE_SERVICE_ROLE_KEY。';
  }

  return null;
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
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

function buildSyntheticEmail(username: string): string {
  return `${normalizeUsername(username)}@${usernameDomain}`;
}

function validateCreateLikePayload(payload: Partial<CreateLikeRequest>): string | null {
  if (!payload.username?.trim()) {
    return '缺少用户名。';
  }

  if (!payload.displayName?.trim()) {
    return '缺少显示名称。';
  }

  if (!payload.password || payload.password.length < 6) {
    return '密码长度至少需要 6 位。';
  }

  if (payload.role && !['admin', 'editor', 'viewer'].includes(payload.role)) {
    return '角色无效。';
  }

  return null;
}

function validateResetPayload(payload: Partial<ResetPasswordRequest>): string | null {
  if (!payload.authUserId?.trim()) {
    return '缺少目标用户 ID。';
  }

  if (!payload.password || payload.password.length < 6) {
    return '新密码长度至少需要 6 位。';
  }

  return null;
}

async function ensureActiveAdmin(
  adminClient: ReturnType<typeof createClient>,
  userClient: ReturnType<typeof createClient>,
): Promise<{ authUserId: string } | Response> {
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) {
    return jsonResponse(401, { message: 'Authentication required.' });
  }

  const { data: operatorProfile, error: operatorProfileError } = await adminClient
    .from(profileTable)
    .select('role,is_active')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();

  if (operatorProfileError) {
    return jsonResponse(500, { message: operatorProfileError.message });
  }

  if (!operatorProfile || operatorProfile.role !== 'admin' || !operatorProfile.is_active) {
    return jsonResponse(403, { message: 'Only an active admin can create users.' });
  }

  return { authUserId: authData.user.id };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { message: 'Only POST is supported.' });
  }

  const environmentError = validateEnvironment();
  if (environmentError) {
    return jsonResponse(500, { message: environmentError });
  }

  let payload: ManageUserRequest;
  try {
    payload = await request.json() as ManageUserRequest;
  } catch {
    return jsonResponse(400, { message: '请求体不是合法 JSON。' });
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const authHeader = request.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: authHeader ? { headers: { Authorization: authHeader } } : undefined,
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (payload.action === 'bootstrap_admin' || payload.action === 'create_user') {
    const validationError = validateCreateLikePayload(payload);
    if (validationError) {
      return jsonResponse(400, { message: validationError });
    }

    const { count: adminCount, error: adminCountError } = await adminClient
      .from(profileTable)
      .select('auth_user_id', { count: 'exact', head: true })
      .eq('role', 'admin')
      .eq('is_active', true);

    if (adminCountError) {
      return jsonResponse(500, { message: adminCountError.message });
    }

    if (payload.action === 'bootstrap_admin') {
      if ((adminCount ?? 0) > 0) {
        return jsonResponse(403, { message: 'Admin account already exists.' });
      }
    } else {
      const adminCheck = await ensureActiveAdmin(adminClient, userClient);
      if (adminCheck instanceof Response) {
        return adminCheck;
      }
    }

    const normalizedUsername = normalizeUsername(payload.username);
    const desiredRole: UserRole = payload.action === 'bootstrap_admin'
      ? 'admin'
      : payload.role ?? 'viewer';

    const syntheticEmail = buildSyntheticEmail(normalizedUsername);
    const { data: createdUser, error: createUserError } = await adminClient.auth.admin.createUser({
      email: syntheticEmail,
      password: payload.password,
      email_confirm: true,
      user_metadata: {
        username: normalizedUsername,
        display_name: payload.displayName.trim(),
      },
    });

    if (createUserError || !createdUser.user) {
      return jsonResponse(400, { message: createUserError?.message ?? 'Failed to create auth user.' });
    }

    const { data: profileRows, error: profileError } = await adminClient
      .from(profileTable)
      .upsert({
        auth_user_id: createdUser.user.id,
        username: normalizedUsername,
        display_name: payload.displayName.trim(),
        role: desiredRole,
        is_active: true,
        allowed_event_types: normalizeEventTypes(payload.allowedEventTypes),
        allowed_competition_ids: normalizeCompetitionIds(payload.allowedCompetitionIds),
      }, {
        onConflict: 'auth_user_id',
      })
      .select('*')
      .limit(1);

    if (profileError) {
      return jsonResponse(500, { message: profileError.message });
    }

    if (!profileRows?.length) {
      return jsonResponse(500, { message: 'Auth user created, but profile row was not returned.' });
    }

    return jsonResponse(200, {
      profile: profileRows[0],
    });
  }

  const validationError = validateResetPayload(payload);
  if (validationError) {
    return jsonResponse(400, { message: validationError });
  }

  const adminCheck = await ensureActiveAdmin(adminClient, userClient);
  if (adminCheck instanceof Response) {
    return jsonResponse(403, { message: 'Only an active admin can reset passwords.' });
  }

  const { error: resetError } = await adminClient.auth.admin.updateUserById(payload.authUserId, {
    password: payload.password,
  });

  if (resetError) {
    return jsonResponse(400, { message: resetError.message });
  }

  return jsonResponse(200, { success: true });
});
