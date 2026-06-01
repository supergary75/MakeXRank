import styles from './Footer.module.css';

interface Props {
  lastUpdate: string;
  isLobby?: boolean;
}

export function Footer({ lastUpdate, isLobby = false }: Props) {
  return (
    <footer className={styles.footer}>
      <p>仅支持剪贴板表格导入</p>
      <p className={styles.lastUpdate}>
        {isLobby ? '当前处于赛事大厅' : lastUpdate ? `最后更新：${lastUpdate}` : '当前赛事尚未解析数据'}
      </p>
    </footer>
  );
}
