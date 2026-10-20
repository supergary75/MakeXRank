import {canManageStaff} from './staff-access.mjs';
const tables={
  competitions:['id','event_type','name','created_at','updated_at','last_update','source_text','teams_data'],
  practice_sync:['id','events','deleted_event_ids','updated_at'],
  training_sync:['id','events','schedules','updated_at'],
  team_tag_sync:['id','tags','options','updated_at'],
  logistics_sync:['id','events','deleted_event_ids','updated_at'],
  inspire_sync:['id','payload','updated_at'],
  user_profiles:['auth_user_id','username','display_name','role','is_active','allowed_event_types','allowed_competition_ids','created_at','must_change_password'],
};
// pg encodes JavaScript arrays as PostgreSQL arrays. JSONB columns must be
// explicitly JSON-encoded, while permission scopes remain native text[].
const jsonColumns={
  competitions:['teams_data'],practice_sync:['events','deleted_event_ids'],
  training_sync:['events','schedules'],team_tag_sync:['tags','options'],
  logistics_sync:['events','deleted_event_ids'],inspire_sync:['payload'],
};
const sqlValue=(table,key,value)=>jsonColumns[table]?.includes(key)?JSON.stringify(value):value;
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const restricted=p=>(p.allowed_event_types?.length||p.allowed_competition_ids?.length)>0;
function competitionAccess(p,row){return p.role==='admin'||(row&&(!p.allowed_event_types?.length||p.allowed_event_types.includes(row.event_type))&&(!p.allowed_competition_ids?.length||p.allowed_competition_ids.includes(row.id)));}

