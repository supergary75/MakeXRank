import styles from './CurriculumSystem.module.css';

const topics = [
  { name: '螺丝、螺母与垫片', stage: '装配基础', purpose: '把金属梁、板和支架牢固连接起来。', principle: '螺丝与匹配的螺母或螺纹孔配合形成连接；垫片可帮助分散接触压力，但不能代替正确紧固。', practice: '辨认配套固定件，选择合适长度，用匹配工具连接两块金属件；比较未固定与正确固定后的稳定性。', check: '能分清螺母与垫片，解释为什么不能随意混用规格或一味拧得更紧。', parts: '螺丝、螺母、垫片、金属梁、匹配工具' },
  { name: '角码与金属框架', stage: '装配基础', purpose: '把金属件连接成底盘或机构支架。', principle: '框架牢固性不仅取决于材料，还取决于连接位置、支撑方式和固定质量。', practice: '用梁和角码装配小框架，轻推检查晃动，再调整连接或增加支撑。', check: '能指出晃动来自哪个连接，比较调整前后的差别。', parts: '金属梁、角码、板、螺丝与螺母' },
  { name: '轴、轴承与固定件', stage: '装配基础', purpose: '让转轴受到支撑，同时使轮子或机构固定在需要的位置。', principle: '轴承用于支撑相对转动，轴环等零件用于定位；需要转动的地方不能被夹紧，需要固定的地方不能松滑。', practice: '装配一根有支撑的轴，检查转动与轴向移动，再按实际零件要求调整定位。', check: '能指出支撑、转动和定位各由哪个零件负责。', parts: '轴、轴承、支架、轴环或适配定位件' },
  { name: '传动固定盘与轮毂', stage: '装配基础', purpose: '把轮、盘或机构连接到轴上，让动力传过去。', principle: '连接件要同时与轴和被带动的零件适配；轴转了而机构不跟着转，可能是连接松动或配合不正确。', practice: '用套件中适配的固定盘或轮毂连接一个轮或小机构，手动转轴检查是否同步运动。', check: '能沿着“轴→连接件→机构”指出动力传递路径，发现并报告松滑。', parts: '传动固定盘、轮毂、轴、适配紧固件' },
  { name: '齿轮传动', stage: '机构应用', purpose: '传递转动，改变方向和转动快慢。', principle: '直接啮合的外齿轮转向相反；大小齿轮搭配会改变转速关系，啮合过紧或位置不合适可能卡顿。', practice: '用Makeblock零件装配两根支撑轴和一组齿轮，先手摇，再比较更换大小齿轮后的转向与快慢。', check: '能说明哪个轮带动哪个轮，观察卡顿并检查安装位置。', parts: '齿轮、轴、支架、固定件' },
  { name: '齿轮与齿条', stage: '机构应用', purpose: '制作直线推送或短行程移动机构。', principle: '齿轮转动推动齿条直线移动；齿条还需要导向与适当的行程限制。', practice: '用金属支架固定齿轮和导向，手动推动齿条往返，观察运动方向与啮合情况。', check: '能解释旋转怎样变成直线运动，检查是否歪斜或超出有效行程。', parts: '齿轮、齿条、金属支架、导向件、紧固件' },
  { name: '连杆与转动连接', stage: '机构应用', purpose: '让多个金属构件配合运动，制作摆动或开合装置。', principle: '连杆通过活动连接传递运动；活动连接既要保留转动空间，也要按零件设计可靠定位，不能靠随意松开普通螺母实现。', practice: '使用适配的轴、轴套或转动连接件搭一组手摇连杆，检查整个运动过程是否碰撞或卡住。', check: '能区分活动连接和固定连接，并指出输入运动怎样传到另一端。', parts: '金属连杆或梁、轴、轴套、适配转动连接件' },
  { name: '金属机构与3D打印件组合', stage: '综合应用', purpose: '体验标准金属件与定制连接件、夹爪或托架的配合。', principle: '材料与连接方式共同影响结构表现；打印件不能照搬金属件的紧固方式，需要按实际零件要求装配。', practice: '将提供的打印托架或夹爪装到金属机构上，使用轻小物体测试，比较连接位置与接触面的效果。', check: '能说明金属件与打印件各自的作用，检查裂纹、松动和干涉并报告问题。', parts: 'Makeblock金属件、提供的打印件、适配紧固件' },
];

export function U12BStructures() {
  return <section aria-label="U12B金属零件与经典机构">
    <h4>从积木连接，到真实金属装配</h4>
    <p>继续认识齿轮、齿条和连杆，但这次用Makeblock金属零件和实际紧固件搭出来，学会分清“固定牢”和“转得顺”。</p>
    <p className={styles.note}>建议先学习四项装配基础，再进入机构应用。以下为俱乐部教学草案；规格、工具和连接方法以实际套件资料为准。</p>
    <div className={styles.columns}>{topics.map(item => <details key={item.name} className={styles.radarScale}>
      <summary>{item.name} · {item.stage}</summary>
      <p><strong>有什么用：</strong>{item.purpose}</p>
      <p><strong>简单原理：</strong>{item.principle}</p>
      <p><strong>搭建与实验：</strong>{item.practice}</p>
      <p><strong>看看是否理解：</strong>{item.check}</p>
      <p className={styles.note}>认识零件：{item.parts}。</p>
    </details>)}</div>
    <section className={styles.rationale}><h4>这一阶段的重点，不是把螺丝拧上就结束</h4><p>能选对固定件、说清固定与转动的区别、检查松动与干涉，并解释机构怎样传递运动。</p><p className={styles.note}>先手动、轻载检查，卡住时先停止；紧固程度与工具选择由教练指导，不将手伸入齿轮啮合或夹持部位。</p></section>
  </section>;
}
