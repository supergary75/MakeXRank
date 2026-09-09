import { useState } from 'react';
import { U9Structures } from './U9Structures';
import { U12BStructures } from './U12BStructures';
import styles from './CurriculumSystem.module.css';

const mixed = 'Makeblock金属件、3D打印件、俱乐部提供的碳纤维／PC板材及激光切割木板';
const levels = [
  { level: 'U9', grades: '1–2年级', stage: '搭建直觉', goal: '让孩子搭出牢固、能运动的小作品，并发现哪里需要改进。', materials: '以LEGO零件为主。', parts: '梁、连接件、轴、轮和基础齿轮；先认识形状、用途与连接方式。', mechanism: '支撑、对称、轮轴与简单齿轮传动；观察哪些地方要固定、哪些地方要转动。', making: '使用现成零件，在示范下搭建、拆解和修改。', outcomes: ['找对零件并连接牢固', '区分固定部位与转动部位', '发现松动并尝试加固'], example: '搭一辆不易散架的小车', task: '让小车沿直线移动，观察轮子是否顺畅、车架是否松散。', steps: ['选择零件', '搭车架与轮轴', '推行观察', '加固后再测试'], test: '能指出一处支撑或连接问题，并展示修改前后的差别。' },
  { level: 'U12B', grades: '3–5年级', stage: '使用体验', goal: '从积木连接走向金属装配，体验标准件与打印件如何配合。', materials: 'Makeblock金属件＋3D打印件。', parts: '螺栓、螺母、垫片、角码、轴、轴承、轮毂与传动固定盘；认识用途并学习正确安装。', mechanism: '轴的支撑与固定、简单齿轮或带传动；区分传递动力与自由转动。', making: '以使用与装配体验为主，感受重量、连接和牢固性的差异；打印操作参与范围另行安排。', outcomes: ['正确使用常见连接件', '分清轴承支撑与零件固定', '比较金属件和打印件的用途'], example: '给小车增加搬运装置', task: '用金属支架与打印连接件组合一个简单搬运装置，检查是否牢固、动作是否顺畅。', steps: ['认识连接零件', '组合支架与打印件', '装配搬运装置', '检查松动与转动'], test: '能说清两种材料分别用在哪里，指出一个转动连接和一个固定连接。' },
  { level: 'U12A', grades: '4–6年级', stage: '对比与验证', goal: '让队员理解不同位置为什么选不同材料，并把机构装得顺畅可靠。', materials: mixed, parts: '轴承座、轴套、轴环、隔柱、传动固定盘和联轴器；学习定位、支撑与动力连接。', mechanism: '齿轮与带轮的连接、机构间隙与干涉；理解轴应顺畅转动而不明显窜动。', making: '使用提供的零件和板材进行装配与对比测试，不默认开放自主加工设备。', outcomes: ['检查机构是否卡住或碰撞', '解释材料与连接方式的选择', '比较两种装配方案'], example: '取放机构为什么会卡住？', task: '装配一个取放机构，检查轴、支架和活动件是否对齐，并比较调整前后的运动。', steps: ['装配支撑与轴', '检查固定和间隙', '手动检查干涉', '调整并重复验证'], test: '能定位卡顿发生的位置，说明调整的是连接、对中还是间隙。' },
  { level: 'U15B', grades: '6–8年级', stage: '加工与测试', goal: '从使用现成零件，走向制作零件、装配验证并根据结果修改。', materials: mixed, parts: '齿轮、同步带与带轮、链条与链轮；认识传动比、张紧、对中与防松。', mechanism: '结合机构任务观察速度、输出力矩、重心与刚度，分析卡顿、打滑和松动。', making: '开始在培训、授权和监督下参与激光切割木板自加工，完成制作—装配—测试—修改。', outcomes: ['参与零件加工与装配', '用测试定位传动问题', '记录修改前后的差别'], example: '改进容易卡顿的传动机构', task: '比较支撑位置、连接松紧和传动对中情况，按检查结果提出修改方案。', steps: ['观察并记录问题', '提出零件修改', '授权加工与装配', '同条件对比测试'], test: '能提供修改依据与重复测试记录，而不是仅凭一次运行判断成功。' },
  { level: 'U15A', grades: '7–9年级', stage: '复合使用入门', goal: '按机构需求组合材料，把图纸上的方案变成能工作的实物。', materials: mixed, parts: '连杆、滑轨、丝杆、齿条等运动零件；结合轴承、固定盘和连接件理解装配关系。', mechanism: '旋转与直线运动转换、升降和夹持；理解支撑、定位、传动各自的职责。', making: '按图组织加工件与标准件，安排装配顺序；自主加工仅限已经授权的设备与材料。', outcomes: ['按图装配一个子系统', '组合材料并处理连接问题', '将尺寸或配合问题反馈给设计人员'], example: '按图装配一个升降机构', task: '结合金属框架、板材和打印件完成升降装配，核对支撑、运动空间与安装位置。', steps: ['读图与核对零件', '安排装配顺序', '组合材料与机构', '验证行程并反馈'], test: '能解释材料分工，找出干涉或配合问题，并保留修改记录。' },
  { level: 'U18B', grades: '7–9年级', stage: '整机复合应用', goal: '综合考虑强度、重量和维修需求，对整机装配与测试结果负责。', materials: mixed, parts: '结合载荷、空间和维护要求选择轴与支撑、连接件和传动件，检查磨损与松动。', mechanism: '多机构协同、精度与间隙、结构可靠性和快拆维护；避免只优化单个零件。', making: '综合标准件、打印件和板材加工方案，完成整机集成、测试与迭代。', outcomes: ['排查跨机构装配问题', '验证可靠性与维修便利性', '对材料组合和修改结果负责'], example: '整机连续测试与快速维修', task: '完成连续运行检查，记录松动、磨损或干涉，并演练更换一个易损件。', steps: ['整机检查', '连续测试记录', '定位并更换问题件', '复测与完善维修清单'], test: '交付检查清单、问题记录和维护步骤；测试次数与负载由教练按设备确定。' },
  { level: 'U18A', grades: '7–12年级', stage: 'FRC整机工程', goal: '把设计、制造、装配和赛场维护连起来，完成真实工程交付。', materials: '碳纤维、钣金件、铝型材等，结合3D打印件及其他设计所需材料。', parts: '围绕整机设计选择轴承、轴、轮毂、联轴器、传动和紧固件，并按图纸与供应资料验证适配。', mechanism: '整机结构与传动集成、加工装配质量、可靠性、检修和赛场维护。', making: '结合CNC雕刻机、3D打印机、激光切割机、带锯、台钻等，以及五轴CNC外加工；按零件需求选择工艺，不代表所有材料适用所有设备。', outcomes: ['完成子系统制造装配交付', '与加工方沟通并检查来件', '承担测试、维护与交接责任'], example: '交付一个可维护的子系统', task: '按设计方案组织自制件、采购件和外加工件，检查来件后装配测试并向队友交接。', steps: ['拆分制造与外协任务', '来件与尺寸检查', '整机装配验证', '维护演练与文档交接'], test: '交付装配记录、质量检查与维护说明；能够追溯问题及修正过程。' },
];

