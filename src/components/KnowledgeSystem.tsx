import { useState } from 'react';
import styles from './CurriculumSystem.module.css';
import { NationalKnowledgeSystem } from './NationalKnowledgeSystem';
import { IBKnowledgeSystem } from './IBKnowledgeSystem';

const systems = [
  { name: '新课标体系对应', label: '中国学校课程', description: '以学校学段与学科知识为线索，整理机器人课程与新课标学习内容的联系。', topics: ['适用学段', '学科知识', '机器人实践', '学习成果'] },
  { name: 'IB课程体系对应', label: '国际课程', description: '以 IB 课程框架为线索，整理机器人项目中的探究、学科联系与学习成果。', topics: ['适用课程阶段', '学科联系', '探究活动', '学习成果'] },
] as const;

export function KnowledgeSystem() {
  const [selected, setSelected] = useState<number | null>(null);
  if (selected !== null) {
    return <div>
      <button type="button" onClick={() => setSelected(null)}>← 返回学科对应体系</button>
      {selected === 0 ? <NationalKnowledgeSystem /> : <IBKnowledgeSystem />}
    </div>;
  }
  return <>
    <p className={styles.note}>同一条机器人培养路径，从两种课程体系理解其学科价值。请选择要查看或继续建设的体系。</p>
    <nav className={styles.modules} aria-label="选择学科对应体系">
      {systems.map((system, index) => <button type="button" key={system.name} onClick={() => setSelected(index)}>
        <small>0{index + 1} · {system.label}</small>
        <strong>{system.name}</strong><p>{system.description}</p><span>进入体系 →</span>
      </button>)}
    </nav>
  </>;
}
