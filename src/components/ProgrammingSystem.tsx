import { useState } from 'react';
import { ProgrammingAlgorithms } from './ProgrammingAlgorithms';
import { programmingExamples } from './programmingExamples';
import { ProgrammingExampleDiagram } from './ProgrammingExampleDiagram';
import styles from './CurriculumSystem.module.css';

const levels = [
  { level: 'U9', grades: '1–2年级', title: '把想法变成步骤', event: 'Junior Botball', why: '从 FRC 的自主解题能力倒推，先让队员学会把路径问题拆成程序步骤，并根据机器人实际表现修改自己的方案。', concepts: ['顺序执行与动作指令', '距离、转向与参数', '重复动作与循环启蒙'], task: '面对一条新路径，先说出步骤，再编程完成行进、转向与到达目标。', debug: '对照预期与实际路径，找出偏差发生在哪一步，每次只改一个参数。', outcome: '能解释程序顺序，在提示下定位并修正一次路径偏差。', next: '由单段动作转向多步骤任务，建立条件与反馈的认识。' },
  { level: 'U12B', grades: '3–5年级', title: '组织任务与条件判断', event: 'MakeX Inspire', why: '让队员不只会写一段动作，还能把多个任务组织成清晰流程，为后续机器人自主控制建立逻辑基础。', concepts: ['变量、循环与条件判断', '传感器输入与动作输出', '任务拆分与可复用函数'], task: '把一个任务拆成移动、判断、执行和结束几个部分，比较不同顺序的效果。', debug: '记录条件是否满足、传感器读数与执行结果，区分逻辑错误和参数问题。', outcome: '能解释一个判断条件，复用一段程序，并用测试记录比较两种方案。', next: '从顺序执行任务，转向手动输入、自动动作与异常状态的协调。' },
  { level: 'U12A', grades: '4–6年级', title: '建立整机控制逻辑', event: 'MakeX Explorer-1', why: '让队员开始统筹驾驶输入、机构动作与自动任务，理解机器人程序不是孤立的指令，而是一套协同工作的控制逻辑。', concepts: ['输入映射与机构控制', '自动任务的阶段划分', '状态、边界与安全停止'], task: '实现基础驾驶和一个得分机构的控制，再完成一段可重复运行的自动流程。', debug: '分开测试底盘与机构，检查输入、状态和输出是否符合预期。', outcome: '能独立修改常规控制逻辑，说明自动流程的开始、执行和结束条件。', next: '从功能可用转向闭环思维、稳定性测试和模块化维护。' },
  { level: 'U15B', grades: '6–8年级', title: '让控制稳定且可复用', event: 'MakeX Explorer-2', why: '同一赛项继续深入，是为了让队员用反馈和测试解决不稳定问题，而不是靠反复试参数或增加代码堆出功能。', concepts: ['目标、反馈与误差', '闭环控制入门与参数调试', '状态机、模块化与日志'], task: '选择一个移动或机构任务，加入反馈，比较优化前后的误差和成功率。', debug: '记录目标值、实际值和异常状态，基于数据定位原因并回归测试。', outcome: '能解释反馈如何影响输出，给出多次测试结果，并维护可复用模块。', next: '从单任务优化转向多机构协同和结构清晰的整机软件。' },
  { level: 'U15A', grades: '7–9年级', title: '构建模块化机器人软件', event: 'MakeX Challenge-1', why: '为 FRC 的跨专业工程分工做准备，让队员把机构需求转化为可测试的软件模块，并与机械、电气成员约定接口。', concepts: ['模块职责与接口设计', '多机构状态协调与互锁', '代码版本与变更记录'], task: '为一个机构编写控制模块，定义输入、输出、状态和异常处理，并与整机联调。', debug: '先独立验证模块，再检查接口与时序，确保异常时能停止或恢复。', outcome: '能交付带接口说明和测试记录的模块，在协作中解释自己的修改。', next: '从模块开发转向整机调度、系统诊断与自动流程优化。' },
  { level: 'U18B', grades: '7–9年级', title: '整机集成与可靠性', event: 'MakeX Challenge-2', why: '让队员对整机程序的结果负责，在多机构、自动流程和现场故障之间做系统判断，衔接 FRC 的软件工程责任。', concepts: ['任务调度与状态管理', '反馈控制的调试与取舍', '故障诊断、回归测试与版本协作'], task: '整合多个机构完成连续任务，设计超时、故障处理和手动接管条件。', debug: '根据日志复现故障，区分软件、传感器和机构问题，修复后验证其他功能未受影响。', outcome: '能参与整机集成，完成一次有证据的故障修复，并保留可追溯的版本记录。', next: '从整机可用转向完整赛季的研发、验证与团队交付。' },
  { level: 'U18A', grades: '7–12年级', title: '面向 FRC 的软件工程', event: 'FRC', why: '把编程变成解决真实工程问题的工具，让队员在团队中承担需求、实现、验证和维护责任，而不只是掌握一种语言。', concepts: ['子系统抽象与任务调度', '自动流程、反馈控制与数据分析', '团队代码协作、测试与赛季维护'], task: '按团队分工负责一个子系统或自动任务，从需求讨论到实现、测试和赛场支持完成交付。', debug: '结合日志与实车测试验证假设，记录性能边界，并与其他专业共同定位问题。', outcome: '形成可维护的代码、测试证据和交接文档；按实际能力逐步承担责任，而非入班即要求全部掌握。', next: '持续深化控制、感知与工程协作，依据赛季需求选择专项方向。' },
];

