import { useId } from 'react';
import styles from './CurriculumSystem.module.css';

const axes = [
  ['自主解题', '自主分析与解决问题'],
  ['设计制造', '机械设计与制造'],
  ['编程控制', '编程与自动控制'],
  ['系统集成', '电气与系统集成'],
  ['联盟决策', '联盟协作与对抗决策'],
  ['工程迭代', '工程管理与迭代验证'],
];
// Club curriculum proposal, not official competition ratings or student scores.
export const radarLevels: Record<string, readonly number[]> = {
  U9: [2, 1, 1, 1, 1, 1],
  U12B: [2, 2, 2, 1, 1, 2],
  U12A: [3, 2, 2, 2, 3, 2],
  U15B: [3, 3, 3, 2, 4, 3],
  U15A: [4, 4, 3, 3, 4, 3],
  U18B: [4, 4, 4, 4, 4, 4],
  U18A: [5, 5, 5, 5, 5, 5],
};
const stages = ['认识任务，在示范下参与', '在指导下完成并解释步骤', '独立完成常规任务并排查问题', '自主设计优化，承担模块责任', '解决开放问题，协同验证并承担工程责任'];
const point = (axis: number, value: number) => {
  const angle = (axis * 60 - 90) * Math.PI / 180;
  return [240 + Math.cos(angle) * value * 30, 215 + Math.sin(angle) * value * 30];
};
const polygon = (values: readonly number[]) => values.map((value, i) => point(i, value).join(',')).join(' ');

export function CurriculumRadar({ level }: { level: string }) {
  const id = useId();
  const values = radarLevels[level];
  if (!values) return null;
  return <section className={styles.radarSection} aria-labelledby={`${id}-heading`}>
    <h4 id={`${id}-heading`}>面向 FRC 的能力进阶图</h4>
    <p className={styles.note}>参考值草案 · 展示课程培养要求，不代表学员实际得分或官方赛事难度；不同维度不可直接相加评定学员。</p>
    <div className={styles.radarLayout}>
      <div>
        <div className={styles.legend}><span><i className={styles.targetKey} />FRC 目标 · 5档</span><span><i className={styles.currentKey} />{level} 培养要求</span></div>
        <svg className={styles.radar} viewBox="0 0 480 440" role="img" aria-labelledby={`${id}-title ${id}-desc`}>
          <title id={`${id}-title`}>{level} 六维培养要求与 FRC 目标对比</title>
          <desc id={`${id}-desc`}>{axes.map((axis, i) => `${axis[1]}：${values[i]}档，目标5档`).join('；')}。详细数值见下方表格。</desc>
          {[1, 2, 3, 4, 5].map(value => <polygon key={value} points={polygon(Array(6).fill(value))} fill="none" stroke="#677181" strokeWidth="1" />)}
          {axes.map((axis, i) => { const [x, y] = point(i, 5); return <line key={axis[0]} x1="240" y1="215" x2={x} y2={y} stroke="#677181" />; })}
          <polygon points={polygon(values)} fill="#c5ff67" fillOpacity=".16" stroke="#c5ff67" strokeWidth="3" />
          <polygon points={polygon([5, 5, 5, 5, 5, 5])} fill="none" stroke="#ffd700" strokeWidth="3" strokeDasharray="8 6" />
          {values.map((value, i) => { const [x, y] = point(i, value); return <circle key={i} cx={x} cy={y} r="5" fill="#c5ff67" stroke="#11141a" strokeWidth="2" />; })}
          {[1, 2, 3, 4, 5].map(value => <text key={value} x="249" y={215 - value * 30 + 5} fill="#f4f6fa" fontSize="14" stroke="#11141a" strokeWidth="3" paintOrder="stroke">{value}</text>)}
          {axes.map((axis, i) => { const [x, y] = point(i, 6.1); return <text key={axis[0]} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fill="#f4f6fa" fontSize="17">{axis[0]}</text>; })}
        </svg>
        {level === 'U18A' && <p className={styles.note}>U18A 为本路径的目标阶段，当前轮廓与 FRC 目标重合；不表示每位队员入班即具备全部能力。</p>}
      </div>
      <div className={styles.radarTableWrap}><table className={styles.radarTable}><caption>{level} · 六维参考值</caption><thead><tr><th scope="col">能力维度</th><th scope="col">本级</th><th scope="col">目标</th></tr></thead><tbody>{axes.map((axis, i) => <tr key={axis[0]}><th scope="row">{axis[1]}</th><td>{values[i]}档</td><td>5档</td></tr>)}</tbody></table><p className={styles.note}>每档代表承担任务的深度，不是考试分数。具体技术要求将在编程、搭建等模块中细化。</p></div>
    </div>
    <details className={styles.radarScale}><summary>查看 1–5 档培养要求说明</summary><ol>{stages.map((stage, i) => <li key={stage}><strong>{i + 1}档：</strong>{stage}</li>)}</ol><p className={styles.note}>数值由俱乐部培养路径拟定，待教练团队确认后作为正式标准；未涉及的专项训练不能仅凭雷达图推断。</p></details>
  </section>;
}
