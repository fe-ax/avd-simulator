/**
 * Headless rider. Drives the engine through the same `dispatch` door the UI uses, with the
 * clock advanced by hand — so tests and the scenario-tuning harness exercise the real physics,
 * perception and scoring rather than a mock of them.
 */
import { BRAKE_DECEL, SimEngine } from './engine';
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
   * There is a give-way line ahead, so be down to walking pace by it whether or not anything is
   * coming.
   *
   * Not the same as `yieldToActor`, and the difference is where you wait. Haaientanden are a place:
   * you arrive slowly enough to stop *at* them, and a rider still doing forty-two at twenty metres
   * has not given way even if they get away with it. A left-turner has no line — they are on the
   * priority road — and waits in the middle of the junction instead, which means slowing early
   * enough is not the skill being taught there. Applying the line's rule to the turn made the model
   * rider trickle up at fifteen and never wait at all: the car had gone by the time it arrived, so
   * the exercise passed without demonstrating its own lesson.
   */
  shedForLine?: boolean;
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
  /** Get going again after the manoeuvre. Off is the rider who dawdles away from the junction. */
  pullAway?: boolean;
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
  shedForLine: false,
  anticipate: false,
  gear: true,
  slowDown: true,
  indicatorOff: 'direct',
  pullAway: true,
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

  // Which way this exercise turns.
  //
  // Every control below used to name the right-hand one, which was true of every crossroads that
  // existed and is a fact about those scenarios rather than about riding. A left turn driven by a
  // rider who signals right and checks the right shoulder is not a sloppy rider; it is a broken
  // harness, and it reports the scenario as unrideable.
  const turning: 'left' | 'right' =
    scenario.world.kind === 'junction' && scenario.world.manoeuvre === 'left' ? 'left' : 'right';
  const SHOULDER = turning === 'left' ? 'SHOULDER_LEFT' : 'SHOULDER_RIGHT';
  const SHOULDER_OTHER = turning === 'left' ? 'SHOULDER_RIGHT' : 'SHOULDER_LEFT';
  const INDICATOR = turning === 'left' ? 'INDICATOR_LEFT' : 'INDICATOR_RIGHT';
  const INDICATOR_OTHER = turning === 'left' ? 'INDICATOR_RIGHT' : 'INDICATOR_LEFT';
  const STEER = turning === 'left' ? 'STEER_LEFT' : 'STEER_RIGHT';
  let record: RunRecord | null = null;
  engine.arm((r) => {
    record = r;
  }, '2026-01-01T12:00:00.000Z');

  const done = new Set<string>();
  /** Latched while the rider is braking down to walking pace for a give-way line. */
  let shedding = false;
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
      const overshoot = p.shoulderTooFarBack && (control === 'SHOULDER_RIGHT' || control === 'SHOULDER_LEFT');
      engine.headPose.yaw = ((overshoot ? -138 : aim.yaw) * Math.PI) / 180;
      engine.headPose.pitch = (aim.pitch * Math.PI) / 180;
      headHold = GAZE_DURATION_S;
    }
    engine.dispatch(control, phase, isLookControl(control) ? 'gaze' : 'keyboard');
  };

  let braking = false;
  /** Latched across frames: see the hysteresis where it is set. */
  let closing = false;
  /** Whether this ride has already had to slow for something, for the rider who never picks up. */
  let slowedFor = false;

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
    if (p.signalBeforeLooking && d <= 58) once('indEarly', () => dispatch(INDICATOR));
    if (p.shoulderPrep && d <= (rush ? 122 : 50)) {
      once('shoulderPrep', () => dispatch(SHOULDER));
    }
    if (p.indicatorWrongSide && d <= 44) once('indL', () => dispatch(INDICATOR_OTHER));
    if (p.indicator && d <= 40) once('ind', () => dispatch(INDICATOR));

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
    if (p.shoulderWrongSide && d <= 14) once('wrongShoulder', () => dispatch(SHOULDER_OTHER));
    if (p.shoulder && d <= 14) once('shoulder', () => dispatch(SHOULDER));
    if (p.steer && d <= 11) once('steer', () => dispatch(STEER));

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
    if (p.anticipate) {
      const bike = engine.world(false).bike;
      const meeting = poseAt(engine.routes.turn, engine.routes.conflictS);
      const mine = d / Math.max(bike.speed, 0.5);
      // Hysteresis, and it is not cosmetic. Both times shift every frame — the rider's because it
      // is slowing, the other's because it is braking — so a single threshold has the difference
      // crossing it back and forth and the brake going on and off twenty-five times a second. The
      // average deceleration comes out about right, which is why it went unnoticed; what does not
      // is the record, where one approach left two hundred and fourteen brake events for a debrief
      // to draw. A rider decides to back off and then stays backed off until it is clearly clear.
      let nearest = Infinity;
      for (const other of engine.actors) {
        if (other.speed < 1) continue;
        const toMeeting =
          (meeting.x - other.x) * Math.cos(other.heading) +
          (meeting.y - other.y) * Math.sin(other.heading);
        if (toMeeting <= 0) continue;
        nearest = Math.min(nearest, Math.abs(toMeeting / other.speed - mine));
      }
      closing = nearest < (closing ? 4 : 2.5);

      // Something stopped across your path is also a reason to ease off, and the test above cannot
      // see it: it asks who will be at the meeting point when you are, and a car that has already
      // stopped there is not going to be anywhere at all. It is simply in the way.
      //
      // Measured to the near edge rather than the centre, because a car sitting across your lane
      // presents its length to you: sixteen metres of lorry broadside is not four metres away just
      // because its middle is.
      const cos = Math.cos(bike.pose.heading);
      const sin = Math.sin(bike.pose.heading);
      for (const other of engine.actors) {
        if (other.speed > 1) continue;
        const dx = other.x - bike.pose.x;
        const dy = other.y - bike.pose.y;
        const along = dx * cos + dy * sin;
        if (along <= 0 || along > BLOCKING_LOOKAHEAD_M) continue;
        const across = -dx * sin + dy * cos;
        const half = (other.spec.length ?? 1.8) / 2;
        const reach = Math.abs(across) - half * Math.abs(Math.sin(other.heading - bike.pose.heading));
        if (reach < BLOCKING_WIDTH_M) closing = true;
      }
    } else {
      closing = false;
    }
    // Where to start braking is a fact about the speed you are carrying, not a number.
    //
    // Twelve metres flat is fine on the Kerkstraat, where the rider is already down to walking pace
    // by the time anything matters. On a 50 road it is not: braking at 38 km/h needs twelve and a
    // half metres to stop, so the rider that "gave way" rolled a metre *past* the conflict point
    // and came to rest in the middle of the junction, two metres from a car doing fifty. It scored
    // as a gevaarzetting, which was the correct reading of what it did — a model rider failing its
    // own exercise, and the exercise was not the thing that was wrong.
    const stopIn = engine.bike.speed ** 2 / (2 * BRAKE_DECEL) + YIELD_MARGIN_M;
    const hazard =
      (p.yieldToActor && d <= Math.max(12, stopIn) && !actorPast) || (closing && d <= 55 && d > -2);

    // And the line itself is worth slowing for, traffic or no traffic.
    //
    // `slowDown` only asks for a lower target speed and lets the machine coast down to it, which is
    // enough on the Kerkstraat: from thirty to fifteen is five metres of drag and it is done long
    // before anything matters. From fifty it is not — the rider was still doing forty-two at twenty
    // metres and had to brake hard at the last moment, which provoked the car it was supposed to be
    // giving way to. The model rider failed its own exercise while the rider who barged across
    // passed it, because that one was through before the car arrived.
    //
    // Braking distance from here to a walking pace, so it scales itself: at thirty it comes out at
    // fifteen metres and the rider has coasted below walking pace long before that, so it never
    // fires; at fifty it is forty-two and it does.
    //
    // At half the available deceleration, because this is a rider reading a give-way line, not one
    // reacting to something. Slowing for a line you can see from a hundred metres away is not an
    // emergency stop, and computing it at the full rate puts the trigger so late that the hazard
    // brake gets there first — which is how the model rider ended up doing forty-two at twenty
    // metres in the first place.
    //
    // Latched, because the trigger recedes as the rider slows: the distance needed to shed shrinks
    // faster than the distance remaining, so an unlatched test releases the brake immediately and
    // then re-arms, which is the twenty-five-times-a-second chatter that once left 214 brake events
    // in a record for a debrief to draw.
    const shedIn =
      (engine.bike.speed ** 2 - APPROACH_SPEED ** 2) / (2 * (BRAKE_DECEL / 2)) + YIELD_MARGIN_M;
    // Behind `slowDown`, because a rider who is not easing off for the junction is not easing
    // off for its line either — and without that gate no sloppy rider can arrive fast, so the rule
    // about arriving slowly has nobody left to catch.
    if (p.shedForLine && p.slowDown && d > 0 && d <= shedIn && engine.bike.speed > APPROACH_SPEED) {
      shedding = true;
    }
    if (shedding && (engine.bike.speed <= APPROACH_SPEED || d <= 0)) shedding = false;
    const mustShed = shedding;
    if (hazard) slowedFor = true;

    // Having slowed for something, get going again — or, for the rider who does not, do not.
    //
    // Modelled as staying on the brake rather than as withholding a throttle press, because there
    // is no throttle press to withhold: the machine climbs back to its set speed by itself once
    // the brake is off, so a rider who wants to keep crawling has to keep asking for it. Which is
    // also what dawdling away from a junction actually looks like from behind.
    //
    // Without this nobody dawdles at a straight-through crossing, and a rule about riding on
    // afterwards can never be missed — which is exactly what the discrimination check reported.
    // A speed floor, because dawdling is not stopping. Without it this rider brakes all the way
    // through the Kerkstraat's turn, never completes the manoeuvre, and every rule anchored to the
    // manoeuvre vanishes instead of failing — the check then reports those rules as untestable
    // when the truth is that the harness fell over.
    const crawling = engine.world(false).bike.speed < 4;
    const wantStop = hazard || mustShed || (!p.pullAway && slowedFor && d > -55 && !crawling);
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
      if (p.pullAway) {
        once('accelerate', () => {
          dispatch('THROTTLE_UP');
          dispatch('THROTTLE_UP');
        });
      }
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
  /**
   * Cancel the richtingaanwijzer once settled in the lane.
   *
   * Not called `indicatorOff` like the crossroads plan's three-way version: the two plan types are
   * intersected wherever a ride is described generically, and two fields of the same name with
   * different types intersect to `undefined` — a field neither plan can then set. That collision
   * was invisible until something tried to use it.
   */
  cancelIndicator?: boolean;
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
  /** Sit on the bumper of whoever is ahead, so the headway rule has somebody to catch. */
  tailgate?: boolean;
}

