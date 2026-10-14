import { useState } from 'react';

export function weeklyDates(start: string, count: number): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || count < 1 || count > 16) return [];
  const date = new Date(`${start}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== start) return [];
  return Array.from({ length: count }, (_, index) => new Date(date.getTime() + index * 7 * 86400000).toISOString().slice(0, 10));
}

export default function TrainingBatchPlanner({ onApply }: { onApply: (dates: string[], start: string, end: string) => void }) {
  const [date, setDate] = useState('');
  const [dates, setDates] = useState<string[]>([]);
  const [weeks, setWeeks] = useState(1);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('12:00');
  const addDates = weeklyDates(date, weeks);
  return <details style={{ padding: 16, margin: '16px 0', border: '1px solid #a4b2bd', borderRadius: 12 }}>
    <summary>批量排期 / 每周重复</summary>
    <p>先加入日期，再应用时间。只添加尚未安排的日期，已有日期和训练内容不覆盖。</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
      <label>日期 <input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
      <label>连续周数 <select value={weeks} onChange={e => setWeeks(Number(e.target.value))}>{Array.from({ length: 16 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} 周</option>)}</select></label>
      <button type="button" disabled={!addDates.length} onClick={() => setDates(previous => [...new Set([...previous, ...addDates])].sort())}>加入待排日期</button>
      <label>开始 <input type="time" value={start} onChange={e => setStart(e.target.value)} /></label>
      <label>结束 <input type="time" value={end} onChange={e => setEnd(e.target.value)} /></label>
    </div>
    <p>待排 {dates.length} 天（点击日期可移除）</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{dates.map(day => <button type="button" key={day} aria-label={`移除 ${day}`} onClick={() => setDates(previous => previous.filter(item => item !== day))}>{day} ×</button>)}</div>
    {start && end && end <= start && <p role="alert">结束时间必须晚于开始时间。</p>}
    <button type="button" disabled={!dates.length || !start || !end || end <= start} onClick={() => { onApply(dates, start, end); setDates([]); }} style={{ marginTop: 12 }}>确认批量添加</button>
  </details>;
}
