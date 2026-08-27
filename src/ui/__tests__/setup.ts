/**
 * Shared setup for the component tests.
 *
 * `jest-dom` for the matchers, and a `localStorage` that is genuinely empty at the start of each
 * test. jsdom provides one, but it persists across tests in a file — and every one of these tests
 * is about storage, so a leaked scenario from the test above is the exact failure mode.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});
