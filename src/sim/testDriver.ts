/**
 * Headless rider. Drives the engine through the same `dispatch` door the UI uses, with the
 * clock advanced by hand — so tests and the scenario-tuning harness exercise the real physics,
 * perception and scoring rather than a mock of them.
 */
import { SimEngine } from './engine';
import { GAZE_DURATION_S, isLookControl, LOOK_DIRECTIONS } from './perception';
import { poseAt } from './route';
import { scoreRun } from './scoring';
import type { ActorState, RunRecord, Scenario } from './types';

export interface RidePlan {
  mirrors?: boolean;
  indicator?: boolean;
  eyes?: boolean;
  /** The preparation schouderblik, step 5 of the sequence. */
  shoulderPrep?: boolean;
  /** The decisive schouderblik just before turning in, step 7. */
  shoulder?: boolean;
  steer?: boolean;
  /** Announce before checking: tries the richtingaanwijzer before any schouderblik. */
  signalBeforeLooking?: boolean;
  /** Do the mirrors before the glances, so the reeks is complete but out of order. */
  swapLookOrder?: boolean;
  /** Fire the whole preparation reeks in the first metres, long before the junction is in sight. */
  rushSequenceAtStart?: boolean;
  /** Distance-to-conflict at which to do the opening blik links, to probe the early bound. */
  firstLookAtD?: number;
  /** Hammer the look controls, to exercise the kijkgedrag rules. */
  scanConstantly?: boolean;
  /** Check over the wrong shoulder, which should reveal nothing. */
  shoulderWrongSide?: boolean;
  /** Turn right past the blind spot to the road behind: still a schouderblik, sees nothing. */
  shoulderTooFarBack?: boolean;
  /** Stop and let the snorfiets pass. */
  yieldToActor?: boolean;
  /**
   * Ease off when somebody is closing on the same piece of junction at the same moment.
   *
   * Not the same thing as giving way. Giving way is a rule about who goes first; this is the
   * judgement that being entitled to go is not the same as it being safe to — and it is the whole
   * content of a hazard exercise, where the other driver is the one making the mistake and your
   * job is to have read it.
   */
  anticipate?: boolean;
  gear?: boolean;
  slowDown?: boolean;
  indicatorOff?: 'direct' | 'laat' | 'nooit';
  /** Extra sloppiness: shift without pulling the clutch. */
  clutchless?: boolean;
  indicatorWrongSide?: boolean;
  /** Throttle-down presses at the very start: a deliberately cautious, slow approach. */
  startSlowPresses?: number;
  /** Training tempo. Affects only the real-time loop, never simulated time. */
  timeScale?: number;
  /** Let the bike take the turn by itself; the sturen controls do nothing. */
  autoSteer?: boolean;
  onSample?: (probe: Probe) => void;
}

export interface Probe {
  t: number;
  d: number;
  speedKmh: number;
  /** Metres the actor sits directly behind the rider, along the rider's heading. */
  gap: number;
  /** Actor bearing relative to the rider's heading, in degrees. */
  bearing: number;
  dist: number;
  mode: string;
  perceived: boolean;
}

const DEFAULTS: Required<Omit<RidePlan, 'onSample'>> = {
  mirrors: true,
  indicator: true,
  eyes: true,
  shoulderPrep: true,
  shoulder: true,
  signalBeforeLooking: false,
  swapLookOrder: false,
  shoulderWrongSide: false,
  shoulderTooFarBack: false,
  rushSequenceAtStart: false,
  firstLookAtD: 0,
  scanConstantly: false,
  steer: true,
  yieldToActor: true,
  anticipate: false,
  gear: true,
  slowDown: true,
  indicatorOff: 'direct',
  clutchless: false,
  indicatorWrongSide: false,
  startSlowPresses: 0,
  timeScale: 1,
  autoSteer: false,
};

const DT = 1 / 60;
const MAX_FRAMES = 60 * 180;

/** Cycled through by `scanConstantly` to simulate a student hammering every look control. */
const SCAN_CYCLE = [
  'EYE_LEFT',
  'MIRROR_LEFT',
  'EYE_RIGHT',
  'MIRROR_RIGHT',
  'SHOULDER_RIGHT',
] as const;

