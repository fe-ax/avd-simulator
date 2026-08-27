/**
 * The two form primitives the builder's sidebar is made of.
 *
 * Lifted out of `ReeksEditor` when the band editor needed them too. Nothing clever: a labelled
 * number and a labelled row of buttons. They live here so the two files that draw rule internals
 * agree about what a field looks like, rather than each growing its own.
 */

export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="builder-field builder-choice">
      <span>{label}</span>
      <span className="builder-choice-options">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`replay-btn tiny${o.id === value ? ' active' : ''}`}
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </button>
        ))}
      </span>
    </div>
  );
}

export function Num({
  label,
  value,
  step = 1,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="builder-field">
      <span>{label}</span>
      <input
        type="number"
        value={Math.round(value * 100) / 100}
        step={step}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
      {unit && <em>{unit}</em>}
    </label>
  );
}
