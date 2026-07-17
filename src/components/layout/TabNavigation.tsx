import type { TabName } from '../../types';
import styles from './TabNavigation.module.css';

interface Props {
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
  showPlayoff?: boolean;
  showFocusSchedule?: boolean;
}

const tabs: Array<{ key: TabName; label: string }> = [
  { key: 'ranking', label: '排名榜' },
  { key: 'playoff', label: '淘汰赛预测' },
  { key: 'focusSchedule', label: '重点赛队赛程' },
];

export function TabNavigation({
  activeTab,
  onTabChange,
  showPlayoff = true,
  showFocusSchedule = false,
}: Props) {
  const visibleTabs = tabs.filter((tab) => {
    if (tab.key === 'playoff') {
      return showPlayoff;
    }

    if (tab.key === 'focusSchedule') {
      return showFocusSchedule;
    }

    return true;
  });

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
