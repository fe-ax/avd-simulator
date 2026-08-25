import { TIME_SCALES } from '../sim/engine';
import { steeringIsInert, type SteeringScenario } from './controls';

interface Props {
  timeScale: number;
  onTimeScale: (value: number) => void;
  autoSteer: boolean;
  onAutoSteer: (value: boolean) => void;
  /** Only the steering mode is read, and the type says so. */
  scenario: SteeringScenario;
  compact?: boolean;
}

export const formatTempo = (scale: number): string =>
  scale === 1 ? '1×' : `${scale.toString().replace('.', ',')}×`;

/**
 * What the rider sets before a run. Both options change the exercise rather than the scoring:
 * the tempo gives you more thinking time, auto-sturen takes a decision off your plate. Which
 * settings a run was flown under is recorded on it and named in the debrief.
 *
 * Auto-sturen is only offered where it would do something. A checkbox that silently changes
 * nothing teaches the student the wrong thing about the exercise they are about to ride.
 */
export function RideSettings({
  timeScale,
  onTimeScale,
  autoSteer,
  onAutoSteer,
  scenario,
  compact,
}: Props) {
  // Ask the one predicate what ticking the box would actually do here: if the sturen controls
  // would stay live either way, there is nothing to offer.
  const offerAutoSteer = steeringIsInert(scenario, true);

  return (
    <div className={`settings${compact ? ' compact' : ''}`}>
      <div className="settings-head">
        <span className="settings-title">Instellingen</span>
        {!compact && (
          <span className="settings-hint">
            Langzamer oefenen geeft je meer denktijd; de beoordeling verandert er niet van.
          </span>
        )}
        {!compact && !offerAutoSteer && (
          <span className="settings-hint">
            Hier stuur je altijd zelf: wanneer je van rijstrook wisselt is de oefening.
          </span>
        )}
      </div>

      <div className="settings-row">
        <span className="settings-label">Oefentempo</span>
        <div className="tempo-options" role="radiogroup" aria-label="Oefentempo">
          {TIME_SCALES.map((scale) => (
            <button
              key={scale}
              type="button"
              role="radio"
              aria-checked={timeScale === scale}
              className={`tempo-btn${timeScale === scale ? ' active' : ''}`}
              onClick={() => onTimeScale(scale)}
            >
              {formatTempo(scale)}
              {scale === 1 && <span className="tempo-tag">examen</span>}
            </button>
          ))}
        </div>
      </div>

      {offerAutoSteer && (
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={autoSteer}
            onChange={(e) => onAutoSteer(e.target.checked)}
          />
          <span>
            <strong>Auto-sturen</strong>
            {!compact && (
              <em>De motor neemt de bocht vanzelf. Uit = je stuurt zelf in.</em>
            )}
          </span>
        </label>
      )}
    </div>
  );
}
