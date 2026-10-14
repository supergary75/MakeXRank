const COACHES = ['Gary', 'Vincent', 'Brook', 'Jason', 'Lyu'];

export function parseTrainingCoaches(value: string): string[] {
  return [...new Set(value.split(/[,，、;；\n]+/).map(name => name.trim()).filter(Boolean))];
}

export default function TrainingCoachPicker({ value, disabled, onChange, label = '负责教练（可单选、多选）' }: {
  value: string; disabled: boolean; onChange: (value: string) => void; label?: string;
}) {
  const selected = parseTrainingCoaches(value);
  const options = [...new Set([...COACHES, ...selected])];
  return <fieldset disabled={disabled} style={{ minWidth: 0, margin: 0, padding: 10, border: '1px solid #a4b2bd', borderRadius: 8 }}>
    <legend>{label}</legend>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map(name => <label key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, cursor: disabled ? 'default' : 'pointer' }}>
        <input type="checkbox" style={{ width: 18, height: 18, minWidth: 18, margin: 0 }} checked={selected.includes(name)}
          onChange={event => onChange((event.target.checked ? [...selected, name] : selected.filter(item => item !== name)).join('、'))} />
        {name}
      </label>)}
    </div>
  </fieldset>;
}
