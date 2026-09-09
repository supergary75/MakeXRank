import { useState } from 'react';
import { CurriculumCardVisual } from './CurriculumCardVisual';
import { CurriculumRadar } from './CurriculumRadar';
import { ProgrammingSystem } from './ProgrammingSystem';
import { BuildingSystem } from './BuildingSystem';
import styles from './CurriculumSystem.module.css';

const makex = 'https://www.makex.cc/en/2026-makex';
export const competitionLevels = [
  { level: 'U9', grades: '1–2年级', event: 'Junior Botball', phase: '任务启蒙',
    rationale: '我们选择 JBC，是希望借助现场出题、现场规划路径与编写程序的任务情境，让低年级队员从小练习面对新问题、自己想办法并验证，而不只是复现教练给出的答案。',
    definition: '以机器人编程与任务挑战为载体，让学员通过搭建、运行和反复测试理解机器人如何完成目标。',
    format: '任务挑战：围绕指定场地任务编写程序并验证结果。具体活动形式以所参加的 Junior Botball 活动规程为准。',
    difficulty: '从动作顺序、行进距离和转向误差入手，把一个任务拆成能执行的小步骤。',
    goal: '在指导下完成任务，能描述程序步骤，发现失败位置并尝试修改。',
    progression: '建立“目标—操作—验证”的习惯，为限时任务规划打基础。',
    evidence: '任务演示、简单测试记录、口头说明一次修改的原因。',
    source: 'https://www.kipr.org/wp-content/uploads/2024/11/JBC-Challenge-Rules-11.2024-.pdf', sourceName: 'KIPR Junior Botball 挑战规则（2024）' },
  { level: 'U12B', grades: '3–5年级', event: 'MakeX Inspire', phase: '任务策略',
    rationale: '我们选择 Inspire，是让队员从解决一道任务，进阶到在规则与时间约束下自主安排路径和任务次序，为未来 FRC 的方案取舍与策略执行打基础。',
    definition: 'MakeX 的单任务型赛事，围绕赛季任务选择方案，强调任务理解、策略规划与执行。',
    format: '任务赛：围绕指定任务组织机器人动作。自动或手动控制要求应查阅对应赛季规则，不能一概视为全自动。',
    difficulty: '在完成任务的基础上考虑路径、次序、耗时和稳定性，而不只是让机器人动起来。',
    goal: '能理解任务约束，比较两种执行方案，并通过练习提高成功率。',
    progression: '从完成单个挑战，进阶到有约束的整场任务安排。',
    evidence: '任务路线、方案比较、耗时与成功率记录。', source: makex, sourceName: 'MakeX 2026 官方赛事介绍' },
  { level: 'U12A', grades: '4–6年级', event: 'MakeX Explorer-1', phase: '对抗入门',
    rationale: '我们选择 Explorer 作为对抗入门，是让队员第一次把机器人能力、场上变化和联盟伙伴一起考虑，开始学习 FRC 所需要的协作与临场判断。',
    definition: 'Explorer 是机器人对抗赛。Explorer-1 是俱乐部在该赛项下设置的第一阶段，不是官方独立组别。',
    format: '联盟对抗：需要面对对方机器人与动态场地。2026 博弈前线包含自动控制和手动控制阶段。',
    difficulty: '由固定任务进入动态对抗，同时协调机构、程序、驾驶与规则约束。',
    goal: '建立完整比赛流程认知，完成基础得分动作，学习联盟沟通与赛后复盘。',
    progression: '从“按计划完成任务”转向“根据场上变化做出选择”。',
    evidence: '基础动作稳定演示、完整模拟赛、角色分工与复盘记录。', source: makex, sourceName: 'MakeX 2026 官方赛事介绍' },
  { level: 'U15B', grades: '6–8年级', event: 'MakeX Explorer-2', phase: '对抗进阶',
    rationale: '我们继续选择 Explorer，是要把队员从“能参加对抗”带到“能自主排查问题、依据数据改进并与联盟配合”，而不是仅靠换赛项来提高难度。',
    definition: '沿用 Explorer 赛项，在俱乐部第二阶段提升独立开发、自动任务稳定性与联盟配合能力。',
    format: '与 Explorer-1 同属一个官方赛项；不是换一套更难的官方规则，而是提高训练深度和自主程度。',
    difficulty: '在同一比赛约束下优化得分效率、可靠性和策略，处理失误与对手干扰。',
    goal: '能独立定位常见故障，通过比赛数据调整方案，承担明确的技术或赛场角色。',
    progression: '从参与比赛，进阶到自主优化机器人和团队决策。',
    evidence: '优化前后测试对比、故障分析、联盟策略与比赛复盘。', source: makex, sourceName: 'MakeX 2026 官方赛事介绍' },
  { level: 'U15A', grades: '7–9年级', event: 'MakeX Challenge-1', phase: '大型机器人入门',
    rationale: '我们选择 Challenge，是让队员开始从“完成比赛任务”转向“为任务设计和制造机器人”，在更强对抗中学习机械、电气与控制的协同，为 FRC 整机工程打基础。',
    definition: 'Challenge 是强调大型机器人设计、搭建与编程的高强度对抗赛；“-1”为俱乐部第一培养阶段。',
    format: '高强度对抗：围绕赛季任务开发机器人，在对抗中执行得分与团队策略。具体流程按当季手册执行。',
    difficulty: '从单项机构能力拓展到整机协同，开始重视结构强度、供电、控制、安全与维护。',
    goal: '理解各子系统的关系，在教练指导下承担一个模块的设计、装配或调试。',
    progression: '从任务执行与战术优化，进阶到整机工程的基本分工。',
    evidence: '子系统方案、装配与测试记录、安全检查清单。', source: makex, sourceName: 'MakeX 2026 官方赛事介绍' },
  { level: 'U18B', grades: '7–9年级', event: 'MakeX Challenge-2', phase: '整机优化',
    rationale: '我们继续选择 Challenge，是让队员对设计、制造、联调和现场维护的结果承担责任，练习自主解决跨系统问题，衔接 FRC 的真实工程分工。',
    definition: '同属 MakeX Challenge，俱乐部第二阶段侧重整机集成、性能验证与技术责任。',
    format: '与 Challenge-1 使用对应赛季的同一赛项规则；递进体现在工程自主性和团队承担上。',
    difficulty: '处理多个子系统之间的取舍，兼顾性能、可靠性、维护效率与赛场策略。',
    goal: '能推动一个模块从方案到验证，并参与整机联调、版本迭代和现场问题排查。',
    progression: '从完成分配的模块任务，进阶到对方案和验证结果负责。',
    evidence: '设计取舍记录、整机联调报告、版本对比及维护方案。', source: makex, sourceName: 'MakeX 2026 官方赛事介绍' },
  { level: 'U18A', grades: '7–12年级', event: 'FRC', phase: '综合工程协作',
    rationale: '我们以 FRC 为培养目标，是因为它要求队员真正去“造”机器人，并在多战队联盟和高强度对抗中自主解决工程问题，把技术能力、团队协作与现场决策综合起来。',
    definition: 'FIRST Robotics Competition：团队面向年度主题开发大型机器人，将机械、电气、软件与团队协作整合为完整工程项目。',
    format: '三支战队组成联盟参与场地比赛；除机器人表现外，团队还需要组织研发、测试和赛事协作。',
    difficulty: '在赛季期限内完成跨专业集成，面对复杂接口、测试验证、版本协作与现场可靠性要求。',
    goal: '按能力承担真实团队角色，逐步参与需求分析、研发、集成测试与赛事复盘。',
    progression: '从整机优化拓展到跨专业团队的完整赛季工程。不是仅凭年级自动晋级。',
    evidence: '角色交付物、研发与测试记录、团队协作记录和赛季总结。',
    source: 'https://www.firstinspires.org/community/teams', sourceName: 'FIRST 官方团队介绍' },
];

