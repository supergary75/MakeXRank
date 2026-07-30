import styles from './PracticeInspireWorkspace.module.css';

export function PracticeInspireWorkspace() {
  return (
    <section className={styles.workspace}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Practice Analytics</p>
        <h1>MakeX Inspire 练习赛分析</h1>
        <p>
          这里是独立模块开发区。练习赛数据导入、队伍表现分析、成长趋势和复盘功能都在此目录内开发。
        </p>
      </header>

      <div className={styles.placeholder}>
        <strong>模块骨架已准备完成</strong>
        <span>请从此处开始搭建 MakeX Inspire 二级页面。</span>
      </div>
    </section>
  );
}
