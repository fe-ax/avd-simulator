/**
 * Simulation engine. Deliberately lives outside React: it runs a fixed-timestep loop at 120 Hz
 * and mutates its own state, while React only subscribes to a throttled snapshot. A 60 Hz
 * simulation must never drive 60 Hz re-renders.
 *
 * Every mutation enters through `dispatch()`. Clicking a button and pressing its key both go
 * through that one door, which is what makes the recording complete and the replay faithful.
 */
import { applyPerception, GAZE_DURATION_S, isLookControl } from './perception';
import { steeringIsAutomatic, steeringIsInert } from './steering';
import { buildRoutes, poseAt, type Route, type ScenarioRoutes } from './route';
import type {
  ActiveGaze,
  ActorIncident,
  ActorSample,
  ActorSpec,
  ActorState,
  BikeSample,
  ControlEvent,
  ControlId,
  ControlPhase,
  HeadPose,
  LookControl,
  PoseOnRoute,
  RouteBranch,
  RunRecord,
  Scenario,
} from './types';

const KMH = 1 / 3.6;

// Longitudinal model. Deliberately minimal: only what the exercise actually scores.
const ACCEL = 2.2; // m/s^2 when below target speed
const COAST_DECEL = 1.2; // m/s^2 when above target speed and not braking
const BRAKE_DECEL = 4.5; // m/s^2 while the rem is held
const MAX_GEAR = 6;

/**
 * How long a set speed takes to arrive, whatever the change.
 *
 * Fixed time rather than fixed acceleration, which is unusual and deliberate. A rider practising
 * a merge wants to say "make it a hundred" and know exactly when it will be a hundred; tying that
 * to a rate means the answer depends on where you started, and the one thing a training tool
 * should not make you compute in your head is when you will be ready. Throttle steps keep the
 * ordinary physics — this is the cruise control, not the wrist.
 */
const SPEED_RAMP_S = 4;

const ACTOR_ACCEL = 1.5;
const ACTOR_BRAKE = 5.0;
/**
 * How long before the rider reaches the fietspad the actor starts to worry. A snorfietser does
 * not stamp on the brakes because a motorbike is merely approaching a crossing — they brake when
 * it is clear the rider is coming through. Too generous a horizon and a correct, yielding ride
 * gets marked as gevaarzetting; too tight and the actor cannot stop in time.
 */
const ACTOR_ALARM_HORIZON_S = 1.3;
const ACTOR_ALARM_TTC_S = 1.6;
const ACTOR_HALF_LENGTH = 0.9;

/**
 * Seconds a lane change takes end to end. About sixty metres at motorway speed — an unhurried,
 * ordinary move rather than a flick, which is what it has to feel like for the timing of it to be
 * the thing being taught.
 */
const LANE_CHANGE_S = 2.2;

/** Half the length of the machine, for bumper-to-bumper gaps. */
const BIKE_HALF_LENGTH = 1.15;

/** Actors are as long as they say they are; a snorfiets was the old hardcoded assumption. */
function actorHalfLength(actor: ActorState): number {
  return (actor.spec.length ?? ACTOR_HALF_LENGTH * 2) / 2;
}

/** Below this much clear headway the vehicle behind has to do something about it. */
const CUT_IN_ALARM_S = 1;

function smoothstep(u: number): number {
  const x = Math.max(0, Math.min(1, u));
  return x * x * (3 - 2 * x);
}
/** Proportional gain of the blind-spot director. */
const DIRECTOR_GAIN = 0.6;

const FIXED_DT = 1 / 120;
const COUNTDOWN_S = 3;

/** Millimetre precision is far beyond what any of this is measured in, and full float precision
 * roughly doubles the size of a stored or exported run. */
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const RECORD_HZ = 20;
const MAX_RUN_S = 90;
/** How far past the junction the run continues before it ends — long enough that "na de bocht"
 * expectations such as richting uitzetten and weer optrekken have room to be scored. */

export type Phase = 'briefing' | 'countdown' | 'riding' | 'finished';

/** Training tempos. Everything slows together, so the exercise keeps its shape and only the
 * rider's thinking time grows. */
