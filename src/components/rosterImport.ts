import { classes, type Rosters, type Member } from './classRoster';
function readJsonRoster(text: string) {
  const data: unknown = JSON.parse(text);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('名册备份格式不正确。');
  const value = (data as Record<string, unknown>).rosters;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('名册备份缺少 rosters。');
  const parsed: {id: string; names: string[]; note: string}[] = [], identities: Member[] = [];
  for (const [id, rows] of Object.entries(value)) {
    if (!classes.some(c=>c.id===id) || !Array.isArray(rows)) throw new Error(`备份班级 ${id} 无法识别，请先核对班级设置。`);
    const names: string[] = [];
    for (const item of rows) {
      const name = typeof item === 'string' ? item : item && typeof item === 'object' ? item.name : undefined;
      if (typeof name !== 'string' || !name.trim() || name.trim().length>80) throw new Error(`${id} 的备份姓名不完整。`);
      names.push(name.trim());
      if (typeof item !== 'string') {
        if (typeof item.id !== 'string' || !item.id.trim()) throw new Error(`${id} 的备份队员 ID 不完整。`);
        identities.push({id:item.id,name:name.trim()});
      }
    }
    if(new Set(names.map(n=>n.toLowerCase())).size!==names.length)throw new Error(`${id} 有重复姓名，请核对。`);
    parsed.push({id,names,note:'从保存的 JSON 名册恢复；原有分班和历史考勤不变。'});
  }
  if (!parsed.length) throw new Error('名册备份中没有班级。');
  return {parsed,identities};
}
export function parseRoster(text: string) {
  if(text.trim().startsWith('{'))return readJsonRoster(text).parsed;
  const result: { id: string; names: string[]; note: string }[] = [];
  let previous: typeof result[number] | undefined;
  for (const raw of text.split(/\r?\n/).filter(line=>line.trim())) {
    const cells = raw.trim().replace(/^\||\|$/g,'').split(raw.includes('\t')?'\t':'|').map(c=>c.replace(/\*\*/g,'').trim());
    if (cells.every(c=>!c || /^:?-+:?$/.test(c)) || cells.includes('班级')) continue;
    const table = /^周[一二三四五六日天]$/.test(cells[0]);
    const id = table ? cells[1] : cells[0];
    const known = classes.find(c=>c.id===id);
    if (known) {
      if(result.some(r=>r.id===id))throw new Error(`班级 ${id} 重复，请合并后导入。`);
      const names = (table?cells.slice(7):cells.slice(1)).filter(Boolean);
      const note = table ? `表填人数 ${cells[5]}；训练安排 ${cells[0]} ${cells[3]}（本次仅导入名单，排课不修改）` : '';
      previous = {id,names,note};result.push(previous);
    } else if (!table && previous && cells.filter(Boolean).every(c=>!/^U\d/.test(c))) {
      previous.names.push(...cells.filter(Boolean));
    } else throw new Error(`无法识别行：${raw.slice(0,70)}`);
  }
  if(!result.length)throw new Error('没有识别到班级，请粘贴完整表格或“班级|姓名”格式。');
  for(const item of result){
    if(item.names.some(n=>n.length>80))throw new Error('姓名过长，请检查表格列位置。');
    if(new Set(item.names.map(n=>n.toLowerCase())).size!==item.names.length)throw new Error(`${item.id} 有重复姓名，请核对。`);
  }
  return result;
}
export function planRosterImport(text: string, old: Rosters) {
  const parsed=parseRoster(text), next: Rosters={}, changes:string[]=[];
  const backupIdentities=text.trim().startsWith('{') ? readJsonRoster(text).identities : [];
  const assigned=new Set<string>();
  for(const item of parsed) {
    next[item.id]=item.names.map(name=>{
      const matches=Object.entries(old).flatMap(([classId,rows])=>rows.filter(r=>r.name.trim().toLowerCase()===name.toLowerCase()).map(member=>({classId,member})));
      const ids=[...new Set(matches.map(m=>m.member.id))];
      if(ids.length>1)throw new Error(`${name} 匹配多个队员 ID，请人工确认后再导入。`);
      const fromBackup=backupIdentities.filter(m=>m.name.trim().toLowerCase()===name.toLowerCase());
      if(!matches.length && new Set(fromBackup.map(m=>m.id)).size>1)throw new Error(`${name} 的备份人员 ID 不唯一，请先核对。`);
      const member:Member=matches[0]?.member ?? fromBackup[0] ?? {id:crypto.randomUUID(),name};
      if(assigned.has(member.id))throw new Error(`${name} 在新表多个班级中重复，暂不自动转班。`);
      assigned.add(member.id);
      for(const match of matches)if(match.classId!==item.id)changes.push(`${name}：${match.classId} → ${item.id}（保留 ID）`);
      return {...member,name};
    });
  }
  for(const [id,members] of Object.entries(old)) {
    if(!next[id]) {const kept=members.filter(m=>!assigned.has(m.id));if(kept.length!==members.length)next[id]=kept;}
  }
  for(const [id,members] of Object.entries(next)) {
    const removed=(old[id]??[]).filter(m=>m.name && !members.some(n=>n.id===m.id));
    for(const m of removed)if(!assigned.has(m.id))changes.push(`${id}：移出 ${m.name}（保留历史考勤）`);
  }
  return {next,parsed,changes};
}

