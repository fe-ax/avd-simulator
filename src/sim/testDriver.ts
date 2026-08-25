/**
 * Headless rider. Drives the engine through the same `dispatch` door the UI uses, with the
 * clock advanced by hand — so tests and the scenario-tuning harness exercise the real physics,
 * perception and scoring rather than a mock of them.
 */
import { SimEngine } from './engine';
import { GAZE_DURATION_S, isLookControl, LOOK_DIRECTIONS } from './perception';
import { scoreRun } from './scoring';
import type { RunRecord, Scenario } from './types';

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

function probe(engine: SimEngine): Probe {
  const actor = engine.actors[0];
  const pose = engine.bike.pose;
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
    const actor = engine.actors[0];
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

    const actorPast =
      engine.routes.kind === 'urbanCrossing' && actor.y > engine.routes.crossYSpan[1] + 1.5;
    const wantStop = p.yieldToActor && d <= 12 && !actorPast;
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
