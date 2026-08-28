/**
 * What the timeline shows about looking.
 *
 * It drew the expected window and the one press that was credited, and nothing else. So a rider who
 * checked the dode hoek twice saw a single mark and no sign that the other look had happened — and
 * when the credited one is the wrong one, that missing mark is exactly the information needed to
 * understand the verdict. An instructor reported the row as simply wrong, which from that display
 * is a fair reading of it.
 *
 * Driven by a real ride rather than a hand-built record, so the row ids, the control behind each row
 * and the event log are the genuine ones — a fixture would prove only that the component renders
 * whatever it is handed.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Timeline } from '../Timeline';
import { rechtsafFietspad } from '../../sim/scenario.rechtsaf-fietspad';
import { driveRun } from '../../sim/testDriver';
import type { ControlEvent, RunRecord } from '../../sim/types';

const props = {
  currentTime: 0,
  onSeek: vi.fn(),
  selectedId: null,
  onSelect: vi.fn(),
};

/** The lane belonging to one result row, by the row's label. */
function lane(container: HTMLElement, startsWith: string): HTMLElement {
  const row = [...container.querySelectorAll('.timeline-row')].find((el) =>
    el.querySelector('.timeline-label')?.textContent?.trim().startsWith(startsWith),
  );
  if (!row) throw new Error(`geen rij die begint met "${startsWith}"`);
  return row.querySelector('.timeline-lane') as HTMLElement;
}

describe('de tijdlijn laat zien wat je deed', () => {
  it('zet een streepje op elke keer dat je die handeling deed', () => {
    const record = driveRun(rechtsafFietspad, {});
    const { container } = render(<Timeline record={record} {...props} />);
    // The model rider does one schouderblik for the preparation step and one before the bend, so
    // the row for either shows both — what the rider did with that control, not just what counted.
    const shoulders = record.events.filter(
      (e) => e.control === 'SHOULDER_RIGHT' && e.phase === 'press',
    ).length;
    expect(shoulders).toBe(2);
    expect(lane(container, '5.').querySelectorAll('.timeline-look')).toHaveLength(2);
  });

  it('en een tweede blik is zichtbaar naast de eerste', () => {
    // The reported case: checked twice, and the timeline showed one mark. Adding a look must add a
    // mark, or the display is still hiding the thing that explains the verdict.
    const base = driveRun(rechtsafFietspad, {});
    const first = base.events.find((e) => e.control === 'SHOULDER_RIGHT' && e.phase === 'press')!;
    const again: ControlEvent = { ...first, t: first.t + 1 };
    const record: RunRecord = {
      ...base,
      events: [...base.events, again].sort((a, b) => a.t - b.t),
    };
    const { container } = render(<Timeline record={record} {...props} />);
    expect(lane(container, '5.').querySelectorAll('.timeline-look')).toHaveLength(3);
  });

  it('en zegt bij elk streepje wanneer je het deed', () => {
    const record = driveRun(rechtsafFietspad, {});
    const { container } = render(<Timeline record={record} {...props} />);
    const tick = lane(container, '5.').querySelector('.timeline-look');
    expect(tick?.getAttribute('title')).toMatch(/Je deed dit op \d+,\d+s/);
  });

  it('maar zet geen streepjes op een rij die niet over een knop of blik gaat', () => {
    // The headway and speed rows have no control behind them, so there is nothing a rider "did"
    // at a moment — marking them would invent an event.
    const record = driveRun(rechtsafFietspad, {});
    expect(lane(container(record), 'Snelheid').querySelectorAll('.timeline-look')).toHaveLength(0);
  });
});

function container(record: RunRecord): HTMLElement {
  return render(<Timeline record={record} {...props} />).container;
}
