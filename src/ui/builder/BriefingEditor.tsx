/**
 * What the student is told before they ride.
 *
 * The gap this closes was not subtle: a built scenario kept its parent's briefing, so an exercise
 * about a car coming out of a side road still opened by telling you to turn right into the
 * Kerkstraat. A scenario that asks for one thing and marks another is worse than no scenario,
 * because the student's mistake is then the author's.
 */
import type { Scenario } from '../../sim/types';

interface Props {
  briefing: Scenario['briefing'];
  onChange: (next: Scenario['briefing']) => void;
}

export function BriefingEditor({ briefing, onChange }: Props) {
  const setHint = (i: number, text: string) =>
    onChange({ ...briefing, hints: briefing.hints.map((h, j) => (j === i ? text : h)) });

  return (
    <section className="sidebar-section">
      <h3>Briefing</h3>
      <label className="builder-field wide builder-prose">
        <span>Situatie</span>
        <textarea
          rows={3}
          value={briefing.situation}
          onChange={(e) => onChange({ ...briefing, situation: e.target.value })}
        />
      </label>
      <label className="builder-field wide builder-prose">
        <span>Opdracht</span>
        <textarea
          rows={2}
          value={briefing.assignment}
          onChange={(e) => onChange({ ...briefing, assignment: e.target.value })}
        />
      </label>

      <h4 className="builder-subhead">Tips</h4>
      {briefing.hints.map((hint, i) => (
        <div key={i} className="builder-hint">
          <textarea rows={3} value={hint} onChange={(e) => setHint(i, e.target.value)} />
          <button
            type="button"
            className="ghost-btn tiny"
            onClick={() => onChange({ ...briefing, hints: briefing.hints.filter((_, j) => j !== i) })}
          >
            Weg
          </button>
        </div>
      ))}
      <button
        type="button"
        className="ghost-btn tiny"
        onClick={() => onChange({ ...briefing, hints: [...briefing.hints, ''] })}
      >
        + Tip
      </button>
    </section>
  );
}