/**
 * A snapshot of the ride, for tuning.
 *
 * Everything about the traffic is optional, because a road can have none: an empty starter is a
 * perfectly good scenario that simply has nothing on it yet, and the model rider used to fall over
 * reading the first actor's position on a road where there was no first actor.
 */
/** Metres the actor has travelled past the point where its path crosses the rider's. */
function clearedConflict(engine: SimEngine, actor: ActorState): boolean {
  const meeting = poseAt(engine.routes.turn, engine.routes.conflictS);
  const along =
    (actor.x - meeting.x) * Math.cos(actor.heading) + (actor.y - meeting.y) * Math.sin(actor.heading);
  return along > (actor.spec.length ?? 1.8) / 2 + 1.5;
}

function probe(engine: SimEngine): Probe {
  const actor: ActorState | undefined = engine.actors[0];
  const pose = engine.bike.pose;
  if (!actor) {
    return {
      t: engine.t,
      d: engine.distanceToConflict(),
      speedKmh: engine.bike.speed * 3.6,
      gap: Infinity,
      bearing: 0,
      dist: Infinity,
      mode: 'cruise',
      perceived: false,
    };
  }
  const dx = actor.x - pose.x;
  const dy = actor.y - pose.y;
  let bearing = ((Math.atan2(dy, dx) - pose.heading) * 180) / Math.PI;
  while (bearing <= -180) bearing += 360;
  while (bearing > 180) bearing -= 360;
  const d = engine.distanceToConflict();
  return {
    t: engine.t,
    d,
    speedKmh: engine.bike.speed * 3.6,
    gap: engine.longitudinalGap(actor),
    bearing,
    dist: Math.hypot(dx, dy),
    mode: actor.mode,
    perceived: actor.perceived,
  };
}

