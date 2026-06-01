import type { StorageMode } from '../../types';
import styles from './DataControls.module.css';

interface Props {
  onQuickRead: () => void;
  onRefresh: () => void;
  autoRefreshEnabled: boolean;
  autoRefreshInterval: number;
  onAutoRefreshToggle: (enabled: boolean) => void;
  onIntervalChange: (interval: number) => void;
  storageMode: StorageMode;
}

export function DataControls({
  onQuickRead,
  onRefresh,
  autoRefreshEnabled,
  autoRefreshInterval,
  onAutoRefreshToggle,
  onIntervalChange,
  storageMode,
}: Props) {
  return (
    <div className={styles.controls}>
      <div className={styles.topRow}>
        <div className={styles.sourceBadge}>
          <span className={styles.sourceLabel}>导入方式</span>
          <span className={styles.sourceValue}>仅剪贴板导入</span>
        </div>

        <div className={styles.sourceBadge}>
          <span className={styles.sourceLabel}>存储位置</span>
          <span className={styles.sourceValue}>
            {storageMode === 'supabase' ? 'Supabase 云端共享' : '浏览器本地存储'}
          </span>
        </div>

        <div className={styles.actions}>
          <button className={`${styles.btn} ${styles.clipboardBtn}`} onClick={onQuickRead}>
            读取并解析剪贴板
          </button>
          <button className={`${styles.btn} ${styles.refreshBtn}`} onClick={onRefresh}>
            刷新排名
          </button>
        </div>

        <div className={styles.autoRefresh}>
          <label className={styles.toggleLabel}>
            <input
              type="checkbox"
              checked={autoRefreshEnabled}
              onChange={(event) => onAutoRefreshToggle(event.target.checked)}
              className={styles.checkbox}
            />
            自动刷新
          </label>
          <select
            value={autoRefreshInterval}
            onChange={(event) => onIntervalChange(Number(event.target.value))}
            className={styles.intervalSelect}
          >
            <option value={10}>10 秒</option>
            <option value={30}>30 秒</option>
            <option value={60}>1 分钟</option>
            <option value={120}>2 分钟</option>
            <option value={300}>5 分钟</option>
          </select>
        </div>
      </div>
    </div>
  );
}
