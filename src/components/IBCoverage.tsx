import { useState } from 'react';
import styles from './IBCoverage.module.css';

type Status = '已有应用案例' | '可拓展' | '暂未覆盖';
type Row = { subject: '数学' | '科学／物理'; topic: string; status: Status; basis: string };
const row = (subject: Row['subject'], topic: string, status: Status, basis: string): Row => ({ subject, topic, status, basis });
export const coverageTopics: Record<string, Row[]> = {
  PYP: [
    row('数学','计数与四则运算','已有应用案例','U9路线合并；U12B重复推送计数。仅涉及部分运算。'),
    row('数学','长度、单位与测量','已有应用案例','U9实测路线；U12B孔距与行程。'),
    row('数学','形状、位置与方向','已有应用案例','U9路线图；U12A场地位置表达。'),
    row('数学','数据分类与图表','已有应用案例','U9到达记录；U12B方案比较图。'),
    row('数学','模式与关系','可拓展','建议增加动作规律预测与数列活动；现有重复指令不等同系统学习。'),
    row('数学','分数与部分整体','已有应用案例','U12B成功次数分数；按学校已学进度选用。'),
    row('科学／物理','运动与力的观察','已有应用案例','U9推拉滚动；U12B摩擦比较。'),
    row('科学／物理','材料性质','已有应用案例','U9支撑观察；U12A材料形状比较。'),
    row('科学／物理','公平测试与记录','已有应用案例','U9只改一个条件；U12B相同载荷测试。'),
    row('科学／物理','生命与生长','暂未覆盖','当前未设计相关活动。'),
    row('科学／物理','地球与空间','暂未覆盖','当前未设计相关活动。'),
    row('科学／物理','环境与资源','可拓展','可增加材料再利用项目；尚未形成案例。'),
  ],
  MYP: [
    row('数学','数、比例与单位','已有应用案例','U15A传动比与尺寸；不是完整数论或运算课程。'),
    row('数学','代数与关系','已有应用案例','U15B变量及参数结果图；仅应用部分关系。'),
    row('数学','几何与测量','已有应用案例','U15A尺寸链；U18B装配几何。'),
    row('数学','统计与数据','已有应用案例','U15B均值范围；U18B故障样本。'),
    row('数学','概率模型','可拓展','已有频数不等于概率模型；需补充随机性与概率任务。'),
    row('数学','推理与证明','可拓展','已有工程理由，尚无系统数学证明案例。'),
    row('科学／物理','运动、力与能量','已有应用案例','U15B平均速度；U15A载荷、提升能量。'),
    row('科学／物理','电路与电学','已有应用案例','U15A低压电路；仅监督下的基础应用。'),
    row('科学／物理','科学探究与误差','已有应用案例','U15B控制条件；U18B提出并检验故障假设。'),
    row('科学／物理','波、声与光','可拓展','可增加测距原理探究；使用传感器本身不算理解波。'),
    row('科学／物理','生物主题','暂未覆盖','当前未设计相关活动。'),
    row('科学／物理','化学主题','暂未覆盖','材料选型不等于化学反应与粒子模型学习。'),
  ],
  DP: [
    row('数学','数与代数','可拓展','需根据AA／AI和SL／HL补充具体内容；工程计算不能代表本主题。'),
    row('数学','函数与建模','已有应用案例','U18A模型与残差；不代表完整函数课程。'),
    row('数学','几何与三角','已有应用案例','U18A位置与三角关系；具体方法按选课。'),
    row('数学','统计与概率','已有应用案例','U18A异常值与测试数据；只关联统计部分，概率仍需补充。'),
    row('数学','微积分','已有应用案例','U18A速度变化与曲线面积；仅限已学内容的条件性应用。'),
    row('科学／物理','运动、力与能量','已有应用案例','U18A运动模型与能量测试；刚体转动仅作HL条件性拓展。'),
    row('科学／物理','电流与电路','已有应用案例','U18A动态电机负载；不是固定电阻的简单替代。'),
    row('科学／物理','热与物质粒子模型','可拓展','可研究电机温升；尚无热学模型案例。'),
    row('科学／物理','波动','暂未覆盖','当前未设计波动知识案例。'),
    row('科学／物理','场','暂未覆盖','使用电机不等于已学习场与感应。'),
    row('科学／物理','核与量子','暂未覆盖','当前未设计相关活动。'),
    row('科学／物理','实验与不确定度','已有应用案例','U18A测量不确定度、模型限制与个人研究证据。'),
  ],
};
const statuses: Status[] = ['已有应用案例','可拓展','暂未覆盖'];
const colors = ['#176c80','#a66a16','#d9dee3'];
export function coverageCounts(rows: Row[]) { return statuses.map(status => rows.filter(row => row.status === status).length); }

