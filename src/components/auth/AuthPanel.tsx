import { useMemo, useState } from 'react';
import type { AuthUserProfile, EventType, UserRole } from '../../types';
import styles from './AuthPanel.module.css';

const EVENT_TYPE_OPTIONS: EventType[] = ['MakeX Inspire', 'MakeX Explorer', 'MakeX Challenge'];

interface ManagedUserForm {
  username: string;
  displayName: string;
  password: string;
  role: UserRole;
  allowedEventTypes: EventType[];
  allowedCompetitionIdsText: string;
}

interface ExistingUserForm {
  displayName: string;
  role: UserRole;
  allowedEventTypes: EventType[];
  allowedCompetitionIdsText: string;
  resetPassword: string;
}

interface Props {
  authAvailable: boolean;
  currentUser: AuthUserProfile | null;
  managedUsers: AuthUserProfile[];
  busy?: boolean;
  onClose: () => void;
  onLogin: (username: string, password: string) => Promise<void> | void;
  onLogout: () => Promise<void> | void;
  onBootstrapAdmin: (input: {
    username: string;
    displayName: string;
    password: string;
    role: UserRole;
    allowedEventTypes?: EventType[] | null;
    allowedCompetitionIds?: string[] | null;
  }) => Promise<void> | void;
  onCreateUser: (input: {
    username: string;
    displayName: string;
    password: string;
    role: UserRole;
    allowedEventTypes?: EventType[] | null;
    allowedCompetitionIds?: string[] | null;
  }) => Promise<void> | void;
  onUpdateUser: (authUserId: string, input: {
    displayName?: string;
    role?: UserRole;
    allowedEventTypes?: EventType[] | null;
    allowedCompetitionIds?: string[] | null;
  }) => Promise<void> | void;
  onResetPassword: (authUserId: string, password: string) => Promise<void> | void;
  onToggleUserActive: (authUserId: string, isActive: boolean) => Promise<void> | void;
}

const DEFAULT_USER_FORM: ManagedUserForm = {
  username: '',
  displayName: '',
  password: '',
  role: 'viewer',
  allowedEventTypes: [],
  allowedCompetitionIdsText: '',
};

function toCompetitionIds(input: string): string[] | null {
  const ids = input
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter(Boolean);

  return ids.length ? ids : null;
}

function formatScopeSummary(user: AuthUserProfile): string {
  const eventSummary = user.allowedEventTypes?.length
    ? `赛项：${user.allowedEventTypes.join(' / ')}`
    : '赛项：全部';

  const competitionSummary = user.allowedCompetitionIds?.length
    ? `比赛：${user.allowedCompetitionIds.join(', ')}`
    : '比赛：全部';

  return `${eventSummary} | ${competitionSummary}`;
}

