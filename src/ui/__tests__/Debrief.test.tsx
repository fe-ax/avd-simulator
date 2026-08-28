/**
 * The two sentences the debrief writes for itself, rather than taking from the scenario.
 *
 * Both were wrong in a way that only shows on a scenario other than the one they were written for.
 * The window was described as "vóór het fietspad" on every road, including a plain crossroads that
 * has no fietspad and a motorway that certainly does not. And a window ending past the conflict
 * point is stored as a negative distance, which printed as "-15–-45 m vóór het kruispunt" and asks
 * the reader to work out that minus-before means after.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Debrief } from '../Debrief';
import { conflictPointName } from '../../sim/route';
import { autoVanRechts } from '../../sim/scenario.auto-van-rechts';
import { rechtsafFietspad } from '../../sim/scenario.rechtsaf-fietspad';
import { inhalenSnelweg } from '../../sim/scenario.inhalen-snelweg';
import { invoegenSnelweg } from '../../sim/scenario.invoegen-snelweg';
import type { ActionResult, RunRecord } from '../../sim/types';

const row = (over: Partial<ActionResult> = {}): ActionResult => ({
  expectedId: 'r1',
  label: 'Een regel',
  group: 'snelheid',
  status: 'gemist',
  severity: 'fout',
  explanation: 'x',
  windowT: [4, 7],
  windowD: [60, 20],
  actualT: null,
  actualD: null,
  ...over,
});

const recordFor = (scenarioId: string, results: ActionResult[]) =>
  ({
    scenarioId,
    verdict: 'gezakt',
    counts: { opmerking: 0, fout: 1, kritiek: 0 },
    results,
    faults: results,
    timeScale: 1,
    autoSteer: false,
  }) as unknown as RunRecord;

const show = (scenarioId: string, results: ActionResult[]) =>
  render(
    <Debrief record={recordFor(scenarioId, results)} selectedId={null} onSelect={vi.fn()} onSeek={vi.fn()} />,
  );

describe('het venster wordt gemeten vanaf iets met een naam', () => {
  it('noemt het kruispunt op een kruispunt, niet het fietspad', () => {
    show(autoVanRechts.id, [row()]);
    expect(screen.getByText(/60–20 m vóór het kruispunt/)).toBeInTheDocument();
  });

  it('en het fietspad waar er wel een ligt', () => {
    show(rechtsafFietspad.id, [row()]);
    expect(screen.getByText(/vóór het fietspad/)).toBeInTheDocument();
  });

  it('elke wereld heeft een naam, en geen twee dezelfde', () => {
    const names = [rechtsafFietspad, autoVanRechts, invoegenSnelweg, inhalenSnelweg].map((s) =>
      conflictPointName(s.world),
    );
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((n) => n.length > 0)).toBe(true);
  });

  it('en een rit waarvan het scenario weg is, houdt een leesbare zin', () => {
    // Dropping the word instead printed "60–20 m vóór)", which reads as a bug rather than as a
    // missing scenario.
    show('bestaat-niet', [row()]);
    const meta = document.querySelector('.result-meta')!.textContent ?? '';
    expect(meta).toMatch(/60–20 m vóór het meetpunt/);
  });
});

describe('een venster voorbij het punt heet ná, niet min-vóór', () => {
  it('rekent negatieve meters om', () => {
    show(autoVanRechts.id, [row({ windowD: [-15, -45] })]);
    expect(screen.getByText(/15–45 m ná het kruispunt/)).toBeInTheDocument();
    expect(screen.queryByText(/-15/)).not.toBeInTheDocument();
  });

  it('en zegt allebei de helften als het venster er dwars overheen ligt', () => {
    show(autoVanRechts.id, [row({ windowD: [200, -100] })]);
    expect(screen.getByText(/200 m vóór tot 100 m ná het kruispunt/)).toBeInTheDocument();
  });
});