export const TIME_SCALES = [0.25, 0.5, 0.75, 1] as const;
export type TimeScale = (typeof TIME_SCALES)[number];

export interface BikeState {
  s: number;
  speed: number;
  targetSpeed: number;
  gear: number;
  clutch: boolean;
  brake: boolean;
  indicator: 'left' | 'right' | 'off';
  branch: RouteBranch;
  steerArmed: boolean;
  /** A set speed on its way in: linear from `from` to `to`, starting at `startedAt`. */
  speedRamp: { from: number; to: number; startedAt: number } | null;
  /**
   * The speed that was asked for, which outlives the ramp that delivers it — the cruise stays set
   * after it has arrived, and the instrument goes on saying so until something takes it back.
   */
  setSpeed: number | null;
  /** Metres left of the route spine: which rijstrook the machine is actually in. */
  laneOffset: number;
  /** Index into `routes.laneOffsets`; 0 is the invoegstrook. */
  laneIndex: number;
  laneFromOffset: number;
  laneTargetOffset: number;
  /** 0 to 1 through the current change; 1 means settled. */
  laneU: number;
  pose: PoseOnRoute;
}

export interface Rejection {
  message: string;
  /** Simulated seconds since the press was refused, so the host can fade it out. */
  ageS: number;
}

export interface EngineSnapshot {
  phase: Phase;
  t: number;
  timeScale: number;
  autoSteer: boolean;
  paused: boolean;
  rejection: Rejection | null;
  countdown: number | null;
  speedKmh: number;
  targetKmh: number;
  gear: number;
  clutch: boolean;
  brake: boolean;
  indicator: 'left' | 'right' | 'off';
  branch: RouteBranch;
  steerArmed: boolean;
  distanceToConflict: number;
  activeGazes: LookControl[];
  /** Only populated when the debug overlay is on; used to tune the scenario. */
  debug: DebugInfo | null;
}

export interface DebugInfo {
  s: number;
  conflictS: number;
  actorGaps: { id: string; gap: number; bearing: number; dist: number; mode: string }[];
}

export interface World {
  scenario: Scenario;
  routes: ScenarioRoutes;
  bike: BikeState;
  actors: ActorState[];
  head: HeadPose;
  /** God view during replay/debrief, perception view while riding. */
  revealAll: boolean;
}

function makeActorState(spec: ActorSpec): ActorState {
  const heading = Math.atan2(spec.to.y - spec.from.y, spec.to.x - spec.from.x);
  return {
    spec,
    dist: 0,
    x: spec.from.x,
    y: spec.from.y,
    heading,
    speed: spec.speed,
    mode: 'cruise',
    perceived: false,
    perceivedAt: null,
    emergencyBraked: false,
    emergencyBrakedAt: null,
  };
}

export class SimEngine {
  readonly scenario: Scenario;
  readonly routes: ScenarioRoutes;

  phase: Phase = 'briefing';
  t = 0;
  countdownRemaining: number | null = null;
  debugEnabled = false;
  /**
   * Freezes simulated time while the frame loop keeps running, so the scene can be inspected and
   * the head still moved. A debugging tool: the only way to look hard at a moment that lasts a
   * sixtieth of a second.
   */
  paused = false;
  /**
   * Slow motion for training. Applied only to the real-time loop, so `t` and every recorded
   * timestamp stay in *simulated* seconds — a run at half tempo is directly comparable with one
   * at full tempo, and the distance-anchored windows are untouched. What actually grows is the
   * rider's reaction time, which is the point.
   */
  timeScale: number = 1;
  /**
   * The bike takes the assigned turn by itself. Forgetting to steer is not a mistake real riders
   * make, so by default the sturen controls are inactive and the exercise stays about kijken,
   * aankondigen en voorrang. Switch it off to practise the decision as well.
   */
  autoSteer = true;
  /**
   * Where the rider is looking. Held by reference to whatever is driving the head, so the engine
   * always sees the current pose without anything having to push it in every frame. Perception is
   * computed from this and nothing else: look away and you genuinely stop seeing.
   */
  headPose: HeadPose = { yaw: 0, pitch: 0 };

  bike: BikeState;
  actors: ActorState[];
  gazes: ActiveGaze[] = [];