const programmingPlan = [
  { language: '纯图形化', knowledge: '从直观动作、方向、距离和简单数量关系出发，先观察和操作，再用自己的话解释。', focus: '顺序执行、动作参数与重复动作；不要求书写文本代码。', task: '用图形积木完成一条新路径，调整行进或转向参数，并说明修改原因。', outcome: '能排列动作步骤，运行程序，并在提示下修正明显偏差。' },
  { language: '纯图形化', knowledge: '结合已经掌握的四则运算、测量与分类，用实物读数理解变量和条件。', focus: '变量、循环、条件判断、传感器反馈与函数封装，均通过图形化表达。', task: '把任务拆成几个积木模块，选择执行次序，并用传感器条件触发动作。', outcome: '能解释一个判断条件，复用程序模块，并比较两种任务方案。' },
  { language: '纯图形化', knowledge: '结合已学的小数、比例、角度和测量，用实际运动结果理解参数关系。', focus: '图形化函数封装、状态切换、手动输入与自动流程，不提前要求Python代码。', task: '用图形化完成底盘和机构控制，编排一段有明确开始与结束条件的自动任务。', outcome: '能独立调整常规控制逻辑，形成结构清晰、可重复运行的自动流程。' },
  { language: '图形化＋Python认知', knowledge: '结合正负数、坐标及数据图表等已学知识，将图形逻辑与文本表达逐项对应。', focus: '主要任务仍使用图形化；认识Python变量、条件、循环和函数，先看懂短代码，不要求独立编写整机程序。', task: '对照同一任务的积木与Python片段，指出对应关系，修改简单参数并观察结果。', outcome: '能读懂熟悉任务的短代码，解释与积木的对应关系，并说明参数修改的影响。' },
  { language: '图形化＋Python代码 · 两者兼容', knowledge: '结合已学的代数、函数和运动知识理解反馈；未掌握的概念先通过实验与图像建立直觉。', focus: '同一任务支持两种方式对照实现，逐步将熟悉的图形化模块改写为Python；学习函数、模块接口与状态管理。', task: '先用图形化验证一个机构动作，再用Python实现同一功能，对比输入、输出和异常处理。', outcome: '能改写熟悉模块并调试完整机构控制程序，解释两种实现的共同逻辑。' },
  { language: 'Python代码控制', knowledge: '根据队员实际基础运用函数、数据图表与反馈误差，不以超前数学知识作为入门门槛。', focus: '以Python完成控制，不再依赖积木；深化模块划分、状态机、异常处理、日志和整机协同。', task: '用Python整合多个机构完成连续任务，设置超时、故障处理和手动接管条件。', outcome: '独立开发和维护控制模块，参与整机联调，并以测试数据验证修复与优化效果。' },
  { language: 'Java（U18A及以后）', knowledge: '7–12年级分层安排：先迁移熟悉的程序逻辑，再按数学、物理基础逐步深化控制算法和工程分析。', focus: '从Python迁移到Java类型、类与对象，再进入机器人子系统、任务调度、版本协作和工程测试。', task: '先用Java复现已有功能，再按团队分工负责一个子系统或自动任务的实现、验证和维护。', outcome: '交付可维护的Java代码、测试证据和交接文档，形成需求到维护的工程闭环。' },
];

const simpleOutcomes = [
  ['把路线说成清楚的步骤', '用积木让机器人完成动作', '发现走偏并尝试调整'],
  ['让机器人根据情况选择动作', '把重复的步骤组合起来', '比较哪种路线更合适'],
  ['控制机器人移动和取放', '安排一段完整的自动任务', '出现问题时让机器人停止'],
  ['看懂一小段Python的意思', '修改参数并解释变化', '用测试记录判断是否改善'],
  ['把熟悉的积木程序改写为Python', '用两种方式完成相同任务', '找出问题并验证修改'],
  ['用Python控制多个机构', '根据记录找到失败原因', '修改后检查其他功能仍正常'],
  ['用Java完成团队分配的功能', '让代码便于队友使用和维护', '用测试证明功能可靠'],
];
const simpleGoals = ['让孩子把一条路线，变成机器人能执行的步骤。', '让孩子学会告诉机器人：遇到不同情况，该做什么。', '让孩子把移动和取放动作，组织成一个完整任务。', '让孩子从“拼积木编程”，走向“看懂简单代码”。', '让孩子把熟悉的积木逻辑，写成能运行的Python。', '让孩子用Python，让机器人的多个部分配合工作。', '让队员用Java，与团队一起完成可靠的机器人功能。'];

