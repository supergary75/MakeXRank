// Supabase bridge for the MakeXRank-hosted Inspire module.
// It keeps the original localStorage behavior as an offline fallback.
(function () {
    const S = window.Shared;
    if (!S) {
        console.warn('supabase_sync.js: Shared not loaded');
        return;
    }

    const CONFIG_KEY = 'competitive-ranking-board::inspire-supabase-config';
    const AUTH_KEY = 'competitive-ranking-board::auth-session';
    const DIRTY_KEY = 'makex-inspire::cloud-dirty';
    const LAST_SYNC_KEY = 'makex-inspire::last-cloud-sync';
    const SHARED_ROW_ID = 'inspire-shared-state';
    const PULL_INTERVAL_MS = 12000;
    const PUSH_DELAY_MS = 700;
    const REQUEST_TIMEOUT_MS = 8000;

    const originalLoadData = S.loadData.bind(S);
    const originalSaveData = S.saveData.bind(S);
    let applyingRemote = false;
    let initialized = false;
    let pushTimer = null;
    let pullTimer = null;
    let remoteUpdatedAt = '';
    let status = { mode: 'local', message: 'Local storage' };

    function emitStatus(mode, message) {
        status = { mode, message };
        window.dispatchEvent(new CustomEvent('inspire-cloud-status', { detail: status }));
    }

    function readJson(key) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (_) {
            return null;
        }
    }

    function getConfig() {
        const runtime = window.MAKEXRANK_INSPIRE_CONFIG;
        const stored = readJson(CONFIG_KEY);
        const value = runtime && runtime.url ? runtime : stored;
        if (!value || !value.url || !value.anonKey) return null;
        const table = String(value.table || 'practice_sync');
        return {
            url: String(value.url).replace(/\/$/, ''),
            anonKey: String(value.anonKey),
            table,
            dataColumn: String(value.dataColumn || (table === 'practice_sync' ? 'events' : 'payload')),
        };
    }

    function getSession() {
        const value = readJson(AUTH_KEY);
        if (!value || !value.accessToken || !value.refreshToken || !value.expiresAt) return null;
        return value;
    }

    async function request(url, init) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const response = await fetch(url, { ...init, signal: controller.signal });
            if (!response.ok) {
                let detail = `HTTP ${response.status}`;
                try {
                    const error = await response.json();
                    detail = error.code || error.message || detail;
                } catch (_) {
                    // Keep the HTTP status when the response is not JSON.
                }
                throw new Error(detail);
            }
            if (response.status === 204) return null;
            return response.json();
        } finally {
            clearTimeout(timer);
        }
    }

    async function refreshSession(config, session) {
        if (session.expiresAt > Date.now() + 30000) return session;
        const response = await request(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
            method: 'POST',
            headers: {
                apikey: config.anonKey,
                Authorization: `Bearer ${config.anonKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ refresh_token: session.refreshToken }),
        });
        const next = {
            accessToken: response.access_token,
            refreshToken: response.refresh_token,
            expiresAt: Date.now() + response.expires_in * 1000,
        };
        localStorage.setItem(AUTH_KEY, JSON.stringify(next));
        return next;
    }

    async function getAuthorizedContext() {
        const config = getConfig();
        if (!config) return null;
        const current = getSession();
        if (!current) return null;
        const session = await refreshSession(config, current);
        return {
            config,
            headers: {
                apikey: config.anonKey,
                Authorization: `Bearer ${session.accessToken}`,
                'Content-Type': 'application/json',
            },
        };
    }

    function hasMeaningfulData(data) {
        return ['students', 'tasks', 'trainings', 'classes', 'enrollments']
            .some((key) => Array.isArray(data?.[key]) && data[key].length > 0);
    }

    function mergeRecords(remote, local) {
        const result = new Map();
        (Array.isArray(remote) ? remote : []).forEach((item) => result.set(item.id, item));
        (Array.isArray(local) ? local : []).forEach((item) => result.set(item.id, item));
        return Array.from(result.values());
    }

    function mergeForFirstSync(remote, local) {
        return {
            ...remote,
            ...local,
            students: mergeRecords(remote?.students, local?.students),
            tasks: mergeRecords(remote?.tasks, local?.tasks),
            trainings: mergeRecords(remote?.trainings, local?.trainings),
            classes: mergeRecords(remote?.classes, local?.classes),
            enrollments: mergeRecords(remote?.enrollments, local?.enrollments),
            scheduleOrder: { ...(remote?.scheduleOrder || {}), ...(local?.scheduleOrder || {}) },
        };
    }

    function applyPayload(payload, notify) {
        if (!payload || typeof payload !== 'object') return;
        applyingRemote = true;
        Object.keys(S.data).forEach((key) => delete S.data[key]);
        Object.assign(S.data, payload);
        originalSaveData();
        applyingRemote = false;
        localStorage.removeItem(DIRTY_KEY);
        if (notify && typeof S._notifyListeners === 'function') S._notifyListeners('supabase');
        if (notify) window.dispatchEvent(new CustomEvent('inspire-cloud-data-updated'));
    }

    async function fetchRemote(context) {
        const query = new URLSearchParams({
            id: `eq.${SHARED_ROW_ID}`,
            select: `id,${context.config.dataColumn},updated_at`,
            limit: '1',
        });
        const rows = await request(
            `${context.config.url}/rest/v1/${context.config.table}?${query.toString()}`,
            { headers: context.headers },
        );
        return rows?.[0] || null;
    }

    async function pushNow(payload) {
        const context = await getAuthorizedContext();
        if (!context) {
            emitStatus('local', 'Sign in on MakeXRank to enable cloud sync');
            return null;
        }
        emitStatus('syncing', 'Syncing to Supabase');
        const query = new URLSearchParams({ on_conflict: 'id' });
        const rows = await request(`${context.config.url}/rest/v1/${context.config.table}?${query}`, {
            method: 'POST',
            headers: {
                ...context.headers,
                Prefer: 'resolution=merge-duplicates,return=representation',
            },
            body: JSON.stringify({ id: SHARED_ROW_ID, [context.config.dataColumn]: payload }),
        });
        remoteUpdatedAt = rows?.[0]?.updated_at || new Date().toISOString();
        localStorage.setItem(LAST_SYNC_KEY, remoteUpdatedAt);
        localStorage.removeItem(DIRTY_KEY);
        emitStatus('supabase', 'Synced with Supabase');
        return rows?.[0] || null;
    }

    function schedulePush() {
        localStorage.setItem(DIRTY_KEY, 'true');
        if (!initialized) return;
        clearTimeout(pushTimer);
        pushTimer = setTimeout(() => {
            void pushNow(S.data).catch((error) => emitStatus('error', `Cloud sync failed: ${error.message}`));
        }, PUSH_DELAY_MS);
    }

    async function pullLatest(notify) {
        const context = await getAuthorizedContext();
        if (!context || localStorage.getItem(DIRTY_KEY) === 'true') return;
        const remote = await fetchRemote(context);
        if (!remote || !remote.updated_at || remote.updated_at === remoteUpdatedAt) return;
        remoteUpdatedAt = remote.updated_at;
        localStorage.setItem(LAST_SYNC_KEY, remoteUpdatedAt);
        applyPayload(remote[context.config.dataColumn], notify);
        emitStatus('supabase', notify ? 'Updates received; refresh the page to display them' : 'Synced with Supabase');
    }

    async function initialize() {
        originalLoadData();
        let context = null;
        try {
            context = await getAuthorizedContext();
        } catch (error) {
            initialized = true;
            emitStatus('error', `Sign-in refresh failed: ${error.message}`);
            return;
        }
        if (!context) {
            initialized = true;
            emitStatus('local', getConfig() ? 'Sign in on MakeXRank to enable cloud sync' : 'Standalone local mode');
            return;
        }

        emitStatus('syncing', 'Connecting to Supabase');
        try {
            const remote = await fetchRemote(context);
            const local = JSON.parse(JSON.stringify(S.data));
            const dirty = localStorage.getItem(DIRTY_KEY) === 'true';
            const lastSync = localStorage.getItem(LAST_SYNC_KEY);

            if (!remote) {
                await pushNow(local);
            } else if (dirty && lastSync) {
                await pushNow(local);
            } else if (!lastSync && hasMeaningfulData(local)) {
                const merged = mergeForFirstSync(remote[context.config.dataColumn] || {}, local);
                applyPayload(merged, false);
                await pushNow(merged);
            } else {
                remoteUpdatedAt = remote.updated_at || '';
                localStorage.setItem(LAST_SYNC_KEY, remoteUpdatedAt);
                applyPayload(remote[context.config.dataColumn] || {}, false);
                emitStatus('supabase', 'Synced with Supabase');
            }

            pullTimer = setInterval(() => {
                void pullLatest(true).catch((error) => emitStatus('error', `Cloud read failed: ${error.message}`));
            }, PULL_INTERVAL_MS);
            window.addEventListener('focus', () => {
                void pullLatest(true).catch((error) => emitStatus('error', `Cloud read failed: ${error.message}`));
            });
        } catch (error) {
            const missingTable = error.message === 'PGRST205' || error.message === '42P01';
            emitStatus('error', missingTable ? 'The configured Supabase sync table is unavailable' : `Supabase connection failed: ${error.message}`);
        } finally {
            initialized = true;
        }
    }

    S.loadData = function () {
        originalLoadData();
        return this.data;
    };

    S.saveData = function () {
        originalSaveData();
        if (!applyingRemote) schedulePush();
    };

    S.cloudSync = {
        getStatus: () => ({ ...status }),
        pull: () => pullLatest(true),
        push: () => pushNow(S.data),
    };
    S.ready = initialize();

    window.addEventListener('beforeunload', () => {
        clearTimeout(pushTimer);
        clearInterval(pullTimer);
    });
})();
