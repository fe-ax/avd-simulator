/**
 * Not an assertion suite: a tuning harness. It prints where the snorfiets actually sits relative
 * to the rider through the approach, which is how the scenario's start distance and director
 * band get set. Run with `npx vitest run tune`.
 */
import { test } from 'vitest';
import { rechtsafFietspad } from '../scenario.rechtsaf-fietspad';
import { driveRun, type Probe } from '../testDriver';

/** Quiet unless asked: `AVD_TUNE=1 npx vitest run tune`. */
const VERBOSE = process.env.AVD_TUNE === '1';
const report = (...args: unknown[]) => {
  if (VERBOSE) console.log(...args);
};

function table(rows: Probe[]) {
  const wanted = [90, 80, 70, 60, 50, 40, 32, 24, 18, 14, 10, 6, 3, 0, -2];
  const lines: string[] = ['   d(m)   t(s)  km/u   gap    brg  afst  mode      gezien'];
  for (const target of wanted) {
    const row = rows.find((r) => r.d <= target);
    if (!row) continue;
    lines.push(
      [
        row.d.toFixed(1).padStart(7),
        row.t.toFixed(1).padStart(6),
        row.speedKmh.toFixed(1).padStart(6),
        row.gap.toFixed(1).padStart(6),
        row.bearing.toFixed(0).padStart(6),
        row.dist.toFixed(1).padStart(6),
        `  ${row.mode}`.padEnd(11),
        row.perceived ? 'ja' : 'nee',
      ].join(''),
    );
  }
  return lines.join('\n');
}

test('tuning: ideal ride', () => {
  const rows: Probe[] = [];
  const record = driveRun(rechtsafFietspad, { onSample: (p) => rows.push(p) });
  report('\n=== IDEALE RIT ===\n' + table(rows));
  report(
    `verdict=${record.verdict} tellingen=${JSON.stringify(record.counts)} ` +
      `branch=${record.branch} duur=${record.durationS.toFixed(1)}s ` +
      `incidents=${record.incidents.length}`,
  );
  for (const r of record.results) {
    report(
      `  ${r.status.padEnd(9)} ${(r.severity ?? '-').padEnd(9)} ${r.label}` +
        (r.actualT !== null ? ` @ ${r.actualT.toFixed(1)}s` : ''),
    );
  }
});

test('tuning: geen schouderblik', () => {
  const rows: Probe[] = [];
  const record = driveRun(rechtsafFietspad, {
    shoulder: false,
    yieldToActor: false,
    onSample: (p) => rows.push(p),
  });
  report('\n=== ZONDER SCHOUDERBLIK, GEEN VOORRANG ===\n' + table(rows));
  report(
    `verdict=${record.verdict} tellingen=${JSON.stringify(record.counts)} ` +
      `incidents=${JSON.stringify(record.incidents)}`,
  );
  for (const r of record.results.filter((x) => x.severity)) {
    report(`  ${r.status.padEnd(9)} ${r.severity} — ${r.label}`);
  }
});
