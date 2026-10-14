import styles from './TiangongCraftGallery.module.css';

const crafts = [
  { image: 'tools', title: '匠作之器', subtitle: '从认识工具，到动手实现', description: '木刨、曲尺与凿子的工艺意象，连接今天的零件认识、测量与装配。' },
  { image: 'structures', title: '构筑之法', subtitle: '从一处连接，到完整结构', description: '以榫卯、斗拱和木桥为灵感，理解连接、支撑与整体设计的关系。' },
  { image: 'mechanisms', title: '天工之机', subtitle: '从观察运动，到探索原理', description: '从水车和木齿轮的运动意象出发，走向机器人的动力、传动与控制。' },
];

export function TiangongCraftGallery() {
  return <section className={styles.gallery} aria-labelledby="tiangong-craft-title">
    <header><p>传统工艺 × 现代工程</p><h2 id="tiangong-craft-title">承匠心，造新物。</h2><span>把造物的好奇心，带进机器人的世界。</span></header>
    <div className={styles.grid}>{crafts.map((craft, index) => <article key={craft.image}>
      <img src={`${import.meta.env.BASE_URL}images/tiangong-${craft.image}-v1.png`} alt={`${craft.title}水墨工艺插画`} width="1536" height="1024" loading="lazy" decoding="async" />
      <div className={styles.copy}><span className={styles.number}>0{index + 1}</span><h3>{craft.title}</h3><h4>{craft.subtitle}</h4><p>{craft.description}</p></div>
    </article>)}</div>
    <p className={styles.note}>AI 创作 · 传统工艺意象，仅用于视觉表达，非历史复原或教学结构图。</p>
  </section>;
}
