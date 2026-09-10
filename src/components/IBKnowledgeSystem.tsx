import { useState } from 'react';
import styles from './CurriculumSystem.module.css';
import { ibSubjectDetails, type SubjectPoint } from './ibSubjectDetails';
import { IBCoverage } from './IBCoverage';

function SubjectDetails({ title, points }: { title: string; points: SubjectPoint[] }) {
  return <section><h4>{title}</h4>{points.map((point, index) => <details key={point.topic} open={index === 0} style={{ marginBottom:12, padding:12, border:'1px solid #9dacb9', borderRadius:8 }}>
    <summary style={{ cursor:'pointer', fontWeight:700 }}>{point.topic}</summary>
    <p className={styles.note}>{point.scope}</p><p><strong>机器人中怎么用：</strong>{point.use}</p><p><strong>学会的证据：</strong>{point.evidence}</p>
  </details>)}</section>;
}

export const ibLevels = [
  { level:'U9', grades:'1–2年级', stage:'PYP', event:'Junior Botball',
    focus:'从好奇出发：提出一个问题，动手试一试，再说出发现。',
    math:'俱乐部建议：计数、长度、位置与简单图形。用格数和实测距离描述路线，不提前要求比例和运动公式。',
    science:'观察推拉、转动与材料差异；问“为什么机器人没有停在目标处？”，用重复尝试寻找原因。',
    making:'纯图形化编程＋LEGO结构：画路径、搭轮轴、排列动作，让自己的想法成为能运行的模型。',
    project:'送物小助手：先画一条路线，试运行三次，记录停点，再自主选择一个地方改进。',
    evidence:'带图的探究记录、口头解释与修改前后展示；关注孩子的选择和解释，而不只看是否得分。',
    boundary:'PYP 是跨学科框架，不是一套统一的机器人教学大纲；本活动由学校探究单元决定如何关联。' },
  { level:'U12B', grades:'3–5年级', stage:'PYP', event:'MakeX Inspire',
    focus:'从“做出来”到“比较方案”：用数据支持自己的选择。',
    math:'俱乐部建议：测量、运算、图形与数据表示；比较两条路线的时间和成功次数，按已学知识选用平均值或比例表达。',
    science:'比较摩擦、连接牢固程度和材料表现；保持任务与载荷相同，逐步形成公平比较的意识。',
    making:'纯图形化控制；Makeblock金属件、紧固件及3D打印件。先画尺寸草图，再搭建齿条或连杆模型。',
    project:'物品推送挑战：小组提出两种推送结构，各测试五次，讨论哪一种更适合目标使用者。',
    evidence:'方案草图、测试表、选择理由和同伴反馈；教练记录沟通与合作过程。',
    boundary:'以PYP学习方式为主要参考；较年长队员若已进入MYP，按学校实际阶段调整，不能只看U12名称。' },
  { level:'U12A', grades:'4–6年级', stage:'PYP／MYP衔接', event:'MakeX Explorer-1',
    focus:'把探究问题变成可测试的设计目标，开始解释方案取舍。',
    math:'俱乐部建议：尺寸、角度、数据与已学比例；用场地草图描述位置，用重复测试比较自动停靠表现。',
    science:'把“运行更稳定”拆成可观察的结果，区分猜想与测试证据；未学公式时保留测量与比较。',
    making:'纯图形化；金属、打印件及俱乐部提供板材。PYP队员强调表达与探索，MYP队员开始记录需求、备选方案和评价。',
    project:'联盟停靠装置：画出接口尺寸，比较两个导向方案，测试能否在允许范围内停靠。',
    evidence:'PYP：探究图册与口头反思；MYP：需求说明、方案比较、制作记录与测试评价。',
    boundary:'PYP与MYP年龄范围有重叠。先确认实际在读项目；不把所有4–6年级学生统一标为MYP。' },
  { level:'U15B', grades:'6–8年级', stage:'MYP为主', event:'MakeX Explorer-2',
    focus:'用设计循环与科学探究，把一次调试变成有证据的改进。',
    math:'俱乐部建议：变量、坐标、几何与数据趋势；按学校进度用表格或函数描述参数与结果。',
    science:'提出可检验问题，控制条件、记录测量结果，评价误差与其他可能解释。',
    making:'图形化＋Python认知；金属传动、打印与板材样件。用“探究分析—发展想法—制作方案—评价”整理设计过程。',
    project:'直行纠偏研究：一次只改变一个参数或结构条件，记录终点分布，提出并验证改进方案。',
    evidence:'研究问题、原始数据、图表、设计过程记录与局限说明；个人写清自己承担的工作。',
    boundary:'6年级可能仍在PYP末段；MYP年次与数学层次由学校确认。项目不是IB正式评分任务。' },
  { level:'U15A', grades:'7–9年级', stage:'MYP', event:'MakeX Challenge-1',
    focus:'为真实任务制定设计指标，独立负责一个子系统。',
    math:'俱乐部建议：代数、几何与统计应用；用尺寸约束和实测数据解释传动或行程选择，不默认已学高中内容。',
    science:'联系运动、力、能量与电路的相关校内内容；通过实验比较方案，讨论损耗和结果可信度。',
    making:'图形化与Python并行；升降或夹持机构从草图到样件，记录材料选择、装配问题和评价依据。',
    project:'设计可维护的升降模块：先设定行程、载荷和维护需求，再制作、测试并依据结果修改。',
    evidence:'设计要求、备选方案、加工装配记录、数据和反思；看思考过程，不用比赛名次替代评价。',
    boundary:'MYP数学、科学和设计的具体单元由学校安排；本映射提供活动建议，不承诺覆盖各科全部目标。' },
  { level:'U18B', grades:'7–9年级', stage:'MYP', event:'MakeX Challenge-2',
    focus:'从单个机构到整机协作，形成可追溯的工程论证。',
    math:'俱乐部建议：用已有函数、几何和统计知识分析整机表现；用相同测试条件比较版本。',
    science:'研究载荷、能量供应与机构运动之间的关系，识别变量相互影响，避免仅凭一次成功下结论。',
    making:'Python控制、复合材料与整机装配；建立接口要求、版本记录及测试评价，强化设计循环的迭代。',
    project:'连续任务可靠性：重复完整任务，分类记录故障，选择一个主要问题改进后再复测。',
    evidence:'个人贡献记录、故障统计、版本对比与反思；可与学校讨论作为个人项目的探究起点。',
    boundary:'U18B在本俱乐部仍为7–9年级，不因名称含U18就对应DP。MYP个人项目属于最终学年要求，须由学校确认资格与监督；团队作品不能直接替代个人项目。' },
  { level:'U18A', grades:'7–12年级', stage:'MYP／DP分轨', event:'FRC',
    focus:'同一支战队，不同学段：以适合自己的研究深度承担工程角色。',
    math:'MYP轨：测量、几何、代数与数据解释。DP轨：依据实际选修的AA或AI及SL/HL，讨论函数模型、几何关系与统计分析；不由参赛级别决定选课。',
    science:'MYP轨：设计实验、处理数据和评价局限。DP物理轨：把实验和模型用于运动、力与能量等已学主题，并检查测量与模型限制。',
    making:'Java与整机研发；MYP轨强调设计过程与验证，DP轨可按学校开设的Design Technology关联需求、原型和系统评价。Java不是IB统一指定语言。',
    project:'进料—升降系统：基础组记录尺寸与重复测试；进阶组建立模型，解释实测偏差，明确个人研究问题与贡献。',
    evidence:'分角色日志、独立分析、模型假设、测试结果及改进论证；每名队员提交可区分的个人成果。',
    boundary:'仅实际就读DP的队员进入DP轨；其余按MYP或实际学校课程衔接。IA、EE、CAS和个人项目须事先由学校审核，并遵守独立性与学术诚信要求；参赛不自动换取学分、认证或成绩。' },
];

