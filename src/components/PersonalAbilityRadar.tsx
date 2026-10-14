import { useState } from 'react';
import { personalAbilities } from './personalAbilities';
import { mindsetProgression } from './mindsetCurriculum';
import { personalRadarAxes, personalRadarTargets, personalTargetScale } from './personalRadarTargets';
import styles from './PersonalAbilityRadar.module.css';

const location = (axis: number, value: number): [number,number] => {
  const angle = axis * Math.PI / 4 - Math.PI / 2;
  return [260 + Math.cos(angle) * value * 35, 220 + Math.sin(angle) * value * 35];
};
const polygon = (values: number[]) => values.map((value,axis) => location(axis,value).join(',')).join(' ');
export function PersonalAbilityRadar({ selected }: { selected: number }) {
  const [axis, setAxis] = useState(6);
  const level = mindsetProgression[selected];
  const target = personalRadarTargets[selected];
  const previous = personalRadarTargets[selected-1];
  const final = personalRadarTargets[6];
  const behavior = axis === 6
    ? { goal: level.stage, practice:level.practice, evidence:level.evidence }
    : personalAbilities[axis === 7 ? 6 : axis].steps[selected];
  return <section className={styles.root} aria-label="八维个人能力课程目标雷达图">
    <h3>{level.level} · {target.role}</h3>
    <p><strong>课程培养目标 · 非学员实际评分</strong></p>
    <p>图中档位表示在本级任务中的建议独立程度。任务随级别变化，因此不是跨年龄绝对能力排名；目标为教研草案，不是标准化量表。</p>
    <div className={styles.layout}>
      <div>
        <svg viewBox="0 0 520 450" role="img" aria-label={`${level.level}课程目标：${personalRadarAxes.map((label,i) => `${label}：${personalTargetScale[target.values[i]-1]}`).join('；')}。下方可查看完整数据。`}>
          {[1,2,3,4].map(value => <polygon key={value} points={polygon(Array(8).fill(value))} fill="none" stroke="#b5c1c8" />)}
          {personalRadarAxes.map((label,i) => { const [x,y] = location(i,4); const [tx,ty] = location(i,5.5); return <g key={label}><line x1="260" y1="220" x2={x} y2={y} stroke="#b5c1c8" /><text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle" fontSize="15" fill={i === 6 ? '#a52a3a' : '#233440'} fontWeight={i === 6 ? 700 : 400}>{i === 6 ? <><tspan x={tx} dy="-8">情绪调节</tspan><tspan x={tx} dy="20">与抗挫成长</tspan></> : label}</text></g>; })}
          <polygon points={polygon(final.values)} fill="#9c7021" fillOpacity="0.05" stroke="#9c7021" strokeWidth="2" strokeDasharray="2 5" />
          {previous && <polygon points={polygon(previous.values)} fill="none" stroke="#81509b" strokeWidth="2" strokeDasharray="8 5" />}
          <polygon points={polygon(target.values)} fill="#176c80" fillOpacity="0.18" stroke="#176c80" strokeWidth="3" />
          {target.values.map((value,i) => { const [cx,cy] = location(i,value); return <circle key={i} cx={cx} cy={cy} r={i === 6 ? 6 : 4} fill={i === 6 ? '#a52a3a' : '#176c80'} />; })}
          {[1,2,3,4].map(value => <text key={value} x="267" y={220-value*35+12} fontSize="12" fill="#233440">{value}</text>)}
        </svg>
        <p className={styles.legend}>实线：{level.level} · {previous ? `长虚线：${mindsetProgression[selected-1].level} · ` : ''}点虚线：U18A进阶目标</p>
        <p>U18A目标并非全部满格，且与选中U18A时的实线重合。求助始终是允许且有价值的行为。</p>
      </div>
      <div>
        <h4>本级重点培养</h4>
        <ul>{target.focus.map(i => <li key={i}>{personalRadarAxes[i]}{i === 6 ? '：认识状态、选择方法、需要时求助，不以硬扛压力为目标。' : ''}</li>)}</ul>
        <div className={styles.axes} aria-label="选择能力查看行为证据">{personalRadarAxes.map((label,i) => <button key={label} type="button" aria-pressed={axis === i} onClick={() => setAxis(i)}>{label}</button>)}</div>
        <section className={styles.evidence} aria-live="polite">
          <h4>{personalRadarAxes[axis]}</h4><p>建议档位：{personalTargetScale[target.values[axis]-1]}</p>
          <p><strong>本级行为目标：</strong>{behavior.goal}</p><p><strong>比赛／学习练习：</strong>{behavior.practice}</p><p><strong>观察证据：</strong>{behavior.evidence}</p>
          {axis === 6 && <p>独立选择求助也属于自我调节；不要求独自处理困难。心态管理详细赛前、赛中、赛后目标见下方专区。</p>}
        </section>
      </div>
    </div>
    <details><summary>查看八维目标数据与使用边界</summary><div className={styles.table}><table><thead><tr><th>能力</th><th>本级</th><th>上一级</th><th>U18A目标</th></tr></thead><tbody>{personalRadarAxes.map((label,i) => <tr key={label}><th scope="row">{label}</th><td>{target.values[i]}</td><td>{previous ? previous.values[i] : '—'}</td><td>{final.values[i]}</td></tr>)}</tbody></table></div><ol>{personalTargetScale.map(label => <li key={label}>{label}</li>)}</ol><p>档位不是等距分数，不计算总分、面积增长或排名。个人评价需有多次任务证据；未观察到的维度记“尚未观察”，不是0分。本页没有录入或保存个人评价，也不自动推断孩子能力。</p></details>
  </section>;
}
