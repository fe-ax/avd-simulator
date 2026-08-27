/**
 * What the validation panel actually says.
 *
 * This is the half of the tool an instructor reads, and until now every claim about its wording was
 * verified by me driving a browser and looking. That worked, and it does not survive the next
 * change: the difference between *"ook een slordige rijder haalt dit"* and *"geen enkele slordige
 * rit werd hierop gemeten"* is one that took a day to work out and is one careless edit from being
 * collapsed back into a single sentence.
 *
 * The panel is a pure function of its props, so these are cheap. They assert the distinctions, not
 * the phrasing — a rewording that keeps the meaning should not turn this red.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ValidationPanel, type Validation } from '../builder/Validation';
import type { RunRecord } from '../../sim/types';

const cleanRecord = {
  verdict: 'geslaagd',
  counts: { opmerking: 0, fout: 0, kritiek: 0 },
  faults: [],
} as unknown as RunRecord;

const base: Validation = {
  record: cleanRecord,
  error: null,
  obstructions: [],
  offRoad: [],
  unscored: [],
  inheritedFrom: null,
  reveals: [],
  discrimination: [],
};

const rule = (over: Partial<Validation['discrimination'][number]>) => ({
  expectedId: 'r1',
  label: '1. Afremmen',
  modelPasses: true,
  failedBy: [] as string[],
  testedBy: [] as string[],
  ...over,
});

describe('de modelrit', () => {
  it('zegt dat een schone rit slaagt', () => {
    render(<ValidationPanel {...base} />);
    expect(screen.getByText(/Een rijder die alles goed doet, haalt dit\./)).toBeInTheDocument();
  });

  it('en zegt het ook als hij dat niet doet', () => {
    const failed = {
      ...cleanRecord,
      verdict: 'gezakt',
      counts: { opmerking: 0, fout: 1, kritiek: 0 },
      faults: [{ expectedId: 'r1', label: '1. Afremmen', explanation: 'te hard' }],
    } as unknown as RunRecord;
    render(<ValidationPanel {...base} record={failed} />);
    expect(screen.getByText(/haalt dit niet/)).toBeInTheDocument();
    expect(screen.getByText('te hard')).toBeInTheDocument();
  });
});

describe('regels die niets onderscheiden', () => {
  it('noemt een regel die ook een slordige rijder haalt', () => {
    render(
      <ValidationPanel
        {...base}
        discrimination={[rule({ failedBy: [], testedBy: ['wie niet kijkt'] })]}
      />,
    );
    expect(screen.getByText(/te ruim/)).toBeInTheDocument();
  });

  it('zegt iets ánders over een regel waar niemand op gemeten is', () => {
    // The distinction that cost a day: a rule nobody failed is soft and wants sharpening; a rule
    // nobody was measured against cannot be sharpened into usefulness at all, because the mistake
    // takes the rider out of its scope entirely.
    render(<ValidationPanel {...base} discrimination={[rule({ failedBy: [], testedBy: [] })]} />);
    expect(screen.getByText(/komt niet eens aan deze regel toe/)).toBeInTheDocument();
    expect(screen.queryByText(/te ruim/)).not.toBeInTheDocument();
  });

  it('en zwijgt erover als elke regel iets vangt', () => {
    render(
      <ValidationPanel
        {...base}
        discrimination={[rule({ failedBy: ['wie niet kijkt'], testedBy: ['wie niet kijkt'] })]}
      />,
    );
    expect(screen.getByText(/Elke regel vangt iets/)).toBeInTheDocument();
    expect(screen.queryByText(/onderscheid/i)).not.toBeInTheDocument();
  });
});

describe('wanneer zie je ze', () => {
  const reveal = (over: Partial<Validation['reveals'][number]>) => ({
    actorId: 'a',
    label: 'Auto van rechts',
    full: 3.4,
    noMirrors: 3.4,
    noLooks: 7.9,
    ...over,
  });

  it('zegt bij een kruispunt dat de spiegels niets toevoegen, zonder dat een fout te noemen', () => {
    render(<ValidationPanel {...base} reveals={[reveal({})]} />);
    expect(screen.getByText(/spiegels voegen hier niets toe/)).toBeInTheDocument();
    expect(screen.queryByText(/leert dus niets/)).not.toBeInTheDocument();
  });

  it('waarschuwt wel als geen enkele manier van rijden iets verandert — maar alleen bij één zo een', () => {
    render(
      <ValidationPanel
        {...base}
        reveals={[reveal({ noLooks: 3.4 }), reveal({ actorId: 'b', label: 'Auto twee' })]}
      />,
    );
    expect(screen.getByText(/leert dus niets/)).toBeInTheDocument();
  });

  it('en noemt het rustig, één keer, als álles even vroeg gezien wordt', () => {
    // Every row flat is a fact about the road — on an open stretch everything is ahead of you or
    // comes past you. Four warnings there push an author to fix a scenario that is right.
    render(
      <ValidationPanel
        {...base}
        reveals={[
          reveal({ noLooks: 3.4 }),
          reveal({ actorId: 'b', label: 'Auto twee', noLooks: 3.4 }),
        ]}
      />,
    );
    expect(screen.getByText(/alles rijdt vóór je of komt langs je heen/)).toBeInTheDocument();
    expect(screen.queryByText(/leert dus niets/)).not.toBeInTheDocument();
  });

  it('en zegt het als iemand nooit in beeld komt', () => {
    render(<ValidationPanel {...base} reveals={[reveal({ full: null })]} />);
    expect(screen.getByText(/komt nooit in beeld/)).toBeInTheDocument();
  });
});

describe('een onrijdbaar scenario', () => {
  it('laat de fout zien in plaats van een leeg paneel', () => {
    render(<ValidationPanel {...base} error="turnInY + turnRadius !== sideLaneCenterY" />);
    expect(screen.getByText(/Onrijdbaar/)).toBeInTheDocument();
    expect(screen.getByText(/sideLaneCenterY/)).toBeInTheDocument();
  });
});
