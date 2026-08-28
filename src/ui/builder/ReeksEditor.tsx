/**
 * What the exercise actually judges.
 *
 * Until this existed, a built scenario was always marked against its parent's reeks — so the
 * validator could say "a rider who does everything right passes" about an exercise that tested
 * nothing you had put in it. That was the worst thing in the builder, and this is the fix.
 *
 * Two decisions run through the whole file.
 *
 * **A rule is picked from a list, not written.** There is no expression language here: every rule
 * is one of the kinds the engine already scores, and choosing one fills in workable numbers. The
 * alternative — a small grammar for conditions — would be more powerful and would put the author
 * in the business of debugging their own predicates, which is exactly the job the model rider is
 * supposed to be doing for them.
 *
 * **The Dutch is not optional.** Every rule carries what the student is told when they get it
 * wrong, because a debrief that says "fout: stap 3" teaches nobody anything. New rules arrive with
 * a plausible sentence already in the box rather than an empty one, since an empty box is an
 * invitation to leave it empty.
 */
import type {
  ActorSpec,
  ControlId,
  ExpectedAction,
  ExpectedKind,
  Manoeuvre,
  Severity,
} from '../../sim/types';
import { CONTROLS } from '../controls';
import { Choice, Num } from './fields';
import { HeadwayBands, LaneChangeBands, SpeedBands } from './BandEditor';

/** The rule kinds an author can reach for, and a workable starting point for each. */
const RECIPES: {
  id: string;
  label: string;
  hint: string;
  make: (ctx: { actors: readonly ActorSpec[]; n: number }) => ExpectedAction;
}[] = [
  {
    id: 'speedAtMost',
    label: 'Niet harder dan',
    hint: 'Snelheid onder een grens, ergens vóór het conflictpunt. Voor afremmen en aanpassen.',
    make: ({ n }) => ({
      id: `regel-${n}`,
      label: `${n}. Snelheid terug`,
      group: 'snelheid',
      kind: { type: 'speedAtMost', maxKmh: 20 },
      window: { from: 40, to: 5 },
      praise: 'Je paste je snelheid op tijd aan.',
      missed: {
        severity: 'fout',
        explanation: 'Je reed te hard door. Pas je snelheid aan vóórdat je er bent, niet erna.',
      },
    }),
  },
  {
    id: 'speedAtLeast',
    label: 'Minstens',
    hint: 'Snelheid boven een grens. Voor op snelheid komen.',
    make: ({ n }) => ({
      id: `regel-${n}`,
      label: `${n}. Op snelheid komen`,
      group: 'snelheid',
      kind: { type: 'speedAtLeast', minKmh: 45 },
      window: { from: 120, to: 20 },
      praise: 'Je was op tijd op snelheid.',
      missed: {
        severity: 'fout',
        explanation: 'Je kwam niet op snelheid, en houdt daarmee het verkeer achter je op.',
      },
    }),
  },
  {
    id: 'control',
    label: 'Handeling in een venster',
    hint: 'Een knop of een blik, tussen twee afstanden vóór het conflictpunt.',
    make: ({ n }) => ({
      id: `regel-${n}`,
      label: `${n}. Spiegel links`,
      group: 'kijken',
      kind: { type: 'control', control: 'MIRROR_LEFT' },
      window: { from: 80, to: 20 },
      tolerance: 10,
      praise: 'Gecontroleerd.',
      missed: { severity: 'fout', explanation: 'Deze controle heb je overgeslagen.' },
    }),
  },
  {
    id: 'laneChange',
    label: 'Strookwissel',
    hint: 'Of de rijder één keer die kant op van rijstrook wisselt. Voor invoegen en inhalen.',
    make: ({ n }) => ({
      id: `regel-${n}`,
      label: `${n}. Van strook wisselen`,
      group: 'sturen',
      kind: { type: 'laneChange', direction: 'left' },
      praise: 'Je wisselde van rijstrook.',
      missed: { severity: 'kritiek', explanation: 'Je bent nooit van rijstrook gewisseld. De opdracht is niet uitgevoerd.' },
    }),
  },
  {
    id: 'beforeLaneChange',
    label: 'Handeling vóór de strookwissel',
    hint: 'Een blik of een knop, binnen zoveel seconden vóórdat de motor van strook ging.',
    make: ({ n }) => ({
      id: `regel-${n}`,
      label: `${n}. Schouderblik links`,
      group: 'kijken',
      kind: { type: 'beforeLaneChange', control: 'SHOULDER_LEFT', direction: 'left', withinSeconds: 5 },
      praise: 'Gecontroleerd vóór je ging.',
      missed: { severity: 'fout', explanation: 'Je ging van strook zonder dit eerst te controleren.' },
    }),
  },
  {
    id: 'speedBand',
    label: 'Snelheidsband',
    hint: 'De snelheid die je vasthoudt, tegen een reeks marges. Voor tempo op de snelweg.',
    make: ({ n }) => ({
      id: `regel-${n}`,
      label: `${n}. Tempo`,
      group: 'snelheid',
      kind: {
        type: 'speedBand',
        bands: [
          { fromKmh: 95, toKmh: 130, outcome: { praise: 'Je hield een passend tempo aan.' } },
          {
            fromKmh: 85,
            toKmh: 95,
            outcome: { severity: 'opmerking', explanation: 'Je reed wat traag voor deze weg.' },
          },
        ],
      },
      window: { from: 400, to: 0 },
      missed: { severity: 'fout', explanation: 'Je tempo paste niet bij deze weg.' },
    }),
  },
  {
    id: 'gearAtMost',
    label: 'Versnelling hoogstens',
    hint: 'Teruggeschakeld zijn tegen het eind van het venster.',
    make: ({ n }) => ({
      id: `regel-${n}`,
      label: `${n}. Terugschakelen`,
      group: 'aandrijving',
      kind: { type: 'gearAtMost', maxGear: 2 },
      window: { from: 40, to: 5 },
      praise: 'Tijdig teruggeschakeld.',
      missed: { severity: 'fout', explanation: 'Je schakelde niet terug; in een te hoge versnelling heb je geen controle.' },
    }),
  },
  {
    id: 'afterTurn',
    label: 'Handeling ná de manoeuvre',
    hint: 'Een knop, binnen zoveel seconden nadat de bocht of de strookwissel klaar was.',
    make: ({ n }) => ({
      id: `regel-${n}`,
      label: `${n}. Richtingaanwijzer uit`,
      group: 'richting',
      kind: { type: 'afterTurn', control: 'INDICATOR_OFF', withinSeconds: 3 },
      praise: 'Direct uitgezet.',
      missed: { severity: 'fout', explanation: 'Je richtingaanwijzer bleef aanstaan; dat is misleidend voor achterliggers.' },
    }),
  },
  {
    id: 'headway',
    label: 'Volgafstand',
    hint: 'Seconden tot een andere weggebruiker, vastgehouden en niet even aangetikt.',
    make: ({ actors, n }) => ({
      id: `regel-${n}`,
      label: `${n}. Volgafstand`,
      group: 'snelheid',
      kind: {
        type: 'headway',
        actorId: actors[0]?.id ?? '',
        bands: [
          { atLeastSeconds: 2, outcome: { praise: 'Je hield genoeg afstand.' } },
          {
            atLeastSeconds: 1,
            outcome: { severity: 'fout', explanation: 'Je zat te dicht erop om nog te kunnen reageren.' },
          },
        ],
      },
      window: { from: 200, to: -100 },
      missed: { severity: 'opmerking', explanation: 'Er viel geen volgafstand te meten.' },
    }),
  },
];

