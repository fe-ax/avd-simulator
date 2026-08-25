/**
 * What you have looked at lately.
 *
 * The kijken buttons are gone — looks are made by looking now — so this takes their place in the
 * panel. It reports rather than prompts: each check lights while the reticle is on it and stays
 * green while it is still fresh, fading as the information goes off. Nothing here says what to do
 * next; working that out is most of the exercise.
 */
import type { LookControl } from '../sim/types';

export interface CheckState {
  control: LookControl;
  under: boolean;
  dwell: number;
  freshness: number;
}

const ORDER: { control: LookControl; label: string }[] = [
  { control: 'EYE_LEFT', label: 'Blik L' },
  { control: 'MIRROR_LEFT', label: 'Spiegel L' },
  { control: 'EYE_RIGHT', label: 'Blik R' },
  { control: 'MIRROR_RIGHT', label: 'Spiegel R' },
  { control: 'SHOULDER_LEFT', label: 'Schoud. L' },
  { control: 'SHOULDER_RIGHT', label: 'Schoud. R' },
];

interface Props {
  states: readonly CheckState[];
}

export function CheckStrip({ states }: Props) {
  const byControl = new Map(states.map((s) => [s.control, s]));

  return (
    <section className="control-group check-strip">
      <h3>
        Kijken
        <span className="group-note">met de muis</span>
      </h3>
      <div className="control-buttons">
        {ORDER.map(({ control, label }) => {
          const state = byControl.get(control);
          return (
            <div
              key={control}
              className={`check-pill${state?.under ? ' under' : ''}`}
              style={
                {
                  '--dwell': (state?.dwell ?? 0).toFixed(3),
                  '--fresh': (state?.freshness ?? 0).toFixed(3),
                } as React.CSSProperties
              }
            >
              <span className="check-dot" />
              <span className="check-label">{label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