export function driveRun(scenario: Scenario, plan: RidePlan = {}): RunRecord {
  const p = { ...DEFAULTS, ...plan };
  const engine = new SimEngine(scenario);
  engine.timeScale = p.timeScale;
  engine.autoSteer = p.autoSteer;
  let record: RunRecord | null = null;
  engine.arm((r) => {
    record = r;
  }, '2026-01-01T12:00:00.000Z');

  const done = new Set<string>();
  let lastScan = -99;
  let scanIndex = 0;
  // Headless stand-in for the gaze system: a look turns the head, and perception follows from
  // where the head is pointing exactly as it does in the renderer. Without this a driven ride
  // would see nothing at all, and every perception test would pass for the wrong reason.
  let headHold = 0;
  const once = (key: string, fn: () => void) => {
    if (done.has(key)) return;
    done.add(key);
    fn();
  };
  const dispatch = (
    control: Parameters<SimEngine['dispatch']>[0],
    phase: 'press' | 'down' | 'up' = 'press',
  ) => {
    if (isLookControl(control) && phase === 'press') {
      const aim = LOOK_DIRECTIONS[control];
      const overshoot = p.shoulderTooFarBack && control === 'SHOULDER_RIGHT';
      engine.headPose.yaw = ((overshoot ? -138 : aim.yaw) * Math.PI) / 180;
      engine.headPose.pitch = (aim.pitch * Math.PI) / 180;
      headHold = GAZE_DURATION_S;
    }
    engine.dispatch(control, phase, isLookControl(control) ? 'gaze' : 'keyboard');
  };

  let braking = false;

  for (let frame = 0; frame < MAX_FRAMES && record === null; frame++) {
    engine.advance(DT);
    if (engine.phase !== 'riding') continue;

    if (headHold > 0) {
      headHold -= DT;
      if (headHold <= 0) {
        engine.headPose.yaw = 0;
        engine.headPose.pitch = 0;
      }
    }

    const d = engine.distanceToConflict();
    const actor: ActorState | undefined = engine.actors[0];
    plan.onSample?.(probe(engine));

    once('startSlow', () => {
      for (let i = 0; i < p.startSlowPresses; i++) dispatch('THROTTLE_DOWN');
    });

    // The prescribed sequence: leave-side, go-side, dode hoek, then announce.
    // Swapping puts each mirror before its matching glance: every step still lands inside its
    // own window, so only the order is wrong.
    // `rushSequenceAtStart` pulls every threshold up to the first few metres of the ride.
    const rush = p.rushSequenceAtStart;
    const at = (normal: number, swapped: number) =>
      rush ? 126 : p.swapLookOrder ? swapped : normal;
    if (p.eyes && d <= (p.firstLookAtD || at(90, 80))) {
      once('eyeL', () => dispatch('EYE_LEFT'));
    }
    if (p.mirrors && d <= at(80, 90)) once('mirrorL', () => dispatch('MIRROR_LEFT'));
    if (p.eyes && d <= at(70, 60)) once('eyeR', () => dispatch('EYE_RIGHT'));
    if (p.mirrors && d <= at(60, 70)) once('mirrorR', () => dispatch('MIRROR_RIGHT'));
    // Announcing first and checking afterwards: both steps land inside their own window, so
    // only the order is wrong.
    if (p.signalBeforeLooking && d <= 58) once('indEarly', () => dispatch('INDICATOR_RIGHT'));
    if (p.shoulderPrep && d <= (rush ? 122 : 50)) {
      once('shoulderPrep', () => dispatch('SHOULDER_RIGHT'));
    }
    if (p.indicatorWrongSide && d <= 44) once('indL', () => dispatch('INDICATOR_LEFT'));
    if (p.indicator && d <= 40) once('ind', () => dispatch('INDICATOR_RIGHT'));

    if (p.scanConstantly && engine.t - lastScan > 0.25) {
      lastScan = engine.t;
      dispatch(SCAN_CYCLE[scanIndex % SCAN_CYCLE.length]);
      scanIndex++;
    }

    if (p.slowDown && d <= 44) {
      once('throttle', () => {
        // Aim for the scenario's 15 km/h rather than a fixed number of presses, so a rider who
        // already set off slowly does not throttle themselves to a standstill.
        let guard = 0;
        while (engine.bike.targetSpeed * 3.6 > 15.5 && guard++ < 20) dispatch('THROTTLE_DOWN');
      });
    }
    if (p.gear && d <= 32) {
      once('gear', () => {
        if (!p.clutchless) dispatch('CLUTCH', 'down');
        dispatch('GEAR_DOWN');
        if (!p.clutchless) dispatch('CLUTCH', 'up');
      });
    }
    if (p.eyes && d <= 24) once('eyeLFinal', () => dispatch('EYE_LEFT'));
    if (p.shoulderWrongSide && d <= 14) once('wrongShoulder', () => dispatch('SHOULDER_LEFT'));
    if (p.shoulder && d <= 14) once('shoulder', () => dispatch('SHOULDER_RIGHT'));
    if (p.steer && d <= 11) once('steer', () => dispatch('STEER_RIGHT'));

    // Has the hazard gone by yet?
    //
    // Measured along the actor's own direction of travel, past the point where the two paths
    // cross. It used to ask whether the actor's y had climbed past the swept strip, which is only
    // "past" for something coming up the fietspad beside you: a car crossing east to west holds
    // its y for the whole ride, so the rider waited for it forever and every such scenario ran
    // into the ninety-second cap with the machine sitting still.
    const actorPast = !actor || clearedConflict(engine, actor);

    // Somebody arriving at the same place at the same time. Compared in seconds rather than
    // metres, because that is the question actually being asked: not "how far away is it" but
    // "will we be there together".
    let closing = false;
    if (p.anticipate) {
      const bike = engine.world(false).bike;
      const meeting = poseAt(engine.routes.turn, engine.routes.conflictS);
      const mine = d / Math.max(bike.speed, 0.5);
      for (const other of engine.actors) {
        if (other.speed < 1) continue;
        const toMeeting =
          (meeting.x - other.x) * Math.cos(other.heading) +
          (meeting.y - other.y) * Math.sin(other.heading);
        if (toMeeting <= 0) continue;
        if (Math.abs(toMeeting / other.speed - mine) < 2.5) closing = true;
      }
    }
    const wantStop = (p.yieldToActor && d <= 12 && !actorPast) || (closing && d <= 55 && d > -2);
    if (wantStop !== braking) {
      braking = wantStop;
      dispatch('BRAKE', wantStop ? 'down' : 'up');
    }

    const turnedAt = engine.getManoeuvreCompletedAt();
    if (turnedAt !== null) {
      if (p.indicatorOff === 'direct') once('off', () => dispatch('INDICATOR_OFF'));
      else if (p.indicatorOff === 'laat' && engine.t > turnedAt + 4.5) {
        once('off', () => dispatch('INDICATOR_OFF'));
      }
      once('accelerate', () => {
        dispatch('THROTTLE_UP');
        dispatch('THROTTLE_UP');
      });
    }
  }

  if (record === null) throw new Error('Run did not finish within the frame budget');
  const scored = scoreRun(record, scenario);
  return { ...(record as RunRecord), ...scored };
}