/**
 * What each rule actually looks at, in one sentence.
 *
 * Not the same thing as the recipe hints below, which say when to reach for a rule. These say how
 * it is *measured*, because that is the part you cannot guess and the part that costs you an
 * afternoon. `speedAtMost` and `speedAtLeast` are mirror images in name and are not measured alike
 * at all — one is a state you have to be in, the other an event you either managed or did not — and
 * a window authored on the wrong assumption fails a model rider for doing the right thing.
 *
 * All nine kinds, not just the four you can add from the menu: a derived scenario inherits rules of
 * kinds the menu does not offer, and those are exactly the ones nobody can reason about.
 *
 * These must match `sim/scoring.ts`. Where a sentence and the code disagree, the code is the bug.
 */
const MEASURES: Record<ExpectedKind['type'], string> = {
  control: 'De knop moet één keer binnen het venster ingedrukt zijn.',
  speedAtMost:
    'De laagste snelheid die je een halve seconde lang vasthoudt binnen het venster. Even ' +
    'aantikken telt niet.',
  speedAtLeast: 'Ergens binnen het venster moet je deze snelheid halen — één moment is genoeg.',
  gearAtMost: 'De versnelling op het punt waar het venster eindigt.',
  afterTurn: 'De knop moet binnen zoveel seconden ná de manoeuvre komen.',
  headway: 'De kleinste volgafstand die je een halve seconde lang vasthoudt.',
  laneChange:
    'Of je die kant op van strook wisselt — en met treden erbij, waar je dat doet. Gemeten op het ' +
    'moment dat je begint te sturen.',
  beforeLaneChange: 'De knop moet binnen zoveel seconden vóór de strookwissel komen. Geen venster.',
  speedBand: 'De snelheid die je binnen het venster vasthoudt, tegen een reeks bandbreedtes.',
};