export function BuildingSystem() {
  const [selected, setSelected] = useState(0);
  const item = levels[selected];
  return <>
    <p>从“能搭起来”到“能造出可靠的机器人”。设计建模负责方案与图纸，搭建体系负责装配、测试与维修。</p>
    <p className={styles.note}>材料路线依据俱乐部安排；知识点、案例与验收为培养草案。复合使用指多种材料、标准件和加工方式的组合应用。</p>
    <div className={styles.path} aria-label="选择搭建培养级别">{levels.map((level, i) => <button key={level.level} type="button" aria-pressed={selected === i} onClick={() => setSelected(i)}><small>0{i + 1}</small><strong>{level.level}</strong><span>{level.grades}</span><b>{level.stage}</b></button>)}</div>
    <article key={item.level} className={styles.detail} aria-live="polite">
      <div className={styles.title}><div><p className={styles.eyebrow}>{item.level} · {item.grades}</p><h3>{item.stage}</h3></div><span>培养内容草案</span></div>
      <section className={styles.rationale}><h4>{item.goal}</h4><p><strong>使用材料：</strong>{item.materials}</p></section>
      <h4>学完能做到什么？</h4><ul>{item.outcomes.map(text => <li key={text}>{text}</li>)}</ul>
      {selected === 0 && <U9Structures />}
      {selected === 1 && <U12BStructures />}
      <section className={styles.progression}><h4>看一个例子：{item.example}</h4><p>{item.task}</p><figure className={styles.exampleDiagram}><figcaption>装配与验证流程</figcaption><ol>{item.steps.map((step, i) => <li key={step}><span className={styles.diagramNumber}>0{i + 1}</span><span>{step}</span></li>)}</ol></figure><details className={styles.radarScale}><summary>这个案例怎么看结果？</summary><p>{item.test}</p></details></section>
      <details className={styles.radarScale}><summary>查看教学细节：零件、传动、材料与加工</summary><div className={styles.columns}><section><h4>零件基础认知</h4><p>{item.parts}</p><h4>机构与传动</h4><p>{item.mechanism}</p></section><section><h4>材料与加工参与</h4><p>{item.making}</p><h4>装配测试与维修</h4><p>{item.test}</p></section></div></details>
      <p className={styles.note}>设备操作按培训和授权单独开放，不能仅凭年级或级别独立操作。加工前须由负责人确认材料与设备适用性，实机测试由教练监督。</p>
    </article>
    <details className={styles.radarScale}><summary>查看贯穿七级的机械认知路线</summary><p>认识名称和用途 → 正确安装 → 理解原理 → 按任务选择 → 测试与排查问题。</p><ul><li>结构与连接：梁、板、角码、螺栓、螺母、垫片、隔柱。</li><li>轴与支撑：轴、轴承、轴套、轴承座。</li><li>固定与定位：轴环、轮毂、传动固定盘、联轴器。</li><li>动力传动：齿轮、同步带与带轮、链条与链轮。</li><li>运动机构：连杆、滑轨、丝杆、齿条、升降与夹持。</li><li>装配检查：对中、间隙、张紧、防松、干涉与磨损。</li></ul><p>同一种零件跨级深化，不要求低级别一次掌握全部内容；具体型号和安装要求按实际器材资料确认。</p></details>
  </>;
}