const sources = [
  ['PYP官方框架（3–12岁）','https://www.ibo.org/programmes/primary-years-programme/'],
  ['MYP课程与学科组','https://www.ibo.org/programmes/middle-years-programme/curriculum/'],
  ['MYP数学简介（11–16岁）','https://www.ibo.org/globalassets/new-structure/brochures-and-infographics/pdfs/myp-brief-mathematics-en.pdf'],
  ['MYP科学探究','https://ibo.org/programmes/middle-years-programme/curriculum/science/'],
  ['IB研究报告：计算思维与设计循环','https://www.ibo.org/contentassets/318968269ae5441d8df5ae76542817a0/ct-and-dt-full-report.pdf'],
  ['MYP个人项目','https://www.ibo.org/programmes/middle-years-programme/assessment-and-exams/personal-project/'],
  ['DP课程框架','https://www.ibo.org/programmes/diploma-programme/curriculum/'],
  ['DP数学AA／AI与SL／HL','https://www.ibo.org/programmes/diploma-programme/curriculum/mathematics/'],
  ['DP物理','https://www.ibo.org/programmes/diploma-programme/curriculum/sciences/physics/'],
  ['DP设计技术','https://www.ibo.org/programmes/diploma-programme/curriculum/sciences/design-technology/'],
] as const;