const GROUPS: { id: ExpectedAction['group']; label: string }[] = [
  { id: 'kijken', label: 'Kijken' },
  { id: 'richting', label: 'Richting' },
  { id: 'snelheid', label: 'Snelheid' },
  { id: 'aandrijving', label: 'Aandrijving' },
  { id: 'sturen', label: 'Sturen' },
];

const SEVERITIES: { id: Severity; label: string }[] = [
  { id: 'opmerking', label: 'Opmerking' },
  { id: 'fout', label: 'Fout' },
  { id: 'kritiek', label: 'Kritiek' },
];

/** The numbers that belong to this particular kind of rule, and nothing else. */
function KindFields({
  kind,
  actors,
  onChange,
}: {
  kind: ExpectedKind;
  actors: readonly ActorSpec[];
  onChange: (next: ExpectedKind) => void;
}) {
  switch (kind.type) {
    case 'speedAtMost':
      return <Num label="Hoogstens" unit="km/u" step={5} value={kind.maxKmh} onChange={(v) => onChange({ ...kind, maxKmh: v })} />;
    case 'speedAtLeast':
      return <Num label="Minstens" unit="km/u" step={5} value={kind.minKmh} onChange={(v) => onChange({ ...kind, minKmh: v })} />;
    case 'gearAtMost':
      return <Num label="Hoogstens" value={kind.maxGear} onChange={(v) => onChange({ ...kind, maxGear: Math.round(v) })} />;
    case 'control':
      return (
        <Choice
          label="Handeling"
          value={kind.control}
          options={CONTROLS.map((c) => ({ id: c.id as ControlId, label: c.short }))}
          onChange={(v) => onChange({ ...kind, control: v })}
        />
      );
    case 'afterTurn':
      return (
        <>
          <Choice
            label="Handeling"
            value={kind.control}
            options={CONTROLS.map((c) => ({ id: c.id as ControlId, label: c.short }))}
            onChange={(v) => onChange({ ...kind, control: v })}
          />
          <Num label="Binnen" unit="s" value={kind.withinSeconds} onChange={(v) => onChange({ ...kind, withinSeconds: v })} />
        </>
      );
    case 'headway':
      return (
        <>
          <Choice
            label="Tot wie"
            value={kind.actorId}
            options={actors.map((a) => ({ id: a.id, label: a.label }))}
            onChange={(v) => onChange({ ...kind, actorId: v })}
          />
          {!actors.some((a) => a.id === kind.actorId) && (
            // Scoring returns no row at all for a headway to nobody — the track is empty, so there
            // is no distance to have held, which is correct and completely silent. A rule added
            // before there was any traffic sits there looking like a rule for ever.
            <p className="builder-note builder-notice bad">
              Deze regel wijst naar een weggebruiker die er niet is. Er wordt niets gemeten en er
              komt geen regel in de nabespreking.
            </p>
          )}
          <HeadwayBands bands={kind.bands} onChange={(bands) => onChange({ ...kind, bands })} />
        </>
      );
    case 'laneChange':
      return (
        <>
          <Choice
            label="Richting"
            value={kind.direction}
            options={[
              { id: 'left' as const, label: 'Naar links' },
              { id: 'right' as const, label: 'Naar rechts' },
            ]}
            onChange={(v) => onChange({ ...kind, direction: v })}
          />
          <LaneChangeBands
            bands={kind.bands ?? []}
            onChange={(bands) => onChange({ ...kind, bands: bands.length ? bands : undefined })}
          />
        </>
      );
    case 'beforeLaneChange':
      return (
        <>
          <Choice
            label="Handeling"
            value={kind.control}
            options={CONTROLS.map((c) => ({ id: c.id as ControlId, label: c.short }))}
            onChange={(v) => onChange({ ...kind, control: v })}
          />
          <Choice
            label="Vóór welke wissel"
            value={kind.direction}
            options={[
              { id: 'left' as const, label: 'Naar links' },
              { id: 'right' as const, label: 'Naar rechts' },
            ]}
            onChange={(v) => onChange({ ...kind, direction: v })}
          />
          <Num
            label="Binnen"
            unit="s"
            value={kind.withinSeconds}
            onChange={(v) => onChange({ ...kind, withinSeconds: v })}
          />
        </>
      );
    case 'speedBand':
      return <SpeedBands bands={kind.bands} onChange={(bands) => onChange({ ...kind, bands })} />;
    default:
      return <p className="builder-note">Deze regel heeft hier geen instellingen.</p>;
  }
}