// ---------------------------------------------------------------------------
// Motorway
// ---------------------------------------------------------------------------

/**
 * How a merge is ridden, headless.
 *
 * A separate driver rather than more flags on `RidePlan`: the crossroads plan is a list of
 * things you do *approaching a junction*, and bolting a merge onto it would have made every
 * option mean "unless it is a motorway, in which case".
 */
export interface MergePlan {
  /** Throttle presses, and how promptly. Five presses of 10 km/h takes 50 to 100. */
  throttlePresses?: number;
  /** Distance-to-conflict at which the first throttle press happens. */
  throttleFromD?: number;
  /** Metres between presses. */
  throttleEveryM?: number;
  mirror?: boolean;
  shoulder?: boolean;
  indicator?: boolean;
  /** Distance-to-conflict at which the rider commits to the lane change. */
  mergeAtD?: number;
  /** Announce before checking, to probe the prerequisite. */
  signalBeforeLooking?: boolean;
  /** Do the schouderblik over the wrong shoulder: it reveals nothing. */
  shoulderWrongSide?: boolean;
  indicatorOff?: boolean;
  /** Ease off once settled in the lane, which is what the road asks of you behind a truck. */
  matchSpeedAfterMerge?: boolean;
  /**
   * Ease off when closing on whoever is in front, which is what a rider does and what the
   * driver did not. Without it a keen model rider accelerates straight into the back of the gap
   * it is merging into, and then the scenario gets blamed for it.
   */
  keepDistance?: boolean;
  /**
   * Merge with plenty of room and then close right up. The whole reason the rule is a held
   * minimum rather than a reading taken at the moment of merging: this ride must not score well.
   */
  chaseAfterMerge?: boolean;
}

/** How far off the rider's line another vehicle has to be before it is somebody else's problem. */
const SAME_LANE_M = 2;

const MERGE_DEFAULTS: Required<MergePlan> = {
  throttlePresses: 5,
  throttleFromD: 148,
  throttleEveryM: 8,
  mirror: true,
  shoulder: true,
  indicator: true,
  mergeAtD: 60,
  signalBeforeLooking: false,
  shoulderWrongSide: false,
  indicatorOff: true,
  matchSpeedAfterMerge: false,
  chaseAfterMerge: false,
  keepDistance: true,
};

