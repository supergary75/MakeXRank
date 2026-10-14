import { statusLabel, type AttendanceRecord, type AttendanceRow } from './attendance';
export type Entry = { date: string; classId: string; session: string; record: AttendanceRecord };
export type Rules = { consecutive: number; late: number; rate: number; minimum: number };
export const defaultRules: Rules = { consecutive: 2, late: 2, rate: 75, minimum: 4 };
export type AttendanceAlert = { id: string; title: string; detail: string; classId: string; date: string; memberId?: string };
export function summarize(entries: Entry[]) {
  const final = entries.filter(e => e.record.phase === 'submitted');
  const rows = final.flatMap(e=>e.record.rows).filter(r=>r.status);
  const arrived = rows.filter(r=>r.status==='present' || r.status==='late').length;
  return { lessons: final.length, expected: rows.length, arrived, rate: rows.length ? Math.round(arrived/rows.length*100) : null,
    late: rows.filter(r=>r.status==='late').length, sick: rows.filter(r=>r.status==='absent' && r.reason==='病假').length,
    leave: rows.filter(r=>r.status==='absent' && r.reason==='事假').length, other: rows.filter(r=>r.status==='absent' && r.reason==='自定义').length,
    unverified: rows.filter(r=>r.status==='unverified').length, drafts: entries.filter(e=>e.record.phase!=='submitted' || e.record.hasDraft).length };
}
export function buildAlerts(entries: Entry[], rules: Rules): AttendanceAlert[] {
  const alerts: AttendanceAlert[] = [];
  const groups = new Map<string, { entry: Entry; row: AttendanceRow }[]>();
  for (const entry of entries.filter(e=>e.record.phase==='submitted').sort((a,b)=>(a.date+a.session).localeCompare(b.date+b.session))) {
    for (const row of entry.record.rows.filter(r=>r.status)) {
      const list = groups.get(row.id) ?? []; list.push({entry,row}); groups.set(row.id,list);
      if (row.status==='unverified') alerts.push({id:`unverified:${entry.date}:${entry.classId}:${entry.session}:${row.id}`,title:`${row.name} · 未到待核实`,detail:'请联系家长确认，不自动视为旷课。',classId:entry.classId,date:entry.date,memberId:row.id});
    }
  }
  for (const [id, list] of groups) {
    const last = list[list.length-1];
    const base = {classId:last.entry.classId,date:last.entry.date,memberId:id};
    let streak = 0; for (const item of list.slice().reverse()) { if (['absent','unverified'].includes(item.row.status)) streak++; else break; }
    const evidence = (items: typeof list) => items.map(x=>`${x.entry.date} ${x.entry.classId} ${statusLabel(x.row)}`).join('；');
    if (streak>=rules.consecutive) alerts.push({...base,id:`streak:${id}:${last.entry.date}:${last.entry.session}`,title:`${last.row.name} · 连续缺席 ${streak} 次`,detail:evidence(list.slice(-streak))+'。请关怀跟进，请假不代表违规。'});
    const recent=list.slice(-4), late=recent.filter(x=>x.row.status==='late').length;
    if (late>=rules.late) alerts.push({...base,id:`late:${id}:${last.entry.date}:${last.entry.session}`,title:`${last.row.name} · 最近 ${recent.length} 次迟到 ${late} 次`,detail:evidence(recent)});
    const months = new Map<string, typeof list>();
    for (const item of list) {const month=item.entry.date.slice(0,7);months.set(month,[...months.get(month) ?? [],item]);}
    for (const [month, items] of months) {
      const rate=items.filter(x=>['present','late'].includes(x.row.status)).length/items.length*100;
      if(items.length>=rules.minimum && rate<rules.rate) alerts.push({...base,date:items[items.length-1].entry.date,id:`rate:${id}:${month}`,title:`${last.row.name} · ${month} 出勤偏低`,detail:`${items.length} 次已提交记录，出勤率 ${Math.round(rate)}%，低于 ${rules.rate}%。`});
    }
  }
  return alerts;
}
