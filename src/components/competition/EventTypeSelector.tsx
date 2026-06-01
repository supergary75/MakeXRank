import type { EventType } from '../../types';
import styles from './EventTypeSelector.module.css';

interface EventTypeOption {
  description: string;
  eventType: EventType;
  footer: string;
  keywords: string[];
}

const EVENT_TYPE_OPTIONS: EventTypeOption[] = [
  {
    eventType: 'MakeX Inspire',
    description: '适合 Inspire 赛项的多场比赛管理、战队榜单整理与淘汰赛推演。',
    footer: '培训赛、区域赛、邀请赛都可独立建卡片',
    keywords: ['创新展示', '团队协作', '赛季运营'],
  },
  {
    eventType: 'MakeX Explorer',
    description: '为 Explorer 赛项单独管理赛事数据，保持每个赛项的工作台互不干扰。',
    footer: '按赛项分开保存，方便不同组别独立维护',
    keywords: ['任务赛', '表格导入', 'EPA 排名'],
  },
  {
    eventType: 'MakeX Challenge',
    description: '面向 Challenge 赛项的排行榜入口，适合更密集的数据刷新与对抗分析。',
    footer: '进入后继续创建对应比赛卡片与专属排行榜页',
    keywords: ['对抗赛', '淘汰赛', '强度分析'],
  },
];

interface Props {
  competitionCounts: Record<EventType, number>;
  onSelect: (eventType: EventType) => void;
}

export function EventTypeSelector({ competitionCounts, onSelect }: Props) {
  return (
    <section className={styles.selector}>
      <div className={styles.intro}>
        <p className={styles.eyebrow}>Step 1</p>
        <h2>先选择赛项，再进入对应的赛事大厅</h2>
        <p className={styles.hint}>
          每个赛项都会进入自己的二级页面，里面再建立具体比赛卡片。这样 Inspire、Explorer、Challenge
          的数据就能完全分开管理。
        </p>
      </div>

      <div className={styles.grid}>
        {EVENT_TYPE_OPTIONS.map((option) => (
          <article key={option.eventType} className={styles.card}>
            <div className={styles.cardTop}>
              <div>
                <p className={styles.cardLabel}>赛项</p>
                <h3>{option.eventType}</h3>
              </div>
              <span className={styles.countBadge}>{competitionCounts[option.eventType]} 场赛事</span>
            </div>

            <p className={styles.description}>{option.description}</p>

            <div className={styles.keywordRow}>
              {option.keywords.map((keyword) => (
                <span key={keyword}>{keyword}</span>
              ))}
            </div>

            <p className={styles.footer}>{option.footer}</p>

            <button className={styles.enterButton} onClick={() => onSelect(option.eventType)}>
              进入 {option.eventType}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
