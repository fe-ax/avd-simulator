/**
 * The control catalogue. One place defines the label, the group, the key and whether a control
 * is hold-to-act, and both the button panel and the keyboard handler read from it — so the two
 * input paths can never drift apart.
 */
import type { ControlGroup, ControlId } from '../sim/types';

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
}

export const GROUP_LABELS: Record<ControlGroup, string> = {
  kijken: 'Kijken',
  richting: 'Richting aangeven',
  snelheid: 'Snelheid',
  aandrijving: 'Aandrijving',
  sturen: 'Sturen',
};

/**
 * The kijken cluster is laid out so that left-hand actions sit on the left key of each pair and
 * right-hand actions on the right: Q/E for a glance, A/D for a mirror, Z/C for a schouderblik.
 * Getting left and right the wrong way round under time pressure is exactly the mistake this
 * exercise is meant to expose, so the keys must not add any confusion of their own.
 */
export const CONTROLS: ControlDef[] = [
  { id: 'EYE_LEFT', label: 'Blik links', short: 'Blik L', group: 'kijken', code: 'KeyQ', keyHint: 'Q' },
  { id: 'EYE_RIGHT', label: 'Blik rechts', short: 'Blik R', group: 'kijken', code: 'KeyE', keyHint: 'E' },
  { id: 'MIRROR_LEFT', label: 'Spiegel links', short: 'Spiegel L', group: 'kijken', code: 'KeyA', keyHint: 'A' },
  { id: 'MIRROR_RIGHT', label: 'Spiegel rechts', short: 'Spiegel R', group: 'kijken', code: 'KeyD', keyHint: 'D' },
  { id: 'SHOULDER_LEFT', label: 'Schouderblik links', short: 'Schoud. L', group: 'kijken', code: 'KeyZ', keyHint: 'Z' },
  { id: 'SHOULDER_RIGHT', label: 'Schouderblik rechts', short: 'Schoud. R', group: 'kijken', code: 'KeyC', keyHint: 'C' },

  { id: 'INDICATOR_LEFT', label: 'Richting links', short: 'Richting L', group: 'richting', code: 'Digit1', keyHint: '1' },
  { id: 'INDICATOR_OFF', label: 'Richting uit', short: 'Uit', group: 'richting', code: 'Digit2', keyHint: '2' },
  { id: 'INDICATOR_RIGHT', label: 'Richting rechts', short: 'Richting R', group: 'richting', code: 'Digit3', keyHint: '3' },

  { id: 'THROTTLE_UP', label: 'Gas meer', short: 'Gas +', group: 'snelheid', code: 'ArrowUp', keyHint: '↑' },
  { id: 'THROTTLE_DOWN', label: 'Gas minder', short: 'Gas −', group: 'snelheid', code: 'ArrowDown', keyHint: '↓' },
  { id: 'BRAKE', label: 'Rem (ingedrukt houden)', short: 'Rem', group: 'snelheid', code: 'Space', keyHint: 'spatie', hold: true },

  { id: 'CLUTCH', label: 'Koppeling (ingedrukt houden)', short: 'Koppeling', group: 'aandrijving', code: 'ShiftLeft', keyHint: 'shift', hold: true },
  { id: 'GEAR_UP', label: 'Schakel omhoog', short: 'Schakel +', group: 'aandrijving', code: 'KeyR', keyHint: 'R' },
  { id: 'GEAR_DOWN', label: 'Schakel omlaag', short: 'Schakel −', group: 'aandrijving', code: 'KeyF', keyHint: 'F' },

  { id: 'STEER_LEFT', label: 'Stuur links', short: 'Stuur L', group: 'sturen', code: 'ArrowLeft', keyHint: '←' },
  { id: 'STEER_RIGHT', label: 'Stuur rechts', short: 'Stuur R', group: 'sturen', code: 'ArrowRight', keyHint: '→' },
];

export const CONTROL_BY_ID: Record<ControlId, ControlDef> = Object.fromEntries(
  CONTROLS.map((c) => [c.id, c]),
) as Record<ControlId, ControlDef>;

export const GROUP_ORDER: ControlGroup[] = [
  'kijken',
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