  events: ControlEvent[] = [];
  /** Controls that have had at least one press that actually took effect. */
  private effectiveControls = new Set<ControlId>();
  private rejection: { message: string; t: number } | null = null;
  samples: BikeSample[] = [];
  actorTracks: Record<string, ActorSample[]> = {};
  incidents: ActorIncident[] = [];
  manoeuvreCompletedAt: number | null = null;

  private accumulator = 0;
  private lastFrameMs: number | null = null;
  private rafId: number | null = null;
  private nextSampleT = 0;
  private startedAt = new Date(0).toISOString();
  private onFinish: ((record: RunRecord) => void) | null = null;
  private onFrame: (() => void) | null = null;

  /**
   * The machine's ceiling and throttle granularity, from the scenario.
   *
   * These were constants — 60 km/h and 5 km/h steps — which read as facts about motorcycles and
   * were really facts about a 30-zone. Left alone, the ceiling makes a motorway literally
   * unrideable and nothing says why.
   */
  private readonly maxSpeed: number;
  private readonly throttleStep: number;

  constructor(scenario: Scenario) {
    this.scenario = scenario;
    this.maxSpeed = scenario.maxSpeedKmh * KMH;
    this.throttleStep = scenario.throttleStepKmh * KMH;
    this.routes = buildRoutes(scenario);
    this.bike = this.freshBike();
    this.actors = scenario.actors.map(makeActorState);
  }

