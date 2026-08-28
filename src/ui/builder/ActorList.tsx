/**
 * The traffic: who is on the road, what they are, and what they do on their own.
 *
 * The cue list at the bottom of each one is the piece that took a scenario from "the snorfiets
 * reacts if you ride at it" to "a car comes up to the junction too fast and stands on its brakes".
 * Cues are anchored to distance along that vehicle's *own* path, so the hazard happens in the same
 * place whether the rider arrives early, late, or never — which is what keeps it the other
 * driver's mistake rather than a response to yours.
 */
import { ACTOR_BRAKE } from '../../sim/engine';
import type { ActorCue, ActorKind, ActorSpec } from '../../sim/types';

/*
 * Divide, never multiply by a stored reciprocal. `70 * (1/3.6)` is 19.444444444444446 and
 * `70 / 3.6` is 19.444444444444443 — different doubles, so a speed the builder wrote was always
 * one ulp away from the same speed written by hand, and the exporter could not recognise it as
 * "seventy" to print it as one.
 */
const toMs = (kmh: number) => kmh / 3.6;
const toKmh = (ms: number) => ms * 3.6;

/** What each kind is called, and how long one is when you first put it down. */
const KINDS: { id: ActorKind; label: string; length: number; speedKmh: number }[] = [
  { id: 'auto', label: 'Auto', length: 4.4, speedKmh: 50 },
  { id: 'vrachtwagen', label: 'Vrachtwagen', length: 16.5, speedKmh: 80 },
  { id: 'snorfiets', label: 'Snorfiets', length: 1.8, speedKmh: 25 },
  { id: 'fietser', label: 'Fietser', length: 1.8, speedKmh: 18 },
  { id: 'voetganger', label: 'Voetganger', length: 0.6, speedKmh: 5 },
];

/** Roughly what dry tarmac gives you with everything locked up. */
const EMERGENCY = 8;

const ACTIONS: { id: ActorCue['action']; label: string }[] = [
  { id: 'brake', label: 'Remmen' },
  { id: 'stop', label: 'Stoppen' },
  { id: 'resume', label: 'Doorrijden' },
];

export function defaultsFor(kind: ActorKind) {
  return KINDS.find((k) => k.id === kind) ?? KINDS[0];
}

interface Props {
  actors: readonly ActorSpec[];
  onPatch: (id: string, patch: Partial<ActorSpec>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  /** Which handle is selected, so the list and the plan view agree about what you are editing. */
  selected: string | null;
  onSelect: (id: string | null) => void;
}

function Field({
  label,
  value,
  step = 0.1,
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
        value={Math.round(value * 1000) / 1000}
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

function CueRow({
  cue,
  onChange,
  onRemove,
}: {
  cue: ActorCue;
  onChange: (next: ActorCue) => void;
  onRemove: () => void;
}) {
  return (
    <div className="builder-cue">
      <Field
        label="Na"
        unit="m"
        step={5}
        value={cue.atDist}
        onChange={(v) => onChange({ ...cue, atDist: Math.max(0, v) })}
      />
      <div className="builder-field builder-choice">
        <span>Doet</span>
        <span className="builder-choice-options">
          {ACTIONS.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`replay-btn tiny${a.id === cue.action ? ' active' : ''}`}
              onClick={() =>
                // `forSeconds` belongs to braking and nothing else. Its field hides when you pick
                // another action, and a value that is invisible but still in the data is how a
                // scenario ends up exporting a number nobody chose.
                onChange(
                  a.id === 'brake'
                    ? { ...cue, action: a.id, forSeconds: cue.forSeconds ?? 2 }
                    : { atDist: cue.atDist, action: a.id },
                )
              }
            >
              {a.label}
            </button>
          ))}
        </span>
      </div>
      {cue.action === 'brake' && (
        <Field
          label="Hoe lang"
          unit="s"
          step={0.5}
          value={cue.forSeconds ?? 2}
          onChange={(v) => onChange({ ...cue, forSeconds: Math.max(0.1, v) })}
        />
      )}
      {cue.action !== 'resume' && (
        <Field
          label="Hoe hard"
          unit="m/s²"
          step={0.5}
          value={cue.decel ?? ACTOR_BRAKE}
          onChange={(v) => onChange({ ...cue, decel: Math.max(0.5, v) })}
        />
      )}
      <button type="button" className="ghost-btn tiny" onClick={onRemove}>
        Weg
      </button>
    </div>
  );
}

