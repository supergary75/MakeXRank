import { useState } from 'react';
import styles from './CurriculumSystem.module.css';
import { NationalCoverage } from './NationalCoverage';

// Club-authored project mappings, not quotations or official grade equivalences.
const levels = [
  { level:'U9', grades:'1–2年级', event:'Junior Botball', goal:'让长度、方向和数量，变成机器人能完成的小任务。',
    math:'计数、加减与简单重复计数；长度测量；辨认平面图形；描述前后左右的位置。',
    science:'小学科学：观察材料与物体特征，比较推拉与运动现象，用观察和简单记录描述变化。',
    boundary:'只做直观观察与实物测量；角度数值、速度公式、传动比不作为本级要求。乘法按学校进度选用。',
    program:'纯图形化：按任务先后排列动作，用格数或实测距离调整前进参数；循环先理解为“重复做几次”。',
    build:'LEGO：轮轴、支撑、齿轮啮合与连杆的直观体验；观察什么能转、什么要固定，不要求背公式。',
    design:'画简单路径与正面草图，数孔位、比较长短，让图和实物一一对应。',
    project:'机器人送物：在方格路线上到达目标，把直线路径分成几段，测量并比较实际停点。',
    evidence:'一张路径图、三次停点记录；孩子能指出偏差并说清改了哪一步。',
    extension:'项目拓展：简单齿轮换向与轮轴连接；用转动体验解释，不提前讲力矩。' },
  { level:'U12B', grades:'3–5年级', event:'MakeX Inspire', goal:'用测量与数据，找到更可靠的任务方案。',
    math:'3–4年级侧重四则运算、长度与角的测量、周长面积、简单数据整理；5年级按进度加入小数运算及相应图形知识。',
    science:'小学科学：材料性质、物体运动、力的作用和简单技术设计的相关学习；通过相同条件下的比较获取证据。',
    boundary:'跨3–4与5–6学段，5–6学段内容不默认所有3年级队员已学；正式比与比例、圆周长等按后续学段衔接。',
    program:'纯图形化：设置距离、转向、等待和重复次数；用耗时、成功次数比较两条任务路线。',
    build:'Makeblock金属件、螺丝螺母与3D打印件：练习牢固连接，比较齿轮、齿条和连杆的运动方式。',
    design:'量取孔距与零件尺寸，画带尺寸草图；用纸板或现成打印件检验是否装得上。',
    project:'齿条推送器：相同行程下比较两种连接方案，各运行5次，记录卡住次数与完成时间。',
    evidence:'尺寸草图、5次测试表和方案选择理由；能区分“零件松动”与“程序参数不合适”。',
    extension:'项目拓展：齿数与转动快慢的关系、打印件配合间隙；先观察与试配，不要求传动比和公差计算。' },
  { level:'U12A', grades:'4–6年级', event:'MakeX Explorer-1', goal:'把图形、数量关系和科学实验用到第一次联盟对抗。',
    math:'4年级巩固测量、角与面积；5–6学段逐步衔接分数小数百分数、比与比例、圆、立体图形和统计表示。',
    science:'小学科学：运动与力、能量转化、简单电路及工程设计的相关学习；区分观察事实与方案猜想。',
    boundary:'圆周长、比例、百分数等按实际教材进度解锁；未学时用滚一圈实测和成功次数表达。',
    program:'纯图形化：拆解自动动作与手动任务，记录转向误差；学过圆后可用轮周长估算行程，再实测修正。',
    build:'金属框架与打印件配合，使用俱乐部提供的碳纤维/PC板及木板件，比较质量、刚性与摩擦表现。',
    design:'绘制平面布局与简单三维模型，核对尺寸、对称和装配空间；面积体积知识用于估计材料用量。',
    project:'自动停靠：同一出发点运行5次，标注终点；比较两组轮子或参数的停靠稳定性。',
    evidence:'布局图、终点分布、修改前后测试表；能解释为何估算距离与实际距离不同。',
    extension:'项目拓展：传动比、重心与传感器阈值；先做具体操作，不把电机控制或力矩当小学课标要求。' },
  { level:'U15B', grades:'6–8年级', event:'MakeX Explorer-2', goal:'从凭感觉调试，走向用变量和实验解释问题。',
    math:'6年级衔接比例与统计；进入7–9学段后按进度学习有理数、代数式、方程、坐标与几何推理，逐步认识函数关系。',
    science:'6年级仍以小学科学为基础；初中物理按学校开课进度衔接测量、运动、力与摩擦。不能默认7年级已系统学习物理。',
    boundary:'函数、勾股定理及物理定量计算按学校进度选择；尚未学习时用表格、坐标格和测量实验替代推导。',
    program:'图形化＋Python认知：将距离、时间和传感器读数视为变量，读懂简单条件判断；比较控制参数与结果。',
    build:'比较轴承支撑、齿轮/带传动和复合材料连接；在培训与监督下开展木板激光加工和样件测试。',
    design:'尺寸约束、孔位坐标、装配干涉检查；比较不同厚度或支撑布局，不一次改变多个条件。',
    project:'直行偏差研究：固定电量与载荷，分别改变支撑或控制参数，每组测试5次并绘制偏差图。',
    evidence:'控制变量说明、数据图与一次改进结论；能解释数据支持了什么、还不能说明什么。',
    extension:'项目拓展：比例纠偏、配合间隙与刚度比较；PID和材料力学不作为初中同步必学知识。' },
  { level:'U15A', grades:'7–9年级', event:'MakeX Challenge-1', goal:'用初中数理知识，说明一个机构为什么能完成任务。',
    math:'7–9学段：方程、函数、几何与统计；按进度使用一次函数、勾股定理及相似等知识分析尺寸与运动关系。',
    science:'初中物理相关主题：运动与力、杠杆和滑轮等简单机械、功与能、电路；应随学校教学顺序逐项对接。',
    boundary:'7年级可先做科学探究；未学电路、功率或机械效率时先用演示和记录。不能将7–9学段整体内容视为7年级先修。',
    program:'图形化与Python代码并行使用：用条件、变量和函数组织子系统动作；用读数—动作对应表辅助调试。',
    build:'搭建升降或夹持子系统，比较支撑、传动与材料组合；理解省力与移动距离之间的取舍。',
    design:'用尺寸图和三维装配检查行程、空间与维修可达性；依据样件测试修改结构。',
    project:'升降机构选型：在教练限定的安全载荷内，对比两种传动配置的提升时间、成功次数与结构变形。',
    evidence:'方案草图、受力方向说明、测试对比；学过相关公式后补充计算，并解释实际损耗。',
    extension:'项目拓展：电机转矩、机构安全余量、代码模块化；不等同于课标要求或允许自行操作加工设备。' },
  { level:'U18B', grades:'7–9年级', event:'MakeX Challenge-2', goal:'不靠新增高年级公式，而靠整机集成加深数理应用。',
    math:'仍对应7–9学段，以函数、几何、统计与方程作综合应用；根据已学内容比较不同方案的数据趋势。',
    science:'仍以初中物理为基础，综合应用运动、力、能量与电路知识解释子系统相互影响。',
    boundary:'与U15A年级相同，递进是自主程度和系统复杂性，不把高中力学、电磁学自动下放为必修。',
    program:'Python控制：分模块采集数据、组织动作与异常处理；结合曲线观察响应快慢和稳定性。',
    build:'复合材料与多机构整合，检查松动、摩擦、载荷变化与供电的影响；建立重复测试流程。',
    design:'整机装配、质量分配、接口尺寸和维护空间；以测试证据比较设计，而非只看模型外观。',
    project:'整机连续任务：空载与规定载荷下分别重复任务，记录耗时、失败原因及电压读数，提出一次版本改进。',
    evidence:'接口清单、同条件版本对比、异常记录；区分相关现象与已验证的因果。',
    extension:'项目拓展：PID直观调参、状态机与可靠性测试；正式控制理论不是初中课标内容。' },
  { level:'U18A', grades:'7–12年级', event:'FRC', goal:'按实际学段分工，用数学建模与物理实验支持整机工程。',
    math:'初中基础组：方程、几何、统计与已学函数。高中进阶组：按课程模块使用函数、三角函数、向量、空间几何和概率统计。',
    science:'初中基础组：测量、简单机械、能量与电路。高中进阶组：按已学模块使用运动规律、牛顿定律、功与能、动量及电路知识。',
    boundary:'7–9年级不默认掌握高中知识；10–12年级也按已学模块安排。FRC培养级别不代表所有人必须完成同一份高阶计算。',
    program:'Java：初中组可做日志、简单子系统与测试；进阶组结合已学三角函数/向量理解方向与速度，验证运动模型。',
    build:'整机设计制作与集成，结合金属、打印件、碳纤维和外加工件；依据培训授权分配制造和检验任务。',
    design:'子系统接口、工程图与装配验证；进阶组用模型估算运动与载荷，再将实测结果反馈设计。',
    project:'进料—升降联合任务：基础组做尺寸、日志与重复测试；进阶组建立提升时间和能量估算，比较模型与实测差异。',
    evidence:'可追溯设计记录、计算假设、测试曲线和迭代结论；各角色分别提交与其学段相符的成果。',
    extension:'工程拓展：PID、运动规划、公差、材料强度与加工工艺；不是国家数学/物理课标的直接条目。' },
];