interface Props {
  expected: readonly ExpectedAction[];
  actors: readonly ActorSpec[];
  manoeuvre: Manoeuvre | null;
  onChange: (next: ExpectedAction[]) => void;
}

export function ReeksEditor({ expected, actors, manoeuvre, onChange }: Props) {
  const patch = (i: number, next: Partial<ExpectedAction>) =>
    onChange(expected.map((e, j) => (j === i ? { ...e, ...next } : e)));

  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= expected.length) return;
    const next = [...expected];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <section className="sidebar-section">
      <h3>Wat er beoordeeld wordt</h3>
      <p className="builder-note">
        Vensters staan in meters vóór het conflictpunt — het punt waarop je het kruispunt op rijdt.
        Meters, niet seconden, zodat wie voorzichtig rijdt daar niet voor gestraft wordt.
      </p>

      {expected.length === 0 && (
        <p className="builder-note">
          Nog niets. Een scenario zonder regels rijdt prima en beoordeelt niets.
        </p>
      )}

      {expected.map((e, i) => (
        <div key={e.id} className="builder-rule">
          <div className="builder-actor-head">
            <input
              type="text"
              className="builder-actor-name"
              value={e.label}
              onChange={(ev) => patch(i, { label: ev.target.value })}
            />
            <button type="button" className="ghost-btn tiny" onClick={() => move(i, -1)} title="Omhoog">
              ↑
            </button>
            <button type="button" className="ghost-btn tiny" onClick={() => move(i, 1)} title="Omlaag">
              ↓
            </button>
            <button
              type="button"
              className="ghost-btn tiny"
              onClick={() => onChange(expected.filter((_, j) => j !== i))}
            >
              Weg
            </button>
          </div>

          <Choice
            label="Groep"
            value={e.group}
            options={GROUPS}
            onChange={(v) => patch(i, { group: v })}
          />
          {/*
            Above the fields, not below them. A banded rule's fields are a ladder several screens
            long, and the sentence saying what the rule looks at read as an afterthought stranded
            underneath it rather than as the thing you need before you touch any of the numbers.
          */}
          <p className="builder-note builder-measures">{MEASURES[e.kind.type]}</p>
          <KindFields kind={e.kind} actors={actors} onChange={(kind) => patch(i, { kind })} />

          {e.window && e.kind.type !== 'afterTurn' && (
            <>
              <Num
                label="Venster van"
                unit="m"
                step={5}
                value={e.window.from}
                onChange={(v) => patch(i, { window: { ...e.window!, from: v } })}
              />
              <Num
                label="tot"
                unit="m"
                step={5}
                value={e.window.to}
                onChange={(v) => patch(i, { window: { ...e.window!, to: v } })}
              />
            </>
          )}

          <Choice
            label="Zwaarte"
            value={e.missed.severity}
            options={SEVERITIES}
            onChange={(v) => patch(i, { missed: { ...e.missed, severity: v } })}
          />
          <label className="builder-field wide builder-prose">
            <span>Uitleg bij gemist</span>
            <textarea
              rows={3}
              value={e.missed.explanation}
              onChange={(ev) => patch(i, { missed: { ...e.missed, explanation: ev.target.value } })}
            />
          </label>
          <label className="builder-field wide builder-prose">
            <span>Bij goed</span>
            <textarea
              rows={2}
              value={e.praise ?? ''}
              onChange={(ev) => patch(i, { praise: ev.target.value })}
            />
          </label>
        </div>
      ))}

      <div className="builder-add-rule">
        {RECIPES.map((r) => (
          <button
            key={r.id}
            type="button"
            className="ghost-btn tiny"
            title={r.hint}
            onClick={() => onChange([...expected, r.make({ actors, n: expected.length + 1 })])}
          >
            + {r.label}
          </button>
        ))}
      </div>
      {manoeuvre && (
        <p className="builder-note">
          De opdracht is <strong>{manoeuvre === 'straight' ? 'rechtdoor' : manoeuvre === 'right' ? 'rechtsaf' : 'linksaf'}</strong>.
          Zorg dat de regels daarover gaan.
        </p>
      )}
    </section>
  );
}
