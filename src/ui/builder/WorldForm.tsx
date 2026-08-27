/**
 * The numbers behind the road, and the traffic on it.
 *
 * One rule runs through this file: **a dependent value is derived, never typed in.** `buildRoutes`
 * throws when `turnInY + turnRadius` does not equal `sideLaneCenterY`, which is a constraint an
 * editor would break on almost every keystroke — so the side road's lane centre is computed from
 * the other two rather than offered as a field. The kink is unrepresentable instead of reported,
 * which is the same move that took the mirror tilt out of a hand-picked constant.
 */
import type { ActorSpec, MotorwayStretch, Scenario, ScenarioWorld } from '../../sim/types';

const KMH = 1 / 3.6;

interface Props {
  draft: Scenario;
  onChange: (next: Scenario) => void;
  onPatchActor: (id: string, patch: Partial<ActorSpec>) => void;
}

function Num({
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
        value={Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0}
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

export function WorldForm({ draft, onChange, onPatchActor }: Props) {
  const world = draft.world;

  const setWorld = (next: ScenarioWorld) => onChange({ ...draft, world: next });

  return (
    <>
      <section className="sidebar-section">
        <h3>Naam</h3>
        <label className="builder-field wide">
          <span>Titel</span>
          <input
            type="text"
            value={draft.title}
            onChange={(e) => onChange({ ...draft, title: e.target.value })}
          />
        </label>
        <label className="builder-field wide">
          <span>Id</span>
          <input
            type="text"
            value={draft.id}
            onChange={(e) => onChange({ ...draft, id: e.target.value })}
          />
        </label>
      </section>

      <section className="sidebar-section">
        <h3>Snelheid</h3>
        <Num
          label="Limiet"
          unit="km/u"
          step={5}
          value={draft.speedLimitKmh}
          onChange={(v) => onChange({ ...draft, speedLimitKmh: v })}
        />
        <Num
          label="Startsnelheid"
          unit="km/u"
          step={5}
          value={draft.startSpeedKmh}
          onChange={(v) => onChange({ ...draft, startSpeedKmh: v })}
        />
        <Num
          label="Maximum"
          unit="km/u"
          step={10}
          value={draft.maxSpeedKmh}
          onChange={(v) => onChange({ ...draft, maxSpeedKmh: v })}
        />
      </section>

      {world.kind === 'urbanCrossing' ? (
        <section className="sidebar-section">
          <h3>Kruispunt</h3>
          <Num
            label="Halve rijbaan"
            unit="m"
            value={world.road.halfWidth}
            onChange={(v) =>
              setWorld({ ...world, road: { ...world.road, halfWidth: v, laneCenterX: v / 2 } })
            }
          />
          <Num
            label="Fietspad van"
            unit="m"
            value={world.road.fietspadFrom}
            onChange={(v) =>
              setWorld({ ...world, road: { ...world.road, fietspadFrom: v, kerbTo: v } })
            }
          />
          <Num
            label="Fietspad tot"
            unit="m"
            value={world.road.fietspadTo}
            onChange={(v) => setWorld({ ...world, road: { ...world.road, fietspadTo: v } })}
          />
          <Num
            label="Berm tot"
            unit="m"
            value={world.road.vergeTo}
            onChange={(v) => setWorld({ ...world, road: { ...world.road, vergeTo: v } })}
          />
          <Num
            label="Halve zijweg"
            unit="m"
            value={world.road.sideHalfWidth}
            onChange={(v) => setWorld({ ...world, road: { ...world.road, sideHalfWidth: v } })}
          />

          <h4 className="builder-subhead">Route</h4>
          <Num
            label="Start"
            unit="m"
            step={5}
            value={world.approach.startY}
            onChange={(v) => setWorld({ ...world, approach: { ...world.approach, startY: v } })}
          />
          <Num
            label="Insturen op"
            unit="m"
            value={world.approach.turnInY}
            onChange={(v) =>
              setWorld({
                ...world,
                approach: { ...world.approach, turnInY: v },
                // Derived, not offered: the arc has to land in the side road's lane.
                road: { ...world.road, sideLaneCenterY: v + world.approach.turnRadius },
              })
            }
          />
          <Num
            label="Bochtstraal"
            unit="m"
            value={world.approach.turnRadius}
            onChange={(v) =>
              setWorld({
                ...world,
                approach: { ...world.approach, turnRadius: v },
                road: { ...world.road, sideLaneCenterY: world.approach.turnInY + v },
              })
            }
          />
          <Num
            label="Conflictpunt x"
            unit="m"
            value={world.conflictX}
            onChange={(v) => setWorld({ ...world, conflictX: v })}
          />
          <p className="builder-note">
            De rijstrook van de zijweg volgt uit insturen + straal ({(world.approach.turnInY + world.approach.turnRadius).toFixed(1)} m).
            Daarom staat hij hier niet: anders kun je een geknikte route tekenen.
          </p>
        </section>
      ) : (
        <section className="sidebar-section">
          <h3>Snelweg</h3>
          <Num
            label="Rijstroken"
            step={1}
            value={world.road.laneCount}
            onChange={(v) =>
              setWorld({ ...world, road: { ...world.road, laneCount: Math.max(1, Math.round(v)) } })
            }
          />
          <Num
            label="Strookbreedte"
            unit="m"
            value={world.road.laneWidth}
            onChange={(v) => setWorld({ ...world, road: { ...world.road, laneWidth: v } })}
          />
          <Num
            label="Invoegstrook"
            unit="m"
            value={world.road.mergeLaneWidth}
            onChange={(v) => setWorld({ ...world, road: { ...world.road, mergeLaneWidth: v } })}
          />
          <Num
            label="Berm"
            unit="m"
            value={world.road.bermWidth}
            onChange={(v) => setWorld({ ...world, road: { ...world.road, bermWidth: v } })}
          />

          <StretchFields
            stretch={world.stretch}
            onChange={(stretch) => setWorld({ ...world, stretch })}
          />
        </section>
      )}

      <section className="sidebar-section">
        <h3>Verkeer</h3>
        <p className="builder-note">Sleep de stippen in beeld om te verzetten waar iemand vandaan komt.</p>
        {draft.actors.map((a) => (
          <div key={a.id} className="builder-actor">
            <h4>{a.label}</h4>
            <Num
              label="Snelheid"
              unit="km/u"
              step={5}
              value={a.speed / KMH}
              onChange={(v) => onPatchActor(a.id, { speed: v * KMH })}
            />
            <Num
              label="Lengte"
              unit="m"
              value={a.length ?? 1.8}
              onChange={(v) => onPatchActor(a.id, { length: v })}
            />
            <p className="builder-coords">
              van ({a.from.x.toFixed(1)}, {a.from.y.toFixed(1)}) naar ({a.to.x.toFixed(1)},{' '}
              {a.to.y.toFixed(1)})
            </p>
          </div>
        ))}
      </section>
    </>
  );
}


/** The oprit's numbers, or the open road's. Which set you get is the stretch's own tag. */
function StretchFields({
  stretch,
  onChange,
}: {
  stretch: MotorwayStretch;
  onChange: (next: MotorwayStretch) => void;
}) {
  if (stretch.kind === 'doorgaand') {
    return (
      <>
        <h4 className="builder-subhead">Doorgaande weg</h4>
        <Num
          label="Start"
          unit="m"
          step={10}
          value={stretch.startY}
          onChange={(v) => onChange({ ...stretch, startY: v })}
        />
        <Num
          label="Einde"
          unit="m"
          step={10}
          value={stretch.endY}
          onChange={(v) => onChange({ ...stretch, endY: v })}
        />
        <p className="builder-note">
          Open weg: geen oprit, geen invoegstrook. Hier gebeurt niets op een vaste plek, dus wat
          beoordeeld wordt hangt aan de manoeuvre die de rijder zelf kiest.
        </p>
      </>
    );
  }

  return (
    <>
      <h4 className="builder-subhead">Oprit</h4>
      <Num
        label="Boogstraal"
        unit="m"
        step={5}
        value={stretch.ramp.radius}
        onChange={(v) => onChange({ ...stretch, ramp: { ...stretch.ramp, radius: v } })}
      />
      <Num
        label="Boog"
        unit="°"
        value={stretch.ramp.sweepDeg}
        onChange={(v) => onChange({ ...stretch, ramp: { ...stretch.ramp, sweepDeg: v } })}
      />
      <Num
        label="Strook begint"
        unit="m"
        step={5}
        value={stretch.ramp.strookStartY}
        onChange={(v) => onChange({ ...stretch, ramp: { ...stretch.ramp, strookStartY: v } })}
      />
      <Num
        label="Strook eindigt"
        unit="m"
        step={5}
        value={stretch.mergeEndY}
        onChange={(v) => onChange({ ...stretch, mergeEndY: v })}
      />
      <Num
        label="Puntstuk"
        unit="m"
        step={10}
        value={stretch.taperM}
        onChange={(v) => onChange({ ...stretch, taperM: Math.max(0, v) })}
      />
      <Num
        label="Uitloop"
        unit="m"
        step={10}
        value={stretch.runOutM}
        onChange={(v) => onChange({ ...stretch, runOutM: Math.max(0, v) })}
      />
      <p className="builder-note">
        De strook houdt op bij "eindigt" en versmalt daarna over het puntstuk tot niets. Het venster
        waarop beoordeeld wordt eindigt bij "eindigt"; het asfalt geeft je meer, zodat het een
        deadline is en geen muur.
      </p>
    </>
  );
}
