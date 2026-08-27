/**
 * The rungs of a banded rule, and the Dutch on each one.
 *
 * Two rule kinds are ordered lists of *range → outcome*: `speedBand` and `headway`. Until this
 * existed neither could be edited past its outer numbers, so a scenario could say "between 95 and
 * 130 is fine" and could not say what a student is told when they are not. The recipe's placeholder
 * sentence then shipped in the debrief, which is the thing the reeks editor was built to end.
 *
 * **Order is the semantics, not a display choice.** Both scorers walk the list and take the *first*
 * band that matches — `bandOf` for speed, `bands.find` for headway — so the list runs best-first and
 * moving a rung changes what the rule means. That is why the arrows are here and why the panel says
 * so out loud rather than leaving an author to discover it by getting a verdict they did not expect.
 *
 * **Falling off the end is a real outcome.** A speed inside no band at all ranks worse than the
 * worst band and falls through to the rule's own `missed`; a headway below the last rung does the
 * same. So the editor shows that as a final, unremovable rung rather than letting it be invisible.
 */
import type { HeadwayBand, Outcome, Severity, SpeedBand } from '../../sim/types';
import { Choice, Num } from './fields';

const SEVERITIES: { id: Severity; label: string }[] = [
  { id: 'opmerking', label: 'Opmerking' },
  { id: 'fout', label: 'Fout' },
  { id: 'kritiek', label: 'Kritiek' },
];

type BandOutcome = Outcome | { praise: string };

const isPraise = (o: BandOutcome): o is { praise: string } => 'praise' in o;

/**
 * What happens on this rung: either it is the good one, or it is a fault of some weight.
 *
 * Switching between them replaces the outcome rather than merging, because the two shapes share no
 * field — a praise string and a severity plus an explanation. Keeping the old text around "in case
 * you switch back" is how a scenario ends up exporting a sentence nobody chose, which is a bug this
 * builder has already had once, in the cue editor.
 */
function OutcomeFields({
  outcome,
  onChange,
}: {
  outcome: BandOutcome;
  onChange: (next: BandOutcome) => void;
}) {
  const praise = isPraise(outcome);
  return (
    <>
      <Choice
        label="Telt als"
        value={praise ? 'goed' : outcome.severity}
        options={[{ id: 'goed' as const, label: 'Goed' }, ...SEVERITIES]}
        onChange={(v) =>
          onChange(
            v === 'goed'
              ? { praise: 'Dit deed je goed.' }
              : { severity: v as Severity, explanation: praise ? '' : outcome.explanation },
          )
        }
      />
      <label className="builder-field wide builder-prose">
        <span>{praise ? 'Wat de rijder leest' : 'Uitleg bij deze fout'}</span>
        <textarea
          rows={2}
          value={praise ? outcome.praise : outcome.explanation}
          onChange={(e) =>
            onChange(praise ? { praise: e.target.value } : { ...outcome, explanation: e.target.value })
          }
        />
      </label>
    </>
  );
}

/** Move, delete and the ordering note — the parts that are the same whatever the range means. */
function BandRow<T extends { outcome: BandOutcome }>({
  bands,
  index,
  onChange,
  children,
}: {
  bands: readonly T[];
  index: number;
  onChange: (next: T[]) => void;
  children: React.ReactNode;
}) {
  const move = (by: number) => {
    const j = index + by;
    if (j < 0 || j >= bands.length) return;
    const next = [...bands];
    [next[index], next[j]] = [next[j], next[index]];
    onChange(next);
  };
  const patch = (o: BandOutcome) =>
    onChange(bands.map((b, i) => (i === index ? { ...b, outcome: o } : b)));

  return (
    <div className="builder-band">
      <div className="builder-band-head">
        <strong>{index + 1}e</strong>
        <button type="button" className="ghost-btn tiny" onClick={() => move(-1)} title="Eerder beoordelen">
          ↑
        </button>
        <button type="button" className="ghost-btn tiny" onClick={() => move(1)} title="Later beoordelen">
          ↓
        </button>
        <button
          type="button"
          className="ghost-btn tiny"
          onClick={() => onChange(bands.filter((_, i) => i !== index))}
        >
          Weg
        </button>
      </div>
      {children}
      <OutcomeFields outcome={bands[index].outcome} onChange={patch} />
    </div>
  );
}

function OrderNote() {
  return (
    <p className="builder-note">
      De eerste tree die past, telt. Zet de gunstigste bovenaan — verschuif je er een, dan verandert
      wat de regel betekent.
    </p>
  );
}

export function SpeedBands({
  bands,
  onChange,
}: {
  bands: readonly SpeedBand[];
  onChange: (next: SpeedBand[]) => void;
}) {
  const patch = (i: number, over: Partial<SpeedBand>) =>
    onChange(bands.map((b, j) => (j === i ? { ...b, ...over } : b)));

  return (
    <div className="builder-bands">
      <OrderNote />
      {bands.map((b, i) => (
        <BandRow key={i} bands={bands} index={i} onChange={onChange}>
          <Num label="Van" unit="km/u" step={5} value={b.fromKmh} onChange={(v) => patch(i, { fromKmh: v })} />
          <Num label="tot" unit="km/u" step={5} value={b.toKmh} onChange={(v) => patch(i, { toKmh: v })} />
        </BandRow>
      ))}
      <div className="builder-band-fall">
        <strong>Anders</strong>
        <span>valt terug op de uitleg bij gemist, onderaan deze regel.</span>
      </div>
      <button
        type="button"
        className="ghost-btn tiny"
        onClick={() =>
          onChange([
            ...bands,
            {
              fromKmh: 0,
              toKmh: bands.at(-1)?.fromKmh ?? 0,
              outcome: { severity: 'fout', explanation: 'Je tempo paste niet bij deze weg.' },
            },
          ])
        }
      >
        + Tree
      </button>
    </div>
  );
}

export function HeadwayBands({
  bands,
  onChange,
}: {
  bands: readonly HeadwayBand[];
  onChange: (next: HeadwayBand[]) => void;
}) {
  const patch = (i: number, over: Partial<HeadwayBand>) =>
    onChange(bands.map((b, j) => (j === i ? { ...b, ...over } : b)));

  return (
    <div className="builder-bands">
      <OrderNote />
      {bands.map((b, i) => (
        <BandRow key={i} bands={bands} index={i} onChange={onChange}>
          <Num
            label="Vanaf"
            unit="s"
            step={0.5}
            value={b.atLeastSeconds}
            onChange={(v) => patch(i, { atLeastSeconds: v })}
          />
          <Choice
            label="Geldt"
            value={b.side ?? 'beide'}
            options={[
              { id: 'beide' as const, label: 'Voor en achter' },
              { id: 'ahead' as const, label: 'Alleen vóór je' },
              { id: 'behind' as const, label: 'Alleen achter je' },
            ]}
            onChange={(v) => patch(i, { side: v === 'beide' ? undefined : v })}
          />
        </BandRow>
      ))}
      <div className="builder-band-fall">
        <strong>Krapper</strong>
        <span>valt terug op de uitleg bij gemist, onderaan deze regel.</span>
      </div>
      <button
        type="button"
        className="ghost-btn tiny"
        onClick={() =>
          onChange([
            ...bands,
            {
              atLeastSeconds: Math.max(0, (bands.at(-1)?.atLeastSeconds ?? 1) - 1),
              outcome: { severity: 'fout', explanation: 'Je zat te dicht erop om nog te kunnen reageren.' },
            },
          ])
        }
      >
        + Tree
      </button>
    </div>
  );
}