/** How far off the rider's line another vehicle has to be before it is somebody else's problem. */
const SAME_LANE_M = 2;

/** How far ahead a stopped obstruction starts to matter. About a rider's thinking distance at 50. */
/**
 * Metres of room a yielding rider leaves between where it stops and the point it must not cross.
 *
 * Stopping exactly on the conflict point is stopping in the path of the thing you are waiting for.
 */
const YIELD_MARGIN_M = 3;

/** Walking pace: what a rider who may have to stop should be down to by the give-way line. */
const APPROACH_SPEED = 15 / 3.6;

const BLOCKING_LOOKAHEAD_M = 45;

/** How close to your line it has to reach before you would slow for it. */
const BLOCKING_WIDTH_M = 1.5;

/**
 * Seconds to whatever is in front, in this lane. Infinity when the road ahead is clear.
 *
 * Both components, not just the one along the heading: on the oprit the car is ten metres to the
 * left and a metre ahead, and measuring only forward distance calls that tailgating. A model rider
 * built on it then brakes for traffic on a different road and never gets up to speed.
 *
 * Written twice, identically, in the merge driver and the overtake driver before the tailgating
 * rider needed a third copy.
 */
function gapAheadSeconds(engine: SimEngine): number {
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
  return closest;
}

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
  cancelIndicator: true,
  matchSpeedAfterMerge: false,
  chaseAfterMerge: false,
  keepDistance: true,
  tailgate: false,
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
    if (p.tailgate) {
      // Sit on the bumper of whoever is ahead. The mirror image of keepDistance, and the reason it
      // exists: until there was a rider who did this, the headway band against the vehicle in
      // front had never once been tested by a bad ride, so the panel could not tell whether the
      // rule was strict or simply unreachable.
      const closest = gapAheadSeconds(engine);
      if (engine.t - easedAt > 0.4) {
        easedAt = engine.t;
        if (closest > 0.9) dispatch('THROTTLE_UP');
        else if (closest < 0.5) dispatch('THROTTLE_DOWN');
      }
    } else if (p.keepDistance && !p.chaseAfterMerge) {
      // Ease off below two and a half, so the two-second rule is met with something in hand
      // rather than hit exactly. Rate-limited, or one frame of closing costs the whole throttle.
      if (gapAheadSeconds(engine) < 2.5 && engine.t - easedAt > 0.4) {
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
    if (settled && p.cancelIndicator) once('indicatorOff', () => dispatch('INDICATOR_OFF'));
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
  /**
   * Do the checks as early as possible rather than at the moment of moving.
   *
   * Looked, then waited, then went — a real fault, and the one `beforeLaneChange` is for: its
   * `missed` outcome on the A12 is literally called LOOK_LATE. Every rider before this one did its
   * checks and steered in the same frame, so the gap was always zero and a six-second window could
   * not be failed by anybody.
   *
   * Modelled as looking early rather than as moving late, because moving late spends road: delay
   * the return by seven seconds and the stretch ends with the rider still in rijstrook 2, which
   * fails a different rule and tests neither.
   */
  lookEarly?: boolean;
  /** Sit on the bumper of whoever is ahead, so the headway rule has somebody to catch. */
  tailgate?: boolean;
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
  tailgate: false,
  lookEarly: false,
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
      const closest = gapAheadSeconds(engine);
      // Ease off for the lorry while waiting; press on while past it. Fifteen km/h of closing
      // speed makes overtaking two lorries a thirty-four second affair, which is not an exercise
      // so much as an endurance test — and dawdling alongside is its own fault on the road.
      //
      // The tailgater eases at 0.8 instead of 2.6, which is to say it does not really ease at all:
      // it closes to about half a second and sits there, which is what the headway rule is for.
      const busy = ride.stage === 'goingOut' || ride.stage === 'passing';
      const easeAt = p.tailgate ? 0.8 : 2.6;
      const wantKmh = closest < easeAt ? 88 : busy ? p.passingKmh : p.cruiseKmh;
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
        if (p.lookEarly) {
          // Before there is anywhere to go: the checks happen, and then the rider sits waiting for
          // a gap with the look going stale behind them.
          if (p.mirror) once('mirrorL', () => dispatch('MIRROR_LEFT'));
          if (p.shoulder) once('shoulderL', () => dispatch('SHOULDER_LEFT'));
          if (p.indicator) once('indicatorL', () => dispatch('INDICATOR_LEFT'));
        }
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
        // The weaver takes what physically fits, not what is safe — which is the whole fault. With
        // the model rider's 2.6 s it needs sixty-five metres of clearance from the lorry it just
        // passed, and the gap between the two is forty-three: it could never land in it, so it
        // cleared both and cut in front of the leader instead. That is a different mistake, and it
        // left the rule about the gap with nobody to catch.
        const clearBy = p.cutInEarly ? 0.6 : CLEAR_BY_S;
        const room = (target.spec.length ?? 2) / 2 + 1.15 + target.speed * clearBy;
        if (p.lookEarly) {
          if (p.mirror) once('mirrorR', () => dispatch('MIRROR_RIGHT'));
          if (p.shoulder) once('shoulderR', () => dispatch('SHOULDER_RIGHT'));
          if (p.indicator) once('indicatorR', () => dispatch('INDICATOR_RIGHT'));
        }
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

export interface ExitPlan {
  /** Cruise on the approach, in km/h. The rider arrives faster than the lorries and has to decide. */
  cruiseKmh?: number;
  /** What to settle at once tucked in behind them. */
  followKmh?: number;
  mirror?: boolean;
  shoulder?: boolean;
  indicator?: boolean;
  /** Metres past the mouth of the strook at which to move over. */
  exitAtM?: number;
  /** Never take the exit at all. */
  neverExit?: boolean;
  /** Blast past the lorries in rijstrook 2 and cut in late — the fault this exercise is about. */
  blastPast?: boolean;
  /** Speed to do it at. */
  blastKmh?: number;
  /** Hold the approach speed rather than falling in behind them. */
  holdSpeed?: boolean;
}

const EXIT_DEFAULTS: Required<ExitPlan> = {
  cruiseKmh: 105,
  followKmh: 90,
  mirror: true,
  shoulder: true,
  indicator: true,
  exitAtM: 25,
  neverExit: false,
  blastPast: false,
  blastKmh: 130,
  holdSpeed: false,
};

/**
 * Leaving a motorway by an exit.
 *
 * The decision this rides is a small one and entirely about patience: three lorries at ninety, an
 * exit coming up, and a clear lane to the left that would let you past all of them. Taking it means
 * arriving at the strook having to cross back over, late, which is the fault. Not taking it means
 * sitting behind a wall of lorry for half a minute, which is dull, correct, and the thing being
 * taught.
 */
export function driveExit(scenario: Scenario, plan: ExitPlan = {}): RunRecord {
  const p = { ...EXIT_DEFAULTS, ...plan };
  const engine = new SimEngine(scenario);
  let record: RunRecord | null = null;
  engine.arm((r) => {
    record = r;
  }, '2026-01-01T12:00:00.000Z');

  const done = new Set<string>();
  let headHold = 0;
  let lastSet = -1;
  let lastSetAt = -99;
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

    // `d` counts down to the mouth of the strook and goes negative past it, like every other
    // window in the project. Positive is still to come.
    const d = engine.distanceToConflict();
    const intoStrook = -d;

    if (p.blastPast) {
      // Out, past the lot at speed, and back in when the exit is already half gone.
      once('outMirror', () => p.mirror && dispatch('MIRROR_LEFT'));
      once('outShoulder', () => p.shoulder && dispatch('SHOULDER_LEFT'));
      once('outIndicator', () => p.indicator && dispatch('INDICATOR_LEFT'));
      once('out', () => {
        dispatch('STEER_LEFT');
        outAt = engine.t;
      });
      if (engine.t - outAt > 1) once('outOff', () => dispatch('INDICATOR_OFF'));
      wantSpeed(p.blastKmh);
      if (intoStrook > 175) {
        once('backMirror', () => p.mirror && dispatch('MIRROR_RIGHT'));
        once('backShoulder', () => p.shoulder && dispatch('SHOULDER_RIGHT'));
        once('backIndicator', () => p.indicator && dispatch('INDICATOR_RIGHT'));
        // Two lane changes to get from rijstrook 2 back across rijstrook 1 into the strook.
        once('back1', () => dispatch('STEER_RIGHT'));
        if (engine.world(false).bike.laneU >= 1) once('back2', () => dispatch('STEER_RIGHT'));
      }
      continue;
    }

    // Falling in behind them: ease to the lorries' speed rather than closing on their tailgate.
    wantSpeed(p.holdSpeed ? p.cruiseKmh : gapAheadSeconds(engine) < 2.6 ? p.followKmh : p.cruiseKmh);

    if (p.neverExit) continue;

    // The checks belong before the strook opens, so they are done on the approach rather than in
    // the two seconds after it does — but not so far before that they have gone stale by the time
    // the rider moves over. At ninety km/h, ninety metres is about three and a half seconds, which
    // is inside the window a `beforeLaneChange` rule would reasonably ask for.
    if (d < 90) {
      once('mirrorR', () => p.mirror && dispatch('MIRROR_RIGHT'));
      once('shoulderR', () => p.shoulder && dispatch('SHOULDER_RIGHT'));
      once('indicatorR', () => p.indicator && dispatch('INDICATOR_RIGHT'));
    }
    if (intoStrook >= p.exitAtM) {
      once('exit', () => {
        dispatch('STEER_RIGHT');
        outAt = engine.t;
      });
      if (engine.t - outAt > 1.5) once('exitOff', () => dispatch('INDICATOR_OFF'));
    }
  }

  function wantSpeed(kmh: number) {
    if (Math.abs(kmh - lastSet) > 0.5 && engine.t - lastSetAt > 0.5) {
      lastSet = kmh;
      lastSetAt = engine.t;
      dispatch('SET_SPEED', kmh);
    }
  }

  if (record === null) throw new Error('rit is niet afgerond binnen de tijd');
  const scored = scoreRun(record, scenario);
  return { ...(record as RunRecord), ...scored };
}
