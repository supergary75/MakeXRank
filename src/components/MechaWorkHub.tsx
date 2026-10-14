import type { ReactNode } from 'react';
import css from './MechaWorkHub.module.css';
import TeamPhotoBanner from './TeamPhotoBanner';
const modules = [
  {view:'home',name:'赛事管理中心',en:'COMPETITION',desc:'赛事后勤、数据分析、练习赛与集训安排。',tags:'赛事协作 / 数据分析',status:'已开放',image:'https://cdn.shopify.com/s/files/1/0440/0326/2624/files/WCP-0994_49432a63-755c-48f0-b0c9-214381011b56.png?v=1718213765'},
  {view:'interview-center',name:'面试流程中心',en:'INTERVIEW',desc:'安排面试、协调教练，在看板中跟进报告与归档。',tags:'面试安排 / 报告归档',status:'开发预览',image:'https://wcproducts.com/cdn/shop/files/WCP-0781-2_1200x1200.png?v=1693264539'},
  {view:'product-center',name:'产品中心',en:'PRODUCT',desc:'从课程体系到教学文档，连接每个级别的成长路径。',tags:'课程体系 / 教学文档',status:'持续建设',image:'https://wcproducts.com/cdn/shop/files/Gussets_7bda8aaf-3b88-4ee9-9518-72ce59f1bb1c_1200x1200.png?v=1710287552'},
  {view:'academic-center',name:'教务管理中心',en:'ACADEMIC',desc:'管理班级与队员，完成课堂点名、出勤统计与跟进。',tags:'班级队员 / 出勤管理',status:'本地记录',image:'https://wcproducts.com/cdn/shop/files/PocketedAluminumGears_1200x1200.png?v=1708134498'},
] as const;
export default function MechaWorkHub({action,onNavigate,onRollCall}:{action:ReactNode;onNavigate:(view:typeof modules[number]['view'])=>void;onRollCall?:()=>void}) {
  return <main className={css.hub} data-hud-home>
    <header className={css.hero}>
      <div className={css.nav}><span className={css.brand}><span className={css.brandMark} aria-hidden="true">⚙</span><span>YOUTH ROBOTICS TRAINING CLUB<small>BUILD · THINK · SOLVE TOGETHER</small></span></span><nav className={css.navLinks} aria-label="工作中心导航"><button type="button" onClick={()=>onNavigate('home')}>赛事</button><button type="button" onClick={()=>onNavigate('product-center')}>产品</button><button type="button" onClick={()=>onNavigate('academic-center')}>教务</button></nav><div className={css.account}>{action}</div></div>
      {onRollCall && <section className={css.quickAttendance} aria-label="教练快捷入口"><div><strong>今日点名</strong><p>查看本人当日课程，点击班级开始点名。</p></div><button data-roll-call-entry type="button" onClick={onRollCall}>进入今日点名 →</button></section>}
      <TeamPhotoBanner kind="home" eyebrow="FROM IDEAS TO IMPACT" title="俱乐部内部工作系统" description="精密制造 · 协同创新 · 成就更好的我们。让机器人从图纸走向赛场，让成长在实践中发生。" />
    </header>
    <section className={css.centers} aria-label="工作中心入口"><div className={css.sectionHeading}><h2>工作中心</h2><span>SELECT MODULE / 选择工作模块</span></div><div className={css.grid}>{modules.map((m,i)=><button key={m.view} className={css.card} onClick={()=>onNavigate(m.view)}>
      <span className={`${css.cardArt} ${m.view==='home'?css.pulleyArt:''}`} aria-hidden="true"><img src={m.image} alt="" loading="lazy"/></span>
      <div className={css.cardTop}><span className={css.number}>{String(i+1).padStart(2,'0')}<small> / MODULE</small></span><span className={css.status}>{m.status}</span></div>
      <span className={css.english}>{m.en} CENTER</span><h3>{m.name}</h3><p>{m.desc}</p><span className={css.tags}>{m.tags}</span><div className={css.cardBottom}><span>进入中心</span><span aria-hidden="true">↗</span></div>
    </button>)}</div><p className={css.note}>零件图片来源：<a href="https://wcproducts.com/products/htd-timing-pulleys" target="_blank" rel="noreferrer">WestCoast Products</a>。教务名单与考勤目前保存在当前浏览器，尚未跨设备同步。</p></section>
  </main>;
}
