/**
 * The numbers behind the road, and the traffic on it.
 *
 * One rule runs through this file: **a dependent value is derived, never typed in.** `buildRoutes`
 * throws when `turnInY + turnRadius` does not equal `sideLaneCenterY`, which is a constraint an
 * editor would break on almost every keystroke — so the side road's lane centre is computed from
 * the other two rather than offered as a field. The kink is unrepresentable instead of reported,
 * which is the same move that took the mirror tilt out of a hand-picked constant.
 */
import type {
  JunctionRoad,
  Manoeuvre,
  MotorwayStretch,
  Scenario,
  ScenarioWorld,
} from '../../sim/types';
// This file grew its own `Num` and `Choice` before `fields.tsx` existed; new primitives come from
// there rather than being copied a third time.
import { TextField } from './fields';

interface Props {
  draft: Scenario;
  onChange: (next: Scenario) => void;
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

export function WorldForm({ draft, onChange }: Props) {
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

      {world.kind === 'junction' ? (
        <JunctionFields world={world} setWorld={setWorld} />
      ) : world.kind === 'urbanCrossing' ? (
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
              setWorld({ ...world, road: { ...world.road, fietspadFrom: v } })
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
          {/*
            Only where there is a strook to widen. It is one field on `MotorwayRoad` and it draws
            the lane right of rijstrook 1 — the invoegstrook on an oprit, the uitvoegstrook on an
            afrit, and nothing at all on a through road. Offering the number there is offering a
            control that changes nothing in front of you, which teaches an author to distrust the
            whole form. The label follows the road for the same reason: on an afrit "Invoegstrook"
            names the opposite manoeuvre.
          */}
          {world.stretch.kind !== 'doorgaand' && (
            <Num
              label={world.stretch.kind === 'afrit' ? 'Uitvoegstrook' : 'Invoegstrook'}
              unit="m"
              value={world.road.mergeLaneWidth}
              onChange={(v) => setWorld({ ...world, road: { ...world.road, mergeLaneWidth: v } })}
            />
          )}
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
  // Which kind of motorway this is, and it is a choice rather than a fact about which scenario you
  // happened to derive from. Without this the two kinds that existed were reachable only by
  // starting from the right base, and a third would not have been reachable at all.
  const kindChoice = (
    <Choice
      label="Wat voor stuk"
      value={stretch.kind}
      options={[
        ['doorgaand', 'Open weg'],
        ['oprit', 'Oprit'],
        ['afrit', 'Afrit'],
      ]}
      onChange={(v) => onChange(v === stretch.kind ? stretch : blankStretch(v as MotorwayStretch['kind']))}
    />
  );

  if (stretch.kind === 'afrit') {
    return (
      <>
        {kindChoice}
        <h4 className="builder-subhead">Afrit</h4>
        <Num
          label="Start"
          unit="m"
          step={10}
          value={stretch.startY}
          onChange={(v) => onChange({ ...stretch, startY: v })}
        />
        <Num
          label="Strook begint"
          unit="m"
          step={10}
          value={stretch.strookStartY}
          onChange={(v) => onChange({ ...stretch, strookStartY: v })}
        />
        <Num
          label="Strooklengte"
          unit="m"
          step={10}
          value={stretch.strookLengthM}
          onChange={(v) => onChange({ ...stretch, strookLengthM: Math.max(20, v) })}
        />
        <Num
          label="Boogstraal"
          unit="m"
          step={5}
          value={stretch.exit.radius}
          onChange={(v) => onChange({ ...stretch, exit: { ...stretch.exit, radius: Math.max(10, v) } })}
        />
        <Num
          label="Boog"
          unit="°"
          value={stretch.exit.sweepDeg}
          onChange={(v) => onChange({ ...stretch, exit: { ...stretch.exit, sweepDeg: v } })}
        />
        {/*
          What the blue board says. The only thing about the signs on this road that is typed rather
          than derived — the limit comes from the scenario and the rest from the layout, but no
          geometry implies "Deventer".
        */}
        <TextField
          label="Richting"
          value={stretch.destination}
          placeholder="Deventer"
          onChange={(v) => onChange({ ...stretch, destination: v })}
        />
        <TextField
          label="Afritnummer"
          value={stretch.exitNumber ?? ''}
          placeholder="23"
          onChange={(v) => onChange({ ...stretch, exitNumber: v === '' ? undefined : v })}
        />
        <p className="builder-note">
          De uitvoegstrook opent rechts van rijstrook 1, achter blokmarkering. Waar hij begint is
          het punt waar alle vensters vandaan gemeten worden: de controles staan er zoveel meter
          vóór, en waar je hem in gaat is een venster erná — dus met een minteken.
        </p>
        <p className="builder-note">
          De bocht erachter wordt wel getekend maar niet gereden: de rit eindigt bij de monding
          ervan. Hij staat er zodat een afrit er van opzij als een afrit uitziet.
        </p>
      </>
    );
  }

  if (stretch.kind === 'doorgaand') {
    return (
      <>
        {kindChoice}
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
      {kindChoice}
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


/** A plain crossroads: two widths, a verge, which way you are going, and who gives way. */
function JunctionFields({
  world,
  setWorld,
}: {
  world: Extract<ScenarioWorld, { kind: 'junction' }>;
  setWorld: (next: ScenarioWorld) => void;
}) {
  return (
    <section className="sidebar-section">
      <h3>Kruispunt</h3>
      <Num
        label="Halve rijbaan"
        unit="m"
        value={world.road.halfWidth}
        onChange={(v) => setWorld({ ...world, road: { ...world.road, halfWidth: v } })}
      />
      <Num
        label="Halve zijweg"
        unit="m"
        value={world.road.sideHalfWidth}
        onChange={(v) => setWorld({ ...world, road: { ...world.road, sideHalfWidth: v } })}
      />
      <Num
        label="Berm tot"
        unit="m"
        value={world.road.vergeTo}
        onChange={(v) => setWorld({ ...world, road: { ...world.road, vergeTo: v } })}
      />

      <h4 className="builder-subhead">Zicht op de hoeken</h4>
      <p className="builder-note">
        Hoe ver de huizen bij elke hoek terugstaan. Dit is geen aankleding: wat je niet kunt zien,
        kun je ook niet lezen — en de simulator rekent een blik wél goed, want die kijkt naar
        richting en afstand en niet naar huizen. Zet de hoek open waar het gevaar vandaan komt.
      </p>
      {CORNERS.map(([key, label]) => (
        <Num
          key={key}
          label={label}
          unit="m"
          step={5}
          value={world.road.openCorners?.[key] ?? world.road.vergeTo + 4}
          onChange={(v) =>
            setWorld({
              ...world,
              road: {
                ...world.road,
                openCorners: { ...world.road.openCorners, [key]: Math.max(0, v) },
              },
            })
          }
        />
      ))}

      <h4 className="builder-subhead">Route</h4>
      <Num
        label="Start"
        unit="m"
        step={5}
        value={world.startY}
        onChange={(v) => setWorld({ ...world, startY: v })}
      />
      <Num
        label="Uitloop"
        unit="m"
        step={5}
        value={world.runOutM}
        onChange={(v) => setWorld({ ...world, runOutM: Math.max(0, v) })}
      />
      <Num
        label="Bochtstraal"
        unit="m"
        value={world.turnRadius}
        onChange={(v) => setWorld({ ...world, turnRadius: Math.max(1, v) })}
      />

      <Choice
        label="Opdracht"
        value={world.manoeuvre}
        options={[
          ['straight', 'Rechtdoor'],
          ['right', 'Rechtsaf'],
          ['left', 'Linksaf'],
        ]}
        onChange={(v) => setWorld({ ...world, manoeuvre: v as Manoeuvre })}
      />
      <Choice
        label="Haaientanden"
        value={world.giveWay}
        options={[
          ['side', 'Op de zijweg'],
          ['main', 'Op jouw weg'],
          ['none', 'Nergens'],
        ]}
        onChange={(v) => setWorld({ ...world, giveWay: v as 'side' | 'main' | 'none' })}
      />
      <p className="builder-note">
        Het insturpunt volgt uit de bochtstraal, dus dat staat er niet bij: anders kun je een
        geknikte route tekenen. Haaientanden op de zijweg betekent dat jij voorrang hebt — en dat
        iemand die er toch uit komt rijden een fout maakt in plaats van een regel te volgen.
      </p>
    </section>
  );
}

/**
 * The four corners, named the way somebody looking at the plan view would name them.
 *
 * North is up there and the rider comes from the bottom, so "rechtsvoor" is the corner on their
 * right as they arrive — which on a crossing where the hazard comes from the right is the one that
 * has to be open.
 */
const CORNERS: [keyof NonNullable<JunctionRoad['openCorners']>, string][] = [
  ['se', 'Rechtsvoor'],
  ['ne', 'Rechtsachter'],
  ['sw', 'Linksvoor'],
  ['nw', 'Linksachter'],
];

/**
 * A workable road of each kind, for when the author switches between them.
 *
 * Switching replaces the stretch rather than merging, because the three share almost no fields —
 * an oprit's ramp means nothing to an open road. Carrying values across would leave numbers nobody
 * chose sitting in the export, which is a bug this builder has already had twice.
 */
function blankStretch(kind: MotorwayStretch['kind']): MotorwayStretch {
  switch (kind) {
    case 'doorgaand':
      return { kind, startY: 0, endY: 900 };
    case 'oprit':
      return {
        kind,
        ramp: { radius: 120, sweepDeg: 18, strookStartY: -150 },
        mergeEndY: 0,
        taperM: 100,
        runOutM: 120,
      };
    case 'afrit':
      return {
        kind,
        startY: -450,
        strookStartY: 0,
        strookLengthM: 300,
        exit: { radius: 150, sweepDeg: 22 },
        // A placeholder an author will replace, not a blank: an exit board with nothing on it
        // reads as a bug in the renderer rather than as a field waiting to be filled in.
        destination: 'Afrit',
      };
  }
}

/** A short list of named alternatives. Segmented rather than a dropdown: there are never many. */
function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <div className="builder-field builder-choice">
      <span>{label}</span>
      <span className="builder-choice-options">
        {options.map(([id, text]) => (
          <button
            key={id}
            type="button"
            className={`replay-btn tiny${id === value ? ' active' : ''}`}
            onClick={() => onChange(id)}
          >
            {text}
          </button>
        ))}
      </span>
    </div>
  );
}
