import { useState } from 'react';
import styles from './CurriculumSystem.module.css';
import { mindsetProgression } from './mindsetCurriculum';

export function MindsetProgression() {
  const [selected, setSelected] = useState(0);
  const item = mindsetProgression[selected];
  return <section aria-label="比赛心态管理七级成长">
    <h3>跟随比赛进阶，逐步学会调适</h3>
    <p>认识情绪 → 选择方法 → 对抗沟通 → 主动调整 → 责任边界 → 协商合作 → 持续成长</p>
    <p className={styles.note}>俱乐部教学草案，不是心理发展常模。每一级都允许求助、休息和退出；成长不是承受更大压力或更快停止哭泣。</p>
    <nav className={styles.path} aria-label="选择心态成长级别">{mindsetProgression.map((row,index) => <button key={row.level} type="button" aria-pressed={selected === index} onClick={() => setSelected(index)}><strong>{row.level}</strong><span>{row.grades}</span><b>{row.event}</b></button>)}</nav>
    <article className={styles.detail} key={item.level}>
      <p className={styles.eyebrow}>{item.level} · {item.event}</p><h3>{item.stage}</h3>
      <p><strong>比赛情境：</strong>{item.context}</p>
      <div className={styles.modules}><section><h4>赛前目标</h4><p>{item.before}</p></section><section><h4>赛中目标</h4><p>{item.during}</p></section><section><h4>赛后目标</h4><p>{item.after}</p></section></div>
      <section className={styles.progression}><h4>建议练习</h4><p>{item.practice}</p><h4>可观察的成长证据</h4><p>{item.evidence}</p></section>
      <details><summary>教练支持与下一步</summary><p><strong>教练怎么做：</strong>{item.coach}</p><p><strong>成长方向：</strong>{item.next}</p></details>
    </article>
    <p className={styles.note}>记录任务情境、采用的方法和所需支持，不进行心理诊断或孩子排名；没有机会观察时记“尚未观察”，不能记成能力不足。所有模拟练习应适度、知情、可退出，不人为制造危险或羞辱。</p>
  </section>;
}
