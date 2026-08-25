/**
 * Core data model for the AVD simulator.
 *
 * Two things are pure, serialisable data and everything else is derived from them:
 *   - `Scenario`  — the exercise (road, actors, expected actions). The future drag & drop
 *                   editor edits this.
 *   - `RunRecord` — one attempt (samples, control events, actor tracks). The future
 *                   record-and-edit feature edits this.
 * Nothing in the renderer or the React tree may hold state that is not reachable from one
 * of these two, otherwise replay and editing break.
 */

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

export type ControlId =
  // kijken
  | 'MIRROR_LEFT'
  | 'MIRROR_RIGHT'
  | 'EYE_LEFT'
  | 'EYE_RIGHT'
  | 'SHOULDER_LEFT'
  | 'SHOULDER_RIGHT'
  // richting aangeven
  | 'INDICATOR_LEFT'
  | 'INDICATOR_RIGHT'
  | 'INDICATOR_OFF'
  // snelheid
  | 'THROTTLE_UP'
  | 'THROTTLE_DOWN'
  | 'BRAKE'
  // aandrijving
  | 'CLUTCH'
  | 'GEAR_UP'
  | 'GEAR_DOWN'
  // sturen
  | 'STEER_LEFT'
  | 'STEER_RIGHT';

export type ControlGroup = 'kijken' | 'richting' | 'snelheid' | 'aandrijving' | 'sturen';

/** The subset of controls that are a deliberate look rather than an operation of the machine. */
export type LookControl =
  | 'MIRROR_LEFT'
  | 'MIRROR_RIGHT'
  | 'EYE_LEFT'
  | 'EYE_RIGHT'
  | 'SHOULDER_LEFT'
  | 'SHOULDER_RIGHT';

export interface ActiveGaze {
  control: LookControl;
  /** Seconds remaining before the gaze closes. */
  remaining: number;
}

/** `press` = momentary. `down`/`up` = the two hold-to-act controls (rem, koppeling). */
export type ControlPhase = 'press' | 'down' | 'up';

