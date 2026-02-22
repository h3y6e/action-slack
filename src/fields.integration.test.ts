/**
 * Integration tests for FieldFactory.
 *
 * Uses real library code (no vi.mock) with undici MockAgent for HTTP interception.
 * Purpose: detect breakage from dependency upgrades that unit tests with vi.mock would miss.
 */
import {
  vi,
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
} from 'vitest';
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from 'undici';
import type { Dispatcher } from 'undici';
import commitFixture from '../fixtures/repos.commits.get.json';
import jobsFixture from '../fixtures/actions.runs.jobs.json';

vi.hoisted(() => {
  const path = require('node:path');
  process.env.GITHUB_EVENT_PATH = path.join(
    __dirname,
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
});

import { context, getOctokit } from '@actions/github';
import { FieldFactory } from './fields';

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
];

describe('FieldFactory (integration)', () => {
  let mockAgent: MockAgent;
  let originalDispatcher: Dispatcher;

  beforeAll(() => {
    originalDispatcher = getGlobalDispatcher();
  });

  afterAll(() => {
    setGlobalDispatcher(originalDispatcher);
  });

  beforeEach(() => {
    mockAgent = new MockAgent();
    setGlobalDispatcher(mockAgent);
    mockAgent.disableNetConnect();

    for (const key of AS_ENV_VARS) {
      delete process.env[key];
    }
  });

  afterEach(async () => {
    await mockAgent.close();
  });

  function interceptGitHubApi(options?: { commit?: object; jobs?: object }) {
    const pool = mockAgent.get('https://api.github.com');

    pool
      .intercept({
        path: '/repos/h3y6e/test/commits/abc123def456789',
        method: 'GET',
      })
      .reply(200, options?.commit ?? commitFixture, {
        headers: { 'content-type': 'application/json' },
      })
      .persist();

    pool
      .intercept({
        path: /^\/repos\/h3y6e\/test\/actions\/runs\/99\/jobs/,
        method: 'GET',
      })
      .reply(200, options?.jobs ?? jobsFixture, {
        headers: { 'content-type': 'application/json' },
      })
      .persist();

    return getOctokit('fake-token');
  }

  function createFactory(
    fields: string,
    octokit: ReturnType<typeof getOctokit>,
    jobName = 'build',
  ) {
    return new FieldFactory(fields, jobName, '', octokit);
  }

  // ── Individual fields ────────────────────────────────────────────────

  describe('repo', () => {
    it('generates a Slack link to the repository', async () => {
      const octokit = interceptGitHubApi();
      const [field] = await createFactory('repo', octokit).attachments();

      expect(field).toEqual({
        title: 'repo',
        value: '<https://github.com/h3y6e/test|h3y6e/test>',
        short: true,
      });
      expect(process.env.AS_REPO).toBe(field.value);
    });
  });

  describe('commit', () => {
    it('generates a Slack link with short SHA', async () => {
      const octokit = interceptGitHubApi();
      const [field] = await createFactory('commit', octokit).attachments();

      expect(field).toEqual({
        title: 'commit',
        value:
          '<https://github.com/h3y6e/test/commit/abc123def456789|abc123de>',
        short: true,
      });
    });
  });

  describe('message', () => {
    it('fetches the commit message and generates a Slack link', async () => {
      const octokit = interceptGitHubApi();
      const [field] = await createFactory('message', octokit).attachments();

      expect(field).toEqual({
        title: 'message',
        value: `<${commitFixture.html_url}|Initial commit>`,
        short: true,
      });
      expect(process.env.AS_MESSAGE).toBe(field.value);
    });
  });

  describe('author', () => {
    it('fetches the commit author name and email', async () => {
      const octokit = interceptGitHubApi();
      const [field] = await createFactory('author', octokit).attachments();

      expect(field).toEqual({
        title: 'author',
        value: 'Octocat <octocat@github.com>',
        short: true,
      });
      expect(process.env.AS_AUTHOR).toBe(field.value);
    });
  });

  describe('eventName', () => {
    it('returns the event name from context', async () => {
      const octokit = interceptGitHubApi();
      const [field] = await createFactory('eventName', octokit).attachments();

      expect(field.value).toBe('push');
    });
  });

  describe('ref', () => {
    it('returns the git ref from context', async () => {
      const octokit = interceptGitHubApi();
      const [field] = await createFactory('ref', octokit).attachments();

      expect(field.value).toBe('refs/heads/main');
    });
  });

  describe('workflow', () => {
    it('generates a Slack link to the checks page', async () => {
      const octokit = interceptGitHubApi();
      const [field] = await createFactory('workflow', octokit).attachments();

      expect(field.value).toBe(
        '<https://github.com/h3y6e/test/commit/abc123def456789/checks|CI>',
      );
    });
  });

  describe('workflowRun', () => {
    it('generates a Slack link to the workflow run', async () => {
      const octokit = interceptGitHubApi();
      const [field] = await createFactory('workflowRun', octokit).attachments();

      expect(field.value).toBe(
        '<https://github.com/h3y6e/test/actions/runs/99|CI>',
      );
    });
  });

  describe('job', () => {
    it('generates a Slack link to the matching job run', async () => {
      const octokit = interceptGitHubApi();
      const [field] = await createFactory('job', octokit).attachments();

      expect(field).toEqual({
        title: 'job',
        value: '<https://github.com/h3y6e/test/runs/42|build>',
        short: true,
      });
      expect(process.env.AS_JOB).toBe(field.value);
    });

    it('returns "Job is not found" when no job name matches', async () => {
      const octokit = interceptGitHubApi({
        jobs: {
          total_count: 1,
          jobs: [{ id: 99, name: 'other-job', status: 'completed' }],
        },
      });
      const [field] = await createFactory('job', octokit).attachments();

      expect(field.value).toContain('Job is not found');
    });
  });

  describe('took', () => {
    it('calculates elapsed time from job start', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-01T12:01:05Z'));

      const octokit = interceptGitHubApi();
      const [field] = await createFactory('took', octokit).attachments();

      expect(field.value).toBe('1 min 5 sec');
      expect(process.env.AS_TOOK).toBe('1 min 5 sec');

      vi.useRealTimers();
    });
  });

  describe('pullRequest', () => {
    let origEventName: string;
    let origPayload: typeof context.payload;

    beforeEach(() => {
      origEventName = context.eventName;
      origPayload = context.payload;
    });

    afterEach(() => {
      context.eventName = origEventName;
      context.payload = origPayload;
    });

    it('returns "n/a" for non-PR events', async () => {
      const octokit = interceptGitHubApi();
      const [field] = await createFactory('pullRequest', octokit).attachments();

      expect(field.value).toBe('n/a');
    });

    it('returns a Slack link with title and number for pull_request events', async () => {
      context.eventName = 'pull_request';
      context.payload = {
        pull_request: {
          number: 42,
          title: 'Add new feature',
          html_url: 'https://github.com/h3y6e/test/pull/42',
          head: { sha: 'pr-sha-123' },
        },
      };

      const octokit = interceptGitHubApi();
      const [field] = await createFactory('pullRequest', octokit).attachments();

      expect(field.value).toBe(
        '<https://github.com/h3y6e/test/pull/42|Add new feature #42>',
      );
      expect(process.env.AS_PULL_REQUEST).toBe(field.value);
    });

    it('also works for pull_request_target events', async () => {
      context.eventName = 'pull_request_target';
      context.payload = {
        pull_request: {
          number: 7,
          title: 'Security fix',
          html_url: 'https://github.com/h3y6e/test/pull/7',
          head: { sha: 'target-sha-456' },
        },
      };

      const octokit = interceptGitHubApi();
      const [field] = await createFactory('pullRequest', octokit).attachments();

      expect(field.value).toBe(
        '<https://github.com/h3y6e/test/pull/7|Security fix #7>',
      );
    });

    it('escapes &, <, > in the PR title', async () => {
      context.eventName = 'pull_request';
      context.payload = {
        pull_request: {
          number: 3,
          title: 'Fix <script> & "quotes"',
          html_url: 'https://github.com/h3y6e/test/pull/3',
          head: { sha: 'escape-sha' },
        },
      };

      const octokit = interceptGitHubApi();
      const [field] = await createFactory('pullRequest', octokit).attachments();

      expect(field.value).toContain('&lt;script&gt;');
      expect(field.value).toContain('&amp;');
    });
  });

  // ── fields: "all" ────────────────────────────────────────────────────

  describe('fields: "all"', () => {
    it('returns all 12 fields in the canonical order', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-01T12:01:05Z'));

      const octokit = interceptGitHubApi();
      const result = await createFactory('all', octokit).attachments();
      const titles = result.map(f => f.title);

      expect(titles).toEqual([
        'repo',
        'message',
        'commit',
        'author',
        'action',
        'job',
        'took',
        'eventName',
        'ref',
        'workflow',
        'workflowRun',
        'pullRequest',
      ]);

      vi.useRealTimers();
    });
  });

  // ── PR event: workflow/action links use PR head SHA ──────────────────

  describe('PR event effects on other fields', () => {
    let origEventName: string;
    let origPayload: typeof context.payload;

    beforeEach(() => {
      origEventName = context.eventName;
      origPayload = context.payload;
    });

    afterEach(() => {
      context.eventName = origEventName;
      context.payload = origPayload;
    });

    it('workflow and action links use PR head SHA instead of context.sha', async () => {
      context.eventName = 'pull_request';
      context.payload = {
        pull_request: {
          number: 5,
          title: 'PR test',
          html_url: 'https://github.com/h3y6e/test/pull/5',
          head: { sha: 'pr-head-sha-999' },
        },
      };

      const octokit = interceptGitHubApi();
      const result = await createFactory(
        'workflow,action',
        octokit,
      ).attachments();

      const workflow = result.find(f => f.title === 'workflow');
      expect(workflow?.value).toContain('pr-head-sha-999');
      expect(workflow?.value).not.toContain('abc123def456789');

      const action = result.find(f => f.title === 'action');
      expect(action?.value).toContain('pr-head-sha-999');
    });
  });

  // ── Job name matching ────────────────────────────────────────────────

  describe('job name matching', () => {
    afterEach(() => {
      delete process.env.MATRIX_CONTEXT;
    });

    it('matches matrix job name: "build (ubuntu-latest, 18)"', async () => {
      const octokit = interceptGitHubApi({
        jobs: {
          total_count: 1,
          jobs: [
            {
              id: 55,
              name: 'build (ubuntu-latest, 18)',
              started_at: '2024-01-01T12:00:00Z',
            },
          ],
        },
      });
      const factory = createFactory(
        'job',
        octokit,
        'build (ubuntu-latest, 18)',
      );
      const [field] = await factory.attachments();

      expect(field.value).toContain('/runs/55|');
      expect(field.value).toContain('build (ubuntu-latest, 18)');
    });

    it('matches custom job_name for renamed jobs', async () => {
      const octokit = interceptGitHubApi({
        jobs: {
          total_count: 1,
          jobs: [
            {
              id: 77,
              name: 'Custom Test',
              started_at: '2024-01-01T12:00:00Z',
            },
          ],
        },
      });
      const factory = createFactory('job', octokit, 'Custom Test');
      const [field] = await factory.attachments();

      expect(field.value).toContain('/runs/77|');
      expect(field.value).toContain('Custom Test');
    });

    it('matches workflow prefix format: "CI / build" matches jobName "build"', async () => {
      const octokit = interceptGitHubApi({
        jobs: {
          total_count: 1,
          jobs: [
            {
              id: 66,
              name: 'CI / build',
              started_at: '2024-01-01T12:00:00Z',
            },
          ],
        },
      });
      const factory = createFactory('job', octokit, 'build');
      const [field] = await factory.attachments();

      expect(field.value).toContain('/runs/66|');
    });

    it('ignores MATRIX_CONTEXT when value is "null"', async () => {
      process.env.MATRIX_CONTEXT = 'null';

      const octokit = interceptGitHubApi();
      const factory = createFactory('job', octokit, 'build');
      const [field] = await factory.attachments();

      expect(field.value).toContain('build');
      expect(field.value).not.toContain('(');
    });
  });
});
