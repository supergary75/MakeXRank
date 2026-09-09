import styles from './CurriculumSystem.module.css';

const algorithms = [
  { core: '顺序执行、固定次数循环、简单路径分解', optional: '比较两种路径的动作步骤与重复结构。', category: '流程逻辑', application: '路径送货按顺序执行；画方形重复四次“前进＋转弯”。', prerequisite: '能够理解先后顺序、方向和简单计数；全程使用图形积木。', assessment: '能预测动作顺序、找出重复部分，并修正一个错误步骤。' },
  { core: '条件分支、阈值判断、计数与累加', optional: '组合多个判断条件，比较任务执行顺序。', category: '逻辑判断与数据处理', application: '距离小于阈值时停车；每完成一次配送就更新任务计数。', prerequisite: '理解比较大小和基础运算，能读取传感器数值；使用图形化表达。', assessment: '能测试阈值两侧及等于阈值的情况，解释计数何时增加。' },
  { core: '有限状态机入门、分段路径执行、优先级判断', optional: '为状态增加超时退出与异常分支。', category: '程序组织与任务调度', application: '移动→取放→返回；停止请求优先于机构动作。', prerequisite: '已掌握条件判断与变量，能够区分当前阶段和下一阶段；仍使用纯图形化。', assessment: '能画出状态切换关系，并验证停止请求在各阶段都能生效。' },
  { core: '误差计算、比例控制（P）入门', optional: '简单滑动平均，观察传感器读数平滑前后的变化。', category: '反馈控制与基础滤波', application: '根据方向偏差调整控制输出；用多次读数的平均值观察噪声。', prerequisite: '认识目标与实际值、正负数和平均数；主要用图形化实验，Python只做短片段认知。', assessment: '能解释“偏得多，修正量更大”的含义，并记录参数变化对实际表现的影响。' },
  { core: 'P控制应用、带超时的状态机、加减速限制', optional: 'PD控制：在有稳定反馈和充分实验基础后，观察误差变化对控制的影响。', category: '控制算法与安全流程', application: '机构到位控制、平稳启动与停车、超时后退出自动流程。', prerequisite: '具备函数与反馈概念，先用图形化验证熟悉任务，再用Python对照实现。', assessment: '能验证到位、超时与取消三个分支，并比较限速前后的启动表现。' },
  { core: '多机构状态协调、反馈控制调试与结果验证', optional: '按需应用PID、认识前馈；不为使用高级算法而增加不必要的复杂度。', category: '整机协调与控制优化', application: '机构准备完成后才允许下一动作；比较反馈控制参数对稳定性的影响。', prerequisite: '使用Python代码，理解误差、采样与日志；学习PID前先掌握P／PD及输出限制。', assessment: '能提供调试前后的测试记录，验证故障退出，并解释采用或不采用某种算法的原因。' },
  { core: 'PID与前馈的组合应用、运动轨迹跟踪', optional: '定位与状态估计，按数学基础、传感器配置和团队需求逐步开展。', category: '运动控制与进阶感知', application: '自动路径行驶、机构运动控制，以及传感器辅助定位。', prerequisite: '使用Java；先掌握子系统开发、反馈控制与测试，再按角色进入专项算法，不要求入班即全部掌握。', assessment: '能交付算法对应的测试证据，说明运行边界，并在团队项目中完成集成与回归验证。' },
];

export function ProgrammingAlgorithms({ levelIndex }: { levelIndex: number }) {
  const item = algorithms[levelIndex];
  return <section className={styles.radarSection} aria-label="核心算法与应用">
    <h4>核心算法与应用</h4>
    <p className={styles.note}>课程规划草案 · {item.category}。流程组织、数据处理和控制算法是不同类型的能力，不作为单一难度排名。</p>
    <div className={styles.columns}>
      <section><h4>核心必修 · 建议</h4><p>{item.core}</p><h4>进阶选修 · 按需开展</h4><p>{item.optional}</p></section>
      <section><h4>机器人应用场景</h4><p>{item.application}</p><h4>学习前提与表达方式</h4><p>{item.prerequisite}</p></section>
    </div>
    <p><strong>建议验收：</strong>{item.assessment}</p>
    <p className={styles.note}>先理解与实验，再实现与验证；实机控制需核对主控接口、反馈条件和安全限制，由教练监督测试。</p>
  </section>;
}
