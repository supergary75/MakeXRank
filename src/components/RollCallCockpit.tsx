import type { CSSProperties } from 'react';
import css from './RollCallCockpit.module.css';

const profiles = {
  U9: { name:'基础训练舱', accent:'#82dec0', layout:'analog', code:'TRAINER' },
  U12B: { name:'导航训练舱', accent:'#7bd5fa', layout:'navigation', code:'NAVIGATION' },
  U12A: { name:'双仪表任务舱', accent:'#e9c477', layout:'dual', code:'MISSION' },
  U15B: { name:'综合航电舱', accent:'#b5a5fc', layout:'avionics', code:'AVIONICS' },
  U15A: { name:'战术协同舱', accent:'#ffb391', layout:'tactical', code:'TACTICAL' },
  U18B: { name:'系统验证舱', accent:'#edafd5', layout:'systems', code:'SYSTEMS' },
  U18: { name:'旗舰指挥舱', accent:'#98e8ea', layout:'command', code:'COMMAND' },
} as const;

export function cockpitLevel(id: string): keyof typeof profiles {
  const level = id.split('-')[0].toUpperCase();
  if (level.startsWith('U9')) return 'U9';
  if (level === 'U18A' || level === 'U18') return 'U18';
  return Object.hasOwn(profiles, level) ? level as keyof typeof profiles : 'U9';
}

function Dial({value,total,label}: {value:number;total:number;label:string}) {
  const fraction = total > 0 ? Math.min(1,Math.max(0,value/total)) : 0;
  return <div className={css.dial}>
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="43" fill="none" stroke="#3a5263" strokeWidth="1"/>
      {Array.from({length:12},(_,i)=><path key={i} d="M50 10 V15" transform={`rotate(${i*30} 50 50)`} stroke="#8ba4b5"/>)}
      <circle cx="50" cy="50" r="32" fill="none" stroke="#253c4e" strokeWidth="5"/>
      <circle cx="50" cy="50" r="32" fill="none" stroke="currentColor" strokeWidth="5" strokeDasharray={`${fraction*201.06} 201.06`} transform="rotate(-90 50 50)"/>
    </svg>
    <strong>{value}<small>/{total}</small></strong><span>{label}</span>
  </div>;
}

export default function RollCallCockpit({classId,total,confirmed,present,leave,available=true}: {
  classId:string;total:number;confirmed:number;present:number;leave:number;available?:boolean;
}) {
  const level=cockpitLevel(classId), profile=profiles[level];
  const pending=Math.max(0,total-confirmed);
  return <div className={css.cockpit} data-layout={profile.layout} style={{'--cockpit-accent':profile.accent} as CSSProperties}>
    <div className={css.identification}><b>{classId.split('-')[0]}</b><span>{profile.name}<small>{profile.code}</small></span></div>
    {!available ? <div className={css.unavailable}>仪表暂停 · 请查看课程状态</div> : <>
    <div className={css.summary}>
      <span>本次应到 <b>{total}</b> 人</span>
      <strong>{total===0 ? '暂无队员' : pending>0 ? `还有 ${pending} 人未点名` : '全部已确认'}</strong>
    </div>
    <div className={css.cluster}>
      <Dial value={confirmed} total={total} label="点名确认"/>
      <div className={css.readouts}>
        <div><span>已到（含迟到）</span><strong>{present}<small> 人</small></strong></div>
        <div><span>请假人数</span><strong>{leave}<small> 人</small></strong></div>
        <div><span>待确认</span><strong>{pending}<small> 人</small></strong></div>
      </div>
      {(profile.layout==='dual' || profile.layout==='command') && <Dial value={present} total={total} label="本次到课"/>}
      <div className={css.track} aria-hidden="true">{Array.from({length:12},(_,i)=><i key={i} data-lit={total>0 && i/12<confirmed/total}/>)}</div>
    </div>
    <div className={css.explanation}>已确认 {confirmed} / {total} 人 · 已确认不等于已到课</div>
    </>}
    <div className={css.legend}>课堂点名数据 · 非飞行参数</div>
  </div>;
}
