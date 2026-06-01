import type { StorageMode } from '../../types';
import styles from './Footer.module.css';

interface Props {
  lastUpdate: string;
  isLobby?: boolean;
  storageMode: StorageMode;
}

export function Footer({ lastUpdate, isLobby = false, storageMode }: Props) {
  return (
    <footer className={styles.footer}>
      <p>{storageMode === 'supabase' ? '当前已连接 Supabase 云端共享' : '当前使用浏览器本地存储'}</p>
      <p className={styles.lastUpdate}>
        {isLobby ? '当前处于赛事大厅' : lastUpdate ? `最后更新：${lastUpdate}` : '当前赛事尚未解析数据'}
      </p>
    </footer>
  );
}
