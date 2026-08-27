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
  | 'SET_SPEED'
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

/** Where the rider is looking, relative to the machine. */
export interface HeadPose {
  /** Radians. Positive is left, matching the bearings used everywhere else. */
  yaw: number;
  /** Radians. Positive is up. */
  pitch: number;
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
  /** What the press was for, when it carries one: the km/h a SET_SPEED asked for. */
  value?: number;
  phase: ControlPhase;
  /** `gaze` means the rider looked at the thing rather than pressing anything. */
  source: 'pointer' | 'keyboard' | 'gaze';
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

export type ActorKind = 'snorfiets' | 'auto' | 'fietser' | 'voetganger' | 'vrachtwagen';

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
   * Metres, nose to tail. Following distance is measured between bumpers, not between centres,
   * and a trekker-oplegger is seven metres longer than the snorfiets this used to assume — about
   * a third of a second at motorway speed, which is enough to move a verdict a whole band.
   */
  length?: number;
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
  /** A control must be pressed within `withinSeconds` of the manoeuvre being completed. */
  | { type: 'afterTurn'; control: ControlId; withinSeconds: number }
  /** Speed must be at or above `minKmh` by the end of the window. */
  | { type: 'speedAtLeast'; minKmh: number }
  /**
   * Following distance to another road user, in seconds, held across the window rather than
   * sampled once. A distance you hold is the thing being taught; an instant is gameable —
   * drop in three seconds clear, bank the credit, then close right up.
   */
  | { type: 'headway'; actorId: string; bands: HeadwayBand[] }
  /** The machine has to move this way once. Missing it is the manoeuvre never happening. */
  | { type: 'laneChange'; direction: 'left' | 'right' }
  /**
   * A control must have been used within `withinSeconds` before the machine moved that way.
   *
   * The mirror of `afterTurn`, and the answer to a road where nothing happens at a fixed place:
   * an overtake is wherever the rider decides, so anchoring the reeks to a milepost would score
   * their choice of milepost instead of their technique.
   */
  | {
      type: 'beforeLaneChange';
      control: ControlId;
      direction: 'left' | 'right';
      withinSeconds: number;
    }
  /** Speed held inside a band, the way `headway` holds a distance. */
  | { type: 'speedBand'; bands: SpeedBand[] };

/**
 * One rung of the following-distance rule. Bands live in scenario data because the thresholds are
 * a teaching choice, not a fact: two seconds normally, three behind something you cannot see past.
 */
export interface HeadwayBand {
  /** Applies when the held headway is at or above this many seconds. */
  atLeastSeconds: number;
  /** Restrict to one side, when the rule differs in front and behind. */
  side?: 'ahead' | 'behind';
  outcome: Outcome | { praise: string };
}

/**
 * One rung of a held-speed rule, ordered widest first.
 *
 * Bands rather than a limit because "how fast should you be going" is rarely one number: on a
 * motorway there is a range that is fine, a range that is untidy, and everything else.
 */
export interface SpeedBand {
  /** Applies when the held speed is inside this range, in km/h. */
  fromKmh: number;
  toKmh: number;
  outcome: Outcome | { praise: string };
}

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

/**
 * The street plan of an urban crossing: a carriageway with a vrijliggend fietspad beside it and a
 * side road across it.
 */
export interface UrbanRoad {
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

/**
 * One carriageway of a motorway, with an invoegstrook on its right.
 *
 * Everything is given as widths rather than as x boundaries so the two cannot disagree; the
 * boundaries are derived in one place by `motorwayLanes()`. Lanes are numbered the Dutch way —
 * rijstrook 1 is the rightmost — and the other carriageway is not modelled at all.
 */
export interface MotorwayRoad {
  laneCount: number;
  laneWidth: number;
  /** x of the left edge of the leftmost lane. The geleiderail stands just outside it. */
  leftEdgeX: number;
  mergeLaneWidth: number;
  /** The band of blokmarkering between the invoegstrook and rijstrook 1. */
  blockBandWidth: number;
  /** How far the berm reaches beyond the right-hand kantstreep. */
  bermWidth: number;
}

export type RoadLayout = UrbanRoad | MotorwayRoad;

/**
 * Where a scenario takes place, and the anchors its route is built from.
 *
 * Tagged as one piece rather than tagging only the road, because the route anchors are just as
 * road-shaped as the road is: an urban crossing needs a turn-in point and a conflict crossing,
 * a motorway needs a ramp and the end of the invoegstrook. Tagging only the road would let a
 * scenario pair a motorway with an urban `approach`, and nothing would complain until
 * `buildRoutes` threw inside the engine constructor — pure data that lies, which is exactly what
 * the future scenario editor must not be able to produce.
 */
export type ScenarioWorld =
  | {
      kind: 'urbanCrossing';
      road: UrbanRoad;
      /** Where the straight approach begins and where it turns in, in world y. */
      approach: { startY: number; turnInY: number; turnRadius: number; exitX: number };
      /** x of the fietspad centreline the route crosses; defines the conflict point. */
      conflictX: number;
    }
  | {
      kind: 'motorway';
      road: MotorwayRoad;
      stretch: MotorwayStretch;
    };

/**
 * Which bit of motorway this is.
 *
 * Tagged rather than a bag of optional fields. An open stretch has no oprit, no invoegstrook and
 * no puntstuk, and an entry has no need of an explicit start — the arc fixes it. Left optional,
 * every generator would have to guess which fields were meant, and a scenario could carry a merge
 * deadline for a road with nothing to merge onto.
 */
export type MotorwayStretch =
  | {
      kind: 'oprit';
      /**
       * An arc of `radius` sweeping `sweepDeg` round onto north, ending where the invoegstrook
       * begins. Those three fix the arc completely, so there is no start point to supply and no
       * way to supply one that disagrees.
       */
      ramp: { radius: number; sweepDeg: number; strookStartY: number };
      /**
       * y at which the invoegstrook runs out. The hard deadline, and the anchor every window is
       * measured back from — the motorway's answer to the fietspad centreline.
       */
      mergeEndY: number;
      /**
       * How long the puntstuk is: the strook narrows from full width at `mergeEndY` to nothing
       * over this many metres. Generous on purpose — the scoring deadline is `mergeEndY`, and the
       * tarmac running out well after it is what makes that a deadline rather than a wall.
       */
      taperM: number;
      /** How far past the deadline the ride continues, so a held following distance can be judged. */
      runOutM: number;
    }
  | {
      /**
       * Open road: two or more lanes and nothing joining them. Nothing happens at a fixed place
       * here, so there is no conflict point to measure back from — what gets scored is anchored to
       * the manoeuvre the rider chooses to make.
       */
      kind: 'doorgaand';
      startY: number;
      endY: number;
    };

export interface Scenario {
  id: string;
  title: string;
  briefing: {
    situation: string;
    assignment: string;
    hints: string[];
  };
  world: ScenarioWorld;
  /** Speed limit in km/h, and the speed the rider starts at. */
  speedLimitKmh: number;
  startSpeedKmh: number;
  startGear: number;
  /**
   * The fastest the machine will go and how much one throttle press adds. Scenario data because
   * they are not facts about motorcycles: 60 km/h was a fact about a 30-zone, and left as a
   * constant it silently makes a motorway unrideable.
   */
  maxSpeedKmh: number;
  throttleStepKmh: number;
  /**
   * What the sturen controls mean here. `branch` arms a choice between two fixed routes;
   * `lane` moves the machine one rijstrook sideways, and auto-sturen does not apply because
   * timing that move is the exercise.
   */
  steering: 'branch' | 'lane';
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
  world: ScenarioWorld;
  /** Simulated seconds. Drives anything that blinks, so a replay blinks in step with the run. */
  time: number;
  pose: PoseOnRoute;
  /** 0 at standstill, 1 at the road's speed limit. Drives how far the camera looks ahead. */
  speedFactor: number;
  /** What the instrument on the cowl reads. */
  speedKmh: number;
  gear: number;
  /**
   * The speed the machine is aiming for, in km/h. Always a number: there is always an answer to
   * "what is it trying to do", and a readout that is blank until you happen to use one particular
   * control is a readout nobody trusts.
   */
  targetSpeedKmh: number;
  indicator: 'left' | 'right' | 'off';
  braking: boolean;
  actors: ActorState[];
  /** Where the rider is looking. The plan view draws it as the cone it is. */
  head: HeadPose;
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
  /** Where the rider was looking, radians relative to the machine. */
  headYaw: number;
  headPitch: number;
  /**
   * Metres left of the route spine. The spine is where the road goes; this is which rijstrook the
   * machine is actually in, so a replay reproduces the lane change rather than the intention.
   */
  laneOffset: number;
  /** The set speed at this instant, so a replay shows the same readout the rider had. */
  targetSpeedKmh: number;
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

/**
 * One completed move from lane to lane.
 *
 * Both ends are recorded because both get judged. The reeks before a manoeuvre is judged against
 * when the machine *started* moving — that is the moment the looking had to be finished by — while
 * following distance and which lane you ended up in are questions about where it arrived.
 */
export interface LaneChange {
  startedAt: number;
  completedAt: number;
  direction: 'left' | 'right';
  fromLane: number;
  toLane: number;
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
  /**
   * Seconds at which the manoeuvre this scenario is about was completed — the turn, or the lane
   * change — or null when the rider never made it. On a road with more than one manoeuvre this is
   * the first of them; `laneChanges` has them all.
   */
  manoeuvreCompletedAt: number | null;
  /** Every lane change, in order. Empty on a road where the rider never changed lane. */
  laneChanges: LaneChange[];
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
