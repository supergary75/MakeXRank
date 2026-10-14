import './LevelSyllabus.css';
import MonthlyCurriculum from './MonthlyPlanEditor';
import type {AuthUserProfile} from '../types';

export const syllabusRoutes = ['curriculum-u9','curriculum-u12b','curriculum-u12a','curriculum-u15b','curriculum-u15a','curriculum-u18b','curriculum-u18a'] as const;
const levels = [
  {name:'U9',grade:'1—2年级',event:'Junior Botball',start:'认识连接与方向，按步骤搭建',goal:'图形化编程走路径，解释简单传动',advance:'独立调试路径，失误后重新尝试',project:'LEGO 路径任务机器人',subjects:['识别任务起点、终点与限制，口述执行顺序。','纯图形化：前进、转向、顺序、重复；逐段运行找出错误。','LEGO 连接、轴与轮、齿轮传动、简单杠杆；观察结构如何运动。','画正面与侧面草图，对照实物表达长度和位置。','方向、长度测量、大小比较；比较不同轮子走过的距离。','轮流操作、主动求助；失败后暂停、说出问题并重新尝试。'],special:['路径调试：改变起终点，分段验证后完成路线。','结构认知：更换齿轮组合，解释快慢变化。'],evidence:'路径演示、结构草图、一次失败与修改的口头说明'},
  {name:'U12B',grade:'3—5年级',event:'MakeX Inspire',start:'从 LEGO 过渡到金属件，认识螺丝、螺母与工具',goal:'按图完成基础装配，体验齿轮、齿条与连杆',advance:'改进紧固与轴的支撑，用图形化程序驱动机构',project:'金属底盘与基础取放机构',subjects:['理解任务目标与操作边界，按分工完成模拟任务。','纯图形化：动作顺序、等待、条件与循环入门，驱动一个机构。','Makeblock 金属件、螺丝螺母、垫片、轴承与固定盘；按图体验齿轮、齿条和连杆。','认识孔位、连接方向与简单尺寸图；体验俱乐部提供的 3D 打印辅助件。','测量长度、比较角度与转动圈数，观察转动如何变为直线运动。','整理工具、遵守操作约定；卡住时停机检查，练习描述问题。'],special:['装配专项：检查松动、轴支撑和机构干涉，比较改进前后。','控制专项：用图形化程序让齿条或连杆完成一次可重复动作。'],evidence:'装配检查单、机构演示、图形化程序与改进照片'},
  {name:'U12A',grade:'4—6年级',event:'MakeX Explorer-1',start:'认识金属件与紧固件，理解条件与循环',goal:'完成稳定机构与程序，记录测试结果',advance:'优化齿轮或齿条机构，提高重复运行稳定性',project:'可重复执行的基础得分机构',subjects:['认识比赛流程与角色，完成基础得分动作和赛后复盘。','纯图形化：条件、循环、变量入门，将机构动作拆成程序模块。','金属机构装配、轴支撑与紧固复查；体验 3D 打印、碳纤维和 PC 成品件。','测量孔距、表达安装关系，制作简单零件草图。','记录耗时与成功次数，用比例、平均值比较测试结果。','按记录讨论问题，轮换分工；失误后复查步骤而非相互指责。'],special:['传动专项：比较齿轮或齿条方案的动作效果。','稳定性专项：保持测试条件一致，逐项调整并记录。'],evidence:'机构图、程序、重复测试表及优化前后对比'},
  {name:'U15B',grade:'6—8年级',event:'MakeX Explorer-2',start:'组合机构与程序模块，读懂任务要求',goal:'完成多任务机器人，用测量支持调整',advance:'优化任务顺序与效率，独立定位常见故障',project:'多任务机器人与路线优化',subjects:['比较任务顺序，练习联盟沟通与完整模拟赛。','图形化为主＋Python 认知：认识变量、条件和循环的代码表达。','组合多个机构，检查干涉；在培训与教练监督下体验激光切割木板制作。','表达多机构安装空间，比较两个布局，记录尺寸变化。','距离、时间、速度及简单统计，用数据比较路线。','按事实复盘；限时任务中先恢复基本功能，再处理优化。'],special:['效率专项：比较路线、动作顺序和时间分配。','排障专项：从机械、连接、程序三个方向逐步检查。'],evidence:'两种任务方案、测试数据、故障定位记录'},
  {name:'U15A',grade:'7—9年级',event:'MakeX Challenge-1',start:'理解反馈与任务策略，图形化与 Python 并用',goal:'协同调试多机构，依据数据迭代',advance:'深化控制或机构专项，压力下稳定执行',project:'多机构协同任务与反馈改进',subjects:['结合机器人能力制定可执行策略，练习团队角色交接。','图形化＋Python 使用：读取反馈、组织动作模块、比较运行结果。','多机构联调，测试金属、打印件与板材的适用性和连接方式。','用参数表达关键尺寸，记录机构方案和修改理由。','理解反馈、变化关系和测试误差，比较调整前后的数据。','限时演练中执行检查清单，清楚表达风险和下一步。'],special:['控制专项：围绕一个反馈信号改进动作一致性。','机构专项：针对卡滞、干涉或动作效率做一次完整迭代。'],evidence:'联调记录、数据对比、策略说明与压力情境复盘'},
  {name:'U18B',grade:'7—9年级',event:'MakeX Challenge-2',start:'建立子系统与接口意识，用 Python 控制机器人',goal:'完成子系统协同，参数化设计与验证',advance:'优化负载与可靠性，承担团队专项责任',project:'一个子系统的设计、控制与集成',subjects:['根据团队任务约定子系统交付与场上配合。','Python 控制：模块接口、状态组织、异常处理与联调记录。','组合金属、打印件和板材，测试连接、维护与负载表现。','参数化零件与装配，明确孔位、空间和接口要求。','用力、力臂和负载测试解释现象，比较计算与实测。','负责一个专项的进度、交付与复盘，主动报告阻碍。'],special:['可靠性专项：设计重复测试与故障检查流程。','负载专项：改变测试负载，对照现象改进机构。'],evidence:'接口说明、设计文件、Python 程序、负载与可靠性记录'},
  {name:'U18A',grade:'7—12年级',event:'FRC',start:'理解材料与加工，用 Java 控制机器人',goal:'整合多材料与控制，完成负载测试',advance:'用计算改进性能，独立负责一个子系统',project:'FRC 子系统从方案到赛场验证',subjects:['理解赛季需求，承担明确的机器人研发或赛场角色。','Java：模块化控制、状态与反馈、测试及版本协作。','比较铝型材、板材、碳纤维等材料与加工方式；设备操作按培训和授权执行。','使用 Onshape / SolidWorks，参考经典结构，完成一个子系统的装配与制造表达。','建立简单负载模型，记录假设，用实测校验计算结果。','在团队约定下自主推进交付，压力下沟通事实并带动复盘。'],special:['性能专项：用计算和测试对比改进一个子系统。','工程交付专项：完善设计、装配、维护与验证记录。'],evidence:'CAD、Java 程序、计算与测试对比、子系统交付档案'},
];
const dimensions=['比赛','编程','搭建','设计建模','学科知识','个人核心能力与比赛心态'];