export function driveMerge(scenario: Scenario, plan: MergePlan = {}): RunRecord {
  const p = { ...MERGE_DEFAULTS, ...plan };
  const engine = new SimEngine(scenario);
  let record: RunRecord | null = null;
  engine.arm((r) => {
    record = r;
  }, '2026-01-01T12:00:00.000Z');

  const done = new Set<string>();
  let headHold = 0;
  let pressed = 0;
  let nextPressD = p.throttleFromD;
  let eased = false;

  const once = (key: string, fn: () => void) => {
    if (done.has(key)) return;
    done.add(key);
    fn();
  };
  const dispatch = (control: Parameters<SimEngine['dispatch']>[0]) => {
    if (isLookControl(control)) {
      const aim = LOOK_DIRECTIONS[control];
      engine.headPose.yaw = (aim.yaw * Math.PI) / 180;
      engine.headPose.pitch = (aim.pitch * Math.PI) / 180;
      headHold = GAZE_DURATION_S;
    }
    engine.dispatch(control, 'press', isLookControl(control) ? 'gaze' : 'keyboard');
  };

  let easedAt = -99;

  for (let frame = 0; frame < MAX_FRAMES && record === null; frame++) {
    engine.advance(DT);
    if (engine.phase !== 'riding') continue;

    if (headHold > 0) {
      headHold -= DT;
      if (headHold <= 0) {
        engine.headPose.yaw = 0;
        engine.headPose.pitch = 0;
      }
    }

    const d = engine.distanceToConflict();

    // Whoever is in front *in this lane*, in seconds.
    //
    // Both components, not just the one along the heading: on the oprit the car is ten metres
    // to the left and a metre ahead, and measuring only forward distance calls that tailgating.
    // The model rider then brakes for traffic on a different road and never gets up to speed.
    if (p.keepDistance && !p.chaseAfterMerge) {
      const bike = engine.world(false).bike;
      const cos = Math.cos(bike.pose.heading);
      const sin = Math.sin(bike.pose.heading);
      let closest = Infinity;
      for (const actor of engine.actors) {
        const dx = actor.x - bike.pose.x;
        const dy = actor.y - bike.pose.y;
        const along = dx * cos + dy * sin;
        const across = -dx * sin + dy * cos;
        if (along <= 0 || Math.abs(across) > SAME_LANE_M) continue;
        const clear = along - (actor.spec.length ?? 1.8) / 2 - 1.15;
        closest = Math.min(closest, clear / Math.max(bike.speed, 0.1));
      }
      // Ease off below two and a half, so the two-second rule is met with something in hand
      // rather than hit exactly. Rate-limited, or one frame of closing costs the whole throttle.
      if (closest < 2.5 && engine.t - easedAt > 0.4) {
        easedAt = engine.t;
        dispatch('THROTTLE_DOWN');
      }
    }

    if (pressed < p.throttlePresses && d <= nextPressD) {
      dispatch('THROTTLE_UP');
      pressed++;
      nextPressD -= p.throttleEveryM;
    }

    // Announcing first is a real reeks, ridden in the wrong order — so every press has to land
    // inside its own window, or scoring discards it and there is no order left to be wrong.
    const early = p.signalBeforeLooking;
    if (p.indicator && d <= (early ? 110 : 95)) once('indicator', () => dispatch('INDICATOR_LEFT'));
    if (p.mirror && d <= (early ? 100 : 120)) once('mirror', () => dispatch('MIRROR_LEFT'));
    if (p.shoulderWrongSide && d <= 105) once('wrongShoulder', () => dispatch('SHOULDER_RIGHT'));
    if (p.shoulder && d <= (early ? 90 : 105)) once('shoulder', () => dispatch('SHOULDER_LEFT'));
    if (d <= p.mergeAtD) once('merge', () => dispatch('STEER_LEFT'));

    const settled = engine.getManoeuvreCompletedAt() !== null;
    if (settled && p.indicatorOff) once('indicatorOff', () => dispatch('INDICATOR_OFF'));
    if (settled && p.chaseAfterMerge && !eased) {
      eased = true;
      for (let i = 0; i < 3; i++) dispatch('THROTTLE_UP');
    }
    // Trim back toward the truck's speed rather than running up its back at 100.
    if (settled && p.matchSpeedAfterMerge && !eased) {
      eased = true;
      dispatch('THROTTLE_DOWN');
      dispatch('THROTTLE_DOWN');
    }
  }

  if (record === null) throw new Error('rit is niet afgerond binnen de tijd');
  const scored = scoreRun(record, scenario);
  return { ...(record as RunRecord), ...scored };
}

// ---------------------------------------------------------------------------
// Overtaking
// ---------------------------------------------------------------------------

/**
 * How an overtake is ridden, headless.
 *
 * Unlike the other two this rider has to *decide*: it watches the left lane and goes when there is
 * room, rather than acting at a fixed distance. That is the whole exercise, so a driver that acted
 * on a stopwatch would be measuring the stopwatch.
 */
export interface OvertakePlan {
  /** Cruise speed in km/h. */
  cruiseKmh?: number;
  /** Speed used while actually alongside, because an overtake is supposed to be brisk. */
  passingKmh?: number;
  mirror?: boolean;
  shoulder?: boolean;
  indicator?: boolean;
  /** Seconds of clear road needed behind and ahead in the left lane before pulling out. */
  needsGapS?: number;
  /** Go out, but come back as soon as the first truck is passed — the weave. */
  cutInEarly?: boolean;
  /** Never leave rijstrook 1. */
  neverOvertake?: boolean;
  /** Overtake, and then stay in the left lane for good. */
  stayLeft?: boolean;
  /** Ignore the left lane entirely and pull out regardless. */
  ignoreTraffic?: boolean;
}

