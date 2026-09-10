import { useState } from 'react';
import { modelingAxes, modelingLevels } from './modelingCurriculum';
import styles from './ModelingSystem.module.css';

const point = (index: number, value: number) => {
  const angle = index * Math.PI / 4 - Math.PI / 2;
  return [250 + Math.cos(angle) * value * 29, 220 + Math.sin(angle) * value * 29];
};
const polygon = (values: number[]) => values.map((value, index) => point(index, value).join(',')).join(' ');
export function ModelingSystem() {
  const [selected, setSelected] = useState(0);
  const item = modelingLevels[selected];
  const previous = modelingLevels[selected - 1];
  return <section className={styles.root} aria-label="七级设计建模培养路线">
    <p className={styles.intro}>看懂结构 → 表达尺寸 → 设计零件 → 设计机构 → 子系统 → 整机协同 → 工程交付</p>
    <p>搭建关注如何装出来，设计建模关注为什么这样设计，以及如何让别人准确制造并验证。</p>
    <nav className={styles.levels} aria-label="选择设计建模级别">{modelingLevels.map((level, index) => <button type="button" key={level.level} aria-pressed={selected === index} onClick={() => setSelected(index)}><strong>{level.level}</strong><span>{level.grades}</span></button>)}</nav>
    <h3>{item.level} · {item.goal}</h3>
    <div className={styles.layout}>
      <section className={styles.panel} aria-label="能力目标雷达图">
        <h4>八维成长目标 · 0—5阶</h4>
        <svg viewBox="0 0 500 450" role="img" aria-label={`${item.level}课程目标：${modelingAxes.map((axis,i) => `${axis}${item.scores[i]}阶`).join('，')}。详细数值见下方表格。`}>
          {[1,2,3,4,5].map(value => <polygon key={value} points={polygon(Array(8).fill(value))} fill="none" stroke="#b7c2ca" />)}
          {modelingAxes.map((axis,i) => { const [x,y] = point(i,5); const [tx,ty] = point(i,6.35); return <g key={axis}><line x1="250" y1="220" x2={x} y2={y} stroke="#b7c2ca" /><text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle" fill="#233440" fontSize="15">{axis}</text></g>; })}
          <polygon points={polygon(Array(8).fill(5))} fill="#98671b" fillOpacity="0.05" stroke="#98671b" strokeWidth="2" strokeDasharray="3 5" />
          {previous && <polygon points={polygon(previous.scores)} fill="none" stroke="#7c478b" strokeWidth="2.5" strokeDasharray="8 5" />}
          <polygon points={polygon(item.scores)} fill="#176c80" fillOpacity="0.2" stroke="#176c80" strokeWidth="3" />
          {item.scores.map((score,i) => { const [cx,cy] = point(i,score); return <circle key={i} cx={cx} cy={cy} r="4" fill="#176c80" />; })}
          {[1,2,3,4,5].map(value => <text key={value} x="258" y={220-value*29+12} fontSize="12" fill="#233440">{value}</text>)}
        </svg>
        <p className={styles.legend}>实线：{item.level}　{previous ? `长虚线：${previous.level}　` : ''}点虚线：FRC进阶目标</p>
        <p>这是俱乐部课程目标，不是学生实际成绩或官方赛事评级。U18A进阶目标与外圈重合；0阶表示暂不独立考核。</p>
        <details><summary>查看数值与评价刻度</summary><table><thead><tr><th>能力</th><th>本级</th><th>上一级</th><th>FRC目标</th></tr></thead><tbody>{modelingAxes.map((axis,i) => <tr key={axis}><th scope="row">{axis}</th><td>{item.scores[i]}</td><td>{previous ? previous.scores[i] : '—'}</td><td>5</td></tr>)}</tbody></table><p>1：引导下体验；2：按示例完成；3：独立完成限定任务；4：系统协同与取舍；5：教练评审下工程分析、交付与验证。</p><p>刻度为教学规划草案，不是等距能力测量；不计算总分或面积增长率。个人评价需结合下方项目证据。</p></details>
      </section>
      <section className={styles.panel} key={item.level}>
        <h4>本级方法论 · 在任务中掌握</h4><ul>{item.methods.map(method => <li key={method}>{method}</li>)}</ul>
        <h4>代表项目</h4><p>{item.project}</p>
        <h4>怎样看见学会了？</h4><ul>{item.evidence.map(evidence => <li key={evidence}>{evidence}</li>)}</ul>
        <details><summary>展开学习内容、软件与分析要求</summary><h4>设计内容</h4><p>{item.content}</p><h4>软件与工具</h4><p>{item.tools}</p><h4>计算与分析</h4><p>{item.analysis}</p></details>
        <p className={styles.boundary}>{item.boundary}</p>
      </section>
    </div>
    {item.level === 'U18A' && <section className={styles.panel}>
      <h4>FRC内部进阶：基础建模 → 独立子系统 → 工程分析</h4>
      <p>基础队员负责尺寸、模型与测试记录；进阶队员负责子系统接口与交付；工程分析队员在教练评审下完成负载模型、仿真和实测对照。按能力与已学数理知识分工，而不是只看年级。</p>
      <div className={styles.layout}><div><h4>最终分析链路</h4><ol><li>定义静止、启动、制动、不同位置和异常工况。</li><li>简化模型，明确质量、重心、约束与载荷假设。</li><li>计算所需惯量、动态力矩和传动需求。</li><li>检查材料、结构变形、加工与装配限制。</li><li>检查仿真载荷、边界条件及网格敏感性。</li><li>用实测检查预测，记录偏差并修正。</li></ol></div><div><h4>两种“惯量”不要混淆</h4><p>转动惯量描述质量分布对角加速度的影响，用于动力学分析；截面惯性矩描述截面几何特征，用于结合材料等条件分析抗弯变形。两者物理意义与单位不同。</p><p>运动仿真不等于负载校核；漂亮的受力云图也不是安全证明。材料参数、连接方式与约束需经审核。</p><h4>设计到制造</h4><p>比较铝合金、钢、工程塑料和复合材料；考虑CNC刀具与装夹、钣金折弯、打印方向、连接与检验。机床和复合材料加工须独立培训授权，外加工图纸需评审。</p></div></div>
    </section>}
    <details className={styles.panel}><summary>统一设计流程与参考资源</summary><p>明确需求 → 拆解功能 → 比较方案 → 整体布局 → 工况与计算 → 加工装配检查 → 样机验证 → 修改定版。</p><p>低级别用草图和观察解释，中级别用尺寸与数据支持，高级别用模型、仿真和实测验证。本页为俱乐部原创培养方案，经典案例整理时需保留来源、版本与使用许可。</p><ul><li><a href="https://www.firstinspires.org/resources/library/frc/technical-resources" target="_blank" rel="noreferrer">FIRST技术资源与经典设计学习入口</a></li><li><a href="https://learn.onshape.com/pages/top-down-design-syllabus" target="_blank" rel="noreferrer">Onshape Top-down教学资源</a></li><li><a href="https://help.solidworks.com/2021/English/SolidWorks/sldworks/c_Design_Methods.htm" target="_blank" rel="noreferrer">SOLIDWORKS设计方法参考（2021版）</a></li></ul></details>
  </section>;
}
