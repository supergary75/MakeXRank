const VENUES = ['206-1', '206-2', '206大厅', '良基'];

export function normalizeDateVenues(dates: string[], value: unknown): Record<string, string> {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return Object.fromEntries(dates.filter(date => typeof source[date] === 'string').map(date => [date, source[date] as string]));
}

export function parseTrainingVenues(value: string): string[] {
  return [...new Set(value.split(/\s*[,，、;；\n]\s*/).map(item => item.trim()).filter(Boolean))];
}

export default function TrainingVenuePicker({ value, disabled, onChange }: {
  value: string; disabled: boolean; onChange: (value: string) => void;
}) {
  const selected = parseTrainingVenues(value);
  const options = [...new Set([...VENUES, ...selected])];
  return <fieldset disabled={disabled} style={{ minWidth: 0, margin: '12px 0', padding: 16, border: '1px solid #a4b2bd', borderRadius: 12 }}>
    <legend>集训场地（可多选）</legend>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      {options.map(venue => <label key={venue} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '4px 12px', cursor: disabled ? 'default' : 'pointer' }}>
        <input type="checkbox" style={{ width: 20, height: 20 }} checked={selected.includes(venue)}
          onChange={event => onChange((event.target.checked ? [...selected, venue] : selected.filter(item => item !== venue)).join('、'))} />
        {venue}{!VENUES.includes(venue) ? '（原有场地）' : ''}
      </label>)}
    </div>
    <small>{selected.length ? `已选：${selected.join('、')}` : '尚未选择场地'}</small>
  </fieldset>;
}
