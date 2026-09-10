import { useState } from 'react';
import styles from './IBCoverage.module.css';

type Status = '已有应用案例' | '可拓展' | '暂未覆盖';
type Topic = { subject: string; name: string; status: Status; evidence: string };
const topic = (subject: string, name: string, status: Status, evidence: string): Topic => ({ subject, name, status, evidence });
export const nationalCoverageTopics: Record<string, Topic[]> = {
  '小学 · 1–6年级': [
    topic('数学','数与运算','已有应用案例','U9路线分段计数；U12B重复任务与运算。'),
    topic('数学','测量与平面图形','已有应用案例','U9路径图；U12B尺寸、孔距与角度草图。'),
    topic('数学','分数、百分数与比例','已有应用案例','U12A按已学进度关联任务数据、比例布局；不是全主题覆盖。'),
    topic('数学','圆与立体图形','已有应用案例','U12A轮周长估算、材料用量与简单三维模型。'),
    topic('数学','数据整理与表示','已有应用案例','U12B五次推送测试；U12A终点分布记录。'),
    topic('数学','规律探索与综合问题','可拓展','可增加明确的规律预测任务；目前尚无独立活动和评价证据。'),
    topic('科学／物理','材料与物体特征','已有应用案例','U9材料观察；U12A材料质量、刚性与摩擦比较。'),
    topic('科学／物理','运动与力','已有应用案例','U9推拉观察；U12B机构运动比较。'),
    topic('科学／物理','能量与简单电路','可拓展','U12A已列主题关联，尚需补充专门电路实验与学习证据。'),
    topic('科学／物理','探究与技术设计','已有应用案例','尺寸草图、相同条件测试、方案选择与改进。'),
    topic('科学／物理','生命科学','暂未覆盖','当前机器人项目未提供相应活动。'),
    topic('科学／物理','地球与宇宙','暂未覆盖','当前机器人项目未提供相应活动。'),
  ],
  '初中 · 7–9年级': [
    topic('数学','数与代数运算','可拓展','已列代数知识衔接，尚需独立计算活动；不能将变量使用算作完整代数学习。'),
    topic('数学','方程与数量关系','可拓展','可补充用方程求行程或参数的任务，现有项目尚未明确求解过程。'),
    topic('数学','函数与坐标','已有应用案例','U15B参数—结果图和孔位坐标；按学校已学进度使用。'),
    topic('数学','几何与空间关系','已有应用案例','U15A行程及装配空间；U18B接口尺寸和整机布局。'),
    topic('数学','统计与概率','已有应用案例','U18B连续任务故障统计；仅统计部分，概率模型尚未覆盖。'),
    topic('数学','数学证明','可拓展','工程方案解释不等于数学证明，需增加推理论证活动。'),
    topic('科学／物理','运动与力','已有应用案例','U15B控制变量研究；U15A升降载荷与变形观察。'),
    topic('科学／物理','简单机械、功与能','已有应用案例','U15A升降传动选型与损耗解释，计算按已学知识加入。'),
    topic('科学／物理','电路与电学','已有应用案例','U18B规定载荷下记录电压；仅部分电学应用。'),
    topic('科学／物理','声、光与热','暂未覆盖','尚无专门项目；使用传感器不代表理解其物理原理。'),
    topic('科学／物理','实验与数据评价','已有应用案例','U15B控制变量与偏差图；U18B同条件版本对比。'),
    topic('科学／物理','物质结构与相关物理主题','暂未覆盖','当前无专门学习活动。'),
  ],
  '高中 · 10–12年级': [
    topic('数学','函数与模型','已有应用案例','U18A进阶组提升时间模型及实测比较；仅项目相关部分。'),
    topic('数学','三角函数与向量','已有应用案例','U18A已学队员结合方向和速度验证运动模型。'),
    topic('数学','空间几何','已有应用案例','U18A子系统接口与三维装配验证；不等同完整空间几何课程。'),
    topic('数学','概率与统计','已有应用案例','U18A重复测试与曲线；仅描述性数据应用，概率理论仍需补充。'),
    topic('数学','数列与不等式','暂未覆盖','当前没有专门案例。'),
    topic('数学','导数与进阶分析','可拓展','可增加运动曲线分析，须按实际课程模块安排；现有新课标案例未展开。'),
    topic('科学／物理','运动规律与牛顿定律','已有应用案例','U18A进阶组运动、载荷模型及实测反馈；不是全部力学内容。'),
    topic('科学／物理','功与能','已有应用案例','U18A进料—升降项目的能量估算与损耗比较。'),
    topic('科学／物理','动量','可拓展','目前仅列知识关联，需另设安全实验和计算证据。'),
    topic('科学／物理','电路与电磁学','可拓展','需要高中层次的定量实验；初中电压记录不能直接算高中覆盖。'),
    topic('科学／物理','热、波动、光及近代物理','暂未覆盖','尚未形成相关项目，此处为合并展示项。'),
    topic('科学／物理','实验与模型评价','已有应用案例','U18A计算假设、测试曲线与模型偏差解释。'),
  ],
};
const statuses: Status[] = ['已有应用案例', '可拓展', '暂未覆盖'];
const colors = ['#176c80', '#a66a16', '#d9dee3'];
export function nationalCoverageCounts(rows: Topic[]) {
  return statuses.map(status => rows.filter(row => row.status === status).length);
}

