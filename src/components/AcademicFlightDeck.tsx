import css from './AcademicFlightDeck.module.css';
import { academicCloudEnabled } from '../services/academicCloud';
import {WORKSPACE_NAME} from '../workspaceBrand';
const destinations = [
  {view:'class-member-management',code:'01',title:'班级队员管理',english:'CLASSES & MEMBERS',description:'查看班级舱位、管理队员名册，进入个人出勤档案。',label:'班级与队员',icon:'seats'},
  {view:'coach-workbench',code:'02',title:WORKSPACE_NAME,english:'KCLUB INTERNAL WORKSPACE',description:'内部统一工作台，选择快速点名或进入完整网站。',label:'点名 / 完整网站',icon:'check'},
  {view:'attendance-dashboard',code:'03',title:'出勤统计与预警',english:'ATTENDANCE MONITOR',description:'查看周月出勤趋势，跟进缺席、迟到与待提交记录。',label:'统计与跟进',icon:'gauge'},
] as const;
export default function AcademicFlightDeck({onNavigate}:{onNavigate:(view:typeof destinations[number]['view'])=>void}) {
  return <section className={css.deck} aria-label="教务导航面板">
    <div className={css.heading}><div><span>FLIGHT DECK / 教务控制台</span><h2>准备就绪，开始今天的教学</h2></div><p>{academicCloudEnabled?'腾讯云教务 · 按登录账号读取负责班级':'本地预览 · 数据暂存当前浏览器'}</p></div>
    <div className={css.grid}>{destinations.map(d=><button key={d.view} className={css.module} onClick={()=>onNavigate(d.view)}>
      <div className={css.top}><span>MODULE / {d.code}</span><span>{d.label}</span></div>
      <div className={css.instrument} aria-hidden="true"><svg viewBox="0 0 160 80">
        <path d="M10 65H150M80 8V72" stroke="#b8c9cc" strokeDasharray="3 5" fill="none" />
        <path d="M8 23V8h22m100 0h22v15M8 57v15h22m100 0h22V57M17 31h6m-6 8h10m-10 8h6m114-16h6m-10 8h10m-6 8h6" stroke="#6b8a85" strokeWidth="1" />
        {d.icon==='seats'?<>{[34,68,102].map(x=><g key={x}><rect x={x} y="17" width="24" height="30" rx="6"/><path d={`M${x-3} 39v17h30V39M${x+3} 56v8m18-8v8`} /></g>)}</>:d.icon==='check'?<><rect x="49" y="13" width="62" height="54" rx="6"/><path d="M61 30l5 5 9-11m-14 25 5 5 9-11M82 30h17M82 49h17" /></>:<><path d="M33 62a47 47 0 0 1 94 0M43 60v-7m7-21 6 6m24-23v9m24 8-6 6m18 15v7"/><path d="M80 61l25-29" stroke="#b54d27"/><circle cx="80" cy="61" r="4"/></>}
      </svg><span>{d.english}</span></div>
      <h3>{d.title}</h3><p>{d.description}</p><div className={css.bottom}><span>进入模块</span><span aria-hidden="true">↗</span></div>
    </button>)}</div>
    <p className={css.note}>图形为导航标识，不代表实时监测数据。点名保存后仍需核对提交，才计入正式统计。</p>
  </section>;
}
