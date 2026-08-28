import { RESERVED_IDS } from '../sim/scenarios';
import type { Scenario } from '../sim/types';
import { CONTROLS, controlLabels, GROUP_ORDER, groupLabel } from './controls';
import { formatTempo, RideSettings } from './RideSettings';
import type { Conditions } from '../scene/sky';

interface Props {
  scenario: Scenario;
  /** Everything on offer, in registry order. One entry is a legitimate state, not a special case. */
  scenarios: readonly Scenario[];
  onScenarioChange: (id: string) => void;
  onStart: () => void;
  countdown: number | null;
  timeScale: number;
  onTimeScaleChange: (value: number) => void;
  autoSteer: boolean;
  conditions: Conditions;
  onConditions: (value: Conditions) => void;
  onAutoSteerChange: (value: boolean) => void;
}

export function BriefingModal({
  scenario,
  scenarios,
  onScenarioChange,
  onStart,
  countdown,
  timeScale,
  onTimeScaleChange,
  autoSteer,
  onAutoSteerChange,
  conditions,
  onConditions,
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
        {/* The briefing is the screen you are on before every ride, so the choice of which ride
            belongs here rather than in a menu somewhere above it. */}
        <div className="briefing-top">
          <p className="briefing-eyebrow">AVD · Verkeersdeelneming</p>
          <div className="scenario-switch" role="group" aria-label="Scenario kiezen">
            <span className="scenario-switch-label">Scenario</span>
            {scenarios.map((s) => {
              // Your own scenarios sit in the same list as the four that ship, because they are
              // the same kind of thing to ride. They are marked because they are not the same kind
              // of thing to trust: nobody has checked them but you.
              const own = !RESERVED_IDS.has(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`replay-btn tiny${s.id === scenario.id ? ' active' : ''}${own ? ' own' : ''}`}
                  aria-pressed={s.id === scenario.id}
                  title={own ? 'Zelfgemaakt scenario, bewaard in deze browser' : undefined}
                  onClick={() => onScenarioChange(s.id)}
                >
                  {s.title}
                  {own && <span className="scenario-own" aria-label="zelfgemaakt"> ·eigen</span>}
                </button>
              );
            })}
          </div>
        </div>
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
              <div className="briefing-look">
                <h4>Kijken</h4>
                <div className="briefing-control-row">
                  <kbd>muis</kbd>
                  <span>hoofd draaien</span>
                </div>
                <div className="briefing-control-row">
                  <kbd>stip</kbd>
                  <span>kruisje erop houden</span>
                </div>
              </div>
              {GROUP_ORDER.map((group) => (
                <div key={group}>
                  {/* The wording comes from the scenario: sturen means something else on a
                      snelweg than at a kruispunt, and the briefing is where it is read first. */}
                  <h4>{groupLabel(group, scenario)}</h4>
                  {CONTROLS.filter((c) => c.group === group).map((c) => (
                    <div key={c.id} className="briefing-control-row">
                      <kbd>{c.keyHint}</kbd>
                      <span>{controlLabels(c, scenario).label}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <RideSettings
              scenario={scenario}
              timeScale={timeScale}
              onTimeScale={onTimeScaleChange}
              autoSteer={autoSteer}
              conditions={conditions}
              onConditions={onConditions}
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
