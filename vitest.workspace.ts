/**
 * Two suites, and only one of them pays for a DOM.
 *
 * The simulation is view-agnostic by design and its two hundred-odd tests run in plain Node in
 * under two seconds. Putting all of them behind jsdom to reach a dozen component tests would tax
 * the suite that gets run constantly for the benefit of the one that does not — and the seam that
 * makes the split possible is the same one that let the renderer be swapped wholesale.
 *
 * A workspace rather than `environmentMatchGlobs`, because the setup file has to be scoped too:
 * applied globally it imports Testing Library into every Node test, and those have no DOM to set up.
 */
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    extends: './vite.config.ts',
    test: {
      name: 'sim',
      environment: 'node',
      include: ['src/sim/**/*.test.ts', 'src/render/**/*.test.ts', 'src/scene/**/*.test.ts'],
    },
  },
  {
    extends: './vite.config.ts',
    test: {
      name: 'ui',
      environment: 'jsdom',
      include: ['src/ui/**/*.test.{ts,tsx}'],
      setupFiles: ['src/ui/__tests__/setup.ts'],
    },
  },
]);
