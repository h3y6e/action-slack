/**
 * Vitest global setup file.
 *
 * Runs before each test file. Provides:
 * 1. GITHUB_* environment variables required by @actions/github context
 *    (unit tests override context via vi.mock, so these are harmless there)
 * 2. afterEach hook to clean up AS_* env vars set by FieldFactory
 */
import { afterEach } from 'vitest';
import { join } from 'node:path';

// ── GitHub Actions environment ─────────────────────────────────────────
process.env.GITHUB_EVENT_PATH = join(
  import.meta.dirname,
  '..',
  'fixtures',
  'event.push.json',
);
process.env.GITHUB_REPOSITORY = 'h3y6e/test';
process.env.GITHUB_SHA = 'abc123def456789';
process.env.GITHUB_REF = 'refs/heads/main';
process.env.GITHUB_WORKFLOW = 'CI';
process.env.GITHUB_RUN_ID = '99';
process.env.GITHUB_JOB = 'build';
process.env.GITHUB_EVENT_NAME = 'push';
process.env.GITHUB_ACTION = 'run';

// ── AS_* env var cleanup ───────────────────────────────────────────────
const AS_ENV_VARS = [
  'AS_REPO',
  'AS_COMMIT',
  'AS_MESSAGE',
  'AS_AUTHOR',
  'AS_ACTION',
  'AS_JOB',
  'AS_TOOK',
  'AS_EVENT_NAME',
  'AS_REF',
  'AS_WORKFLOW',
  'AS_WORKFLOW_RUN',
  'AS_PULL_REQUEST',
] as const;

afterEach(() => {
  for (const key of AS_ENV_VARS) {
    delete process.env[key];
  }
});
