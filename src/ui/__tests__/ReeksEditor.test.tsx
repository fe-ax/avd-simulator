/**
 * The reeks editor: adding rules, and changing one without disturbing its neighbour.
 *
 * The recipes are the interesting part. Five of the nine were added at once, each writing a rule
 * shape by hand, and a wrong field name in one of them produces a rule that scores *nothing* —
 * silently, because `scoreExpected` returns null for a rule it cannot evaluate rather than throwing.
 * A scenario built with it would look finished and measure less than it claimed. The recipe test
 * below rides each freshly-added rule through the real scorer for exactly that reason; the
 * `speedBand` recipe shipped with `minKmh`/`maxKmh` instead of `fromKmh`/`toKmh` and only the
 * typechecker caught it.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ReeksEditor } from '../builder/ReeksEditor';
import { referenceRide } from '../../sim/referenceRide';
import { scoreRun } from '../../sim/scoring';
import { autoVanRechts } from '../../sim/scenario.auto-van-rechts';
import { inhalenSnelweg } from '../../sim/scenario.inhalen-snelweg';
import type { ExpectedAction, Scenario } from '../../sim/types';

const two: ExpectedAction[] = [
  {
    id: 'r1',
    label: 'Eerste',
    group: 'snelheid',
    kind: { type: 'speedAtMost', maxKmh: 25 },
    window: { from: 60, to: 20 },
    missed: { severity: 'fout', explanation: 'a' },
  },
  {
    id: 'r2',
    label: 'Tweede',
    group: 'snelheid',
    kind: { type: 'speedAtLeast', minKmh: 35 },
    window: { from: -15, to: -45 },
    missed: { severity: 'opmerking', explanation: 'b' },
  },
];

function editor(expected = two, onChange = vi.fn()) {
  render(<ReeksEditor expected={expected} actors={[]} manoeuvre={null} onChange={onChange} />);
  return onChange;
}

describe('de reeks-editor', () => {
  it('biedt alle negen soorten regels aan, niet alleen de vier die een kruispunt nodig heeft', () => {
    editor();
    const adders = screen.getAllByRole('button', { name: /^\+ / });
    expect(adders.length).toBeGreaterThanOrEqual(9);
  });

  it('zegt bij elke regel waar hij naar kijkt', () => {
    editor();
    expect(screen.getByText(/een halve seconde lang vasthoudt/)).toBeInTheDocument();
    expect(screen.getByText(/één moment is genoeg/)).toBeInTheDocument();
  });

  it('verandert de regel die je bewerkt en niet zijn buurman', () => {
    const onChange = editor();
    // fireEvent rather than setting .value and dispatching by hand: React tracks the value on the
    // node and ignores an event whose value it believes it already has, so the hand-rolled version
    // silently does nothing at all.
    fireEvent.change(screen.getByDisplayValue('Tweede'), { target: { value: 'Hernoemd' } });

    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)![0] as ExpectedAction[];
    expect(next.map((e) => e.label)).toEqual(['Eerste', 'Hernoemd']);
    expect(next[0]).toEqual(two[0]);
  });

  it('verwijdert alleen de regel waar je op drukt', () => {
    const onChange = editor();
    screen.getAllByRole('button', { name: 'Weg' })[0].click();
    const next = onChange.mock.calls.at(-1)![0] as ExpectedAction[];
    expect(next.map((e) => e.id)).toEqual(['r2']);
  });

  it('waarschuwt als een volgafstandregel naar niemand wijst', () => {
    render(
      <ReeksEditor
        expected={[
          {
            id: 'r1',
            label: 'Volgafstand',
            group: 'snelheid',
            kind: { type: 'headway', actorId: '', bands: [] },
            window: { from: 200, to: -100 },
            missed: { severity: 'opmerking', explanation: 'a' },
          },
        ]}
        actors={[]}
        manoeuvre={null}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/wijst naar een weggebruiker die er niet is/)).toBeInTheDocument();
  });
});

describe('elk recept levert een regel op die de scorer echt kan beoordelen', () => {
  // A junction for the crossroads kinds, a motorway for the ones that need a lane change. A rule
  // the scorer cannot evaluate returns null and produces no row — no error, no complaint, just an
  // exercise that measures less than it says it does.
  const hosts: [string, Scenario][] = [
    ['kruispunt', autoVanRechts],
    ['snelweg', inhalenSnelweg],
  ];

  it.each(hosts)('op een %s', (_name, host) => {
    const onChange = vi.fn();
    render(<ReeksEditor expected={[]} actors={host.actors} manoeuvre={null} onChange={onChange} />);

    for (const adder of screen.getAllByRole('button', { name: /^\+ / })) {
      onChange.mockClear();
      adder.click();
      const [added] = onChange.mock.calls.at(-1)![0] as ExpectedAction[];
      const scenario: Scenario = { ...host, expected: [added] };
      const { record, error } = referenceRide(scenario);
      expect(`${adder.textContent} ${error}`).toBe(`${adder.textContent} null`);
      // It does not have to pass — a fresh rule is a guess at numbers. It has to be *evaluated*,
      // which for anything anchored to a manoeuvre means the host has to have one.
      expect(() => scoreRun(record, scenario)).not.toThrow();
    }
  });
});
