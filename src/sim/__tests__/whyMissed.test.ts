/**
 * Why a rule was missed, told to the author rather than to the rider.
 *
 * These exist because of a specific afternoon. *Uitvoegen op de A12* would not pass its own model
 * ride, and the builder said "je ging van strook zonder dit eerst te controleren" — the sentence
 * written for a student. The schouderblik had happened. It was 5,8 s before the lane change and the
 * rule allowed 5, and nothing on the screen carried a number that would have said so.
 *
 * The distinction each test draws is between causes that produce *identical* debriefs and have
 * opposite fixes: a look that happened too early is an author's window to widen or a rider to move,
 * a look that was refused by a prerequisite is a reeks in the wrong order, and a look that never
 * happened is neither. Conflating them is what sent the search to the wrong place.
 */
import { describe, expect, it } from 'vitest';
import { uitvoegenSnelweg } from '../scenario.uitvoegen-snelweg';
import { driveExit } from '../testDriver';
import { scoreRun } from '../scoring';
import type { Scenario } from '../types';

/** The shoulder-check rule, with its allowance narrowed to whatever the test needs. */
function withAllowance(seconds: number): Scenario {
  return {
    ...uitvoegenSnelweg,
    expected: uitvoegenSnelweg.expected.map((e) =>
      e.kind.type === 'beforeLaneChange' && e.kind.control === 'SHOULDER_RIGHT'
        ? { ...e, kind: { ...e.kind, withinSeconds: seconds } }
        : e,
    ),
  };
}

const shoulderRow = (s: Scenario) =>
  scoreRun(driveExit(s), s).results.find((r) => r.label.includes('Schouderblik'));

describe('waarom een regel gemist werd', () => {
  it('zegt dat de blik er wél was, en hoeveel te vroeg', () => {
    // One second is narrower than any rider could satisfy, so the model rider's genuine shoulder
    // check lands outside it — the exact shape of the bug this was built for.
    const row = shoulderRow(withAllowance(1));
    expect(row?.severity).not.toBeNull();
    expect(row?.why?.kind).toBe('tooEarly');
    if (row?.why?.kind !== 'tooEarly') throw new Error('verkeerde reden');
    expect(row.why.allowedS).toBe(1);
    // The numbers have to be real, not placeholders: the press comes before the move, and the gap
    // between them is what the author has to weigh against the allowance.
    expect(row.why.pressedAt).toBeLessThan(row.why.anchorAt);
    expect(row.why.anchorAt - row.why.pressedAt).toBeGreaterThan(1);
    expect(row.why.anchor).toBe('laneChange');
  });

  it('en zegt niets bijzonders als de regel gewoon gehaald wordt', () => {
    const row = shoulderRow(uitvoegenSnelweg);
    expect(row?.severity).toBeNull();
    expect(row?.why).toBeUndefined();
  });

  it('onderscheidt een blik die nooit gebeurde van een die te vroeg was', () => {
    const s = uitvoegenSnelweg;
    const record = driveExit(s, { shoulder: false });
    const row = scoreRun(record, s).results.find((r) => r.label.includes('Schouderblik'));
    expect(row?.why?.kind).toBe('neverPressed');
  });
});

/**
 * Rules aimed at nobody.
 *
 * The builder already handles this where an author meets it: the recipe points a new Volgafstand
 * rule at the first road user, `removeActor` deletes any rule pointing at one it removes, and the
 * rule's own form says so in place when the target does not resolve. A second notice in the
 * validation column was written and thrown away — it fired at exactly the same moment as the one
 * beside the chooser that fixes it, which is duplication rather than coverage.
 *
 * What is left is the question asked of a *finished* scenario, which those three do not cover: one
 * arriving from a file or from localStorage has never been through the form. These pin that, and
 * the sweep is the one with standing value — a shipped exercise whose rule measures nothing would
 * pass every other check in the suite, because measuring nothing is silent by construction.
 */
describe('en dat geldt voor beide ankers', () => {
  it('ook een regel die ná de manoeuvre meet zegt waarom hij miste', async () => {
    // `afterTurn` was the other silent one, and it fails the mirror-image way: the press can land
    // just before the manoeuvre finished rather than just after. Same fix, other side.
    const { rechtsafFietspad } = await import('../scenario.rechtsaf-fietspad');
    const { driveRun } = await import('../testDriver');
    const record = driveRun(rechtsafFietspad, { indicatorOff: 'nooit' });
    const row = scoreRun(record, rechtsafFietspad).results.find(
      (r) => r.severity !== null && r.why !== undefined,
    );
    expect(row?.why).toBeDefined();
    if (row?.why?.kind === 'tooEarly' || row?.why?.kind === 'onTheWrongSide') {
      expect(row.why.anchor).toBe('manoeuvre');
    }
  });
});

describe('een regel die niemand aanwijst', () => {
  it('wordt gevonden aan een scenario dat niet door het formulier is gekomen', async () => {
    const { findDanglingTargets } = await import('../validate');
    // Not "is the id empty" but "does the id resolve": a hand-edited file that drops a road user
    // leaves exactly the same silence as never having chosen one.
    const withoutLorry: Scenario = {
      ...uitvoegenSnelweg,
      actors: uitvoegenSnelweg.actors.filter((a) => a.id !== 'weggebruiker-3'),
    };
    expect(findDanglingTargets(withoutLorry).map((d) => d.actorId)).toEqual(['weggebruiker-3']);
  });

  it('en geen enkel scenario dat meegeleverd wordt heeft er een', async () => {
    const { findDanglingTargets } = await import('../validate');
    const { ALL_SCENARIOS } = await import('../scenarios');
    for (const s of ALL_SCENARIOS) expect([s.title, findDanglingTargets(s)]).toEqual([s.title, []]);
  });
});
