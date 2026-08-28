/**
 * The control catalogue. One place defines the label, the group, the key and whether a control
 * is hold-to-act, and both the button panel and the keyboard handler read from it — so the two
 * input paths can never drift apart.
 */
import { steeringIsInert, type SteeringScenario } from '../sim/steering';
import type { ControlGroup, ControlId, LookControl } from '../sim/types';

export interface ControlDef {
  id: ControlId;
  label: string;
  short: string;
  group: ControlGroup;
  /** `event.code` value. */
  code: string;
  keyHint: string;
  /** Hold-to-act: records a down/up pair instead of a single press. */
  hold?: boolean;
  /**
   * Wording for a scenario where a press moves the machine one rijstrook sideways. Only the
   * controls whose *meaning* changes carry it — the rest read the same on a snelweg as on a
   * kruispunt, and one row of the table keeps saying so.
   */
  lane?: { label: string; short: string };
}

/** The default wording: what these groups mean when sturen is a choice between two routes. */
export const GROUP_LABELS: Record<ControlGroup, string> = {
  kijken: 'Kijken',
  richting: 'Richting aangeven',
  snelheid: 'Snelheid',
  aandrijving: 'Aandrijving',
  sturen: 'Sturen',
};

/** Groups that are called something else once a press means a whole rijstrook. */
const LANE_GROUP_LABELS: Partial<Record<ControlGroup, string>> = {
  sturen: 'Rijstrook wisselen',
};

/**
 * Only the machine's controls live here. Looking is done by looking — see the gaze targets — so
 * there is no key for it, and the briefing must not offer one.
 */
/**
 * The six looks, in the order the strip shows them.
 *
 * Separate from `CONTROLS` because they are not buttons — you do them with your head, and the HUD
 * has nothing to press. They belong here anyway: a rule in the reeks editor can be about a look
 * just as easily as about the richtingaanwijzer, and while this list lived privately inside
 * `CheckStrip` the editor's control picker offered eleven buttons and not one look. Six of the
 * Kerkstraat's nine steps are looks, and none of them could be authored.
 */
export const LOOKS: { id: LookControl; short: string }[] = [
  { id: 'EYE_LEFT', short: 'Blik L' },
  { id: 'MIRROR_LEFT', short: 'Spiegel L' },
  { id: 'EYE_RIGHT', short: 'Blik R' },
  { id: 'MIRROR_RIGHT', short: 'Spiegel R' },
  { id: 'SHOULDER_LEFT', short: 'Schoud. L' },
  { id: 'SHOULDER_RIGHT', short: 'Schoud. R' },
];

export const CONTROLS: ControlDef[] = [
  { id: 'INDICATOR_LEFT', label: 'Richting links', short: 'Richting L', group: 'richting', code: 'Digit1', keyHint: '1' },
  { id: 'INDICATOR_OFF', label: 'Richting uit', short: 'Uit', group: 'richting', code: 'Digit2', keyHint: '2' },
  { id: 'INDICATOR_RIGHT', label: 'Richting rechts', short: 'Richting R', group: 'richting', code: 'Digit3', keyHint: '3' },

  { id: 'THROTTLE_UP', label: 'Gas meer', short: 'Gas +', group: 'snelheid', code: 'ArrowUp', keyHint: '↑' },
  { id: 'THROTTLE_DOWN', label: 'Gas minder', short: 'Gas −', group: 'snelheid', code: 'ArrowDown', keyHint: '↓' },
  { id: 'BRAKE', label: 'Rem (ingedrukt houden)', short: 'Rem', group: 'snelheid', code: 'Space', keyHint: 'spatie', hold: true },

  { id: 'CLUTCH', label: 'Koppeling (ingedrukt houden)', short: 'Koppeling', group: 'aandrijving', code: 'ShiftLeft', keyHint: 'shift', hold: true },
  { id: 'GEAR_UP', label: 'Schakel omhoog', short: 'Schakel +', group: 'aandrijving', code: 'KeyR', keyHint: 'R' },
  { id: 'GEAR_DOWN', label: 'Schakel omlaag', short: 'Schakel −', group: 'aandrijving', code: 'KeyF', keyHint: 'F' },

  // The lane wording is the only thing that tells the student one press is one whole rijstrook
  // rather than a nudge of the bars, so it is part of the table and not something a view invents.
  { id: 'STEER_LEFT', label: 'Stuur links', short: 'Stuur L', group: 'sturen', code: 'ArrowLeft', keyHint: '←',
    lane: { label: 'Rijstrook links', short: 'Rijstrook L' } },
  { id: 'STEER_RIGHT', label: 'Stuur rechts', short: 'Stuur R', group: 'sturen', code: 'ArrowRight', keyHint: '→',
    lane: { label: 'Rijstrook rechts', short: 'Rijstrook R' } },
];

export const CONTROL_BY_ID: Record<ControlId, ControlDef> = Object.fromEntries(
  CONTROLS.map((c) => [c.id, c]),
) as Record<ControlId, ControlDef>;

export const GROUP_ORDER: ControlGroup[] = [
  'richting',
  'snelheid',
  'aandrijving',
  'sturen',
];

/**
 * How the panel is laid out. Kijken is absent: looks are made by looking, and the check strip
 * reports them instead.
 */
export const GROUP_ROWS: ControlGroup[][] = [
  ['richting'],
  ['snelheid', 'aandrijving', 'sturen'],
];

// ---------------------------------------------------------------------------
// What the sturen controls mean here
// ---------------------------------------------------------------------------

/**
 * What the sturen controls mean is decided in `src/sim/steering.ts` and nowhere else — the engine
 * has to ask the same question and `src/sim` may not import from a view, so the rule lives there
 * and this layer imports it. Re-exported rather than wrapped so the control layer still has one
 * front door, and so there is no second body of it to drift.
 *
 * `steeringIsAutomatic` is deliberately not re-exported: it is what a finished run *records*, and
 * nothing in the UI has any business asking it.
 */
export { steeringIsInert };
export type { SteeringScenario };

/** A control that steers, read off the table rather than by naming the two ids again. */
export function isSteerControl(control: ControlId): boolean {
  return CONTROL_BY_ID[control]?.group === 'sturen';
}

/** The wording for one control in this scenario. Falls back to the table's default row. */
export function controlLabels(
  def: ControlDef,
  scenario: SteeringScenario,
): { label: string; short: string } {
  if (scenario.steering === 'lane' && def.lane) return def.lane;
  return { label: def.label, short: def.short };
}

/** The heading for one group in this scenario. */
export function groupLabel(group: ControlGroup, scenario: SteeringScenario): string {
  if (scenario.steering === 'lane') return LANE_GROUP_LABELS[group] ?? GROUP_LABELS[group];
  return GROUP_LABELS[group];
}
