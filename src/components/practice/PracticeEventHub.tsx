import { useEffect, useState } from 'react';
import styles from './PracticeEventHub.module.css';

interface PracticeEventRecord {
  id: string;
  name: string;
  date: string;
  venue: string;
  notes: string;
  eventItem: string;
  sourceLogisticsEventId: string;
  teams: PracticeTeam[];
}

export interface PracticeLogisticsParticipant {
  id: string;
  name: string;
  role: string;
  eventItem: string;
  teamNo: string;
  teamName: string;
}

export interface PracticeLogisticsEvent {
  id: string;
  name: string;
  date: string;
  venue: string;
  participants: PracticeLogisticsParticipant[];
}

interface PracticeTeam {
  id: string;
  eventItem: string;
  teamNo: string;
  teamName: string;
  members: Array<{ id: string; name: string }>;
}

interface PracticeEventHubProps {
  logisticsEvents: PracticeLogisticsEvent[];
  onOpenInspire: () => void;
  onOpenExplorer: () => void;
  onOpenSimulation: () => void;
  onOpenScoreCalculator: () => void;
}

const STORAGE_KEY = 'makexrank::practice-events';

function loadEvents(): PracticeEventRecord[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.map((event) => ({
      ...event,
      eventItem: typeof event.eventItem === 'string' && event.eventItem ? event.eventItem : 'MakeX Explorer',
      sourceLogisticsEventId: typeof event.sourceLogisticsEventId === 'string' ? event.sourceLogisticsEventId : '',
      teams: Array.isArray(event.teams) ? event.teams : [],
    })) : [];
  } catch {
    return [];
  }
}

function buildPracticeTeams(source: PracticeLogisticsEvent, selectedEventItem: string): PracticeTeam[] {
  const groups = new Map<string, PracticeTeam>();
  const selectedSeries = selectedEventItem.replace('MakeX ', '').trim().toLowerCase();
  source.participants.filter((participant) => participant.role === '队员'
    && (!selectedSeries || participant.eventItem.toLowerCase().includes(selectedSeries))).forEach((participant) => {
    const eventItem = participant.eventItem.trim() || '未分赛项';
    const teamNo = participant.teamNo.trim() || '未填写编号';
    const teamName = participant.teamName.trim() || teamNo;
    const key = `${eventItem}::${teamNo}::${teamName}`;
    const team = groups.get(key) ?? { id: key, eventItem, teamNo, teamName, members: [] };
    team.members.push({ id: participant.id, name: participant.name });
    groups.set(key, team);
  });
  return Array.from(groups.values());
}