export function IBCoverage() {
  const [subject, setSubject] = useState('全部');
  return <section className={styles.panel} aria-label="IB主题关联覆盖情况">
    <h3>PYP · MYP · DP 主题关联覆盖图</h3>
    <p><strong>俱乐部自评草案 · 不是IB全课程覆盖率</strong></p>
    <p>分母是下方人工选定的主题，每项等权；只要已有一个相关活动，就计入“已有应用案例”，不代表整个主题已教完或学生已掌握。“可拓展”不计入已有覆盖。</p>
    <label>查看范围 <select value={subject} onChange={event => setSubject(event.target.value)}><option>全部</option><option>数学</option><option>科学／物理</option></select></label>
    <div className={styles.grid}>{Object.entries(coverageTopics).map(([stage, topics]) => {
      const rows = topics.filter(row => subject === '全部' || row.subject === subject);
      const counts = coverageCounts(rows);
      const first = counts[0] / rows.length * 100;
      const second = (counts[0] + counts[1]) / rows.length * 100;
      const summary = statuses.map((status,index) => `${status} ${counts[index]}/${rows.length}，${(counts[index]/rows.length*100).toFixed(1)}%`).join('；');
      return <article className={styles.card} key={stage}>
        <h4>{stage}</h4>
        <div className={styles.pie} role="img" aria-label={`${stage}：${summary}`} style={{ background: `conic-gradient(${colors[0]} 0% ${first}%, ${colors[1]} ${first}% ${second}%, ${colors[2]} ${second}% 100%)` }} />
        <p className={styles.metric}>{first.toFixed(1)}% <span>已有应用案例</span></p>
        <ul className={styles.legend}>{statuses.map((status,index) => <li key={status}><i aria-hidden="true" style={{background:colors[index]}} />{status}：{counts[index]}/{rows.length}（{(counts[index]/rows.length*100).toFixed(1)}%）</li>)}</ul>
        <details><summary>查看统计明细与判断依据</summary><ul className={styles.rows}>{rows.map(row => <li key={row.topic}><strong>{row.subject} · {row.topic}</strong><p>{row.status}</p><p>{row.basis}</p></li>)}</ul></details>
      </article>;
    })}</div>
    <details className={styles.method}><summary>统计口径、范围与官方参考</summary>
      <p>各阶段各选12项用于俱乐部规划，并非IB官方完整清单。主题粒度不同、部分跨领域，百分比不可用于比较阶段难度、考试分数或宣传完整覆盖；显示数值因四舍五入可能合计为99.9%或100.1%。分类为人工教学判断，需教研人员复核。</p>
      <p>PYP与MYP需结合学校实际单元；DP图仅为数学与物理应用概览，不包含生物、化学等其他科学选课。尚未逐项核对AA／AI、SL／HL及考试届别，因此不提供四种数学课程或物理SL／HL的独立覆盖率。条件性活动不表示每个队员均适用。</p>
      <p>本图统计“课程方案已有案例”，不是“课程已实施”。覆盖明细与七级知识点均为俱乐部教学映射；核对日期：2026-09-09。</p>
      <ul><li><a href="https://www.ibo.org/programmes/primary-years-programme/curriculum/" target="_blank" rel="noreferrer">PYP跨学科框架</a></li><li><a href="https://www.ibo.org/programmes/middle-years-programme/curriculum/mathematics/" target="_blank" rel="noreferrer">MYP数学领域</a></li><li><a href="https://www.ibo.org/programmes/diploma-programme/curriculum/mathematics/" target="_blank" rel="noreferrer">DP数学选课</a></li><li><a href="https://www.ibo.org/programmes/diploma-programme/curriculum/sciences/physics/" target="_blank" rel="noreferrer">DP物理框架</a></li></ul>
    </details>
  </section>;
}
