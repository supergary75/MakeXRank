import styles from './CurriculumSystem.module.css';

const flows = [
  [
    ['起点 A', '直行到转弯点', '停车并转向', '直行到目标 B', '记录偏差 → 调整参数'],
    ['设置重复次数＝4', '前进一条边', '转弯一次', '未满4次 → 回到前进', '完成 → 比较终点与起点'],
  ],
  [
    ['低速测试开始', '读取距离', '小于阈值？', '是：停车｜否：继续前进', '循环读取，观察停止位置'],
    ['起点', '方案一：A → B', '方案二：B → A', '分别试跑3次', '比较耗时与完成情况'],
  ],
  [
    ['读取两个按钮', '判断输入组合', '仅开：打开｜仅关：关闭', '冲突输入：停止优先', '松开：按约定停止逻辑验证'],
    ['开始自动任务', '移动阶段', '到位 → 取放阶段', '完成 → 结束并停止', '任一步超时 → 停止'],
  ],
  [
    ['积木：重复3次', '对应 Python：for 循环', '循环体：提示一次', '预测 → 修改为5次', '运行并核对提示次数'],
    ['输入样例距离', '积木判断 ↔ Python if/else', '比较距离与阈值', '分别推演大于／等于／小于', '对照图形程序验证结果'],
  ],
  [
    ['列出相同输入与动作', '实现一：图形函数', '实现二：Python函数', '使用同一组测试输入', '比较正常与冲突时的输出'],
    ['开始 → 移动', '检查到位信号', '到位：完成并停止', '超时／取消：停止并退出', '记录退出原因'],
  ],
  [
    ['机构A：准备', '检查准备状态', '就绪 → 允许机构B动作', '失败／超时 → 停止流程', '取消 → 各模块安全停止'],
    ['模拟缺失反馈', '记录时间／状态／反馈', '查找卡住的阶段', '修改 → 重现原测试', '回归验证正常流程'],
  ],
  [
    ['明确机构需求', 'Java类：封装状态与行为', '公开动作与状态接口', '模拟验证 → 实机验证', '队友依据文档调用与停止'],
    ['申请子系统资源', '开始并调度任务', '持续执行与检查条件', '完成／超时／取消 → 结束', '安全停止并释放资源'],
  ],
];

export function ProgrammingExampleDiagram({ levelIndex, exampleIndex, title }: { levelIndex: number; exampleIndex: number; title: string }) {
  return <figure className={styles.exampleDiagram} aria-label={`${title}流程示意图`}>
    <figcaption>任务流程示意</figcaption>
    <ol>{flows[levelIndex][exampleIndex].map((step, i) => <li key={step}>
      <span className={styles.diagramNumber}>{String(i + 1).padStart(2, '0')}</span>
      <span>{step}</span>
    </li>)}</ol>
    <small>教学逻辑示意，非实际积木界面或可直接运行的程序。</small>
  </figure>;
}
