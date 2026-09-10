import { useState } from 'react';
import { personalAbilities } from './personalAbilities';
import { mindsetProgression } from './mindsetCurriculum';
import styles from './CurriculumSystem.module.css';

export function PersonalAbilityProgression() {
  const [selected, setSelected] = useState(0);
  const level = mindsetProgression[selected];
  return <section aria-label="其余七项个人核心能力分级">
    <h3>七级工程成长 · 学习、思考与共同担当</h3>
    <p>每个级别都练习全部能力；进阶体现在任务复杂度、独立程度和责任范围，不以年龄直接判定个人水平。</p>
    <nav className={styles.path} aria-label="选择个人能力培养级别">{mindsetProgression.map((row,index) => <button key={row.level} type="button" aria-pressed={selected === index} onClick={() => setSelected(index)}><strong>{row.level}</strong><span>{row.grades}</span><b>{row.event}</b></button>)}</nav>
    <h4>{level.level} · {level.event} · 七项能力任务</h4>
    <div className={styles.modules} key={level.level}>{personalAbilities.map(ability => {
      const step = ability.steps[selected];
      return <section className={styles.detail} key={ability.name}><h4>{ability.name}</h4><p>{ability.definition}</p><p><strong>本级目标：</strong>{step.goal}</p><details><summary>展开练习与成长证据</summary><p><strong>建议练习：</strong>{step.practice}</p><p><strong>观察证据：</strong>{step.evidence}</p><p className={styles.note}>参考关联：{ability.foundation}。任务为俱乐部原创设计。</p></details></section>;
    })}</div>
    <section className={styles.progression}><h4>统一观察方式 · 不按印象打分</h4><p>引导下完成 → 提示下完成 → 独立完成 → 能迁移并支持他人。另设“尚未观察”，不能将缺少机会视为能力不足。</p><p>每次记录：任务情境＋具体行为＋作品或记录＋所需支持＋下一步目标。结合多次情境和队员自述判断，不用比赛名次、外向程度或单次表现排名。</p><p>示例：连续测试失败后，在一次提示下提出“先固定程序、检查传动”，并记录结果。下一步练习独立设计对照测试。</p><p className={styles.note}>本页展示课程方案，不包含学生评分、保存或心理测评功能。比赛心态管理的七级目标在上方独立展示，各级均允许求助与休息。</p></section>
    <details><summary>21世纪能力与5C参考说明</summary><p>以5C中的审辩思维、创新、沟通、合作、文化理解与传承为参考，结合自主学习、担当和情绪调适形成俱乐部八维框架。“文化与伦理”是本俱乐部扩展，不等同于原模型定义。本体系未经标准化测量验证，不代表官方认证。</p><ul><li><a href="https://www.battelleforkids.org/wp-content/uploads/2023/11/P21_Framework_Brief.pdf" target="_blank" rel="noreferrer">P21框架参考</a></li><li><a href="https://xbjk.ecnu.edu.cn/EN/article/downloadArticleFile.do?attachType=PDF&id=9311" target="_blank" rel="noreferrer">5C模型研究参考</a></li></ul></details>
  </section>;
}