const OVERTAKE_DEFAULTS: Required<OvertakePlan> = {
  cruiseKmh: 105,
  passingKmh: 120,
  mirror: true,
  shoulder: true,
  indicator: true,
  needsGapS: 2.2,
  cutInEarly: false,
  neverOvertake: false,
  stayLeft: false,
  ignoreTraffic: false,
};

/**
 * Where the rider is in the overtake.
 *
 * Held on an object rather than in a plain local. The stage advances from inside callbacks, and a
 * local would be narrowed by the compiler as if those assignments never happened — leaving it
 * convinced half the switch is unreachable. A property is re-widened by any call, which is exactly
 * the honest answer here: anything might have moved it.
 */
type OvertakeStage = 'approach' | 'goingOut' | 'passing' | 'comingBack' | 'settled';

/** How far left of the rider's own line the next lane sits. */
const LEFT_LANE_OFFSET_M = 3.5;

/**
 * Seconds of daylight the rider wants behind a lorry before tucking back in front of it.
 *
 * Time, not metres: what matters to the lorry is how long it has, and twenty-five metres in front
 * of something doing ninety is one second — which the following-distance rule quite rightly calls
 * a fault. The model rider was committing the very mistake the scenario teaches.
 */
const CLEAR_BY_S = 2.6;

/** Metres ahead (positive) or behind (negative) along the rider's heading, and how far off the line. */
function relativeTo(engine: SimEngine, actor: { x: number; y: number }) {
  const bike = engine.world(false).bike.pose;
  const cos = Math.cos(bike.heading);
  const sin = Math.sin(bike.heading);
  const dx = actor.x - bike.x;
  const dy = actor.y - bike.y;
  return { along: dx * cos + dy * sin, across: -dx * sin + dy * cos };
}