export const curriculumModules = ['级别与比赛体系', '级别与编程体系', '级别与搭建体系', '级别与设计建模体系', '级别与学科知识对应体系'];
export const curriculumRoutes = ['curriculum-competition', 'curriculum-programming', 'curriculum-building', 'curriculum-modeling', 'curriculum-knowledge'] as const;
const descriptions = ['赛事定义、比赛方式、难度与七级进阶路径', '编程语言、开发工具与控制能力', '工具使用、机械结构与装配调试', '设计表达、零件建模与工程图纸', '机器人项目中的数学、物理及相关知识'];

export function CurriculumSystem({ module = -1, onOpen }: { module?: number; onOpen: (route: typeof curriculumRoutes[number]) => void }) {
  const [selected, setSelected] = useState(0);
  const item = competitionLevels[selected];
  return <section id="curriculum-system" className={`${styles.root} ${module < 0 ? styles.silverLanding : ''}`} aria-labelledby="curriculum-title">
    <header><p className={styles.eyebrow}>CURRICULUM / 课程体系</p><h2 id="curriculum-title">{module < 0 ? '五个维度，构建成长路径' : curriculumModules[module]}</h2></header>
    {module < 0 ? <nav className={styles.modules} aria-label="课程体系模块">{curriculumModules.map((name, i) =>
      <button key={name} type="button" onClick={() => onOpen(curriculumRoutes[i])}><small>0{i + 1}</small><CurriculumCardVisual index={i} /><strong>{name}</strong><p>{descriptions[i]}</p><span>{i > 2 ? '待编写 · 进入模块 →' : i === 2 ? '查看搭建培养草案 →' : i === 1 ? '查看编程培养草案 →' : '查看七级比赛体系 →'}</span></button>
    )}</nav> : module === 1 ? <ProgrammingSystem /> : module === 2 ? <BuildingSystem /> : module !== 0 ? <div className={styles.empty}><p>尚未录入正式课程内容，后续按七个级别分别编写。</p></div> : <>
      <div className={styles.progression}><h4>以 FRC 为目标，倒推每一级的锻炼</h4><p>我们的赛事选择，不只是按年龄由易到难排列，而是从 FRC 所需的自主解决问题、机器人设计制造、联盟协作与对抗决策能力出发，把训练拆解到每一个成长阶段。</p></div>
      <p className={styles.note}>七个级别为俱乐部培养路径，年级由俱乐部设定，不等同于赛事报名资格。“-1 / -2”表示内部培养阶段。以下培养目标与难度说明为课程草案，非官方难度评级。</p>
      <div className={styles.path} aria-label="选择培养级别">{competitionLevels.map((level, i) =>
        <button key={level.level} type="button" aria-pressed={selected === i} onClick={() => setSelected(i)}><small>0{i + 1}</small><strong>{level.level}</strong><span>{level.grades}</span><b>{level.phase}</b></button>
      )}</div>
      <article className={styles.detail} aria-live="polite">
        <div className={styles.title}><div><p className={styles.eyebrow}>{item.level} · {item.grades}</p><h3>{item.event}</h3></div><span>{item.phase}</span></div>
        <section className={styles.rationale}><h4>为什么我们选择这个比赛？</h4><p>{item.rationale}</p>{item.level === 'U9' && <small>这里采用俱乐部所描述的现场任务情境；是否现场出题，以实际参加活动的规程为准。</small>}</section>
        <CurriculumRadar level={item.level} />
        <div className={styles.columns}>
          <section><h4>赛事定义与比赛方式</h4><p>{item.definition}</p><p>{item.format}</p><a href={item.source} target="_blank" rel="noreferrer">{item.sourceName} ↗</a></section>
          <section><h4>赛项难点 · 俱乐部培养解读</h4><p>{item.difficulty}</p><h4>本级培养目标 · 草案</h4><p>{item.goal}</p></section>
        </div>
        <div className={styles.progression}><h4>这一阶段，进阶在哪里？</h4><p>{item.progression}</p><p><strong>建议观察成果：</strong>{item.evidence}</p></div>
      </article>
      <p className={styles.note}>资料核对：2026-09-08。具体时长、任务、器材和参赛资格以当季官方手册及活动通知为准；U18A 的低年级学员可先进行预备培养，正式参赛资格须另行核对。晋级应结合能力评估，不仅看年级或参赛次数。</p>
    </>}
  </section>;
}
