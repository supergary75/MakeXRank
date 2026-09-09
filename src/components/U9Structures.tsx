import styles from './CurriculumSystem.module.css';

const structures = [
  { name: '稳固框架', use: '让底盘和支架不容易歪、散。', principle: '在连接可转动的框架中，增加合适的斜撑，可以限制框架变形；连接点本身也要牢固。', experiment: '搭一个四边框，轻推观察；增加斜撑后用同样方式再试。', question: '加了哪根梁以后不容易歪？为什么？', parts: '梁、连接销、支撑件', stage: '基础' },
  { name: '轮轴与支撑', use: '让小车的轮子顺畅转动。', principle: '轮子与轴配合传递运动，支架支撑轴；转动位置不能被夹紧，固定位置不能随意滑动。', experiment: '搭一根带轮子的轴，比较支架过紧和留有合适活动空间时的转动。', question: '哪里需要固定，哪里必须能转动？', parts: '轮、轴、轴套、梁', stage: '基础' },
  { name: '齿轮传动', use: '把转动传到另一个位置，改变转动方向或快慢。', principle: '两个直接啮合的外齿轮转向相反；大齿轮带小齿轮时，小齿轮转得更快，反过来则更慢。', experiment: '先装两个相同齿轮，标记转向；再换大小齿轮，手摇并数转圈次数。', question: '哪个轮转得快？换成它来带动另一个，会怎样？', parts: '齿轮、轴、支撑梁', stage: '基础' },
  { name: '杠杆与抬升', use: '抬起物体，制作简单机械臂。', principle: '围绕支点转动时，施力点离支点越远，抬起同样物体通常越省力，但手要移动更长的距离。', experiment: '用梁做杠杆，以轻小积木为负载，改变手的施力位置比较感受。', question: '从哪里按更容易抬起？手移动的距离一样吗？', parts: '长梁、轴、支点支架', stage: '基础' },
  { name: '带轮传动', use: '把转动传给相隔一段距离的轴。', principle: '普通不交叉的带连接两个带轮时，两轮转向相同；带过松可能打滑，并不是越紧越好。', experiment: '用合适的带与带轮连接两根轴，手摇观察另一端，再检查打滑现象。', question: '带轮转了，另一端为什么有时没跟着转？', parts: '带轮、适配皮带、轴', stage: '拓展' },
  { name: '齿轮与齿条', use: '让平台或推杆沿直线移动。', principle: '转动的齿轮推动齿条，把旋转变成直线运动；导向结构帮助它沿预定方向移动。', experiment: '搭一个短行程推杆，手摇齿轮，观察正反转对应的伸出与收回。', question: '齿轮转动时，哪个零件在走直线？', parts: '齿轮、齿条、导向支架', stage: '拓展' },
  { name: '曲柄连杆', use: '让小人摆动，或让机构来回运动。', principle: '转轴上偏离中心的连接点带动连杆；配合支点或导向，可以把连续转动变成来回运动。', experiment: '搭一个手摇摆动机构，缓慢转一圈，观察连杆位置怎样变化。', question: '手柄一直往一个方向转，为什么另一端会来回动？', parts: '曲柄、连杆、轴、支撑件', stage: '拓展' },
  { name: '夹持机构', use: '夹住轻小物体，再松开放下。', principle: '通过杠杆或齿轮带动夹爪开合；夹爪形状和接触面会影响是否容易滑落。', experiment: '搭简单夹爪，夹取轻小积木，比较不同接触面或开口大小的效果。', question: '为什么夹住了还会滑？可以改哪里？', parts: '梁、轴、连接件，可选齿轮', stage: '综合应用' },
];

export function U9Structures() {
  return <section aria-label="U9 LEGO经典结构与原理">
    <h4>LEGO经典结构：搭出来，也说得明白</h4>
    <p>先看它怎么动，再亲手搭、改一处、比较结果。不要求背公式，用自己的话解释原理。</p>
    <p className={styles.note}>建议先学四项基础，再按器材与学习情况选择拓展；这是俱乐部教学草案，不是LEGO官方课程清单。</p>
    <div className={styles.columns}>{structures.map(item => <details key={item.name} className={styles.radarScale}>
      <summary>{item.name} · {item.stage}</summary>
      <p><strong>有什么用：</strong>{item.use}</p>
      <p><strong>简单原理：</strong>{item.principle}</p>
      <p><strong>搭建与实验：</strong>{item.experiment}</p>
      <p><strong>问问孩子：</strong>{item.question}</p>
      <p className={styles.note}>认识零件：{item.parts}。具体零件以实际套件为准。</p>
    </details>)}</div>
    <section className={styles.rationale}><h4>怎样算真正理解？</h4><p>能够指出主要零件，说出输入和输出怎样运动，预测改动后的变化，并用搭建实验验证。</p><p className={styles.note}>先手动、轻载验证，不把手伸入啮合或夹持部位；电机测试由教练监督，卡住时先停止再调整。</p></section>
  </section>;
}