export function IBKnowledgeSystem() {
  const [selected, setSelected] = useState(0);
  const item = ibLevels[selected];
  return <section aria-label="IB课程级别对应">
    <h3>IB课程体系对应 · PYP / MYP / DP</h3>
    <IBCoverage />
    <p className={styles.note}>官方年龄范围：PYP 3–12岁、MYP 11–16岁、DP 16–19岁。下表是俱乐部按现有年级设计的教学关联，不是IB官方等值表。以队员实际就读项目、学校单元与已学知识为准。</p>
    <div className={styles.columns}><section><h4>PYP · 探究与表达</h4><p>以跨学科探究组织学习；机器人活动为孩子提供提问、选择、试验和分享的情境。</p></section><section><h4>MYP · 学科与设计循环</h4><p>关联数学、科学和设计，逐步记录从问题到方案、制作与评价的过程。</p></section><section><h4>DP · 按选课深化</h4><p>根据实际科目与层次开展建模、实验和设计分析，不把一场机器人比赛等同于DP课程。</p></section></div>
    <details><summary>查看七级与IB阶段对应总览</summary><div style={{ overflowX:'auto' }}><table><thead><tr><th scope="col">俱乐部级别</th><th scope="col">年级</th><th scope="col">建议关联阶段</th><th scope="col">赛事</th></tr></thead><tbody>{ibLevels.map(row => <tr key={row.level}><th scope="row">{row.level}</th><td>{row.grades}</td><td>{row.stage}</td><td>{row.event}</td></tr>)}</tbody></table></div></details>
    <nav className={styles.path} aria-label="选择IB对应级别">{ibLevels.map((row,i) => <button key={row.level} type="button" aria-pressed={selected === i} onClick={() => setSelected(i)}><strong>{row.level}</strong><span>{row.grades}</span><b>{row.stage}</b></button>)}</nav>
    <article className={styles.detail} aria-live="polite">
      <div className={styles.title}><div><p className={styles.eyebrow}>{item.level} · {item.grades} · {item.event}</p><h3>{item.stage}</h3></div><span>俱乐部教学关联</span></div>
      <section className={styles.rationale}><h4>本级培养重点</h4><p>{item.focus}</p></section>
      <p className={styles.note}>以下是俱乐部设计的具体学习活动，不是IB逐年级必修清单。点击知识点展开用法与成果；请按实际学校单元选择，未学知识先做直观体验。</p>
      <div className={styles.columns} key={item.level}><SubjectDetails title="数学关联 · 知识到应用" points={ibSubjectDetails[item.level].math} /><SubjectDetails title="科学／物理关联 · 探究到验证" points={ibSubjectDetails[item.level].science} /></div>
      <section className={styles.progression}><h4>编程、搭建与设计</h4><p>{item.making}</p><h4>建议项目</h4><p>{item.project}</p><h4>学习证据</h4><p>{item.evidence}</p></section>
      <p className={styles.note}><strong>适用边界：</strong>{item.boundary}</p>
    </article>
    <details><summary>官方依据与使用说明</summary><p>核对日期：2026-09-09。依据IB公开项目及学科介绍整理；部分网页限制直接抓取，已结合官方可检索摘要核对框架。本页不提供正式评分细则或逐单元覆盖认证，实施时须核对学生考试届别及学校适用指南。</p><ul>{sources.map(([label,url]) => <li key={url}><a href={url} target="_blank" rel="noreferrer">{label} ↗</a></li>)}</ul><p className={styles.note}>所有赛事任务、语言路线、材料安排及成果建议均为俱乐部原创教学映射。PYP、MYP、DP不是机器人难度等级；本页面不表示俱乐部获得IB授权或官方背书。加工与电路活动仍需培训、监督及安全授权。</p></details>
  </section>;
}
