/**
 * Keyboard input. Buttons and keys both end up calling `engine.dispatch`, which is the only
 * door into engine state — that single path is what keeps the recording complete.
 */
import { useEffect } from 'react';
import type { SimEngine } from '../sim/engine';
import { isLookControl } from '../sim/perception';
import { CONTROLS, isSteerControl, steeringIsInert, type ControlDef } from '../ui/controls';

const BY_CODE = new Map<string, ControlDef>();
for (const def of CONTROLS) {
  BY_CODE.set(def.code, def);
  if (def.code === 'ShiftLeft') BY_CODE.set('ShiftRight', def);
}

export function useControls(engine: SimEngine, enabled: boolean, onUse?: () => void) {
  useEffect(() => {
    if (!enabled) return;

    const held = new Set<string>();

    const down = (e: KeyboardEvent) => {
      const def = BY_CODE.get(e.code);
      if (!def) return;
      e.preventDefault();
      if (e.repeat) return;
      // The engine ignores an inert sturen control anyway; bailing here keeps the button from
      // flashing as though something happened. Whether it *is* inert is one question with one
      // answer — where a press means a whole rijstrook, these keys are the exercise.
      if (isSteerControl(def.id) && steeringIsInert(engine.scenario, engine.autoSteer)) return;
      // Looks are made by looking. A key for them would be a way round the entire mechanic.
      if (isLookControl(def.id)) return;
      if (def.hold) {
        if (held.has(def.id)) return;
        held.add(def.id);
        engine.dispatch(def.id, 'down', 'keyboard');
      } else {
        engine.dispatch(def.id, 'press', 'keyboard');
      }
      onUse?.();
    };

    const up = (e: KeyboardEvent) => {
      const def = BY_CODE.get(e.code);
      if (!def?.hold) return;
      e.preventDefault();
      held.delete(def.id);
      engine.dispatch(def.id, 'up', 'keyboard');
    };

    // A window that loses focus mid-hold would otherwise leave the rem stuck on.
    const blur = () => {
      for (const id of held) engine.dispatch(id as ControlDef['id'], 'up', 'keyboard');
      held.clear();
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      blur();
    };
  }, [engine, enabled, onUse]);
}
