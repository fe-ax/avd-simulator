/**
 * The loop an instructor needs, through the real components: keep a scenario, find it where you
 * ride, and get it back out of a file.
 *
 * The `sim` side of this is covered next door in `sim/__tests__/library.test.ts`, which proves the
 * envelope is not lossy. What is only testable here is the wiring: whether the picker is actually
 * fed the saved scenarios, whether it marks them, and whether a file that fails to parse produces
 * a message rather than nothing at all. Those are the failures that cost somebody the scenario they
 * spent an evening on, and none of them would show up in a scoring test.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BriefingModal } from '../BriefingModal';
import { RunHistory } from '../RunHistory';
import { saveScenario } from '../../sim/library';
import { ALL_SCENARIOS, RESERVED_IDS, allScenarios, scenarioById } from '../../sim/scenarios';
import { runFileFor } from '../../sim/scenarioFile';
import { referenceRide } from '../../sim/referenceRide';
import { autoVanRechts } from '../../sim/scenario.auto-van-rechts';
import { rechtsafFietspad } from '../../sim/scenario.rechtsaf-fietspad';
import type { Scenario } from '../../sim/types';

const mine: Scenario = { ...autoVanRechts, id: 'mijn-kruispunt-v1', title: 'Mijn kruispunt' };

/** Stand in for the OS file picker: the next file input to be clicked gets this text. */
function stageFile(text: string) {
  const real = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function (this: HTMLInputElement) {
    if (this.type !== 'file') return real.call(this);
    Object.defineProperty(this, 'files', {
      configurable: true,
      value: [new File([text], 'x.json', { type: 'application/json' })],
    });
    this.dispatchEvent(new Event('change', { bubbles: true }));
  };
  return () => {
    HTMLInputElement.prototype.click = real;
  };
}

describe('de scenariokiezer', () => {
  it('toont een bewaard scenario naast de scenarios die meekomen, en markeert het als eigen', () => {
    saveScenario(mine, RESERVED_IDS);
    render(
      <BriefingModal
        scenario={rechtsafFietspad}
        scenarios={allScenarios()}
        onScenarioChange={vi.fn()}
        onStart={vi.fn()}
        countdown={null}
        timeScale={1}
        onTimeScaleChange={vi.fn()}
        autoSteer
        onAutoSteerChange={vi.fn()}
      />,
    );
    const own = screen.getByRole('button', { name: /Mijn kruispunt/ });
    expect(own).toBeInTheDocument();
    expect(own).toHaveTextContent('eigen');
    // And the ones that ship are not marked as somebody's.
    expect(screen.getByRole('button', { name: /^Inhalen op de A12$/ })).not.toHaveTextContent('eigen');
  });

  it('kiest het scenario waar je op drukt', () => {
    saveScenario(mine, RESERVED_IDS);
    const onScenarioChange = vi.fn();
    render(
      <BriefingModal
        scenario={rechtsafFietspad}
        scenarios={allScenarios()}
        onScenarioChange={onScenarioChange}
        onStart={vi.fn()}
        countdown={null}
        timeScale={1}
        onTimeScaleChange={vi.fn()}
        autoSteer
        onAutoSteerChange={vi.fn()}
      />,
    );
    screen.getByRole('button', { name: /Mijn kruispunt/ }).click();
    expect(onScenarioChange).toHaveBeenCalledWith('mijn-kruispunt-v1');
  });

  it('en een bewaard scenario kan er nooit een verdringen dat meekomt', () => {
    // Not reachable through saveScenario, which refuses it — this is a hand-edited file.
    localStorage.setItem(
      'avd-simulator.scenarios.v1',
      JSON.stringify([{ scenario: { ...mine, id: 'rechtsaf-fietspad-v1' }, savedAt: '' }]),
    );
    expect(scenarioById('rechtsaf-fietspad-v1')).toBe(rechtsafFietspad);
    expect(allScenarios().filter((s) => s.id === 'rechtsaf-fietspad-v1')).toHaveLength(
      ALL_SCENARIOS.filter((s) => s.id === 'rechtsaf-fietspad-v1').length,
    );
  });
});

describe('een rit uit een bestand', () => {
  const run = referenceRide(mine).record;

  it('komt binnen met zijn scenario als de ontvanger dat niet heeft', () => {
    const onChange = vi.fn();
    const onNotice = vi.fn();
    render(<RunHistory runs={[]} currentId={null} onOpen={vi.fn()} onChange={onChange} onNotice={onNotice} />);

    const restore = stageFile(JSON.stringify(runFileFor(run, mine)));
    fireEvent.click(screen.getByRole('button', { name: /Open een rit uit een bestand/ }));
    restore();

    return vi.waitFor(() => {
      expect(onChange).toHaveBeenCalled();
      expect(onChange.mock.calls.at(-1)![0][0].id).toBe(run.id);
      // The scenario came along, so the row can be replayed rather than reading "onbekend".
      expect(scenarioById('mijn-kruispunt-v1')?.title).toBe('Mijn kruispunt');
      expect(onNotice).toHaveBeenCalledWith(expect.stringContaining('Mijn kruispunt'));
    });
  });

  it('zegt waarom als het bestand niet klopt, in plaats van niets te doen', () => {
    const onNotice = vi.fn();
    render(<RunHistory runs={[]} currentId={null} onOpen={vi.fn()} onChange={vi.fn()} onNotice={onNotice} />);

    const restore = stageFile('{"format":"iets anders"}');
    fireEvent.click(screen.getByRole('button', { name: /Open een rit uit een bestand/ }));
    restore();

    return vi.waitFor(() => {
      expect(onNotice).toHaveBeenCalledWith(expect.stringMatching(/komt niet uit de simulator/));
    });
  });

  it('en wijst een scenariobestand vriendelijk de goede kant op', () => {
    const onNotice = vi.fn();
    render(<RunHistory runs={[]} currentId={null} onOpen={vi.fn()} onChange={vi.fn()} onNotice={onNotice} />);

    const restore = stageFile(JSON.stringify({ format: 'avd-scenario', version: 1, scenario: mine }));
    fireEvent.click(screen.getByRole('button', { name: /Open een rit uit een bestand/ }));
    restore();

    return vi.waitFor(() => {
      expect(onNotice).toHaveBeenCalledWith(expect.stringMatching(/scenario-bouwer/));
    });
  });
});
