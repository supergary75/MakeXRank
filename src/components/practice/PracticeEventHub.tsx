import { useEffect, useState } from 'react';
import styles from './PracticeEventHub.module.css';
import { ScoreCalculator, type ScoreCalculatorResult } from '../scoring/ScoreCalculator';

interface PracticeEventRecord {
  id: string;
  name: string;
  date: string;
  venue: string;
  notes: string;
  eventItem: string;
  sourceLogisticsEventId: string;
  teams: PracticeTeam[];
  manualTeams: PracticeTeam[];
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

interface PracticeMatch {
  id: string;
  slot: number;
  field: number;
  red1: PracticeTeam;
  red2: PracticeTeam;
  blue1: PracticeTeam;
  blue2: PracticeTeam;
}

interface PracticeEventHubProps {
  logisticsEvents: PracticeLogisticsEvent[];
  accessToken?: string;
  onOpenInspire: () => void;
  onOpenExplorer: () => void;
  onOpenSimulation: () => void;
  onOpenScoreCalculator: () => void;
}

const STORAGE_KEY = 'makexrank::practice-events';
const ACTIVE_EXPLORER_TEAMS_KEY = 'makexrank::active-practice-explorer-teams';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
const PRACTICE_SYNC_TABLE = import.meta.env.VITE_SUPABASE_PRACTICE_SYNC_TABLE?.trim() || 'practice_sync';
const PRACTICE_SYNC_ID = 'shared-practice-state';

async function syncPracticeEvents(events: PracticeEventRecord[], accessToken: string): Promise<PracticeEventRecord[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return events;
  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
  const query = new URLSearchParams({ select: 'events', id: `eq.${PRACTICE_SYNC_ID}`, limit: '1' });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${PRACTICE_SYNC_TABLE}?${query.toString()}`, { headers });
  if (!response.ok) throw new Error(`读取练习赛云数据失败（${response.status}）`);
  const rows = await response.json() as Array<{ events?: PracticeEventRecord[] }>;
  const remoteEvents = Array.isArray(rows[0]?.events) ? rows[0].events : [];
  const merged = new Map(remoteEvents.map((event) => [event.id, event]));
  events.forEach((event) => {
    const remoteEvent = merged.get(event.id);
    merged.set(event.id, remoteEvent ? {
      ...remoteEvent,
      ...event,
      manualTeams: mergePracticeTeams(remoteEvent.manualTeams ?? [], event.manualTeams ?? []),
    } : event);
  });
  const next = Array.from(merged.values());
  const saveResponse = await fetch(`${SUPABASE_URL}/rest/v1/${PRACTICE_SYNC_TABLE}?on_conflict=id`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: PRACTICE_SYNC_ID, events: next, updated_at: new Date().toISOString() }),
  });
  if (!saveResponse.ok) throw new Error(`保存练习赛云数据失败（${saveResponse.status}）`);
  return next;
}

function loadEvents(): PracticeEventRecord[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.map((event) => ({
      ...event,
      eventItem: typeof event.eventItem === 'string' && event.eventItem ? event.eventItem : 'MakeX Explorer',
      sourceLogisticsEventId: typeof event.sourceLogisticsEventId === 'string' ? event.sourceLogisticsEventId : '',
      teams: Array.isArray(event.teams) ? event.teams : [],
      manualTeams: Array.isArray(event.manualTeams) ? event.manualTeams : [],
    })) : [];
  } catch {
    return [];
  }
}

function normalizeEventItem(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchesEventItem(value: string, selectedItem: string): boolean {
  const normalizedValue = normalizeEventItem(value);
  const normalizedSelected = normalizeEventItem(selectedItem);
  if (!normalizedValue) return false;
  return normalizedValue.includes(normalizedSelected)
    || normalizedSelected.includes(normalizedValue)
    || (normalizedSelected === 'makexinspire' && normalizedValue.includes('ins'))
    || (normalizedSelected === 'makexexplorer' && normalizedValue.includes('exp'))
    || (normalizedSelected === 'makexchallenge' && normalizedValue.includes('cha'));
}

function buildPracticeTeams(source: PracticeLogisticsEvent, selectedEventItem: string): PracticeTeam[] {
  const groups = new Map<string, PracticeTeam>();
  source.participants.filter((participant) => participant.role === '队员'
    && matchesEventItem(participant.eventItem, selectedEventItem)).forEach((participant) => {
    const teamNo = participant.teamNo.trim() || '未填写编号';
    const teamName = participant.teamName.trim() || teamNo;
    const normalizedTeamNo = teamNo.replace(/\s+/g, '').toLowerCase();
    const normalizedTeamName = teamName.replace(/\s+/g, '').toLowerCase();
    const teamIdentity = normalizedTeamNo && !teamNo.includes('未填写') ? normalizedTeamNo : normalizedTeamName;
    const key = `${normalizeEventItem(selectedEventItem)}::${teamIdentity}`;
    const team = groups.get(key) ?? { id: key, eventItem: selectedEventItem, teamNo, teamName, members: [] };
    if (!team.members.some((member) => member.id === participant.id)) {
      team.members.push({ id: participant.id, name: participant.name });
    }
    groups.set(key, team);
  });
  return Array.from(groups.values());
}

function mergePracticeTeams(...teamSets: PracticeTeam[][]): PracticeTeam[] {
  const merged = new Map<string, PracticeTeam>();
  teamSets.flat().forEach((team) => {
    const key = `${normalizeEventItem(team.eventItem)}::${team.teamNo.replace(/\s+/g, '').toLowerCase()}`;
    const current = merged.get(key);
    if (!current) { merged.set(key, { ...team, id: key, members: [...team.members] }); return; }
    team.members.forEach((member) => {
      if (!current.members.some((item) => item.name.trim().toLowerCase() === member.name.trim().toLowerCase())) current.members.push(member);
    });
    if ((!current.teamName || current.teamName === current.teamNo) && team.teamName) current.teamName = team.teamName;
  });
  return Array.from(merged.values());
}

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

function generateExplorerSchedule(teams: PracticeTeam[], roundsPerTeam: number, fieldCount: number): PracticeMatch[] | null {
  if (teams.length < 4 || (teams.length * roundsPerTeam) % 4 !== 0) return null;
  const matchCount = (teams.length * roundsPerTeam) / 4;
  let best: { matches: PracticeMatch[]; score: number } | null = null;

  for (let attempt = 0; attempt < 700; attempt += 1) {
    const remaining = new Map(teams.map((team) => [team.id, roundsPerTeam]));
    const lastPlayed = new Map<string, number>();
    const partners = new Map<string, number>();
    const opponents = new Map<string, number>();
    const matches: PracticeMatch[] = [];
    let score = 0;
    let currentSlotTeams = new Set<string>();

    for (let matchIndex = 0; matchIndex < matchCount; matchIndex += 1) {
      const slot = Math.floor(matchIndex / fieldCount);
      const field = (matchIndex % fieldCount) + 1;
      if (field === 1) currentSlotTeams = new Set<string>();
      const available = shuffled(teams).filter((team) => (remaining.get(team.id) ?? 0) > 0 && !currentSlotTeams.has(team.id));
      const chosen: PracticeTeam[] = [];
      while (chosen.length < 4) {
        const candidates = available.filter((team) => !chosen.some((item) => item.id === team.id));
        if (!candidates.length) break;
        candidates.sort((a, b) => {
          const restA = lastPlayed.get(a.id) === slot - 1 ? 100 : 0;
          const restB = lastPlayed.get(b.id) === slot - 1 ? 100 : 0;
          return restA - restB || (remaining.get(b.id) ?? 0) - (remaining.get(a.id) ?? 0) || Math.random() - 0.5;
        });
        chosen.push(candidates[0]);
      }
      if (chosen.length < 4) break;

      let bestOrder = chosen;
      let bestOrderScore = Number.POSITIVE_INFINITY;
      for (let orderAttempt = 0; orderAttempt < 24; orderAttempt += 1) {
        const order = shuffled(chosen);
        const partnerPairs = [[order[0], order[1]], [order[2], order[3]]];
        const opponentPairs = [[order[0], order[2]], [order[0], order[3]], [order[1], order[2]], [order[1], order[3]]];
        const orderScore = partnerPairs.reduce((total, pair) => total + (partners.get(pair.map((team) => team.id).sort().join('|')) ?? 0) * 12, 0)
          + opponentPairs.reduce((total, pair) => total + (opponents.get(pair.map((team) => team.id).sort().join('|')) ?? 0) * 3, 0);
        if (orderScore < bestOrderScore) { bestOrder = order; bestOrderScore = orderScore; }
      }

      const [red1, red2, blue1, blue2] = bestOrder;
      [[red1, red2], [blue1, blue2]].forEach((pair) => {
        const key = pair.map((team) => team.id).sort().join('|');
        partners.set(key, (partners.get(key) ?? 0) + 1);
      });
      [[red1, blue1], [red1, blue2], [red2, blue1], [red2, blue2]].forEach((pair) => {
        const key = pair.map((team) => team.id).sort().join('|');
        opponents.set(key, (opponents.get(key) ?? 0) + 1);
      });
      bestOrder.forEach((team) => {
        if (lastPlayed.get(team.id) === slot - 1) score += 100;
        remaining.set(team.id, (remaining.get(team.id) ?? 0) - 1);
        lastPlayed.set(team.id, slot);
        currentSlotTeams.add(team.id);
      });
      score += bestOrderScore;
      matches.push({ id: `match-${matchIndex + 1}`, slot: slot + 1, field, red1, red2, blue1, blue2 });
    }

    if (matches.length === matchCount && Array.from(remaining.values()).every((count) => count === 0)) {
      if (!best || score < best.score) best = { matches, score };
      if (score === 0) break;
    }
  }
  return best?.matches ?? null;
}

export function ExplorerScheduleGenerator() {
  const roundsPerTeam = 4;
  const [fieldCount, setFieldCount] = useState(1);
  const [schedule, setSchedule] = useState<PracticeMatch[]>([]);
  const [message, setMessage] = useState('');
  const [results, setResults] = useState<Record<string, ScoreCalculatorResult>>({});
  const [activeScoreMatch, setActiveScoreMatch] = useState<PracticeMatch | null>(null);
  let teams: PracticeTeam[] = [];
  try { teams = JSON.parse(window.localStorage.getItem(ACTIVE_EXPLORER_TEAMS_KEY) ?? '[]'); } catch { teams = []; }
  const createSchedule = () => {
    const minimumTeamCount = fieldCount * 4;
    const virtualTeamCount = Math.max(0, minimumTeamCount - teams.length);
    const virtualTeams: PracticeTeam[] = Array.from({ length: virtualTeamCount }, (_, index) => ({
      id: `virtual-explorer-${index + 1}`,
      eventItem: 'MakeX Explorer',
      teamNo: `V${String(index + 1).padStart(3, '0')}`,
      teamName: `虚拟赛队${index + 1}`,
      members: [{ id: `virtual-member-${index + 1}`, name: '虚拟队员' }],
    }));
    const scheduledTeams = [...teams, ...virtualTeams];
    const next = generateExplorerSchedule(scheduledTeams, roundsPerTeam, fieldCount);
    setSchedule(next ?? []);
    setResults({});
    setMessage(next
      ? `已使用 ${teams.length} 支真实赛队${virtualTeamCount ? `，并补入 ${virtualTeamCount} 支虚拟赛队` : ''}，生成 ${next.length} 场随机赛程；每队参加固定4场资格赛。`
      : '当前条件未找到合适赛程，请重新生成。');
  };
  const ranking = Array.from(new Map(schedule.flatMap((match) => [match.red1, match.red2, match.blue1, match.blue2]).map((team) => [team.id, team])).values()).map((team) => {
    let played = 0; let wins = 0; let draws = 0; let losses = 0; let rankingPoints = 0; let totalScore = 0; let netScore = 0;
    schedule.forEach((match) => {
      const result = results[match.id];
      if (!result) return;
      const isRed = match.red1.id === team.id || match.red2.id === team.id;
      const isBlue = match.blue1.id === team.id || match.blue2.id === team.id;
      if (!isRed && !isBlue) return;
      played += 1;
      const own = isRed ? result.redScore : result.blueScore;
      const other = isRed ? result.blueScore : result.redScore;
      totalScore += own; netScore += own - other;
      if (own > other) { wins += 1; rankingPoints += 3; } else if (own === other) { draws += 1; rankingPoints += 1; } else losses += 1;
    });
    return { team, played, wins, draws, losses, rankingPoints, totalScore, netScore };
  }).sort((a, b) => b.rankingPoints - a.rankingPoints || b.totalScore - a.totalScore || b.netScore - a.netScore || a.team.teamNo.localeCompare(b.team.teamNo));
  return <section className={styles.secondarySchedule}>
    <div><small>Schedule Generator</small><h2>Explorer 赛程生成器</h2></div>
    <p>每支赛队固定参加4场资格赛；多个场地可同时比赛，同一时间轮次不会重复安排同一支赛队。赛队不足场地满负荷时，自动创建虚拟赛队补足。</p>
    <div className={styles.scheduleControls}><label><span>比赛场地数量</span><select value={fieldCount} onChange={(event) => { setFieldCount(Number(event.target.value)); setSchedule([]); setMessage(''); }}><option value={1}>1 个场地</option><option value={2}>2 个场地</option><option value={3}>3 个场地</option><option value={4}>4 个场地</option></select></label><button type="button" onClick={createSchedule}>生成随机赛程</button></div>
    {message && <p className={styles.scheduleMessage}>{message}</p>}
    {schedule.length > 0 && <div className={styles.scheduleTableWrap}>
      <div className={styles.schedulePublicTitle}>Explorer 资格排位赛 · 赛程表及成绩公示</div>
      <table className={styles.scheduleTable}>
        <thead><tr><th>场地</th><th>场次</th><th className={styles.redHead}>红方战队1</th><th className={styles.redHead}>红方战队2</th><th className={styles.blueHead}>蓝方战队1</th><th className={styles.blueHead}>蓝方战队2</th><th>红方胜负分</th><th className={styles.redScoreHead}>红方总分</th><th>红方净胜分</th><th>蓝方胜负分</th><th className={styles.blueScoreHead}>蓝方总分</th><th>蓝方净胜分</th></tr></thead>
        <tbody>{schedule.map((match) => { const result = results[match.id]; const redWin = result ? (result.redScore > result.blueScore ? 3 : result.redScore === result.blueScore ? 1 : 0) : null; const blueWin = result ? (result.blueScore > result.redScore ? 3 : result.blueScore === result.redScore ? 1 : 0) : null; const redNet = result ? result.redScore - result.blueScore : null; return <tr key={match.id} onClick={() => setActiveScoreMatch(match)} className={styles.clickableMatch}><td><strong>场地 {match.field}</strong><button type="button">进入计分</button></td><td>{match.slot}</td>{[match.red1, match.red2, match.blue1, match.blue2].map((team, teamIndex) => <td key={`${match.id}-${teamIndex}`}><strong>{team.teamNo}</strong><span>{team.teamName}</span></td>)}<td className={styles.pendingScore}>{redWin ?? '—'}</td><td className={`${styles.pendingScore} ${styles.redScoreCell}`}>{result?.redScore ?? '—'}</td><td className={styles.pendingScore}>{redNet ?? '—'}</td><td className={styles.pendingScore}>{blueWin ?? '—'}</td><td className={`${styles.pendingScore} ${styles.blueScoreCell}`}>{result?.blueScore ?? '—'}</td><td className={styles.pendingScore}>{redNet === null ? '—' : -redNet}</td></tr>; })}</tbody>
      </table>
    </div>}
    {schedule.length > 0 && <div className={styles.rankingWrap}><div className={styles.schedulePublicTitle}>Explorer 资格赛实时排名</div><table className={styles.rankingTable}><thead><tr><th>排名</th><th>队号</th><th>赛队名称</th><th>已赛</th><th>胜-平-负</th><th>排名积分</th><th>总得分</th><th>净胜分</th></tr></thead><tbody>{ranking.map((row, index) => <tr key={row.team.id}><td><strong>{index + 1}</strong></td><td>{row.team.teamNo}</td><td>{row.team.teamName}</td><td>{row.played}</td><td>{row.wins}-{row.draws}-{row.losses}</td><td><strong>{row.rankingPoints}</strong></td><td>{row.totalScore}</td><td>{row.netScore}</td></tr>)}</tbody></table></div>}
    {activeScoreMatch && <ScoreCalculator onBack={() => setActiveScoreMatch(null)} onSave={(result) => setResults((current) => ({ ...current, [activeScoreMatch.id]: result }))} matchInfo={{ field: `场地${activeScoreMatch.field}`, matchNo: String(activeScoreMatch.slot), red1: `${activeScoreMatch.red1.teamNo} ${activeScoreMatch.red1.teamName}`, red2: `${activeScoreMatch.red2.teamNo} ${activeScoreMatch.red2.teamName}`, blue1: `${activeScoreMatch.blue1.teamNo} ${activeScoreMatch.blue1.teamName}`, blue2: `${activeScoreMatch.blue2.teamNo} ${activeScoreMatch.blue2.teamName}` }} />}
  </section>;
}

export function PracticeEventHub({ logisticsEvents, accessToken, onOpenInspire, onOpenExplorer, onOpenSimulation, onOpenScoreCalculator }: PracticeEventHubProps) {
  const [events, setEvents] = useState<PracticeEventRecord[]>(loadEvents);
  const [cloudReady, setCloudReady] = useState(false);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [form, setForm] = useState({
    sourceLogisticsEventId: '',
    eventItem: 'MakeX Explorer',
    name: '',
    date: new Date().toISOString().slice(0, 10),
    venue: '',
    notes: '',
  });
  const [manualTeamForm, setManualTeamForm] = useState({ eventItem: 'MakeX Explorer', teamNo: '', teamName: '', members: '' });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  }, [events]);

  useEffect(() => {
    let cancelled = false;
    if (!accessToken) { setCloudReady(false); return; }
    void syncPracticeEvents(loadEvents(), accessToken).then((next) => {
      if (cancelled) return;
      setEvents(next);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setCloudReady(true);
    }).catch(() => { if (!cancelled) setCloudReady(false); });
    return () => { cancelled = true; };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !cloudReady) return;
    const timer = window.setTimeout(() => { void syncPracticeEvents(events, accessToken); }, 600);
    return () => window.clearTimeout(timer);
  }, [accessToken, cloudReady, events]);

  useEffect(() => {
    if (!accessToken || !cloudReady) return;
    let cancelled = false;
    const pullLatest = () => {
      void syncPracticeEvents(loadEvents(), accessToken).then((next) => {
        if (cancelled) return;
        setEvents((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }).catch(() => undefined);
    };
    const interval = window.setInterval(pullLatest, 12000);
    window.addEventListener('focus', pullLatest);
    return () => { cancelled = true; window.clearInterval(interval); window.removeEventListener('focus', pullLatest); };
  }, [accessToken, cloudReady]);

  useEffect(() => {
    setEvents((current) => {
      let changed = false;
      const next = current.map((event) => {
        const source = logisticsEvents.find((item) => item.id === event.sourceLogisticsEventId)
          ?? logisticsEvents.find((item) => item.name.trim() === event.name.trim())
          ?? logisticsEvents.find((item) => Boolean(event.date && event.venue)
            && item.date === event.date
            && item.venue.trim() === event.venue.trim());
        if (!source) return event;

        const teams = buildPracticeTeams(source, event.eventItem || 'MakeX Explorer');
        const sourceChanged = event.sourceLogisticsEventId !== source.id;
        const teamsChanged = JSON.stringify(event.teams) !== JSON.stringify(teams);
        if (!sourceChanged && !teamsChanged) return event;

        changed = true;
        return { ...event, sourceLogisticsEventId: source.id, teams };
      });
      return changed ? next : current;
    });
  }, [logisticsEvents]);

  const activeEvent = events.find((event) => event.id === activeEventId) ?? null;
  const activeEventItem = activeEvent?.eventItem || 'MakeX Explorer';
  const activeLogisticsSource = activeEvent
    ? logisticsEvents.find((event) => event.id === activeEvent.sourceLogisticsEventId)
      ?? logisticsEvents.find((event) => event.name.trim() === activeEvent.name.trim())
      ?? logisticsEvents.find((event) => Boolean(activeEvent.date && activeEvent.venue)
        && event.date === activeEvent.date
        && event.venue.trim() === activeEvent.venue.trim())
    : null;
  const activeTeams = activeEvent
    ? (activeLogisticsSource
      ? buildPracticeTeams(activeLogisticsSource, activeEventItem)
      : activeEvent.teams.filter((team) => matchesEventItem(team.eventItem, activeEventItem)))
    : [];
  const rosterGroups = ['MakeX Explorer', 'MakeX Inspire'].map((eventItem) => {
    const syncedTeams = activeLogisticsSource
      ? buildPracticeTeams(activeLogisticsSource, eventItem)
      : (activeEventItem === eventItem ? activeTeams : []);
    const manualTeams = (activeEvent?.manualTeams ?? []).filter((team) => matchesEventItem(team.eventItem, eventItem));
    const teams = mergePracticeTeams(syncedTeams, manualTeams);
    return {
      eventItem,
      teams,
      memberCount: teams.reduce((total, team) => total + team.members.length, 0),
    };
  });

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
      manualTeams: [],
    }, ...current]);
    setForm((current) => ({ ...current, sourceLogisticsEventId: '', name: '', venue: '', notes: '' }));
  };

  const selectLogisticsEvent = (sourceId: string) => {
    const source = logisticsEvents.find((event) => event.id === sourceId);
    setForm((current) => ({ ...current, sourceLogisticsEventId: sourceId, name: source?.name ?? current.name, date: source?.date || current.date, venue: source?.venue ?? current.venue }));
  };

  const syncActiveEvent = () => {
    if (!activeEvent) return;
    const source = activeLogisticsSource;
    if (!source) return;
    setEvents((current) => current.map((event) => event.id === activeEvent.id ? { ...event, sourceLogisticsEventId: source.id, name: source.name, date: source.date, venue: source.venue, teams: buildPracticeTeams(source, event.eventItem || 'MakeX Explorer') } : event));
  };

  const deleteEvent = (eventId: string) => {
    setEvents((current) => current.filter((event) => event.id !== eventId));
    if (activeEventId === eventId) setActiveEventId(null);
  };

  const addManualTeam = () => {
    if (!activeEvent) return;
    const teamNo = manualTeamForm.teamNo.trim();
    const teamName = manualTeamForm.teamName.trim();
    const memberNames = manualTeamForm.members.split(/[、,，;；\n]+/).map((name) => name.trim()).filter(Boolean);
    if (!teamNo || !teamName || memberNames.length === 0) return;
    const eventItem = manualTeamForm.eventItem;
    const id = `${normalizeEventItem(eventItem)}::${teamNo.replace(/\s+/g, '').toLowerCase()}`;
    const nextTeam: PracticeTeam = { id, eventItem, teamNo, teamName, members: memberNames.map((name, index) => ({ id: `manual-${Date.now()}-${index}`, name })) };
    setEvents((current) => current.map((event) => {
      if (event.id !== activeEvent.id) return event;
      const existing = event.manualTeams ?? [];
      const withoutSame = existing.filter((team) => team.id !== id);
      return { ...event, manualTeams: [...withoutSame, nextTeam] };
    }));
    setManualTeamForm((current) => ({ ...current, teamNo: '', teamName: '', members: '' }));
  };

  if (activeEvent) {
    return (
      <div className={styles.hub}>
        <div className={styles.workspaceBar}>
          <button type="button" onClick={() => setActiveEventId(null)}>← 返回练习赛列表</button>
          <div><strong>{activeEvent.name}</strong><span>{activeEvent.date || '日期待定'} · {activeEvent.venue || '场地待定'} · {activeEventItem}</span></div>
          <em>{cloudReady ? 'Supabase 已同步' : '练习赛工作台'}</em>
        </div>

        {activeEvent.notes && <p className={styles.eventNotes}>{activeEvent.notes}</p>}

        <section className={styles.rosterSection}>
          <div className={styles.heading}>
            <div><small>Club Teams</small><h2>俱乐部内部赛队</h2></div>
            <div className={styles.rosterActions}>
              {activeEvent.sourceLogisticsEventId && <button className={styles.syncButton} type="button" onClick={syncActiveEvent}>同步后勤最新人员</button>}
            </div>
          </div>
          <div className={styles.manualTeamPanel}>
            <div><small>Manual Team</small><strong>手动添加赛队</strong></div>
            <div className={styles.manualTeamGrid}>
              <label><span>赛项</span><select value={manualTeamForm.eventItem} onChange={(event) => setManualTeamForm((current) => ({ ...current, eventItem: event.target.value }))}><option>MakeX Explorer</option><option>MakeX Inspire</option></select></label>
              <label><span>赛队编号</span><input value={manualTeamForm.teamNo} onChange={(event) => setManualTeamForm((current) => ({ ...current, teamNo: event.target.value }))} placeholder="例如：98404" /></label>
              <label><span>赛队名称</span><input value={manualTeamForm.teamName} onChange={(event) => setManualTeamForm((current) => ({ ...current, teamName: event.target.value }))} placeholder="例如：星辰主宰" /></label>
              <label><span>赛队队员</span><input value={manualTeamForm.members} onChange={(event) => setManualTeamForm((current) => ({ ...current, members: event.target.value }))} placeholder="多人请用顿号或逗号分隔" /></label>
              <button type="button" onClick={addManualTeam} disabled={!manualTeamForm.teamNo.trim() || !manualTeamForm.teamName.trim() || !manualTeamForm.members.trim()}>添加赛队</button>
            </div>
          </div>
          <div className={styles.rosterGroups}>
            {rosterGroups.map((group) => (
              <details className={styles.rosterGroup} key={group.eventItem} open>
                <summary>
                  <div><strong>{group.eventItem}</strong><span>{group.memberCount} 名队员 · {group.teams.length} 支赛队</span></div>
                  <em>展开 / 收起</em>
                </summary>
                {group.teams.length === 0 ? <div className={styles.rosterEmpty}><strong>暂无 {group.eventItem} 内部赛队</strong><span>后勤赛事中尚未录入该赛项的参赛队员、队号或队名。</span></div> : (
                  <div className={styles.teamTableWrap}>
                    <table className={styles.teamTable}>
                      <thead><tr><th>队号</th><th>赛队名称</th><th>队员人数</th><th>参赛队员</th></tr></thead>
                      <tbody>{group.teams.map((team) => <tr key={team.id}><td><strong>{team.teamNo}</strong></td><td>{team.teamName}</td><td>{team.members.length} 人</td><td>{team.members.map((member) => member.name).join('、')}</td></tr>)}</tbody>
                    </table>
                  </div>
                )}
              </details>
            ))}
          </div>
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
            <button type="button" onClick={() => { window.localStorage.setItem(ACTIVE_EXPLORER_TEAMS_KEY, JSON.stringify(rosterGroups.find((group) => group.eventItem === 'MakeX Explorer')?.teams ?? [])); onOpenExplorer(); }}>进入 MakeX Explorer</button>
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
        <div className={styles.heading}><div><small>Simulation Scoring System</small><h2>模拟赛积分系统</h2></div><span>独立工具</span></div>
        <p className={styles.hint}>快速记录红蓝双方得分、加减分项目和最终比分，点击进入独立计分界面。</p>
        <button className={styles.primaryButton} type="button" onClick={onOpenScoreCalculator}>进入模拟赛积分系统</button>
      </section>
    </div>
  );
}
