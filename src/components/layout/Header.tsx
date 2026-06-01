import type { ReactNode } from 'react';
import styles from './Header.module.css';

interface Props {
  title: string;
  subtitle: string;
  eyebrow?: string;
  action?: ReactNode;
}

export function Header({ title, subtitle, eyebrow, action }: Props) {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <div className={styles.copy}>
          {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
          <h1>{title}</h1>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>
        {action && <div className={styles.action}>{action}</div>}
      </div>
    </header>
  );
}