export function mountRest(app,pool,{auth,profile}) {
  app.all('/rest/v1/:table',async(req,res,next)=>{try{
    const table=req.params.table,cols=Object.hasOwn(tables,table)?tables[table]:null;if(!cols)fail(404,'Unknown table');
    const publicRead=['competitions','team_tag_sync'].includes(table);
    const user=await auth(req);
    // Existing anonymous clients send a public compatibility API-key bearer.
    // Public reads stay public; all private reads and every mutation require a session.
    if((req.method!=='GET'||!publicRead)&&!user)fail(401,'Authentication required');
    const caller=user&&await profile(user.sub);
    if(user&&!caller?.is_active)fail(403,'Account is disabled');
    if(table==='user_profiles'){
      const target=req.query.auth_user_id;
      const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if(target!==undefined&&(typeof target!=='string'||!target.startsWith('eq.')||!uuid.test(target.slice(3))))fail(400,'Invalid user ID');
      const self=typeof target==='string'&&target.slice(3).toLowerCase()===user?.sub.toLowerCase();
      if(!canManageStaff(caller)&&!(req.method==='GET'&&self))fail(403,'Only supergary can manage staff');
      if(req.method==='POST'||req.method==='DELETE')fail(405,'Use manage-users endpoint');
      if(req.method==='PATCH'){
        if(!isObject(req.body))fail(400,'Invalid profile fields');
        for(const k of ['allowed_event_types','allowed_competition_ids'])if(k in req.body&&req.body[k]!==null&&(!Array.isArray(req.body[k])||req.body[k].some(v=>typeof v!=='string')))fail(400,'Invalid permission scope');
        if(!Object.keys(req.body).length||Object.keys(req.body).some(k=>!['display_name','role','is_active','allowed_event_types','allowed_competition_ids'].includes(k)))fail(400,'Invalid profile fields');
        if(('role' in req.body&&!['admin','editor','viewer'].includes(req.body.role))||('is_active' in req.body&&typeof req.body.is_active!=='boolean')||('display_name' in req.body&&(typeof req.body.display_name!=='string'||!req.body.display_name.trim())))fail(400,'Invalid profile values');
        if(self&&(req.body.is_active===false||('role' in req.body&&req.body.role!=='admin')))fail(400,'Cannot disable or demote your own account');
      }
    }else if(req.method!=='GET'){
      if(!['admin','editor'].includes(caller?.role))fail(403,'Editor permission required');
      if(table==='competitions'&&req.method==='DELETE'&&caller.role!=='admin')fail(403,'Administrator permission required');
      // Opaque shared snapshots cannot safely be filtered then replaced: preserve others' data.
      if(table!=='competitions'&&caller.role!=='admin'&&restricted(caller))fail(403,'Scoped accounts cannot replace shared data; contact an administrator');
    }
    if(req.method==='GET'){
      const selected=String(req.query.select||'*').split(',').filter(c=>c==='*'||cols.includes(c));if(!selected.length)fail(400,'Invalid selected columns');
      const values=[],where=[];
      for(const c of cols){const q=req.query[c];if(typeof q==='string'&&q.startsWith('eq.')){values.push(q.slice(3));where.push(`${c}=$${values.length}`);}}
      let sql=`select ${selected.includes('*')?cols.join(','):selected.join(',')} from ${table}`;if(where.length)sql+=` where ${where.join(' and ')}`;
      if(typeof req.query.order==='string'){const [c,d]=req.query.order.split('.');if(cols.includes(c))sql+=` order by ${c} ${d==='desc'?'desc':'asc'}`;}
      if(req.query.limit)sql+=` limit ${Math.max(1,Math.min(10000,Number(req.query.limit)||1000))}`;
      return res.json((await pool.query(sql,values)).rows);
    }
    if(!['POST','PATCH','DELETE'].includes(req.method))return res.status(405).end();
    const idCol=cols.includes('id')?'id':'auth_user_id';let items;
    if(req.method==='POST'){
      items=Array.isArray(req.body)?req.body:[req.body];
      if(!items.length||items.length>1000||items.some(x=>!isObject(x)||typeof x[idCol]!=='string'||!x[idCol]||x[idCol].length>512))fail(400,'Invalid records');
    }else{
      const raw=req.query[idCol];if(typeof raw!=='string'||!raw.startsWith('eq.')||!raw.slice(3)||raw.length>515)fail(400,'ID filter required');
      if(req.method==='PATCH'&&!isObject(req.body))fail(400,'Invalid record');
      items=[{...(req.method==='PATCH'?req.body:{}),[idCol]:raw.slice(3)}];
    }
    const db=await pool.connect();
    try{
      await db.query('begin');await db.query("set local lock_timeout='5s'; set local statement_timeout='15s'");
      for(const id of [...new Set(items.map(x=>x[idCol]))].sort())await db.query('select pg_advisory_xact_lock(hashtext($1))',[`rest:${table}:${id}`]);
      const output=[];
      for(const original of items){
        const item={...original},id=item[idCol];
        const stored=(await db.query(`select ${cols.join(',')} from ${table} where ${idCol}=$1 for update`,[id])).rows[0];
        if(table==='competitions'){
          if(stored&&!competitionAccess(caller,stored))fail(403,'Competition is outside your scope');
          if(!competitionAccess(caller,{...stored,...item}))fail(403,'Competition is outside your scope');
        }
        if(req.method==='POST'){
          if(table==='competitions'&&(await db.query('select 1 from competition_deletions where id=$1',[id])).rows.length)continue;
          const keys=Object.keys(item).filter(k=>cols.includes(k));
          if(cols.includes('updated_at')&&!keys.includes('updated_at')){item.updated_at=new Date();keys.push('updated_at');}
          const updates=keys.filter(k=>k!==idCol);if(!updates.length)fail(400,'No writable fields');
          output.push((await db.query(`insert into ${table}(${keys.join(',')}) values(${keys.map((_,i)=>`$${i+1}`).join(',')}) on conflict(${idCol}) do update set ${updates.map(k=>`${k}=excluded.${k}`).join(',')} returning ${cols.join(',')}`,keys.map(k=>sqlValue(table,k,item[k])))).rows[0]);
        }else if(req.method==='PATCH'){
          const keys=Object.keys(item).filter(k=>cols.includes(k)&&k!==idCol);if(!keys.length)fail(400,'No writable fields');
          await db.query(`update ${table} set ${keys.map((k,i)=>`${k}=$${i+1}`).join(',')} where ${idCol}=$${keys.length+1}`,[...keys.map(k=>sqlValue(table,k,item[k])),id]);
        }else{
          if(table==='competitions')await db.query('insert into competition_deletions(id) values($1) on conflict(id) do update set deleted_at=now()',[id]);
          await db.query(`delete from ${table} where ${idCol}=$1`,[id]);
        }
      }
      await db.query('commit');return req.method==='POST'?res.status(201).json(output):res.status(204).end();
    }catch(e){await db.query('rollback');throw e;}finally{db.release();}
  }catch(e){next(e);}});
}
