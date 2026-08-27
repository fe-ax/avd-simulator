/**
 * Getting a file out of the browser and back into it.
 *
 * Deliberately not in `src/sim/`: this is all Blob, anchor and file input, and the rule that the
 * simulation imports nothing from a view exists so the simulation stays testable without one. What
 * a file *contains* is `sim/scenarioFile.ts`; how it leaves the machine is here.
 */

/** Save `text` as a download. The object URL is revoked once the click has been dispatched. */
export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // A microtask is not enough on Safari; a frame is, and leaking one URL would be worse than
  // waiting one.
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}

/**
 * Ask for one file and read it as text.
 *
 * Resolves to null when the picker is dismissed. There is no cancel event on a file input, so a
 * dismissed picker simply never fires `change` — which means this promise is allowed to never
 * settle, and every caller has to be written so that is harmless (no spinner, no disabled button).
 */
export function pickTextFile(accept = '.json,application/json'): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      file
        .text()
        .then(resolve)
        .catch(() => resolve(null))
        .finally(() => input.remove());
    });
    input.style.display = 'none';
    document.body.appendChild(input);
    input.click();
  });
}