export function NationalKnowledgeSystem() {
  const [selected, setSelected] = useState(0);
  const item = levels[selected];
  return <section aria-label="新课标学科对应内容">
    <h3>新课标体系对应 · 数学与科学／物理</h3>
    <NationalCoverage />
    <p className={styles.note}>俱乐部课程映射草案，不是官方认证或逐册教学进度表。以义务教育2022年版课标为基础参考，高中按实际课程模块衔接；日常修订版和学校教材进度需在教案定稿时复核。小学侧重科学体验，初中逐步定量，高中按角色建模。</p>
    <nav className={styles.path} aria-label="选择学科对应级别">{levels.map((row, i) => <button type="button" key={row.level} aria-pressed={i === selected} onClick={() => setSelected(i)}><strong>{row.level}</strong><span>{row.grades}</span></button>)}</nav>
    <article className={styles.detail} aria-live="polite">
      <div className={styles.title}><div><p className={styles.eyebrow}>{item.level} · {item.grades}</p><h3>{item.event}</h3></div><span>课程映射草案</span></div>
      <section className={styles.rationale}><h4>这一阶段，把知识用在哪里？</h4><p>{item.goal}</p></section>
      <div className={styles.columns}><section><h4>数学 · 校内衔接</h4><p>{item.math}</p></section><section><h4>科学／物理 · 校内衔接</h4><p>{item.science}</p></section></div>
      <p className={styles.note}><strong>年级边界：</strong>{item.boundary}</p>
      <div className={styles.columns}><section><h4>编程需求 → 数理应用</h4><p>{item.program}</p><h4>搭建需求 → 数理应用</h4><p>{item.build}</p></section><section><h4>设计需求 → 数理应用</h4><p>{item.design}</p><h4>工程拓展 · 不等同于课标必修</h4><p>{item.extension}</p></section></div>
      <section className={styles.progression}><h4>综合项目 · 建议活动</h4><p>{item.project}</p><h4>如何看见学会了？</h4><p>{item.evidence}</p></section>
    </article>
    <details><summary>依据、使用边界与教练备课建议</summary>
      <p>以上赛事情境、语言路线、材料路线与项目任务为俱乐部教学设计，不是课标原文。每次授课先确认队员已学知识，再选同步应用、直观体验或进阶拓展；未掌握公式时保留测量、比较、解释环节。不同版本教材的年级与学期安排可能不同。</p>
      <ul><li><a href="https://www.moe.gov.cn/srcsite/A26/s8001/202204/t20220420_619921.html" target="_blank" rel="noreferrer">教育部：义务教育课程方案和课程标准（2022年版），数学、科学、物理附件</a></li><li><a href="https://www.moe.gov.cn/srcsite/A26/s8001/202204/W020220510531636118932.pdf" target="_blank" rel="noreferrer">义务教育数学课标（2022年版更正版）：课程内容与学段要求</a></li><li><a href="https://pmc.scnu.edu.cn/a/20251127/25.html" target="_blank" rel="noreferrer">国家教材建设重点研究基地：高中物理课标（2017年版2025年修订）</a></li><li><a href="https://qspfw.moe.gov.cn/html/sublaws/20250122/22735.html" target="_blank" rel="noreferrer">教育部：中小学科学教育工作指南（2025）</a></li></ul>
      <p className={styles.note}>资料检索：2026-09-09。本版为主题级对应，尚未逐条标注修订课标页码，不用于宣称教材完全同步。涉及电路、载荷和加工设备的活动须由教练设置安全边界，年级不等于设备操作授权。</p>
    </details>
  </section>;
}
