import type { TabName } from '../../types';
import styles from './TabNavigation.module.css';

interface Props {
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
  showPlayoff?: boolean;
}

const tabs: Array<{ key: TabName; label: string }> = [
  { key: 'ranking', label: '📊 排行榜' },
  { key: 'playoff', label: '🏆 淘汰赛预测' },
];

export function TabNavigation({ activeTab, onTabChange, showPlayoff = true }: Props) {
  const visibleTabs = showPlayoff ? tabs : tabs.filter((tab) => tab.key !== 'playoff');

  return (
    <div className={styles.nav}>
      {visibleTabs.map((tab) => (
        <button
          key={tab.key}
          className={`${styles.btn} ${activeTab === tab.key ? styles.active : ''}`}
          onClick={() => onTabChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
