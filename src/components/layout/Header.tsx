import type { ReactNode } from 'react';
import styles from './Header.module.css';

interface Props {
  title: string;
  subtitle: string;
  eyebrow?: string;
  action?: ReactNode;
  showLogo?: boolean;
  theme?: 'default' | 'darkGold';
}

export function Header({ title, subtitle, eyebrow, action, showLogo = true, theme = 'default' }: Props) {
  const resolvedEyebrow = eyebrow === 'Event Selection' ? 'Event Analytics' : eyebrow;
  const resolvedTitle = eyebrow === 'Event Selection' ? '赛事数据分析' : title;

  return (
    <header className={`${styles.header} ${theme === 'darkGold' ? styles.darkGold : ''}`}>
      <div className={styles.decorStickers} aria-hidden="true">
        <span className={styles.surfSticker} />
        <span className={styles.cablecarSticker} />
      </div>
      <div className={styles.inner}>
        <div className={styles.brandBlock}>
          {showLogo && <div className={styles.logoBadge} aria-label="KCLUB logo">
            <span className={styles.logoMark}>KC</span>
            <div className={styles.logoText}>
              <strong className={styles.logoTitle}>KCLUB</strong>
              <span className={styles.logoSub}>Competition Lab</span>
            </div>
          </div>}

          <div className={styles.copy}>
            {resolvedEyebrow && <p className={styles.eyebrow}>{resolvedEyebrow}</p>}
            <h1>{resolvedTitle}</h1>
            <p className={styles.subtitle}>{subtitle}</p>
          </div>
        </div>
        {action && <div className={styles.action}>{action}</div>}
      </div>
    </header>
  );
}