// Recovery is additive: an older source must not silently move current members
// back to an old class, remove newer members, or detach their attendance IDs.
export function planRosterRecovery(text: string, old: Rosters, history: Member[] = []) {
  const decoded=text.trim().startsWith('{') ? readJsonRoster(text) : {parsed:parseRoster(text),identities:[]};
  const parsed=decoded.parsed, identities=[...history,...decoded.identities], next:Rosters={}, changes:string[]=[];
  const normalize=(name:string)=>name.trim().toLowerCase();
  const current=Object.entries(old).flatMap(([classId,rows])=>rows.map(member=>({classId,member})));
  const historicalIds=new Set(identities.map(m=>m.id));
  const assigned=new Set<string>();
  for(const item of parsed) {
    const recovered=(old[item.id]??[]).map(m=>({...m}));
    for(const name of item.names) {
      const matches=current.filter(m=>m.member.name && normalize(m.member.name)===normalize(name));
      if(new Set(matches.map(m=>m.member.id)).size>1)throw new Error(`${name} 匹配多个现有队员，请先核对。`);
      const elsewhere=matches.find(m=>m.classId!==item.id);
      if(elsewhere){changes.push(`${name} 已在 ${elsewhere.classId}，保留现有分班，不按旧表转回。`);continue;}
      const known=matches[0]?.member;
      const past=identities.filter(m=>normalize(m.name)===normalize(name));
      if(!known && new Set(past.map(m=>m.id)).size>1)throw new Error(`${name} 对应多个历史 ID，不能自动恢复。`);
      const historical=known ? undefined : past[0];
      const occupied=historical && current.find(m=>m.member.id===historical.id && m.member.name);
      if(occupied){changes.push(`${name} 的 ID 已由 ${occupied.member.name} 使用，保留现有姓名及分班。`);continue;}
      const blank=recovered.find(m=>!m.name && !historicalIds.has(m.id) && !assigned.has(m.id));
      const member=known ?? historical ?? blank ?? {id:crypto.randomUUID(),name};
      if(assigned.has(member.id))throw new Error(`${name} 在原表多个班级中重复，请先核对。`);
      assigned.add(member.id);
      const position=recovered.findIndex(m=>m.id===member.id);
      if(position>=0){if(!recovered[position].name)recovered[position]={id:member.id,name};}
      else recovered.push({...member,name});
      if(!known)changes.push(`${item.id}：恢复 ${name}${historical ? '（沿用历史 ID）' : blank ? '（保留已有 ID）' : ''}`);
    }
    next[item.id]=recovered.filter(m=>m.name || historicalIds.has(m.id));
  }
  return {next,parsed,changes};
}
