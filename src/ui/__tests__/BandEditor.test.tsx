/**
 * The rungs of a banded rule.
 *
 * Two things are worth pinning here and neither is about rendering. **Order is the semantics** —
 * both scorers take the first band that matches, so moving a rung changes what the rule means, and
 * a reorder that silently did nothing would be the worst possible bug in this editor. And **the two
 * outcome shapes must not blend**: a praise string and a severity-plus-explanation share no field,
 * so switching between them has to replace rather than merge, or a scenario exports a sentence
 * nobody chose.
 *
 * The last test rides an edited rule through the real scorer, because a band editor that produces
 * a shape `scoreSpeedBand` cannot read produces no row at all — silently.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HeadwayBands, SpeedBands } from '../builder/BandEditor';
import { referenceRide } from '../../sim/referenceRide';
import { scoreRun } from '../../sim/scoring';
import { inhalenSnelweg } from '../../sim/scenario.inhalen-snelweg';
import type { ExpectedAction, Scenario, SpeedBand } from '../../sim/types';

const speedBands: SpeedBand[] = [
  { fromKmh: 100, toKmh: 130, outcome: { praise: 'Goed tempo.' } },
  { fromKmh: 95, toKmh: 100, outcome: { severity: 'opmerking', explanation: 'Iets traag.' } },
];

describe('de treden van een snelheidsregel', () => {
  it('laat elke tree zien, inclusief de tekst die de rijder leest', () => {
    render(<SpeedBands bands={speedBands} onChange={vi.fn()} />);
    expect(screen.getByDisplayValue('Goed tempo.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Iets traag.')).toBeInTheDocument();
  });

  it('en zegt dat wat nergens in past terugvalt op de regel zelf', () => {
    render(<SpeedBands bands={speedBands} onChange={vi.fn()} />);
    expect(screen.getByText(/valt terug op de uitleg bij gemist/)).toBeInTheDocument();
  });

  it('verschuift een tree echt, want de volgorde ís de betekenis', () => {
    const onChange = vi.fn();
    render(<SpeedBands bands={speedBands} onChange={onChange} />);
    screen.getAllByTitle('Later beoordelen')[0].click();
    const next = onChange.mock.calls.at(-1)![0] as SpeedBand[];
    expect(next.map((b) => b.fromKmh)).toEqual([95, 100]);
  });

  it('en doet niets als er niets te verschuiven valt', () => {
    const onChange = vi.fn();
    render(<SpeedBands bands={speedBands} onChange={onChange} />);
    screen.getAllByTitle('Eerder beoordelen')[0].click();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('verandert de tree die je bewerkt en niet zijn buurman', () => {
    const onChange = vi.fn();
    render(<SpeedBands bands={speedBands} onChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue('Iets traag.'), { target: { value: 'Te traag.' } });
    const next = onChange.mock.calls.at(-1)![0] as SpeedBand[];
    expect(next[0]).toEqual(speedBands[0]);
    expect(next[1].outcome).toEqual({ severity: 'opmerking', explanation: 'Te traag.' });
  });

  it('vervangt de uitkomst bij het omzetten van goed naar fout, en mengt hem niet', () => {
    // The two shapes share no field. Keeping the old praise around "in case you switch back" is how
    // a scenario ends up exporting a sentence nobody chose.
    const onChange = vi.fn();
    render(<SpeedBands bands={speedBands} onChange={onChange} />);
    screen.getAllByRole('button', { name: 'Fout' })[0].click();
    const next = onChange.mock.calls.at(-1)![0] as SpeedBand[];
    expect(next[0].outcome).not.toHaveProperty('praise');
    expect(next[0].outcome).toEqual({ severity: 'fout', explanation: '' });
  });

  it('voegt een tree toe die onder de laatste ligt in plaats van erbovenop', () => {
    const onChange = vi.fn();
    render(<SpeedBands bands={speedBands} onChange={onChange} />);
    screen.getByRole('button', { name: '+ Tree' }).click();
    const next = onChange.mock.calls.at(-1)![0] as SpeedBand[];
    expect(next).toHaveLength(3);
    expect(next[2].toKmh).toBe(95);
  });

  it('verwijdert alleen de tree waar je op drukt', () => {
    const onChange = vi.fn();
    render(<SpeedBands bands={speedBands} onChange={onChange} />);
    screen.getAllByRole('button', { name: 'Weg' })[1].click();
    const next = onChange.mock.calls.at(-1)![0] as SpeedBand[];
    expect(next.map((b) => b.fromKmh)).toEqual([100]);
  });
});

describe('de treden van een volgafstandregel', () => {
  it('laat per tree kiezen of hij vóór of achter je geldt', () => {
    const onChange = vi.fn();
    render(
      <HeadwayBands
        bands={[{ atLeastSeconds: 2, outcome: { praise: 'Genoeg afstand.' } }]}
        onChange={onChange}
      />,
    );
    screen.getByRole('button', { name: 'Alleen vóór je' }).click();
    expect(onChange.mock.calls.at(-1)![0][0].side).toBe('ahead');
  });

  it('en "voor en achter" betekent geen kant, niet de kant "beide"', () => {
    // `side` is optional in the data and absent means both. Writing the string 'beide' would be a
    // value `scoreHeadway` never compares against, so the band would match nothing.
    const onChange = vi.fn();
    render(
      <HeadwayBands
        bands={[{ atLeastSeconds: 2, side: 'ahead', outcome: { praise: 'ok' } }]}
        onChange={onChange}
      />,
    );
    screen.getByRole('button', { name: 'Voor en achter' }).click();
    expect(onChange.mock.calls.at(-1)![0][0].side).toBeUndefined();
  });
});

describe('een bewerkte regel blijft iets wat de scorer kan lezen', () => {
  it('rijdt en scoort na het verschuiven van een tree', () => {
    const onChange = vi.fn();
    render(<SpeedBands bands={speedBands} onChange={onChange} />);
    screen.getAllByTitle('Later beoordelen')[0].click();
    const bands = onChange.mock.calls.at(-1)![0] as SpeedBand[];

    const rule = inhalenSnelweg.expected.find((e) => e.kind.type === 'speedBand') as ExpectedAction;
    const scenario: Scenario = {
      ...inhalenSnelweg,
      expected: [{ ...rule, kind: { type: 'speedBand', bands } }],
    };
    const { record, error } = referenceRide(scenario);
    expect(error).toBeNull();
    // A row, not silence: a shape the scorer cannot read simply produces nothing.
    expect(scoreRun(record, scenario).results).toHaveLength(1);
  });
});