export function driveOvertake(scenario: Scenario, plan: OvertakePlan = {}): RunRecord {
  const p = { ...OVERTAKE_DEFAULTS, ...plan };
  const engine = new SimEngine(scenario);
  let record: RunRecord | null = null;
  engine.arm((r) => {
    record = r;
  }, '2026-01-01T12:00:00.000Z');

  const done = new Set<string>();
  let headHold = 0;
  let outAt = -99;

  const once = (key: string, fn: () => void) => {
    if (done.has(key)) return;
    done.add(key);
    fn();
  };
  const dispatch = (control: Parameters<SimEngine['dispatch']>[0], value?: number) => {
    if (isLookControl(control)) {
      const aim = LOOK_DIRECTIONS[control];
      engine.headPose.yaw = (aim.yaw * Math.PI) / 180;
      engine.headPose.pitch = (aim.pitch * Math.PI) / 180;
      headHold = GAZE_DURATION_S;
    }
    engine.dispatch(control, 'press', isLookControl(control) ? 'gaze' : 'keyboard', value);
  };

  const ride: { stage: OvertakeStage } = { stage: 'approach' };
  let lastSet = -1;
  let lastSetAt = -99;

  for (let frame = 0; frame < MAX_FRAMES && record === null; frame++) {
    engine.advance(DT);
    if (engine.phase !== 'riding') continue;

    if (headHold > 0) {
      headHold -= DT;
      if (headHold <= 0) {
        engine.headPose.yaw = 0;
        engine.headPose.pitch = 0;
      }
    }

    once('cruise', () => dispatch('SET_SPEED', p.cruiseKmh));

    // Ease off for whatever is in front, in this lane. Without it the model rider holds its cruise
    // straight into the back of the lorry it is waiting to pass, and the scenario gets blamed for
    // the harness having no brakes.
    {
      const bike = engine.world(false).bike;
      const cos = Math.cos(bike.pose.heading);
      const sin = Math.sin(bike.pose.heading);
      let closest = Infinity;
      for (const actor of engine.actors) {
        const dx = actor.x - bike.pose.x;
        const dy = actor.y - bike.pose.y;
        const along = dx * cos + dy * sin;
        const across = -dx * sin + dy * cos;
        if (along <= 0 || Math.abs(across) > SAME_LANE_M) continue;
        const clear = along - (actor.spec.length ?? 1.8) / 2 - 1.15;
        closest = Math.min(closest, clear / Math.max(bike.speed, 0.1));
      }
      // Ease off for the lorry while waiting; press on while past it. Fifteen km/h of closing
      // speed makes overtaking two lorries a thirty-four second affair, which is not an exercise
      // so much as an endurance test — and dawdling alongside is its own fault on the road.
      const busy = ride.stage === 'goingOut' || ride.stage === 'passing';
      const wantKmh = closest < 2.6 ? 88 : busy ? p.passingKmh : p.cruiseKmh;
      if (Math.abs(wantKmh - lastSet) > 0.5 && engine.t - lastSetAt > 0.5) {
        lastSet = wantKmh;
        lastSetAt = engine.t;
        dispatch('SET_SPEED', wantKmh);
      }
    }

    if (p.neverOvertake) continue;

    const speed = Math.max(engine.world(false).bike.speed, 1);
    const trucks = engine.actors.filter((a) => a.spec.kind === 'vrachtwagen');
    const others = engine.actors.filter((a) => a.spec.kind !== 'vrachtwagen');

    // A switch rather than a chain of guarded ifs: the stage advances from inside callbacks,
    // which control-flow analysis cannot follow, and an if-chain ends up arguing with itself
    // about which branches are reachable.
    switch (ride.stage) {
      case 'approach': {
        // Room in the left lane, in seconds, both ways. Anything within a lane width of the line
        // the rider would move onto counts; anything further out is on somebody else's road.
        const clear =
          p.ignoreTraffic ||
          others.every((a) => {
            const r = relativeTo(engine, a);
            if (Math.abs(r.across - LEFT_LANE_OFFSET_M) > SAME_LANE_M) return true;
            return Math.abs(r.along) / speed > p.needsGapS;
          });
        if (!clear) break;
        if (p.mirror) once('mirrorL', () => dispatch('MIRROR_LEFT'));
        if (p.shoulder) once('shoulderL', () => dispatch('SHOULDER_LEFT'));
        if (p.indicator) once('indicatorL', () => dispatch('INDICATOR_LEFT'));
        once('out', () => {
          dispatch('STEER_LEFT');
          outAt = engine.t;
          ride.stage = 'goingOut';
        });
        break;
      }

      case 'goingOut': {
        if (engine.t - outAt <= 2.5) break;
        once('indicatorOffL', () => dispatch('INDICATOR_OFF'));
        ride.stage = 'passing';
        break;
      }

      case 'passing': {
        if (trucks.length === 0 || p.stayLeft) break;
        // Past which truck? The weaver settles for the first; a proper overtake clears them all.
        const target = p.cutInEarly
          ? trucks.reduce((a, b) => (relativeTo(engine, a).along < relativeTo(engine, b).along ? a : b))
          : trucks.reduce((a, b) => (relativeTo(engine, a).along > relativeTo(engine, b).along ? a : b));
        const behindMe = -relativeTo(engine, target).along;
        const room = (target.spec.length ?? 2) / 2 + 1.15 + target.speed * CLEAR_BY_S;
        if (behindMe < room) break;
        if (p.mirror) once('mirrorR', () => dispatch('MIRROR_RIGHT'));
        if (p.shoulder) once('shoulderR', () => dispatch('SHOULDER_RIGHT'));
        if (p.indicator) once('indicatorR', () => dispatch('INDICATOR_RIGHT'));
        once('back', () => {
          dispatch('STEER_RIGHT');
          ride.stage = 'comingBack';
        });
        break;
      }

      case 'comingBack': {
        once('indicatorOffR', () => dispatch('INDICATOR_OFF'));
        ride.stage = 'settled';
        break;
      }
    }
  }

  if (record === null) throw new Error('rit is niet afgerond binnen de tijd');
  const scored = scoreRun(record, scenario);
  return { ...(record as RunRecord), ...scored };
}