export function NationalCoverage() {
  const [subject, setSubject] = useState('全部');
  return <section className={styles.panel} aria-label="新课标主题关联覆盖情况">
    <h3>新课标 · 学段主题关联覆盖图</h3>
    <p><strong>俱乐部自评草案，不是国家课标全量覆盖率或学生掌握率。</strong></p>
    <p>按小学、初中、高中分别统计下方选定主题：已有相关项目案例才计入已有覆盖，仅列出知识名称或未来建议不计入。每个主题等权，部分主题只涉及其中一部分内容。</p>
    <label>查看范围 <select value={subject} onChange={event => setSubject(event.target.value)}><option>全部</option><option>数学</option><option>科学／物理</option></select></label>
    <div className={styles.grid}>{Object.entries(nationalCoverageTopics).map(([stage, topics]) => {
      const rows = topics.filter(row => subject === '全部' || row.subject === subject);
      const counts = nationalCoverageCounts(rows);
      const first = counts[0] / rows.length * 100;
      const second = (counts[0] + counts[1]) / rows.length * 100;
      const summary = statuses.map((status, i) => `${status} ${counts[i]}/${rows.length}（${(counts[i]/rows.length*100).toFixed(1)}%）`).join('；');
      return <article className={styles.card} key={stage}>
        <h4>{stage}</h4>
        <div className={styles.pie} role="img" aria-label={`${stage}：${summary}`} style={{background:`conic-gradient(${colors[0]} 0% ${first}%, ${colors[1]} ${first}% ${second}%, ${colors[2]} ${second}% 100%)`}} />
        <p className={styles.metric}>{first.toFixed(1)}%<span>所选主题已有应用案例</span></p>
        <ul className={styles.legend}>{statuses.map((status, i) => <li key={status}><i aria-hidden="true" style={{background:colors[i]}} />{status}：{counts[i]}/{rows.length}（{(counts[i]/rows.length*100).toFixed(1)}%）</li>)}</ul>
        <details><summary>查看主题明细与判断依据</summary><ul className={styles.rows}>{rows.map(row => <li key={row.name}><strong>{row.subject} · {row.name}</strong><p>{row.status}</p><p>{row.evidence}</p></li>)}</ul></details>
      </article>;
    })}</div>
    <details className={styles.method}><summary>统计口径与使用边界</summary>
      <p>每学段人工选取12个主题，数学和科学／物理各6项。主题划分是俱乐部规划用的简化清单，不是官方完整目录；主题粒度和合并方式会影响比例，不能用来比较学段难度或宣称课标覆盖百分比。比例由所显示条目自动计算，四舍五入可能使合计偏离100%。</p>
      <p>小学统计数学与科学；初高中统计数学与物理，不包含初高中生物、化学等其他科学学科。高中尚未逐项拆分必修、选择性必修与选修，也未按修订课标条文计数。</p>
      <p>U12A、U15B、U18A跨学段，案例只按相应年级的已学知识选用；不表示某个队员完成了整个学段。图表是课程方案的人工关联评价，未经实际教学成效验证。课标依据和修订说明见本页末尾，定稿前需教研人员按学校教材及适用版本复核。</p>
    </details>
  </section>;
}
