import type { Scenario } from '../sim/types';
import { CONTROLS, GROUP_LABELS, GROUP_ORDER } from './controls';
import { formatTempo, RideSettings } from './RideSettings';

interface Props {
  scenario: Scenario;
  onStart: () => void;
  countdown: number | null;
  timeScale: number;
  onTimeScaleChange: (value: number) => void;
  autoSteer: boolean;
  onAutoSteerChange: (value: boolean) => void;
}

export function BriefingModal({
  scenario,
  onStart,
  countdown,
  timeScale,
  onTimeScaleChange,
  autoSteer,
  onAutoSteerChange,
}: Props) {
  if (countdown !== null) {
    return (
      <div className="overlay countdown-overlay">
        <div className="countdown">{countdown}</div>
        <p className="countdown-hint">{scenario.briefing.assignment}</p>
        {timeScale < 1 && (
          <p className="countdown-tempo">Oefentempo {formatTempo(timeScale)}</p>
        )}
      </div>
    );
  }

  return (
    <div className="overlay">
      <div className="briefing">
        <p className="briefing-eyebrow">AVD · Verkeersdeelneming</p>
        <h1>{scenario.title}</h1>
        <div className="briefing-grid">
          <div>
            <p className="briefing-situation">{scenario.briefing.situation}</p>

            <div className="briefing-assignment">
              <span className="briefing-assignment-label">Opdracht van de examinator</span>
              <strong>{scenario.briefing.assignment}</strong>
            </div>

            <ul className="briefing-hints">
              {scenario.briefing.hints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
          </div>

          <div className="briefing-controls">
            <h2>Bediening</h2>
            <div className="briefing-control-groups">
              {GROUP_ORDER.map((group) => (
                <div key={group}>
                  <h4>{GROUP_LABELS[group]}</h4>
                  {CONTROLS.filter((c) => c.group === group).map((c) => (
                    <div key={c.id} className="briefing-control-row">
                      <kbd>{c.keyHint}</kbd>
                      <span>{c.label}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <RideSettings
              timeScale={timeScale}
              onTimeScale={onTimeScaleChange}
              autoSteer={autoSteer}
              onAutoSteer={onAutoSteerChange}
            />
          </div>
        </div>

        <button type="button" className="primary-btn briefing-start" onClick={onStart} autoFocus>
          Start de rit
        </button>
      </div>
    </div>
  );
}