export function PracticeEventHub({ logisticsEvents, onOpenInspire, onOpenExplorer, onOpenSimulation, onOpenScoreCalculator }: PracticeEventHubProps) {
  const [events, setEvents] = useState<PracticeEventRecord[]>(loadEvents);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [form, setForm] = useState({
    sourceLogisticsEventId: '',
    eventItem: 'MakeX Explorer',
    name: '',
    date: new Date().toISOString().slice(0, 10),
    venue: '',
    notes: '',
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  }, [events]);

  const activeEvent = events.find((event) => event.id === activeEventId) ?? null;
  const activeEventItem = activeEvent?.eventItem || 'MakeX Explorer';
  const activeSeries = activeEventItem.replace('MakeX ', '').trim().toLowerCase();
  const activeTeams = activeEvent && Array.isArray(activeEvent.teams)
    ? activeEvent.teams.filter((team) => !activeSeries || team.eventItem.toLowerCase().includes(activeSeries))
    : [];

  const createEvent = () => {
    const name = form.name.trim();
    if (!name) return;
    const source = logisticsEvents.find((event) => event.id === form.sourceLogisticsEventId);
    setEvents((current) => [{
      id: `practice-${Date.now()}`,
      name,
      date: form.date,
      venue: form.venue.trim(),
      notes: form.notes.trim(),
      eventItem: form.eventItem,
      sourceLogisticsEventId: source?.id ?? '',
      teams: source ? buildPracticeTeams(source, form.eventItem) : [],
    }, ...current]);
    setForm((current) => ({ ...current, sourceLogisticsEventId: '', name: '', venue: '', notes: '' }));
  };

  const selectLogisticsEvent = (sourceId: string) => {
    const source = logisticsEvents.find((event) => event.id === sourceId);
    setForm((current) => ({ ...current, sourceLogisticsEventId: sourceId, name: source?.name ?? current.name, date: source?.date || current.date, venue: source?.venue ?? current.venue }));
  };

  const syncActiveEvent = () => {
    if (!activeEvent?.sourceLogisticsEventId) return;
    const source = logisticsEvents.find((event) => event.id === activeEvent.sourceLogisticsEventId);
    if (!source) return;
    setEvents((current) => current.map((event) => event.id === activeEvent.id ? { ...event, name: source.name, date: source.date, venue: source.venue, teams: buildPracticeTeams(source, event.eventItem || 'MakeX Explorer') } : event));
  };

  const deleteEvent = (eventId: string) => {
    setEvents((current) => current.filter((event) => event.id !== eventId));
    if (activeEventId === eventId) setActiveEventId(null);
  };

  if (activeEvent) {
    return (
      <div className={styles.hub}>
        <div className={styles.workspaceBar}>
          <button type="button" onClick={() => setActiveEventId(null)}>← 返回练习赛列表</button>
          <div><strong>{activeEvent.name}</strong><span>{activeEvent.date || '日期待定'} · {activeEvent.venue || '场地待定'} · {activeEventItem}</span></div>
          <em>练习赛工作台</em>
        </div>

        {activeEvent.notes && <p className={styles.eventNotes}>{activeEvent.notes}</p>}

        <section className={styles.rosterSection}>
          <div className={styles.heading}>
            <div><small>Club Teams</small><h2>俱乐部内部赛队</h2></div>
            {activeEvent.sourceLogisticsEventId && <button className={styles.syncButton} type="button" onClick={syncActiveEvent}>同步后勤最新人员</button>}
          </div>
          {activeTeams.length === 0 ? <div className={styles.empty}><strong>暂无内部赛队</strong><span>来源赛事中尚未录入角色为“队员”的人员。</span></div> : (
            <div className={styles.teamTableWrap}>
              <table className={styles.teamTable}>
                <thead><tr><th>赛项</th><th>队号</th><th>队名</th><th>人数</th><th>队员</th></tr></thead>
                <tbody>{activeTeams.map((team) => <tr key={team.id}><td><span>{team.eventItem}</span></td><td><strong>{team.teamNo}</strong></td><td>{team.teamName}</td><td>{team.members.length}</td><td>{team.members.map((member) => member.name).join('、')}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </section>

        <div className={styles.moduleGrid}>
          <article className={styles.moduleCard}>
            <div className={styles.cardTop}><div><small>练习赛项</small><h3>MakeX Inspire</h3></div><span>Inspire</span></div>
            <p>用于 Inspire 练习赛数据整理。后续可以接入常规任务、随机任务、最好成绩、最快时间和训练复盘记录。</p>
            <button type="button" onClick={onOpenInspire}>进入 MakeX Inspire</button>
          </article>
          <article className={styles.moduleCard}>
            <div className={styles.cardTop}><div><small>练习赛项</small><h3>MakeX Explorer</h3></div><span>Explorer</span></div>
            <p>用于 Explorer 练习赛数据整理，包含表格读取、参数分析、单场得分、EPA 变化和训练复盘。</p>
            <button type="button" onClick={onOpenExplorer}>进入 MakeX Explorer</button>
          </article>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.hub}>
      <section className={styles.builder}>
        <div className={styles.heading}><div><small>Practice Event</small><h2>创建练习赛事</h2></div><span>{events.length} 场赛事</span></div>
        <p className={styles.hint}>填写练习赛基本信息生成赛事卡片，点击卡片后进入该赛事的数据分析与模拟比赛工具。</p>
        <div className={styles.formGrid}>
          <label className={styles.wideField}><span>从后勤赛事调用（推荐）</span><select value={form.sourceLogisticsEventId} onChange={(event) => selectLogisticsEvent(event.target.value)}><option value="">不调用，手动创建</option>{logisticsEvents.map((event) => <option key={event.id} value={event.id}>{event.name}（{event.participants.filter((participant) => participant.role === '队员').length} 名队员）</option>)}</select></label>
          <label><span>对应赛项</span><select value={form.eventItem} onChange={(event) => setForm((current) => ({ ...current, eventItem: event.target.value }))}><option>MakeX Explorer</option><option>MakeX Inspire</option><option>MakeX Challenge</option></select></label>
          <label><span>赛事名称</span><input placeholder="例如：8 月 Explorer 队内练习赛" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
          <label><span>比赛日期</span><input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} /></label>
          <label><span>比赛场地</span><input placeholder="例如：KCLUB 训练场" value={form.venue} onChange={(event) => setForm((current) => ({ ...current, venue: event.target.value }))} /></label>
          <label><span>备注</span><input placeholder="训练目标或参赛队伍说明" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label>
        </div>
        <button className={styles.primaryButton} type="button" onClick={createEvent} disabled={!form.name.trim()}>生成赛事卡片</button>
      </section>

      <section className={styles.listSection}>
        <div className={styles.heading}><div><small>Practice Cards</small><h2>练习赛事列表</h2></div></div>
        {events.length === 0 ? (
          <div className={styles.empty}><strong>暂无练习赛事</strong><span>请先填写上方信息并生成赛事卡片。</span></div>
        ) : (
          <div className={styles.eventGrid}>
            {events.map((event) => (
              <article key={event.id} className={styles.eventCard}>
                <div><span>练习赛事</span><small>{event.date || '日期待定'}</small></div>
                <h3>{event.name}</h3>
                <p>{event.eventItem} · {event.venue || '场地待定'}</p>
                <div className={styles.cardActions}>
                  <button type="button" onClick={() => setActiveEventId(event.id)}>进入练习赛工作台</button>
                  <button className={styles.deleteButton} type="button" onClick={() => deleteEvent(event.id)}>删除卡片</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className={styles.simulatorSection}>
        <div className={styles.heading}><div><small>Simulation</small><h2>赛事模拟器</h2></div><span>独立工具</span></div>
        <p className={styles.hint}>与练习赛事列表同级使用，无需先创建或进入赛事卡片。用于战队签到、比赛计时、现场判罚和语音倒计时演练。</p>
        <button className={styles.primaryButton} type="button" onClick={onOpenSimulation}>进入赛事模拟器</button>
      </section>

      <section className={styles.simulatorSection}>
        <div className={styles.heading}><div><small>Score Calculator</small><h2>比赛计分器</h2></div><span>独立工具</span></div>
        <p className={styles.hint}>快速记录红蓝双方得分、加减分项目和最终比分，点击进入独立计分界面。</p>
        <button className={styles.primaryButton} type="button" onClick={onOpenScoreCalculator}>进入比赛计分器</button>
      </section>
    </div>
  );
}
