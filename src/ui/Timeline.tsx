/**
 * Scrubbable timeline: what should have happened versus what did.
 *
 * The expected bands are drawn in seconds even though the scenario authors them in metres —
 * `scoring.ts` converts each window using this run's own s(t), so the bands sit where they
 * really were for this rider rather than where they would be for an average one.
 *
 * This component is the direct ancestor of the future editing timeline, so it takes results and
 * a time and emits a seek, and knows nothing about the engine.
 */
import { useCallback, useRef } from 'react';
import type { ActionResult, RunRecord } from '../sim/types';

interface Props {
  record: RunRecord;
  currentTime: number;
  onSeek: (t: number) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

const STATUS_CLASS: Record<ActionResult['status'], string> = {
  goed: 'ok',
  'te vroeg': 'early',
  'te laat': 'late',
  gemist: 'missed',
  ongewenst: 'unwanted',
};

export function Timeline({ record, currentTime, onSeek, selectedId, onSelect }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const duration = Math.max(record.durationS, 0.001);
  const pct = (t: number) => `${Math.max(0, Math.min(100, (t / duration) * 100))}%`;

  const seekFromEvent = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      onSeek(((clientX - rect.left) / rect.width) * duration);
    },
    [duration, onSeek],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    seekFromEvent(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.buttons === 1) seekFromEvent(e.clientX);
  };

  const ticks = Math.ceil(duration);

  return (
    <div className="timeline">
      <div className="timeline-rows">
        {record.results.map((r) => (
          <div
            key={r.expectedId}
            className={`timeline-row${selectedId === r.expectedId ? ' selected' : ''}`}
            onClick={() => {
              onSelect(selectedId === r.expectedId ? null : r.expectedId);
              if (r.actualT !== null) onSeek(r.actualT);
              else if (r.windowT) onSeek(r.windowT[1]);
            }}
          >
            <div className={`timeline-label sev-${r.severity ?? 'none'}`}>
              <span className={`dot ${STATUS_CLASS[r.status]}`} />
              {r.label}
            </div>
            <div className="timeline-lane">
              {r.windowT && (
                <div
                  className="timeline-band"
                  style={{
                    left: pct(r.windowT[0]),
                    width: pct(Math.max(0, r.windowT[1] - r.windowT[0])),
                  }}
                  title="Verwacht venster"
                />
              )}
              {r.actualT !== null && (
                <div
                  className={`timeline-marker ${STATUS_CLASS[r.status]} sev-${r.severity ?? 'none'}`}
                  style={{ left: pct(r.actualT) }}
                  title={`${r.label} — ${r.status} (${r.actualT.toFixed(1).replace('.', ',')}s)`}
                />
              )}
              {r.actualT === null && r.status === 'gemist' && (
                <div
                  className="timeline-miss"
                  style={{
                    left: r.windowT ? pct(r.windowT[0]) : '0%',
                    width: r.windowT ? pct(Math.max(0, r.windowT[1] - r.windowT[0])) : '100%',
                  }}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      <div
        className="timeline-scrub"
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        role="slider"
        aria-label="Tijdlijn"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={currentTime}
        tabIndex={0}
      >
        {Array.from({ length: ticks + 1 }, (_, i) => (
          <span key={i} className="timeline-tick" style={{ left: pct(i) }}>
            {i % 5 === 0 ? `${i}s` : ''}
          </span>
        ))}
        <div className="timeline-playhead" style={{ left: pct(currentTime) }} />
      </div>
    </div>
  );
}
