import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Two suites, and only one of them pays for a DOM.
 *
 * The simulation is view-agnostic by design and its three hundred-odd tests run in plain Node in
 * about two seconds. Putting all of them behind jsdom to reach a few dozen component tests would
 * tax the suite that gets run constantly for the benefit of the one that does not — and the seam
 * that makes the split possible is the same one that let the renderer be swapped wholesale.
 *
 * Projects rather than `environmentMatchGlobs`, because the setup file has to be scoped too:
 * applied globally it imports Testing Library into every Node test, and those have no DOM to set
 * up. This lived in `vitest.workspace.ts` until Vitest 4 removed `defineWorkspace`; the failure
 * mode was quiet in the worst way — the file was simply ignored, so every UI test ran in Node and
 * reported `document is not defined` as if the tests themselves were wrong.
 *
 * `extends: true` means "inherit this file", so the plugins above apply to both projects without
 * either naming a path back to here.
 */
export default defineConfig({
  plugins: [react()],
  server: { port: 5273, open: false },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'sim',
          environment: 'node',
          include: ['src/sim/**/*.test.ts', 'src/render/**/*.test.ts', 'src/scene/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/ui/**/*.test.{ts,tsx}'],
          setupFiles: ['src/ui/__tests__/setup.ts'],
        },
      },
    ],
  },
});