export function AuthPanel({
  authAvailable,
  currentUser,
  managedUsers,
  busy = false,
  onClose,
  onLogin,
  onLogout,
  onBootstrapAdmin,
  onCreateUser,
  onUpdateUser,
  onResetPassword,
  onToggleUserActive,
}: Props) {
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [bootstrapForm, setBootstrapForm] = useState<ManagedUserForm>({
    ...DEFAULT_USER_FORM,
    role: 'admin',
  });
  const [userForm, setUserForm] = useState<ManagedUserForm>(DEFAULT_USER_FORM);
  const [editingUsers, setEditingUsers] = useState<Record<string, ExistingUserForm>>({});

  const hasAdmin = useMemo(
    () => managedUsers.some((user) => user.role === 'admin'),
    [managedUsers],
  );

  const canManageUsers = currentUser?.role === 'admin';

  const getUserDraft = (user: AuthUserProfile): ExistingUserForm =>
    editingUsers[user.authUserId] ?? {
      displayName: user.displayName,
      role: user.role,
      allowedEventTypes: user.allowedEventTypes ?? [],
      allowedCompetitionIdsText: user.allowedCompetitionIds?.join(', ') ?? '',
      resetPassword: '',
    };

  const updateUserDraft = (authUserId: string, updater: (draft: ExistingUserForm) => ExistingUserForm) => {
    setEditingUsers((previous) => {
      const current = previous[authUserId] ?? {
        displayName: '',
        role: 'viewer' as UserRole,
        allowedEventTypes: [],
        allowedCompetitionIdsText: '',
        resetPassword: '',
      };

      return {
        ...previous,
        [authUserId]: updater(current),
      };
    });
  };

  const toggleEventType = (
    selected: EventType[],
    eventType: EventType,
  ): EventType[] => (
    selected.includes(eventType)
      ? selected.filter((item) => item !== eventType)
      : [...selected, eventType]
  );

  const handleManagedUserSubmit = async () => {
    await onCreateUser({
      username: userForm.username,
      displayName: userForm.displayName,
      password: userForm.password,
      role: userForm.role,
      allowedEventTypes: userForm.allowedEventTypes,
      allowedCompetitionIds: toCompetitionIds(userForm.allowedCompetitionIdsText),
    });

    setUserForm(DEFAULT_USER_FORM);
  };

  const handleSaveUser = async (user: AuthUserProfile) => {
    const draft = getUserDraft(user);
    await onUpdateUser(user.authUserId, {
      displayName: draft.displayName,
      role: draft.role,
      allowedEventTypes: draft.allowedEventTypes,
      allowedCompetitionIds: toCompetitionIds(draft.allowedCompetitionIdsText),
    });
  };

  const handleResetPassword = async (user: AuthUserProfile) => {
    const draft = getUserDraft(user);
    await onResetPassword(user.authUserId, draft.resetPassword);
    updateUserDraft(user.authUserId, (current) => ({
      ...current,
      resetPassword: '',
    }));
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Account Center</p>
            <h2>账号与权限</h2>
          </div>
          <button className={styles.closeButton} onClick={onClose}>
            关闭
          </button>
        </div>

        {!authAvailable && (
          <div className={styles.notice}>
            当前环境还没有完整配置 Supabase Auth，登录界面已经准备好，等函数和环境变量接通后即可启用。
          </div>
        )}

        {!currentUser ? (
          <div className={styles.columns}>
            <section className={styles.card}>
              <h3>用户登录</h3>
              <p className={styles.helper}>
                用户只输入你分配的用户名和密码即可登录，系统内部会自动映射账号，不需要用户接触邮箱。
              </p>
              <label className={styles.field}>
                <span>用户名</span>
                <input
                  value={loginUsername}
                  onChange={(event) => setLoginUsername(event.target.value)}
                  placeholder="例如：guangdong_admin"
                />
              </label>
              <label className={styles.field}>
                <span>密码</span>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  placeholder="输入分配的密码"
                />
              </label>
              <button
                className={styles.primaryButton}
                disabled={busy || !authAvailable}
                onClick={() => onLogin(loginUsername, loginPassword)}
              >
                登录
              </button>
            </section>

            <section className={styles.card}>
              <h3>初始化管理员</h3>
              <p className={styles.helper}>
                第一次接入时，在这里创建首个管理员。后面的账号都由管理员继续分配，不再依赖邮箱验证。
              </p>
              {hasAdmin && (
                <div className={styles.tip}>
                  系统里已经检测到管理员账号。如果你只是登录，请用左侧用户名密码直接进入。
                </div>
              )}
              <label className={styles.field}>
                <span>管理员用户名</span>
                <input
                  value={bootstrapForm.username}
                  onChange={(event) => setBootstrapForm((previous) => ({ ...previous, username: event.target.value }))}
                  placeholder="例如：admin"
                />
              </label>
              <label className={styles.field}>
                <span>显示名称</span>
                <input
                  value={bootstrapForm.displayName}
                  onChange={(event) => setBootstrapForm((previous) => ({ ...previous, displayName: event.target.value }))}
                  placeholder="例如：赛事总管理员"
                />
              </label>
              <label className={styles.field}>
                <span>初始密码</span>
                <input
                  type="password"
                  value={bootstrapForm.password}
                  onChange={(event) => setBootstrapForm((previous) => ({ ...previous, password: event.target.value }))}
                  placeholder="建议至少 8 位"
                />
              </label>
              <button
                className={styles.secondaryButton}
                disabled={busy || !authAvailable}
                onClick={() => onBootstrapAdmin({
                  username: bootstrapForm.username,
                  displayName: bootstrapForm.displayName,
                  password: bootstrapForm.password,
                  role: 'admin',
                  allowedEventTypes: null,
                  allowedCompetitionIds: null,
                })}
              >
                创建首个管理员
              </button>
            </section>
          </div>
        ) : (
          <div className={styles.columns}>
            <section className={styles.card}>
              <h3>当前账号</h3>
              <div className={styles.profileCard}>
                <strong>{currentUser.displayName}</strong>
                <span>用户名：{currentUser.username}</span>
                <span>角色：{currentUser.role}</span>
                <span>状态：{currentUser.isActive ? '已启用' : '已停用'}</span>
                <span>{formatScopeSummary(currentUser)}</span>
              </div>
              <button className={styles.secondaryButton} disabled={busy} onClick={() => onLogout()}>
                退出登录
              </button>
            </section>

            <section className={styles.card}>
              <h3>账号说明</h3>
              <p className={styles.helper}>
                现在这版支持管理员直接重置密码，并且可以限制某个用户只看或只编辑指定赛项、指定比赛。
                赛项留空表示可见全部；比赛 ID 留空表示不再单独限制比赛卡片。
              </p>
              {!canManageUsers && (
                <div className={styles.tip}>
                  你当前不是管理员，所以只能登录使用，不能继续分配新账号。
                </div>
              )}
            </section>
          </div>
        )}

        {currentUser && canManageUsers && (
          <section className={styles.adminArea}>
            <div className={styles.adminHeader}>
              <div>
                <h3>管理员分配账号</h3>
                <p className={styles.helper}>
                  由你统一分配用户名和密码。现在也支持限制某个用户只看指定赛项、指定比赛。
                </p>
              </div>
            </div>

            <div className={styles.userForm}>
              <label className={styles.field}>
                <span>用户名</span>
                <input
                  value={userForm.username}
                  onChange={(event) => setUserForm((previous) => ({ ...previous, username: event.target.value }))}
                  placeholder="例如：judge_01"
                />
              </label>
              <label className={styles.field}>
                <span>显示名称</span>
                <input
                  value={userForm.displayName}
                  onChange={(event) => setUserForm((previous) => ({ ...previous, displayName: event.target.value }))}
                  placeholder="例如：初中组裁判"
                />
              </label>
              <label className={styles.field}>
                <span>初始密码</span>
                <input
                  type="password"
                  value={userForm.password}
                  onChange={(event) => setUserForm((previous) => ({ ...previous, password: event.target.value }))}
                  placeholder="例如：Kclub2026!"
                />
              </label>
              <label className={styles.field}>
                <span>角色</span>
                <select
                  value={userForm.role}
                  onChange={(event) => setUserForm((previous) => ({ ...previous, role: event.target.value as UserRole }))}
                >
                  <option value="viewer">viewer 只读</option>
                  <option value="editor">editor 可编辑比赛</option>
                  <option value="admin">admin 管理员</option>
                </select>
              </label>
            </div>

            <div className={styles.scopeEditor}>
              <div className={styles.scopeBlock}>
                <span className={styles.scopeLabel}>允许的赛项</span>
                <div className={styles.checkboxRow}>
                  {EVENT_TYPE_OPTIONS.map((eventType) => (
                    <label key={eventType} className={styles.checkboxTag}>
                      <input
                        type="checkbox"
                        checked={userForm.allowedEventTypes.includes(eventType)}
                        onChange={() => setUserForm((previous) => ({
                          ...previous,
                          allowedEventTypes: toggleEventType(previous.allowedEventTypes, eventType),
                        }))}
                      />
                      <span>{eventType}</span>
                    </label>
                  ))}
                </div>
                <p className={styles.scopeHint}>不勾选任何赛项表示默认可见全部赛项。</p>
              </div>

              <label className={styles.field}>
                <span>指定比赛 ID（可选，逗号分隔）</span>
                <input
                  value={userForm.allowedCompetitionIdsText}
                  onChange={(event) => setUserForm((previous) => ({
                    ...previous,
                    allowedCompetitionIdsText: event.target.value,
                  }))}
                  placeholder="例如：competition-ab12, competition-cd34"
                />
              </label>
            </div>

            <div className={styles.buttonRow}>
              <button
                className={styles.primaryButton}
                disabled={busy || !authAvailable}
                onClick={handleManagedUserSubmit}
              >
                创建用户
              </button>
            </div>

            <div className={styles.userList}>
              {managedUsers.map((user) => {
                const draft = getUserDraft(user);

                return (
                  <article key={user.authUserId} className={styles.userCard}>
                    <div className={styles.userCardHeader}>
                      <div>
                        <strong>{user.displayName}</strong>
                        <span>{user.username}</span>
                        <span>{formatScopeSummary(user)}</span>
                      </div>
                      <div className={styles.userMeta}>
                        <span>{user.role}</span>
                        <button
                          className={styles.inlineButton}
                          disabled={busy || user.authUserId === currentUser.authUserId}
                          onClick={() => onToggleUserActive(user.authUserId, !user.isActive)}
                        >
                          {user.isActive ? '停用' : '启用'}
                        </button>
                      </div>
                    </div>

                    <div className={styles.existingUserGrid}>
                      <label className={styles.field}>
                        <span>显示名称</span>
                        <input
                          value={draft.displayName}
                          onChange={(event) => updateUserDraft(user.authUserId, (current) => ({
                            ...current,
                            displayName: event.target.value,
                          }))}
                        />
                      </label>
                      <label className={styles.field}>
                        <span>角色</span>
                        <select
                          value={draft.role}
                          onChange={(event) => updateUserDraft(user.authUserId, (current) => ({
                            ...current,
                            role: event.target.value as UserRole,
                          }))}
                        >
                          <option value="viewer">viewer 只读</option>
                          <option value="editor">editor 可编辑比赛</option>
                          <option value="admin">admin 管理员</option>
                        </select>
                      </label>
                      <label className={styles.field}>
                        <span>比赛 ID 限制（逗号分隔）</span>
                        <input
                          value={draft.allowedCompetitionIdsText}
                          onChange={(event) => updateUserDraft(user.authUserId, (current) => ({
                            ...current,
                            allowedCompetitionIdsText: event.target.value,
                          }))}
                          placeholder="留空表示全部比赛"
                        />
                      </label>
                      <label className={styles.field}>
                        <span>重置密码</span>
                        <input
                          type="password"
                          value={draft.resetPassword}
                          onChange={(event) => updateUserDraft(user.authUserId, (current) => ({
                            ...current,
                            resetPassword: event.target.value,
                          }))}
                          placeholder="输入新密码后点击重置"
                        />
                      </label>
                    </div>

                    <div className={styles.scopeBlock}>
                      <span className={styles.scopeLabel}>允许的赛项</span>
                      <div className={styles.checkboxRow}>
                        {EVENT_TYPE_OPTIONS.map((eventType) => (
                          <label key={`${user.authUserId}-${eventType}`} className={styles.checkboxTag}>
                            <input
                              type="checkbox"
                              checked={draft.allowedEventTypes.includes(eventType)}
                              onChange={() => updateUserDraft(user.authUserId, (current) => ({
                                ...current,
                                allowedEventTypes: toggleEventType(current.allowedEventTypes, eventType),
                              }))}
                            />
                            <span>{eventType}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className={styles.userActionRow}>
                      <button
                        className={styles.secondaryButton}
                        disabled={busy}
                        onClick={() => handleSaveUser(user)}
                      >
                        保存权限
                      </button>
                      <button
                        className={styles.inlineButton}
                        disabled={busy || !draft.resetPassword.trim()}
                        onClick={() => handleResetPassword(user)}
                      >
                        重置密码
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
