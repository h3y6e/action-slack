/**
 * Integration tests for Client.
 *
 * Uses real library code (no vi.mock) with HTTP interception:
 * - undici MockAgent for GitHub API (Octokit uses undici fetch directly)
 * - msw for Slack webhook (@slack/webhook uses axios -> node:http)
 *
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
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
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

import { context } from '@actions/github';
import { Client, Success, Failure, Cancelled } from './client';
import type { With } from './client';

// ── Slack webhook mock ─────────────────────────────────────────────────
const WEBHOOK_URL = 'https://hooks.slack.com/services/T00/B00/xxxx';
const slackRequests: { body: unknown }[] = [];

const mswServer = setupServer(
  http.post(WEBHOOK_URL, async ({ request }) => {
    const body = await request.json();
    slackRequests.push({ body });
    return HttpResponse.json({ ok: true });
  }),
);

// ── Defaults ───────────────────────────────────────────────────────────
const defaultWith: With = {
  status: Success,
  mention: '',
  author_name: '',
  if_mention: '',
  username: 'bot',
  icon_emoji: '',
  icon_url: '',
  channel: '',
  fields: 'repo,commit',
  job_name: '',
  success_message: 'Succeeded GitHub Actions',
  cancelled_message: 'Cancelled GitHub Actions',
  failure_message: 'Failed GitHub Actions',
};

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

// ── Test suite ─────────────────────────────────────────────────────────
describe('Client (integration)', () => {
  let mockAgent: MockAgent;
  let originalDispatcher: Dispatcher;
  let originalExitCode: typeof process.exitCode;

  beforeAll(() => {
    originalDispatcher = getGlobalDispatcher();
    mswServer.listen({ onUnhandledRequest: 'bypass' });
  });

  afterAll(() => {
    mswServer.close();
    setGlobalDispatcher(originalDispatcher);
  });

  beforeEach(() => {
    mockAgent = new MockAgent();
    setGlobalDispatcher(mockAgent);
    mockAgent.disableNetConnect();
    mockAgent.enableNetConnect(host => host.includes('hooks.slack.com'));

    slackRequests.length = 0;
    originalExitCode = process.exitCode;

    for (const key of AS_ENV_VARS) {
      delete process.env[key];
    }
    delete process.env.MATRIX_CONTEXT;
  });

  afterEach(async () => {
    process.exitCode = originalExitCode;
    mswServer.resetHandlers();
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
  }

  function createClient(props: Partial<With> = {}) {
    return new Client(
      { ...defaultWith, ...props },
      'fake-token',
      '',
      WEBHOOK_URL,
    );
  }

  // ── Construction ───────────────────────────────────────────────────

  describe('constructor', () => {
    it('creates an instance with real dependencies', () => {
      interceptGitHubApi();
      expect(createClient()).toBeDefined();
    });

    it('throws when webhook URL is empty', () => {
      expect(() => new Client(defaultWith, 'fake-token', '', '')).toThrow(
        'Specify secrets.SLACK_WEBHOOK_URL',
      );
    });
  });

  // ── prepare() ──────────────────────────────────────────────────────

  describe('prepare()', () => {
    it('sets text, username, color, and default fields (repo, commit)', async () => {
      interceptGitHubApi();
      const payload = await createClient().prepare('Build passed');

      expect(payload.text).toBe('Build passed');
      expect(payload.username).toBe('bot');
      expect(payload.attachments[0].color).toBe('good');
      expect(
        payload.attachments[0].fields.map((f: { title: string }) => f.title),
      ).toEqual(['repo', 'commit']);
    });

    it('maps status to color: failure -> danger', async () => {
      interceptGitHubApi();
      const payload = await createClient({ status: Failure }).prepare('');

      expect(payload.attachments[0].color).toBe('danger');
    });

    it('maps status to color: cancelled -> warning', async () => {
      interceptGitHubApi();
      const payload = await createClient({ status: Cancelled }).prepare('');

      expect(payload.attachments[0].color).toBe('warning');
    });

    it('uses default status message when text is empty', async () => {
      interceptGitHubApi();
      const payload = await createClient({ status: Failure }).prepare('');

      expect(payload.text).toBe('Failed GitHub Actions');
    });

    it('uses provided text over default status message', async () => {
      interceptGitHubApi();
      const payload = await createClient().prepare('Custom text');

      expect(payload.text).toBe('Custom text');
    });

    it('generates all 11 documented fields', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-01T12:01:05Z'));

      interceptGitHubApi();
      const payload = await createClient({
        status: Success,
        fields:
          'repo,message,commit,author,action,eventName,ref,workflow,job,took,pullRequest',
      }).prepare('');

      const titles = payload.attachments[0].fields.map(
        (f: { title: string }) => f.title,
      );
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
        'pullRequest',
      ]);

      vi.useRealTimers();
    });
  });

  // ── send() ─────────────────────────────────────────────────────────

  describe('send()', () => {
    it('delivers a prepared payload to the Slack webhook', async () => {
      interceptGitHubApi();
      const client = createClient();
      await client.send(await client.prepare('Hello'));

      expect(slackRequests).toHaveLength(1);
      const sent = slackRequests[0].body as Record<string, unknown>;
      expect(sent.text).toBe('Hello');
      expect(sent.username).toBe('bot');
    });

    it('delivers a string payload (webhook wraps it as { text })', async () => {
      interceptGitHubApi();
      await createClient().send('Simple text');

      const sent = slackRequests[0].body as Record<string, unknown>;
      expect(sent.text).toBe('Simple text');
    });
  });

  // ── mention ────────────────────────────────────────────────────────

  describe('mention', () => {
    it('does not mention when if_mention does not match status', async () => {
      interceptGitHubApi();
      const payload = await createClient({
        status: Success,
        mention: 'here',
        if_mention: 'failure',
      }).prepare('');

      expect(payload.text).toBe('Succeeded GitHub Actions');
    });

    it('mention: "here" -> <!here>', async () => {
      interceptGitHubApi();
      const payload = await createClient({
        status: Failure,
        mention: 'here',
        if_mention: 'failure',
      }).prepare('');

      expect(payload.text).toBe('<!here> Failed GitHub Actions');
    });

    it('mention: "channel" -> <!channel>', async () => {
      interceptGitHubApi();
      const payload = await createClient({
        status: Failure,
        mention: 'channel',
        if_mention: 'failure',
      }).prepare('');

      expect(payload.text).toBe('<!channel> Failed GitHub Actions');
    });

    it('mention: "subteam^ID" -> <!subteam^ID>', async () => {
      interceptGitHubApi();
      const payload = await createClient({
        status: Failure,
        mention: 'subteam^S012ABC3Y4Z',
        if_mention: 'failure',
      }).prepare('');

      expect(payload.text).toBe('<!subteam^S012ABC3Y4Z> Failed GitHub Actions');
    });

    it('mention: "user1,user2" -> <@user1> <@user2>', async () => {
      interceptGitHubApi();
      const payload = await createClient({
        status: Failure,
        mention: 'user1,user2',
        if_mention: 'failure',
      }).prepare('');

      expect(payload.text).toBe('<@user1> <@user2> Failed GitHub Actions');
    });

    it('if_mention: "failure,cancelled" matches cancelled status', async () => {
      interceptGitHubApi();
      const payload = await createClient({
        status: Cancelled,
        mention: 'here',
        if_mention: 'failure,cancelled',
      }).prepare('');

      expect(payload.text).toBe('<!here> Cancelled GitHub Actions');
    });

    it('if_mention: "always" matches any status', async () => {
      interceptGitHubApi();
      const payload = await createClient({
        status: Success,
        mention: 'here',
        if_mention: 'always',
      }).prepare('');

      expect(payload.text).toBe('<!here> Succeeded GitHub Actions');
    });
  });

  // ── Payload properties ─────────────────────────────────────────────

  describe('payload properties', () => {
    it('author_name appears in attachment', async () => {
      interceptGitHubApi();
      const payload = await createClient({
        author_name: 'my workflow',
      }).prepare('');

      expect(payload.attachments[0].author_name).toBe('my workflow');
    });

    it('icon_emoji appears in payload', async () => {
      interceptGitHubApi();
      const payload = await createClient({ icon_emoji: ':octocat:' }).prepare(
        '',
      );

      expect(payload.icon_emoji).toBe(':octocat:');
    });

    it('icon_url appears in payload', async () => {
      interceptGitHubApi();
      const payload = await createClient({
        icon_url: 'http://example.com/icon.png',
      }).prepare('');

      expect(payload.icon_url).toBe('http://example.com/icon.png');
    });

    it('channel appears in payload', async () => {
      interceptGitHubApi();
      const payload = await createClient({ channel: '#general' }).prepare('');

      expect(payload.channel).toBe('#general');
    });

    it('username appears in payload', async () => {
      interceptGitHubApi();
      const payload = await createClient({ username: 'deploy-bot' }).prepare(
        '',
      );

      expect(payload.username).toBe('deploy-bot');
    });
  });

  // ── custom() ───────────────────────────────────────────────────────

  describe('custom()', () => {
    it('populates AS_* env vars from fields and evaluates the template', async () => {
      interceptGitHubApi();
      const result = await createClient({ fields: 'repo,message' }).custom(
        '{ text: `${process.env.AS_REPO} - ${process.env.AS_MESSAGE}` }',
      );

      expect(result.text).toContain('h3y6e/test');
      expect(result.text).toContain('Initial commit');
    });

    it('evaluates JS expressions: toLowerCase(), split().reverse().join()', async () => {
      interceptGitHubApi();
      const result = await createClient({ fields: 'repo' }).custom(`{
        text: "Custom Field Check",
        attachments: [{
          "author_name": "h3y6e@action-slack",
          fallback: 'fallback',
          color: 'good',
          title: 'CI Result',
          text: 'Succeeded',
          fields: [{
            title: 'lower case',
            value: 'LOWER CASE CHECK'.toLowerCase(),
            short: true
          },
          {
            title: 'reverse',
            value: 'gnirts esrever'.split('').reverse().join(''),
            short: true
          },
          {
            title: 'long title1',
            value: 'long value1',
            short: false
          }],
          actions: [{}]
        }]
      }`);

      expect(result.text).toBe('Custom Field Check');
      expect(result.attachments![0].color).toBe('good');
      const fields = (result.attachments![0] as Record<string, unknown>)
        .fields as Array<Record<string, unknown>>;
      expect(fields[0].value).toBe('lower case check');
      expect(fields[1].value).toBe('reverse string');
      expect(fields[2].short).toBe(false);
    });

    it('uses AS_* env vars with status-based color expression', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-01T12:01:05Z'));

      interceptGitHubApi();
      const result = await createClient({
        fields: 'workflow,job,commit,repo,ref,author,took',
      }).custom(`{
        attachments: [{
          color: 'success' === 'success' ? 'good' : 'success' === 'failure' ? 'danger' : 'warning',
          text: \`\${process.env.AS_WORKFLOW}\\n\${process.env.AS_JOB} (\${process.env.AS_COMMIT}) of \${process.env.AS_REPO}@\${process.env.AS_REF} by \${process.env.AS_AUTHOR} succeeded in \${process.env.AS_TOOK}\`,
        }]
      }`);

      expect(result.attachments![0].color).toBe('good');
      const text = (result.attachments![0] as Record<string, unknown>)
        .text as string;
      expect(text).toContain('h3y6e/test');
      expect(text).toContain('1 min 5 sec');

      vi.useRealTimers();
    });

    it('color expression: failure -> danger', async () => {
      interceptGitHubApi();
      const result = await createClient({ fields: 'repo' }).custom(`{
        attachments: [{
          color: 'failure' === 'success' ? 'good' : 'failure' === 'failure' ? 'danger' : 'warning',
          text: 'Failed',
        }]
      }`);

      expect(result.attachments![0].color).toBe('danger');
    });
  });

  // ── job_name / MATRIX_CONTEXT ──────────────────────────────────────

  describe('job_name / MATRIX_CONTEXT', () => {
    afterEach(() => {
      delete process.env.MATRIX_CONTEXT;
    });

    it('constructs job name from MATRIX_CONTEXT: "build (ubuntu-latest, 18)"', async () => {
      process.env.MATRIX_CONTEXT = JSON.stringify({
        os: 'ubuntu-latest',
        node: '18',
      });
      interceptGitHubApi({
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

      const payload = await createClient({ fields: 'job' }).prepare('');

      expect(payload.attachments[0].fields[0].value).toContain(
        'build (ubuntu-latest, 18)',
      );
    });

    it('uses job_name to match renamed jobs', async () => {
      interceptGitHubApi({
        jobs: {
          total_count: 1,
          jobs: [{ id: 77, name: 'Test', started_at: '2024-01-01T12:00:00Z' }],
        },
      });

      const payload = await createClient({
        fields: 'job',
        job_name: 'Test',
      }).prepare('');

      expect(payload.attachments[0].fields[0].value).toContain('/runs/77|');
      expect(payload.attachments[0].fields[0].value).toContain('Test');
    });
  });

  // ── pullRequest via Client ─────────────────────────────────────────

  describe('pullRequest field in PR events', () => {
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

    it('includes PR link with title and number', async () => {
      context.eventName = 'pull_request';
      context.payload = {
        pull_request: {
          number: 42,
          title: 'Add new feature',
          html_url: 'https://github.com/h3y6e/test/pull/42',
          head: { sha: 'pr-sha-123' },
        },
      };
      interceptGitHubApi();

      const payload = await createClient({ fields: 'pullRequest' }).prepare('');

      expect(payload.attachments[0].fields[0].value).toBe(
        '<https://github.com/h3y6e/test/pull/42|Add new feature #42>',
      );
    });
  });
});