export interface ControlEvent {
  /** Seconds since the countdown finished. */
  t: number;
  /**
   * The press was recorded but had no effect, because a prerequisite was not met — see
   * `ControlPrerequisite`. Kept in the log precisely because it happened.
   */
  rejected?: boolean;
  /** Arc length along the route, in metres. */
  s: number;
  /** Metres still to travel to the conflict point. Negative once past it. */
  d: number;
  control: ControlId;
  phase: ControlPhase;
  source: 'pointer' | 'keyboard';
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export interface Vec2 {
  x: number;
  y: number;
}

export interface LineSegment {
  kind: 'line';
  from: Vec2;
  to: Vec2;
}

export interface ArcSegment {
  kind: 'arc';
  center: Vec2;
  radius: number;
  /** Radians. Travel goes from `startAngle` to `endAngle`; clockwise when `cw`. */
  startAngle: number;
  endAngle: number;
  cw: boolean;
}

export type RouteSegment = LineSegment | ArcSegment;

export interface PoseOnRoute {
  x: number;
  y: number;
  /** Radians, 0 = +x (east), pi/2 = +y (north). */
  heading: number;
}

// ---------------------------------------------------------------------------
// Actors
// ---------------------------------------------------------------------------

export type ActorKind = 'snorfiets' | 'auto' | 'fietser' | 'voetganger';

export interface ActorSpec {
  id: string;
  kind: ActorKind;
  label: string;
  /** Straight path the actor travels, in world metres. */
  from: Vec2;
  to: Vec2;
  /** Cruising speed in m/s. */
  speed: number;
  /**
   * Why this road user has priority over the rider, in the student's own terms. Appended to the
   * debrief when the rider takes it, because "you took their priority" only teaches something if
   * it says which rule was at work.
   */
  priorityReason?: string;
  /**
   * Scenario director aid: nudge this actor's speed inside [minSpeed, maxSpeed] so it stays
   * roughly `targetGap` metres behind the rider until it is close to the conflict, then let
   * physics take over. Guarantees the dode-hoek lesson fires regardless of riding style.
   * Set `enabled: false` for a strictly deterministic, constant-speed actor.
   */
  keepInBlindSpot?: {
    enabled: boolean;
    /**
     * Never set this below the actor's cruising speed. A road user with priority does not slow
     * down for someone who is about to take it: it just keeps coming. The director may only ever
     * make an actor catch up, never defer.
     */
    minSpeed: number;
    maxSpeed: number;
    /** Metres behind the rider (measured as distance-to-conflict) the actor aims to sit. */
    targetGap: number;
    /** Below this rider distance-to-conflict the actor stops adapting and runs on physics. */
    releaseAt: number;
  };
}

export type ActorMode = 'cruise' | 'braking' | 'stopped' | 'resuming' | 'done';

export interface ActorState {
  spec: ActorSpec;
  /** Distance travelled along `from`→`to`. */
  dist: number;
  x: number;
  y: number;
  heading: number;
  speed: number;
  mode: ActorMode;
  /** True once any look action has revealed this actor. Drives the perception view. */
  perceived: boolean;
  perceivedAt: number | null;
  /** True once the actor had to brake hard because the rider took its right of way. */
  emergencyBraked: boolean;
  emergencyBrakedAt: number | null;
}

// ---------------------------------------------------------------------------
// Expected actions & scoring
// ---------------------------------------------------------------------------

export type Severity = 'opmerking' | 'fout' | 'kritiek';

export interface Outcome {
  severity: Severity;
  explanation: string;
}

/**
 * Windows are expressed in **metres before the conflict point**, never in seconds: a cautious
 * rider arrives later and must not be punished for it. `[from, to]` with from > to, e.g.
 * `[32, 12]` means "between 32 m and 12 m before the fietspad".
 */
export interface DistanceWindow {
  from: number;
  to: number;
}

export type ExpectedKind =
  /** A control must be pressed inside the window. */
  | { type: 'control'; control: ControlId }
  /** Speed must be at or below `maxKmh` by the end of the window. */
  | { type: 'speedAtMost'; maxKmh: number }
  /** Gear must be at or below `maxGear` by the end of the window. */
  | { type: 'gearAtMost'; maxGear: number }
  /** A control must be pressed within `withinSeconds` of the turn being completed. */
  | { type: 'afterTurn'; control: ControlId; withinSeconds: number };

export interface ExpectedAction {
  id: string;
  label: string;
  group: ControlGroup;
  kind: ExpectedKind;
  window?: DistanceWindow;
  /** Extra metres either side of the window that count as te vroeg / te laat rather than gemist. */
  tolerance?: number;
  missed: Outcome;
  early?: Outcome;
  late?: Outcome;
  /** Shown in the debrief when the student got it right. */
  praise?: string;
  /** Not scored when the rider has auto-sturen on, because there was nothing to do. */
  onlyWhenManualSteering?: boolean;
}

/**
 * Handelingen die in deze volgorde moeten gebeuren. Scored on the actual times of the listed
 * expected actions, so a rider who does everything but in the wrong order still gets told.
 */
export interface SequenceRule {
  label: string;
  ids: string[];
  outcome: Outcome;
}

/**
 * Kijkgedrag is not a tic. Repeating the same look every couple of seconds is normal; hammering
 * every mirror and shoulder continuously is not looking, it is scanning — and without a cost a
 * student could simply mash every look control and hit every window by accident.
 */
export interface LookDiscipline {
  /** Repeating the *same* look inside this many seconds adds nothing. */
  minRepeatSeconds: number;
  /** More than this many look actions of any kind inside `burstSeconds`. */
  maxInBurst: number;
  burstSeconds: number;
  /** Violation counts at which this becomes an opmerking, then a fout. */
  warnAt: number;
  faultAt: number;
  warning: Outcome;
  fault: Outcome;
}

/**
 * A control that stays inoperative until certain looks have been made.
 *
 * The richtingaanwijzer is an announcement of a decision you have already verified, so it should
 * not be possible to announce first and check afterwards. The press is still recorded — marked
 * `rejected` — because what the student tried to do is exactly what needs saying afterwards.
 */
export interface ControlPrerequisite {
  label: string;
  control: ControlId;
  requires: ControlId[];
  /** Shown briefly on the HUD when the press is refused. */
  message: string;
  outcome: Outcome;
}

/** Things the student should NOT do. */
export interface UnwantedRule {
  id: string;
  label: string;
  group: ControlGroup;
  control: ControlId;
  outcome: Outcome;
}

export type ResultStatus = 'goed' | 'te vroeg' | 'te laat' | 'gemist' | 'ongewenst';

export interface ActionResult {
  expectedId: string;
  label: string;
  group: ControlGroup;
  status: ResultStatus;
  severity: Severity | null;
  explanation: string;
  /** Window converted to this run's own seconds via the recorded s(t). */
  windowT: [number, number] | null;
  windowD: [number, number] | null;
  actualT: number | null;
  actualD: number | null;
}

export type Verdict = 'geslaagd' | 'gezakt';

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------

export interface RoadLayout {
  /** Half width of the carriageway; the road runs from -halfWidth to +halfWidth. */
  halfWidth: number;
  laneCenterX: number;
  kerbTo: number;
  fietspadFrom: number;
  fietspadTo: number;
  vergeTo: number;
  /** Half height of the side road (Kerkstraat) carriageway. */
  sideHalfWidth: number;
  sideLaneCenterY: number;
}

export interface Scenario {
  id: string;
  title: string;
  briefing: {
    situation: string;
    assignment: string;
    hints: string[];
  };
  road: RoadLayout;
  /** Where the straight approach begins and where it turns in, in world y. */
  approach: { startY: number; turnInY: number; turnRadius: number; exitX: number };
  /** Speed limit in km/h, and the speed the rider starts at. */
  speedLimitKmh: number;
  startSpeedKmh: number;
  startGear: number;
  /** x of the fietspad centreline the route crosses; defines the conflict point. */
  conflictX: number;
  actors: ActorSpec[];
  expected: ExpectedAction[];
  sequence: SequenceRule;
  lookDiscipline: LookDiscipline;
  controlPrerequisites: ControlPrerequisite[];
  unwanted: UnwantedRule[];
  verdictRule: { faultLimit: number };
}

// ---------------------------------------------------------------------------
// What a renderer is given
// ---------------------------------------------------------------------------

/**
 * The observable state of the world at one instant — everything a renderer needs and nothing
 * about how it will be shown. Produced both by the live engine and by replaying a recording, so
 * the two paths are indistinguishable to whatever is drawing.
 */
export interface WorldView {
  road: RoadLayout;
  pose: PoseOnRoute;
  /** 0 at standstill, 1 at the road's speed limit. Drives how far the camera looks ahead. */
  speedFactor: number;
  indicator: 'left' | 'right' | 'off';
  braking: boolean;
  actors: ActorState[];
  gazes: ActiveGaze[];
}

// ---------------------------------------------------------------------------
// Run record
// ---------------------------------------------------------------------------

export interface BikeSample {
  t: number;
  s: number;
  d: number;
  x: number;
  y: number;
  heading: number;
  /** m/s */
  speed: number;
  gear: number;
  clutch: boolean;
  brake: boolean;
  indicator: 'left' | 'right' | 'off';
  branch: RouteBranch;
}

export interface ActorSample {
  t: number;
  x: number;
  y: number;
  heading: number;
  speed: number;
  mode: ActorMode;
  perceived: boolean;
}

export type RouteBranch = 'approach' | 'turn' | 'straight';

export interface ActorIncident {
  actorId: string;
  actorLabel: string;
  kind: 'emergency_brake';
  t: number;
  /** Was the actor ever perceived by the rider before the incident? */
  wasPerceived: boolean;
}

export interface RunRecord {
  id: string;
  scenarioId: string;
  scenarioTitle: string;
  startedAt: string;
  durationS: number;
  /** Training tempo the ride was flown at: 1 = real time, 0.5 = half speed. */
  timeScale: number;
  /** The bike took the turn by itself; the sturen controls were inactive. */
  autoSteer: boolean;
  branch: RouteBranch;
  /** Seconds at which the turn was completed, or null when the rider carried straight on. */
  turnCompletedAt: number | null;
  /** Sampled at RECORD_HZ. */
  samples: BikeSample[];
  actorTracks: Record<string, ActorSample[]>;
  events: ControlEvent[];
  incidents: ActorIncident[];
  /** Filled in by scoring.ts. */
  results: ActionResult[];
  faults: ActionResult[];
  counts: { opmerking: number; fout: number; kritiek: number };
  verdict: Verdict;
}
