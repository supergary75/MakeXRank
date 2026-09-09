import type { ReactNode } from 'react';
import styles from './WorkspaceHero.module.css';

export default function WorkspaceHero({ product = false, action }: { product?: boolean; action: ReactNode }) {
  return <header className={styles.hero}>
    <div className={styles.nav}><span>CLUB / ROBOTICS</span><div>{action}</div></div>
    <div className={styles.body}>
      <div className={styles.copy}>
        <p className={styles.kicker}>{product ? 'LEARNING THROUGH BUILDING' : 'BUILD · COMPETE · GROW'}</p>
        <h1>{product ? '产品中心' : <>俱乐部内部<br />工作系统</>}</h1>
        <p className={styles.description}>{product ? '从第一台机器人，到整机设计。让课程、实践与竞赛，连接成清晰的成长路径。' : '一起造机器人，一起解决问题。连接赛事、教练与课程，让团队的每一次进步都有迹可循。'}</p>
        <span className={styles.rule} />
        <p className={styles.meta}>{product ? '07 培养级别 / 05 能力维度' : '03 工作中心 / ONE TEAM'}</p>
      </div>
    </div>
  </header>;
}