  private freshBike(): BikeState {
    const speed = this.scenario.startSpeedKmh * KMH;
    return {
      s: 0,
      speed,
      targetSpeed: speed,
      gear: this.scenario.startGear,
      clutch: false,
      brake: false,
      indicator: 'off',
      branch: 'approach',
      steerArmed: false,
      speedRamp: null,
      setSpeed: null,
      laneOffset: 0,
      laneIndex: 0,
      laneFromOffset: 0,
      laneTargetOffset: 0,
      laneU: 1,
      pose: poseAt(this.routes.turn, 0),
    };
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Called once per animation frame by the host so it can redraw. */
  setFrameCallback(cb: () => void) {
    this.onFrame = cb;
  }

  start(onFinish: (record: RunRecord) => void, startedAtIso: string) {
    this.arm(onFinish, startedAtIso);
    this.loop();
  }

  /**
   * Same as `start()` but without the animation frame loop: the caller drives the clock with
   * `advance()`. Used by the tests and by the scenario-tuning harness, so what they measure is
   * the same code path the browser runs.
   */
  arm(onFinish: (record: RunRecord) => void, startedAtIso: string) {
    this.onFinish = onFinish;
    this.startedAt = startedAtIso;
    this.reset();
    this.phase = 'countdown';
    this.countdownRemaining = COUNTDOWN_S;
  }

  /** Advance the simulation by `seconds` of fixed steps, then notify the host. */
  advance(seconds: number) {
    this.accumulator += seconds;
    while (this.accumulator >= FIXED_DT) {
      this.step(FIXED_DT);
      this.accumulator -= FIXED_DT;
    }
    this.onFrame?.();
  }

  /** Back to the briefing, ready for another attempt. */
  toBriefing() {
    this.stop();
    this.reset();
    this.phase = 'briefing';
  }

  reset() {
    this.t = 0;
    this.bike = this.freshBike();
    this.actors = this.scenario.actors.map(makeActorState);
    this.gazes = [];
    this.events = [];
    this.effectiveControls = new Set();
    this.rejection = null;
    this.samples = [];
    this.actorTracks = Object.fromEntries(this.scenario.actors.map((a) => [a.id, []]));
    this.incidents = [];
    this.manoeuvreCompletedAt = null;
    this.paused = false;
    this.accumulator = 0;
    this.lastFrameMs = null;
    this.nextSampleT = 0;
  }

  stop() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  private loop = () => {
    this.rafId = requestAnimationFrame(this.loop);
    const now = performance.now();
    const deltaMs = this.lastFrameMs === null ? 16.7 : now - this.lastFrameMs;
    this.lastFrameMs = now;

    // Clamp so an alt-tab does not fast-forward the whole ride.
    if (this.paused) {
      // Still notify: the host keeps drawing, and the rider can keep looking around.
      this.onFrame?.();
      return;
    }

    // Clamped so an alt-tab cannot fast-forward the ride when the tab comes back. The countdown
    // deliberately runs at real time: a three-second countdown should not take twelve.
    const tempo = this.phase === 'riding' ? this.timeScale : 1;
    this.advance(Math.min(deltaMs / 1000, 0.25) * tempo);
  };

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  dispatch(
    control: ControlId,
    phase: ControlPhase,
    source: ControlEvent['source'],
    value?: number,
  ) {
    if (this.phase !== 'riding') return;
    // With auto-sturen the controls are inert and nothing is recorded: an inactive button that
    // still fills the log would put phantom rows in the debrief.
    if (
      steeringIsInert(this.scenario, this.autoSteer) &&
      (control === 'STEER_LEFT' || control === 'STEER_RIGHT')
    ) {
      return;
    }

    // A control whose prerequisites are not met records the attempt and does nothing else. The
    // richtingaanwijzer announces a decision you have already checked, so announcing first has
    // to be impossible rather than merely marked down afterwards.
    const blocker =
      phase === 'up'
        ? undefined
        : this.scenario.controlPrerequisites.find(
            (rule) =>
              rule.control === control &&
              !rule.requires.every((needed) => this.effectiveControls.has(needed)),
          );

    this.events.push({
      t: round3(this.t),
      s: round3(this.bike.s),
      d: round3(this.distanceToConflict()),
      control,
      phase,
      source,
      ...(value === undefined ? {} : { value }),
      ...(blocker ? { rejected: true } : {}),
    });

    if (blocker) {
      this.rejection = { message: blocker.message, t: this.t };
      return;
    }
    if (phase !== 'up') this.effectiveControls.add(control);

    const bike = this.bike;
    switch (control) {
      case 'BRAKE':
        bike.brake = phase !== 'up';
        break;
      case 'CLUTCH':
        bike.clutch = phase !== 'up';
        break;
      case 'THROTTLE_UP':
        // A hand on the throttle cancels a set speed, the way it does on any machine that has one.
        bike.speedRamp = null;
        bike.setSpeed = null;
        bike.targetSpeed = Math.min(this.maxSpeed, bike.targetSpeed + this.throttleStep);
        break;
      case 'THROTTLE_DOWN':
        bike.speedRamp = null;
        bike.setSpeed = null;
        bike.targetSpeed = Math.max(0, bike.targetSpeed - this.throttleStep);
        break;
      case 'SET_SPEED': {
        // No value means the limit. The keyboard has no way to carry one, and "S" meaning "get up
        // to the speed of this road" is the useful reading — where the alternative, a missing
        // value falling through to zero, would stop the machine dead on a motorway.
        const want = Math.max(0, Math.min(this.maxSpeed, (value ?? this.scenario.speedLimitKmh) * KMH));
        bike.targetSpeed = want;
        bike.setSpeed = want;
        bike.speedRamp = { from: bike.speed, to: want, startedAt: this.t };
        break;
      }
      case 'GEAR_UP':
        bike.gear = Math.min(MAX_GEAR, bike.gear + 1);
        break;
      case 'GEAR_DOWN':
        bike.gear = Math.max(1, bike.gear - 1);
        break;
      case 'INDICATOR_LEFT':
        bike.indicator = 'left';
        break;
      case 'INDICATOR_RIGHT':
        bike.indicator = 'right';
        break;
      case 'INDICATOR_OFF':
        bike.indicator = 'off';
        break;
      case 'STEER_RIGHT':
        if (this.scenario.steering === 'lane') this.changeLane(-1);
        // Arming, not steering: the geometry of the turn is fixed, the decision is not.
        else if (bike.branch === 'approach') bike.steerArmed = true;
        break;
      case 'STEER_LEFT':
        if (this.scenario.steering === 'lane') this.changeLane(1);
        else if (bike.branch === 'approach') bike.steerArmed = false;
        break;
      default:
        if (isLookControl(control) && phase === 'press') {
          this.gazes = this.gazes.filter((g) => g.control !== control);
          this.gazes.push({ control, remaining: GAZE_DURATION_S });
        }
    }
  }

  // -------------------------------------------------------------------------
  // Simulation
  // -------------------------------------------------------------------------

  private step(dt: number) {
    if (this.phase === 'countdown') {
      this.countdownRemaining = (this.countdownRemaining ?? 0) - dt;
      if (this.countdownRemaining <= 0) {
        this.countdownRemaining = null;
        this.phase = 'riding';
      }
      return;
    }
    if (this.phase !== 'riding') return;

    this.t += dt;
    this.stepBike(dt);
    this.stepActors(dt);

    for (const gaze of this.gazes) gaze.remaining -= dt;
    this.gazes = this.gazes.filter((g) => g.remaining > 0);

    applyPerception(this.bike.pose, this.headPose, this.actors, this.t);
    this.recordSample();
    this.checkFinished();
  }

  private stepBike(dt: number) {
    const bike = this.bike;

    if (bike.brake) {
      // The brake wins over everything, including a set speed still on its way in.
      bike.speedRamp = null;
      bike.setSpeed = null;
      bike.speed = Math.max(0, bike.speed - BRAKE_DECEL * dt);
    } else if (bike.speedRamp) {
      const { from, to, startedAt } = bike.speedRamp;
      const u = SPEED_RAMP_S <= 0 ? 1 : (this.t - startedAt) / SPEED_RAMP_S;
      if (u >= 1) {
        bike.speed = to;
        bike.speedRamp = null;
      } else {
        bike.speed = from + (to - from) * u;
      }
    } else if (bike.speed < bike.targetSpeed) {
      // The clutch being in means no drive reaches the wheel.
      if (!bike.clutch) bike.speed = Math.min(bike.targetSpeed, bike.speed + ACCEL * dt);
    } else if (bike.speed > bike.targetSpeed) {
      bike.speed = Math.max(bike.targetSpeed, bike.speed - COAST_DECEL * dt);
    }

    bike.s += bike.speed * dt;

    // Commit to a branch at the turn-in point. Missing the steer press is not an abort:
    // the rider simply carries straight on and the run plays out.
    if (bike.branch === 'approach' && bike.s >= this.routes.decisionS) {
      bike.branch =
        bike.steerArmed || steeringIsAutomatic(this.scenario, this.autoSteer) ? 'turn' : 'straight';
    }

    const route = this.activeRoute();
    const spine = poseAt(route, bike.s);

    // The spine is where the road goes; the offset is which rijstrook the machine is in. Composed
    // here rather than in a renderer, because `applyPerception` and `recordSample` both read
    // `bike.pose` immediately after this — offset it later and perception would credit the rider
    // with seeing from a position they are not in.
    const before = bike.laneOffset;
    if (bike.laneU < 1) {
      bike.laneU = Math.min(1, bike.laneU + dt / LANE_CHANGE_S);
      if (bike.laneU >= 1 && this.manoeuvreCompletedAt === null) this.manoeuvreCompletedAt = this.t;
    }
    bike.laneOffset =
      bike.laneFromOffset +
      (bike.laneTargetOffset - bike.laneFromOffset) * smoothstep(bike.laneU);

    const lateral = dt > 0 ? (bike.laneOffset - before) / dt : 0;
    const h = spine.heading;
    bike.pose = {
      // Left of the heading is (-sin, cos): rotate the direction a quarter turn anticlockwise.
      x: spine.x - Math.sin(h) * bike.laneOffset,
      y: spine.y + Math.cos(h) * bike.laneOffset,
      // Angled into the move, so the machine visibly leans across and the mirrors sweep with it.
      heading: h + Math.atan2(lateral, Math.max(bike.speed, 0.1)),
    };

    if (
      this.scenario.steering === 'branch' &&
      bike.branch === 'turn' &&
      this.manoeuvreCompletedAt === null &&
      bike.s >= this.routes.decisionS + this.routes.turn.lengths[1]
    ) {
      this.manoeuvreCompletedAt = this.t;
    }
  }

  private stepActors(dt: number) {
    const bikeD = this.distanceToConflict();
    for (const actor of this.actors) {
      if (actor.mode === 'done') continue;

      const cruise = this.directorSpeed(actor, bikeD);
      const conflict = this.actorConflicts(actor);

      if (conflict && (actor.mode === 'cruise' || actor.mode === 'resuming')) {
        actor.mode = 'braking';
        if (!actor.emergencyBraked) {
          actor.emergencyBraked = true;
          actor.emergencyBrakedAt = this.t;
          this.incidents.push({
            actorId: actor.spec.id,
            actorLabel: actor.spec.label,
            kind: 'emergency_brake',
            // Rounded like every other timestamp on the record: an unrounded one compares
            // fractionally later than the rounded event at the same instant.
            t: round3(this.t),
            wasPerceived: actor.perceived,
          });
        }
      } else if (!conflict && (actor.mode === 'braking' || actor.mode === 'stopped')) {
        actor.mode = 'resuming';
      }

      switch (actor.mode) {
        case 'braking':
          actor.speed = Math.max(0, actor.speed - ACTOR_BRAKE * dt);
          if (actor.speed === 0) actor.mode = 'stopped';
          break;
        case 'stopped':
          actor.speed = 0;
          break;
        case 'resuming':
          actor.speed = Math.min(cruise, actor.speed + ACTOR_ACCEL * dt);
          if (actor.speed >= cruise - 0.05) actor.mode = 'cruise';
          break;
        default:
          // Rate-limited rather than snapped, so the director letting go of an actor does not
          // show up as an instant change of speed.
          actor.speed += Math.max(
            -ACTOR_BRAKE * dt,
            Math.min(ACTOR_ACCEL * dt, cruise - actor.speed),
          );
      }

      actor.dist += actor.speed * dt;
      const spec = actor.spec;
      const len = Math.hypot(spec.to.x - spec.from.x, spec.to.y - spec.from.y);
      const u = Math.min(1, actor.dist / len);
      actor.x = spec.from.x + (spec.to.x - spec.from.x) * u;
      actor.y = spec.from.y + (spec.to.y - spec.from.y) * u;
      if (u >= 1) actor.mode = 'done';
    }
  }

  /**
   * Scenario director. Holds the actor `targetGap` metres behind the rider so the dode-hoek
   * lesson fires regardless of riding style, but only inside a plausible speed band and only
   * until the rider is close to the conflict — after that it is pure physics, so what the
   * student sees in the last seconds is honest.
   */
  private directorSpeed(actor: ActorState, bikeD: number): number {
    const cfg = actor.spec.keepInBlindSpot;
    if (!cfg?.enabled || bikeD < cfg.releaseAt) return actor.spec.speed;
    const desired =
      this.bike.speed + DIRECTOR_GAIN * (this.longitudinalGap(actor) - cfg.targetGap);
    return Math.max(cfg.minSpeed, Math.min(cfg.maxSpeed, desired));
  }

  /** True when the rider is taking (or about to take) this actor's right of way. */
  /**
   * A vehicle already on the motorway having to brake because the rider dropped in on it.
   *
   * Nobody crosses anybody's path here, so the crossing predicate has nothing to say. What makes
   * a merge dangerous is longitudinal: same lane, coming up behind, and not enough room left to
   * do anything but brake.
   */
  private actorCutIn(actor: ActorState): boolean {
    const bike = this.bike;
    if (this.scenario.world.kind !== 'motorway') return false;
    const laneWidth = this.scenario.world.road.laneWidth;
    // Sharing a lane is a lateral question, and during a lane change the answer changes.
    if (Math.abs(actor.x - bike.pose.x) > laneWidth / 2) return false;

    const gap = this.longitudinalGap(actor);
    if (gap <= 0) return false; // ahead of the rider: not its problem

    const clear = gap - actorHalfLength(actor) - BIKE_HALF_LENGTH;
    if (clear <= 0) return true;
    const closing = actor.speed - bike.speed;
    // Not catching up means it never has to do anything, however close it is sitting.
    if (closing <= 0) return clear / Math.max(actor.speed, 0.1) < CUT_IN_ALARM_S;
    return clear / closing < ACTOR_ALARM_TTC_S || clear / Math.max(actor.speed, 0.1) < CUT_IN_ALARM_S;
  }

  private actorConflicts(actor: ActorState): boolean {
    const bike = this.bike;
    if (this.routes.kind === 'motorway') return this.actorCutIn(actor);
    if (bike.branch !== 'turn') return false;

    const { crossEntryS, crossExitS, crossYSpan } = this.routes;
    const occupying = bike.s >= crossEntryS && bike.s <= crossExitS;

    const distToEntry = crossEntryS - bike.s;
    // If the rider is braking hard enough to stop short of the fietspad there is no conflict —
    // that is the correct ride, and the snorfiets must not brake for it.
    const stoppingDist = bike.brake ? (bike.speed * bike.speed) / (2 * BRAKE_DECEL) : Infinity;
    const willOccupy =
      distToEntry > 0 &&
      bike.speed > 1.5 &&
      distToEntry <= Math.min(bike.speed * ACTOR_ALARM_HORIZON_S, stoppingDist);

    if (!occupying && !willOccupy) return false;

    const gapToStrip = crossYSpan[0] - actor.y - ACTOR_HALF_LENGTH;
    if (gapToStrip < -2.5) return false; // already through
    const ttc = gapToStrip / Math.max(actor.speed, 0.1);
    return gapToStrip <= 0 || ttc < ACTOR_ALARM_TTC_S;
  }

  /**
   * Move one rijstrook. `dir` is +1 for left, matching the offsets, which grow leftward.
   *
   * A press during a change is deliberately ignored rather than queued: half a lane across is
   * exactly where a rider should be committing, not reconsidering. The press is still recorded —
   * `dispatch` logs before it acts — so the debrief can say it happened.
   */
  private changeLane(dir: number) {
    if (this.routes.kind !== 'motorway') return;
    const bike = this.bike;
    if (bike.laneU < 1) return;
    if (bike.s < this.routes.mergeFromS) return;
    const next = bike.laneIndex + dir;
    if (next < 0 || next >= this.routes.laneOffsets.length) return;
    bike.laneIndex = next;
    bike.laneFromOffset = bike.laneOffset;
    bike.laneTargetOffset = this.routes.laneOffsets[next];
    bike.laneU = 0;
  }

  private checkFinished() {
    const past =
      this.routes.kind === 'urbanCrossing' && this.bike.branch !== 'straight'
        ? this.routes.crossExitS
        : this.bike.branch === 'straight'
          ? this.routes.decisionS
          : this.routes.conflictS;
    if (this.bike.s >= past + this.routes.runOutM || this.t >= MAX_RUN_S) this.finish();
  }

  private finish() {
    if (this.phase === 'finished') return;
    this.phase = 'finished';
    this.stop();
    this.recordSample(true);
    this.onFinish?.(this.buildRecord());
  }

  // -------------------------------------------------------------------------
  // Recording
  // -------------------------------------------------------------------------

  private recordSample(force = false) {
    if (!force && this.t < this.nextSampleT) return;
    this.nextSampleT = this.t + 1 / RECORD_HZ;
    const b = this.bike;
    this.samples.push({
      t: round3(this.t),
      s: round3(b.s),
      d: round3(this.distanceToConflict()),
      x: round3(b.pose.x),
      y: round3(b.pose.y),
      heading: round3(b.pose.heading),
      speed: round3(b.speed),
      gear: b.gear,
      clutch: b.clutch,
      brake: b.brake,
      indicator: b.indicator,
      branch: b.branch,
      headYaw: round3(this.headPose.yaw),
      headPitch: round3(this.headPose.pitch),
      laneOffset: round3(this.bike.laneOffset),
      setSpeedKmh: this.bike.setSpeed === null ? null : Math.round(this.bike.setSpeed * 3.6),
    });
    for (const actor of this.actors) {
      this.actorTracks[actor.spec.id].push({
        t: round3(this.t),
        x: round3(actor.x),
        y: round3(actor.y),
        heading: round3(actor.heading),
        speed: round3(actor.speed),
        mode: actor.mode,
        perceived: actor.perceived,
      });
    }
  }

  private buildRecord(): RunRecord {
    return {
      id: `run-${this.startedAt}`,
      scenarioId: this.scenario.id,
      scenarioTitle: this.scenario.title,
      startedAt: this.startedAt,
      durationS: round3(this.t),
      timeScale: this.timeScale,
      autoSteer: steeringIsAutomatic(this.scenario, this.autoSteer),
      branch: this.bike.branch,
      manoeuvreCompletedAt: this.manoeuvreCompletedAt === null ? null : round3(this.manoeuvreCompletedAt),
      samples: this.samples,
      actorTracks: this.actorTracks,
      events: this.events,
      incidents: this.incidents,
      // scoring.ts fills these in; kept on the record so a saved run needs no re-scoring.
      results: [],
      faults: [],
      counts: { opmerking: 0, fout: 0, kritiek: 0 },
      verdict: 'geslaagd',
    };
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  activeRoute(): Route {
    return this.bike.branch === 'straight' ? this.routes.straight : this.routes.turn;
  }

  distanceToConflict(): number {
    return this.routes.conflictS - this.bike.s;
  }

  actorDistanceToConflict(actor: ActorState): number {
    // Actors travel a straight line, so distance-to-conflict is measured along their own path
    // toward the strip the rider sweeps through. On a motorway nobody crosses anybody's path;
    // the gap that matters there is longitudinal and lives in `longitudinalGap`.
    if (this.routes.kind !== 'urbanCrossing') return Infinity;
    return this.routes.crossYSpan[0] - actor.y;
  }

  /**
   * Metres the actor sits directly behind the rider, measured along the rider's own heading.
   *
   * This is what the blind spot is actually about, and it is NOT the difference of the two
   * distance-to-conflict values: the rider's is measured to the fietspad centreline along a
   * curving route, the actor's to the near edge of the swept strip along a straight one, and the
   * two reference points are several metres apart. Using the difference put the snorfiets a good
   * three metres further back than intended — comfortably inside mirror view.
   */
  longitudinalGap(actor: ActorState): number {
    const dx = actor.x - this.bike.pose.x;
    const dy = actor.y - this.bike.pose.y;
    return -(dx * Math.cos(this.bike.pose.heading) + dy * Math.sin(this.bike.pose.heading));
  }

  /** When the manoeuvre this scenario is about finished: the turn, or the lane change. */
  getManoeuvreCompletedAt(): number | null {
    return this.manoeuvreCompletedAt;
  }

  world(revealAll: boolean): World {
    return {
      scenario: this.scenario,
      routes: this.routes,
      bike: this.bike,
      actors: this.actors,
      head: this.headPose,
      revealAll,
    };
  }

  snapshot(): EngineSnapshot {
    return {
      phase: this.phase,
      t: this.t,
      timeScale: this.timeScale,
      autoSteer: steeringIsAutomatic(this.scenario, this.autoSteer),
      paused: this.paused,
      rejection: this.rejection
        ? { message: this.rejection.message, ageS: this.t - this.rejection.t }
        : null,
      countdown: this.countdownRemaining === null ? null : Math.ceil(this.countdownRemaining),
      speedKmh: this.bike.speed / KMH,
      targetKmh: this.bike.targetSpeed / KMH,
      gear: this.bike.gear,
      clutch: this.bike.clutch,
      brake: this.bike.brake,
      indicator: this.bike.indicator,
      branch: this.bike.branch,
      steerArmed: this.bike.steerArmed,
      distanceToConflict: this.distanceToConflict(),
      activeGazes: this.gazes.map((g) => g.control),
      debug: this.debugEnabled ? this.debugInfo() : null,
    };
  }

  private debugInfo(): DebugInfo {
    return {
      s: this.bike.s,
      conflictS: this.routes.conflictS,
      actorGaps: this.actors.map((a) => {
        const dx = a.x - this.bike.pose.x;
        const dy = a.y - this.bike.pose.y;
        let bearing = ((Math.atan2(dy, dx) - this.bike.pose.heading) * 180) / Math.PI;
        while (bearing <= -180) bearing += 360;
        while (bearing > 180) bearing -= 360;
        return {
          id: a.spec.id,
          gap: this.longitudinalGap(a),
          bearing,
          dist: Math.hypot(dx, dy),
          mode: a.mode,
        };
      }),
    };
  }
}
