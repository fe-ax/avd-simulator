/**
 * The motorfiets controls. Pointer and keyboard both route through `engine.dispatch`; this
 * component only renders and reports which controls are currently lit.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SimEngine } from '../sim/engine';
import type { ControlId, Scenario } from '../sim/types';
import { CheckStrip, type CheckState } from './CheckStrip';
import {
  CONTROLS,
  controlLabels,
  GROUP_ROWS,
  groupLabel,
  isSteerControl,
  steeringIsInert,
  type ControlDef,
} from './controls';

interface Props {
  engine: SimEngine;
  enabled: boolean;
  /** Controls whose gaze cone is currently open, for the lit state. */
  activeGazes: ControlId[];
  indicator: 'left' | 'right' | 'off';
  /**
   * The rider's setting, not the answer: whether it actually renders the sturen group inert
   * depends on what those controls mean here, which only `steeringIsInert` decides.
   */
  autoSteer: boolean;
  checks: readonly CheckState[];
}

const FLASH_MS = 260;

export function ControlPanel({ engine, enabled, activeGazes, indicator, autoSteer, checks }: Props) {
  // Read off the engine rather than taken as a prop: it is the same immutable scenario App holds,
  // and a second copy of "which scenario is this" is precisely the drift being avoided here.
  const scenario = engine.scenario;
  const steerInert = steeringIsInert(scenario, autoSteer);
  const [flashing, setFlashing] = useState<Record<string, number>>({});
  // Hold state is tracked from the input device rather than read off the engine snapshot: that
  // snapshot is throttled to keep React off the 120 Hz path, and a rem lamp that lights 70 ms
  // late is exactly the wrong place to spend that budget.
  const [held, setHeld] = useState<ControlId[]>([]);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const flash = useCallback((id: ControlId) => {
    setFlashing((f) => ({ ...f, [id]: (f[id] ?? 0) + 1 }));
    const timer = window.setTimeout(() => {
      setFlashing((f) => ({ ...f, [id]: Math.max(0, (f[id] ?? 1) - 1) }));
    }, FLASH_MS);
    timers.current.push(timer);
  }, []);

  // Keyboard presses must light the same buttons, so listen for them here too rather than
  // duplicating the lit-state logic in the key handler.
  useEffect(() => {
    if (!enabled) {
      setHeld([]);
      return;
    }
    const defFor = (code: string) =>
      CONTROLS.find((c) => c.code === code || (c.code === 'ShiftLeft' && code === 'ShiftRight'));

    const onKeyDown = (e: KeyboardEvent) => {
      const def = defFor(e.code);
      if (!def || e.repeat) return;
      // An inert control is dropped before it reaches the engine, so lighting it up here would
      // report something that did not happen.
      if (steerInert && isSteerControl(def.id)) return;
      if (def.hold) setHeld((h) => (h.includes(def.id) ? h : [...h, def.id]));
      else flash(def.id);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const def = defFor(e.code);
      if (def?.hold) setHeld((h) => h.filter((id) => id !== def.id));
    };
    const onBlur = () => setHeld([]);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [enabled, flash, steerInert]);

  const isLit = (def: ControlDef) => {
    if (def.hold) return held.includes(def.id);
    if (activeGazes.includes(def.id)) return true;
    if (def.id === 'INDICATOR_LEFT') return indicator === 'left';
    if (def.id === 'INDICATOR_RIGHT') return indicator === 'right';
    return (flashing[def.id] ?? 0) > 0;
  };

  const press = (def: ControlDef) => {
    engine.dispatch(def.id, def.hold ? 'down' : 'press', 'pointer');
    if (def.hold) setHeld((h) => (h.includes(def.id) ? h : [...h, def.id]));
    else flash(def.id);
  };

  const release = (def: ControlDef) => {
    if (!def.hold) return;
    engine.dispatch(def.id, 'up', 'pointer');
    setHeld((h) => h.filter((id) => id !== def.id));
  };

  return (
    <div className={`control-panel${enabled ? '' : ' disabled'}`}>
      {GROUP_ROWS.map((row, i) => (
        <div key={i} className="control-row">
          {i === 0 && <CheckStrip states={checks} />}
          {row.map((group) => {
            const defs = CONTROLS.filter((c) => c.group === group);
            const inert = group === 'sturen' && steerInert;
            // Live sturen controls that move a whole rijstrook: say so, because the size of what
            // one press does is the thing the student has to time.
            const perLane = group === 'sturen' && scenario.steering === 'lane';
            return (
              <section
                key={group}
                className={`control-group group-${group}${inert ? ' inert' : ''}`}
                style={{ flexGrow: defs.length }}
              >
                <h3>
                  {groupLabel(group, scenario)}
                  {inert && <span className="group-note">automatisch</span>}
                  {perLane && <span className="group-note">1 druk = 1 strook</span>}
                </h3>
                <div className="control-buttons">
                  {defs.map((def) => {
                    const { label, short } = controlLabels(def, scenario);
                    return (
                      <button
                        key={def.id}
                        type="button"
                        className={`control-btn${isLit(def) ? ' lit' : ''}${def.hold ? ' hold' : ''}`}
                        disabled={!enabled || inert}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.currentTarget.setPointerCapture(e.pointerId);
                          press(def);
                        }}
                        onPointerUp={() => release(def)}
                        onPointerCancel={() => release(def)}
                        title={label}
                      >
                        <span className="control-label">{short}</span>
                        <kbd>{def.keyHint}</kbd>
                      </button>
                    );
                  })}
                </div>
                {group === 'snelheid' && (
                  <SetSpeed engine={engine} enabled={enabled} scenario={scenario} />
                )}
              </section>
            );
          })}
        </div>
      ))}
    </div>
  );
}


/**
 * Cruise control: say what you want to be doing, and the machine gets there in a fixed four
 * seconds however far away it is.
 *
 * On the invoegstrook the exercise is arriving at the speed of the traffic, not operating a
 * throttle — and getting from fifty to a hundred in ten-kilometre steps is five presses of a
 * button while the road runs out. This turns "kom op snelheid" into one action whose timing you
 * can actually plan around, which is the thing being taught.
 */
function SetSpeed({
  engine,
  enabled,
  scenario,
}: {
  engine: SimEngine;
  enabled: boolean;
  scenario: Pick<Scenario, 'speedLimitKmh' | 'maxSpeedKmh'>;
}) {
  const [value, setValue] = useState(scenario.speedLimitKmh);
  const commit = useCallback(() => {
    if (!enabled) return;
    engine.dispatch('SET_SPEED', 'press', 'pointer', value);
  }, [enabled, engine, value]);

  // "S" belongs to this widget rather than to the control table, so the key and the button send
  // the number in the box. A table entry could only ever dispatch without one, and then the two
  // affordances sitting next to each other would mean different speeds.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyS' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      commit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [commit]);
  return (
    <div className="set-speed">
      <label>
        <span>Zet op</span>
        <input
          type="number"
          min={0}
          max={scenario.maxSpeedKmh}
          step={5}
          value={value}
          disabled={!enabled}
          onChange={(e) => setValue(Number(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            // The ride reads the keyboard; a number field must not double as the controls.
            e.stopPropagation();
          }}
        />
        <em>km/u</em>
      </label>
      <button type="button" className="control-btn" disabled={!enabled} onClick={commit} title="Zet snelheid">
        Zet<kbd>S</kbd>
      </button>
    </div>
  );
}
