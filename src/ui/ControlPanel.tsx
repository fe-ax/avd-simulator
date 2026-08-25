/**
 * The motorfiets controls. Pointer and keyboard both route through `engine.dispatch`; this
 * component only renders and reports which controls are currently lit.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SimEngine } from '../sim/engine';
import type { ControlId } from '../sim/types';
import { CONTROLS, GROUP_LABELS, GROUP_ROWS, type ControlDef } from './controls';

interface Props {
  engine: SimEngine;
  enabled: boolean;
  /** Controls whose gaze cone is currently open, for the lit state. */
  activeGazes: ControlId[];
  indicator: 'left' | 'right' | 'off';
  /** The sturen group is inert while the bike takes the turn itself. */
  autoSteer: boolean;
}

const FLASH_MS = 260;

export function ControlPanel({ engine, enabled, activeGazes, indicator, autoSteer }: Props) {
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
  }, [enabled, flash]);

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
          {row.map((group) => {
            const defs = CONTROLS.filter((c) => c.group === group);
            const inert = autoSteer && group === 'sturen';
            return (
              <section
                key={group}
                className={`control-group group-${group}${inert ? ' inert' : ''}`}
                style={{ flexGrow: defs.length }}
              >
                <h3>
                  {GROUP_LABELS[group]}
                  {inert && <span className="group-note">automatisch</span>}
                </h3>
                <div className="control-buttons">
                  {defs.map((def) => (
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
                      title={def.label}
                    >
                      <span className="control-label">{def.short}</span>
                      <kbd>{def.keyHint}</kbd>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ))}
    </div>
  );
}