export function ActorList({ actors, onPatch, onAdd, onRemove, selected, onSelect }: Props) {
  return (
    <section className="sidebar-section">
      <h3>Verkeer</h3>
      <p className="builder-note">
        Sleep de stippen in beeld om te verzetten waar iemand vandaan komt en waar hij heen gaat.
      </p>

      {actors.length === 0 && (
        <p className="builder-note">Nog geen verkeer. Zonder tegenpartij valt er weinig te oefenen.</p>
      )}

      {actors.map((a) => {
        const cues = a.cues ?? [];
        const setCues = (next: ActorCue[]) => onPatch(a.id, { cues: next.length ? next : undefined });
        return (
          <div
            key={a.id}
            className={`builder-actor${selected === a.id ? ' selected' : ''}`}
            onPointerEnter={() => onSelect(a.id)}
            onPointerLeave={() => onSelect(null)}
          >
            <div className="builder-actor-head">
              <input
                type="text"
                className="builder-actor-name"
                value={a.label}
                onChange={(e) => onPatch(a.id, { label: e.target.value })}
              />
              <button type="button" className="ghost-btn tiny" onClick={() => onRemove(a.id)}>
                Verwijder
              </button>
            </div>

            <div className="builder-field builder-choice">
              <span>Wat</span>
              <span className="builder-choice-options">
                {KINDS.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    className={`replay-btn tiny${k.id === a.kind ? ' active' : ''}`}
                    onClick={() =>
                      // Length comes with the kind, because a lorry that is four metres long is
                      // not a lorry — and following distance is measured bumper to bumper.
                      onPatch(a.id, { kind: k.id, length: k.length })
                    }
                  >
                    {k.label}
                  </button>
                ))}
              </span>
            </div>

            <Field
              label="Snelheid"
              unit="km/u"
              step={5}
              value={toKmh(a.speed)}
              onChange={(v) => onPatch(a.id, { speed: toMs(v) })}
            />
            <Field
              label="Lengte"
              unit="m"
              value={a.length ?? 1.8}
              onChange={(v) => onPatch(a.id, { length: v })}
            />
            {/*
              Numbers as well as handles. Dragging is the right way to place something you can see,
              and useless for something a hundred and seventy metres up the road: you have to zoom
              out until the carriageway is a thread before the handle is even on screen.
            */}
            <div className="builder-xy">
              <span>Van</span>
              <Field label="x" value={a.from.x} onChange={(v) => onPatch(a.id, { from: { ...a.from, x: v } })} />
              <Field label="y" value={a.from.y} onChange={(v) => onPatch(a.id, { from: { ...a.from, y: v } })} />
            </div>
            <div className="builder-xy">
              <span>Naar</span>
              <Field label="x" value={a.to.x} onChange={(v) => onPatch(a.id, { to: { ...a.to, x: v } })} />
              <Field label="y" value={a.to.y} onChange={(v) => onPatch(a.id, { to: { ...a.to, y: v } })} />
            </div>

            <div className="builder-cues">
              <h5>
                Doet uit zichzelf
                <button
                  type="button"
                  className="ghost-btn tiny"
                  onClick={() =>
                    setCues([...cues, { atDist: Math.round(cues.length ? 0 : 40), action: 'brake', forSeconds: 2 }])
                  }
                >
                  + Aanwijzing
                </button>
              </h5>
              {cues.length === 0 ? (
                <p className="builder-note">
                  Niets — hij rijdt gewoon door, en remt alleen als de rijder hem daartoe dwingt.
                </p>
              ) : (
                cues.map((cue, i) => (
                  <CueRow
                    key={i}
                    cue={cue}
                    onChange={(next) => setCues(cues.map((c, j) => (j === i ? next : c)))}
                    onRemove={() => setCues(cues.filter((_, j) => j !== i))}
                  />
                ))
              )}
              {cues.length > 0 && (
                <>
                  <p className="builder-note">
                    Gemeten vanaf zijn eigen startpunt, niet vanaf jou — daarom gebeurt het elke rit
                    op dezelfde plek, of je er nu vroeg of laat bent.
                  </p>
                  <p className="builder-note">
                    {ACTOR_BRAKE} is stevig remmen: iemand die je laat zag. {EMERGENCY} is een
                    noodstop met alles op slot — iemand die je helemaal niet zag.
                  </p>
                </>
              )}
            </div>
          </div>
        );
      })}

      <button type="button" className="ghost-btn" onClick={onAdd}>
        + Weggebruiker
      </button>
    </section>
  );
}
