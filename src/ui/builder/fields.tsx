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

/**
 * A labelled line of text, for the handful of things about a road that no geometry implies — an
 * exit's destination, its number. Named `TextField` rather than `Text` because the DOM already
 * owns that name globally and the collision only shows up as a baffling JSX error. Deliberately as
 * plain as `Num`: the two sit in the same form and
 * a field that looked different would suggest it behaved differently.
 */
export function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="builder-field">
      <span>{label}</span>
      <input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
