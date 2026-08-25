import type { EngineSnapshot } from '../sim/engine';
import { formatTempo } from './RideSettings';

interface Props {
  snapshot: EngineSnapshot;
  /** Debug only: freeze simulated time, and nudge it forward a step at a time. */
  onTogglePause?: () => void;
  onStep?: (seconds: number) => void;
}

export function Hud({ snapshot, onTogglePause, onStep }: Props) {
  return (
    <div className="hud">
      {/* Speed and gear are on the machine's own instrument; repeating them here would make
          reading the clocks free, which is the one thing it should not be. */}
      <div className={`hud-item hud-ind ${snapshot.indicator}`}>
        <span className="hud-label">Richting</span>
        <span className="hud-value small">
          {snapshot.indicator === 'left' ? '◀' : snapshot.indicator === 'right' ? '▶' : '—'}
        </span>
      </div>
      <div className="hud-flags">
        {snapshot.brake && <span className="flag flag-brake">REM</span>}
        {snapshot.clutch && <span className="flag flag-clutch">KOPPELING</span>}
        {snapshot.steerArmed && snapshot.branch === 'approach' && (
          <span className="flag flag-steer">INSTUREN RECHTS</span>
        )}
      </div>
      {snapshot.timeScale < 1 && (
        <div className="hud-item hud-tempo">
          <span className="hud-label">Tempo</span>
          <span className="hud-value small">{formatTempo(snapshot.timeScale)}</span>
        </div>
      )}
      <div className="hud-item hud-time">
        <span className="hud-label">Tijd</span>
        <span className="hud-value small">{snapshot.t.toFixed(1).replace('.', ',')}s</span>
      </div>
      {snapshot.rejection && snapshot.rejection.ageS < 2.2 && (
        <div className="hud-rejection" role="status">
          {snapshot.rejection.message}
        </div>
      )}
      {snapshot.debug && (
        <div className="hud-pause">
          <button type="button" onClick={onTogglePause}>
            {snapshot.paused ? '▶ Verder' : '⏸ Pauze'}
          </button>
          <button type="button" onClick={() => onStep?.(0.1)}>
            +0,1s
          </button>
          <button type="button" onClick={() => onStep?.(1)}>
            +1s
          </button>
        </div>
      )}
      {snapshot.debug && (
        <div className="hud-debug">
          s={snapshot.debug.s.toFixed(1)} d={snapshot.distanceToConflict.toFixed(1)}
          {snapshot.debug.actorGaps.map((a) => (
            <span key={a.id}>
              {' · '}
              {a.id}: gap {a.gap.toFixed(1)}m, {a.bearing.toFixed(0)}°, {a.dist.toFixed(1)}m,{' '}
              {a.mode}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