export function ProgrammingSystem() {
  const [selected, setSelected] = useState(0);
  const item = levels[selected];
  const plan = programmingPlan[selected];
  return <>
    <p>从图形积木到代码开发，看看每一级能学会做什么。</p>
    <p className={styles.note}>语言路线已确认 · 教学内容草案，待继续调整。</p>
    <div className={styles.path} aria-label="选择编程培养级别">{levels.map((level, i) => <button key={level.level} type="button" aria-pressed={selected === i} onClick={() => setSelected(i)}><small>0{i + 1}</small><strong>{level.level}</strong><span>{level.grades}</span><b>{level.title}</b></button>)}</div>
    <article key={selected} className={styles.detail} aria-live="polite">
      <div className={styles.title}><div><p className={styles.eyebrow}>{item.level} · {item.grades} · {item.event}</p><h3>{item.title}</h3></div><span>培养内容草案</span></div>
      <section className={styles.rationale}><h4>{simpleGoals[selected]}</h4><p>编程方式：{plan.language}</p></section>
      <h4>学完能做到什么？</h4>
      <ul>{simpleOutcomes[selected].map(outcome => <li key={outcome}>{outcome}</li>)}</ul>
      <section className={styles.progression}><h4>看一个例子：{programmingExamples[selected][0].title}</h4><p>{programmingExamples[selected][0].task}</p><ProgrammingExampleDiagram levelIndex={selected} exampleIndex={0} title={programmingExamples[selected][0].title} /><p className={styles.note}>教学示例，非官方赛题；实机测试由教练监督并准备可靠的停止方式。</p>
        <details className={styles.radarScale}><summary>这个案例怎么教、怎么看结果？</summary><p><strong>程序思路：</strong>{programmingExamples[selected][0].method}</p><p><strong>验收：</strong>{programmingExamples[selected][0].check}</p><p><strong>进阶挑战：</strong>{programmingExamples[selected][0].extension}</p></details>
      </section>
      <details className={styles.radarScale}><summary>查看教学细节：学习依据、算法与验收标准</summary>
      <section className={styles.rationale}><h4>为什么这一阶段学习这些内容？</h4><p>{item.why}</p></section>
      <section className={styles.rationale}><h4>编程方式：{plan.language}</h4><p>{plan.focus}</p><h4>年龄与学科学习特点</h4><p>{plan.knowledge}</p></section>
      <div className={styles.columns}>
        <section><h4>核心编程能力</h4><ul>{item.concepts.map(concept => <li key={concept}>{concept}</li>)}</ul><h4>工具与硬件 · 待确认</h4><p>开发环境、机器人主控及可用接口需进一步核对，尤其是Python代码控制的实际支持情况。</p>{selected === 4 && <p>“两者兼容”指同一硬件平台支持两种开发方式、同一任务可对照实现；不承诺图形与Python自动双向转换。</p>}</section>
        <section><h4>建议实践任务</h4><p>{plan.task}</p><h4>调试与验证习惯</h4><p>{item.debug}</p></section>
      </div>
      <div className={styles.progression}><h4>建议阶段成果</h4><p>{plan.outcome}</p><h4>下一步进阶</h4><p>{item.next}</p></div>
      <ProgrammingAlgorithms levelIndex={selected} />
      </details>
      <details className={styles.radarScale}><summary>更多案例：{programmingExamples[selected][1].title}</summary>
      <section aria-label={`${item.level}教学案例`}>
        <h4>具体教学案例 · {plan.language}</h4>
        <p className={styles.note}>以下为教学设计示例，不是官方赛题。根据器材和队员基础调整；实机测试由教练监督，先模拟、低速验证，并准备可靠的停止方式。</p>
        <div>{programmingExamples[selected].slice(1).map((example, offset) => { const index = offset + 1; return <section className={styles.progression} key={example.title}>
          <h4>案例 {index + 1}｜{example.title}</h4>
          <ProgrammingExampleDiagram levelIndex={selected} exampleIndex={index} title={example.title} />
          <p><strong>任务：</strong>{example.task}</p>
          <p><strong>程序思路：</strong>{example.method}</p>
          <p><strong>如何验收：</strong>{example.check}</p>
          <p><strong>进阶挑战：</strong>{example.extension}</p>
        </section>; })}</div>
      </section>
      </details>
    </article>
    <details className={styles.radarScale}><summary>查看完整语言路线与教学原则</summary>
    <p>U9–U12A 纯图形化 → U15B 图形化＋Python认知 → U15A 图形化＋Python代码 → U18B Python代码控制 → U18A及以后 Java</p>
    <p className={styles.note}>开发环境、主控与接口待确认；教学路线不等同于赛事指定语言。</p>
    <section className={styles.progression}><h4>贯穿七级的教学原则</h4><ul><li>不以超前学科知识作为门槛：先实验、观察和测量，再逐步公式化。</li><li>语言切换时先复现熟悉任务，不同时增加语言、硬件与算法难度。</li><li>按拆解任务、解释程序和独立调试的能力判断准备度，不仅依据年级。</li></ul></section>
    </details>
  </>;
}