export function LevelOverview({onOpen}:{onOpen:(route:typeof syllabusRoutes[number])=>void}) {
  return <section className="syllabus" aria-label="七级课程大纲"><p>点击图中任一级别，查看具体课程大纲。手机上可左右滑动查看完整成长图。</p><div className="syllabus-chart-scroll"><div className="syllabus-chart"><img src={`${import.meta.env.BASE_URL}images/curriculum-growth-final.png`} alt="七级阶梯成长图：U9至U18A，每级由能力起点到1—8月综合达成，再到9—12月专项突破；下方展示年度双闭环与FRC高阶深化。" />{levels.map((l,i)=><button className="syllabus-chart-link" style={{left:`${10.5+i*12.5}%`}} key={l.name} aria-label={`${l.name} ${l.grade} ${l.event}，查看课程大纲`} title={`查看 ${l.name} 课程大纲`} onClick={()=>onOpen(syllabusRoutes[i])}><span>查看 {l.name} 大纲 ↗</span></button>)}</div></div></section>;
}

export default function LevelSyllabus({index,user,onLogin}:{index:number;user?:AuthUserProfile|null;onLogin:()=>void}) {
  const l=levels[index];
  return <article className="syllabus" aria-label={`${l.name}课程大纲`}><p className="syllabus-label">{l.grade} · {l.event} · 课程大纲草案</p><h2>{l.name} · {l.project}</h2>
    <div className="syllabus-stages">{[['能力起点',l.start],['1—8月 · 综合达成',l.goal],['9—12月 · 专项突破',l.advance]].map(([title,body])=><section key={title}><h3>{title}</h3><p>{body}</p></section>)}</div>
    <MonthlyCurriculum key={`${l.name}:${user?.authUserId}:${user?.role}:${user?.isActive}`} level={l.name} user={user} onLogin={onLogin}/>
    <h3>六维学习内容</h3><div className="syllabus-dimensions">{l.subjects.map((text,i)=><section key={dimensions[i]}><h4>{dimensions[i]}</h4><p>{text}</p></section>)}</div>
    <section className="syllabus-cycle"><h3>第一闭环 · 1—8月</h3><p>围绕「{l.project}」完成综合培养。具体课次随课表与赛事安排确定。</p><ol><li><b>学：</b>通过示范、小实验与讲解掌握上述六维基础。</li><li><b>练：</b>分段制作与测试，记录问题，每次只改变可比较的关键条件。</li><li><b>赛：</b>用完整任务挑战或适合的赛事检验执行、协作与临场调整。</li><li><b>复盘：</b>依据作品和表现评估达成情况，选择下半年共同专项与个人目标。</li></ol><p><b>阶段成果：</b>{l.evidence}。</p></section>
    <section className="syllabus-cycle"><h3>第二闭环 · 9—12月</h3><p>班级共同专项＋个人提升目标；根据第一闭环表现选取重点，不要求同时完成所有专项。</p><ul>{l.special.map(s=><li key={s}>{s}</li>)}</ul><p><b>专项学 → 针对练 → 赛中检验 → 复盘：</b>保留提升前后的同类任务记录，再放回综合任务中检验迁移应用。</p><p><b>阶段成果：</b>专项前后对比、个人讲解与下一阶段改进计划。</p></section>
    {l.name==='U18A'&&<section className="syllabus-cycle"><h3>FRC 高阶深化 · 非入门要求</h3><p>Top-down 整机设计 → 加工装配与赛场验证 → 惯量与子系统负载仿真 → 实测验证与团队迭代。根据基础达成情况逐步开放。</p></section>}
    <section className="syllabus-cycle"><h3>怎么判断成长</h3><p>需要指导 → 提示下完成 → 独立完成 → 能迁移并解释。分别记录六维表现，用作品、测试和具体行为作为证据。</p><p>比赛心态单独观察：遇到失误后的恢复、表达问题、继续执行及团队沟通。阶段评估后安排补练或深化，不按参赛次数自动升级。</p></section>
  </article>;
}
