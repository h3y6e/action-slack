import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Client, Success, Failure, Cancelled } from './client';
import type { With } from './client';

const mockSend = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockIncomingWebhookConstructor = vi.hoisted(() => vi.fn());

vi.mock('@actions/core', () => ({
  debug: vi.fn(),
  setFailed: vi.fn(),
}));

vi.mock('@actions/github', () => ({
  context: {
    job: 'test-job',
    repo: { owner: 'h3y6e', repo: 'test' },
    sha: 'abc123def456',
    ref: 'refs/heads/main',
    workflow: 'Test Workflow',
    runId: 12345,
    eventName: 'push',
    payload: {},
  },
  getOctokit: vi.fn().mockReturnValue({
    rest: {
      repos: { getCommit: vi.fn() },
      actions: { listJobsForWorkflowRun: vi.fn() },
    },
    paginate: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock('@slack/webhook', () => ({
  IncomingWebhook: class {
    constructor(...args: unknown[]) {
      mockIncomingWebhookConstructor(...args);
    }
    send = mockSend;
  },
}));

vi.mock('./fields', () => ({
  FieldFactory: class {
    attachments = vi.fn().mockResolvedValue([]);
  },
}));

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

function createClient(props: Partial<With> = {}) {
  return new Client(
    { ...defaultWith, ...props },
    'token',
    '',
    'https://hooks.slack.com/test',
  );
}

describe('Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue(undefined);
    mockIncomingWebhookConstructor.mockReset();
  });

  // ── constructor ────────────────────────────────────────────────────

  describe('constructor', () => {
    it('throws when webhookUrl is undefined', () => {
      expect(() => new Client(defaultWith, 'token', '', undefined)).toThrow(
        'Specify secrets.SLACK_WEBHOOK_URL',
      );
    });

    it('throws when webhookUrl is null', () => {
      expect(() => new Client(defaultWith, 'token', '', null)).toThrow(
        'Specify secrets.SLACK_WEBHOOK_URL',
      );
    });
  });

  // ── injectColor() ──────────────────────────────────────────────────

  describe('injectColor()', () => {
    it('throws for an unknown status', () => {
      expect(() => createClient({ status: 'unknown' }).injectColor()).toThrow(
        'invalid status: unknown',
      );
    });
  });

  // ── mentionText() ──────────────────────────────────────────────────

  describe('mentionText()', () => {
    it('returns empty string when mention is empty', () => {
      const client = createClient({ mention: '', if_mention: Success });
      expect(client.mentionText(Success)).toBe('');
    });

    it('strips spaces inside the mention list', () => {
      const client = createClient({
        mention: 'user1, user2',
        if_mention: Success,
      });
      expect(client.mentionText(Success)).toBe('<@user1> <@user2> ');
    });

    it('if_mention: "always" matches any status', () => {
      const client = createClient({ mention: 'user1', if_mention: 'always' });
      expect(client.mentionText(Success)).toBe('<@user1> ');
      expect(client.mentionText(Failure)).toBe('<@user1> ');
      expect(client.mentionText(Cancelled)).toBe('<@user1> ');
    });

    it('does not mention when status is not in the CSV list', () => {
      const client = createClient({
        mention: 'user1',
        if_mention: 'success,failure',
      });
      expect(client.mentionText(Cancelled)).toBe('');
    });
  });

  // ── injectText() ───────────────────────────────────────────────────

  describe('injectText()', () => {
    it('uses success_message when text is empty', () => {
      expect(createClient({ status: Success }).injectText('')).toBe(
        'Succeeded GitHub Actions',
      );
    });

    it('uses cancelled_message when text is empty', () => {
      expect(createClient({ status: Cancelled }).injectText('')).toBe(
        'Cancelled GitHub Actions',
      );
    });

    it('throws for an unknown status', () => {
      expect(() => createClient({ status: 'invalid' }).injectText('')).toThrow(
        'invalid status: invalid',
      );
    });
  });

  // ── prepare() ──────────────────────────────────────────────────────

  describe('prepare()', () => {
    it('defaults to "repo,commit" when fields input is empty', async () => {
      const client = createClient({ fields: '' });
      const payload = await client.prepare('');
      expect(payload.attachments).toHaveLength(1);
    });
  });

  // ── jobName ────────────────────────────────────────────────────────

  describe('jobName', () => {
    let originalMatrixContext: string | undefined;

    beforeEach(() => {
      originalMatrixContext = process.env.MATRIX_CONTEXT;
    });

    afterEach(() => {
      if (originalMatrixContext === undefined) {
        delete process.env.MATRIX_CONTEXT;
      } else {
        process.env.MATRIX_CONTEXT = originalMatrixContext;
      }
    });

    it('uses context.job when job_name is empty and no matrix', () => {
      delete process.env.MATRIX_CONTEXT;
      const client = createClient({ job_name: '' });
      expect((client as any).jobName).toBe('test-job');
    });

    it('ignores MATRIX_CONTEXT when value is "null"', () => {
      process.env.MATRIX_CONTEXT = 'null';
      const client = createClient({ job_name: '' });
      expect((client as any).jobName).toBe('test-job');
    });

    it('returns base name when MATRIX_CONTEXT is an empty object', () => {
      process.env.MATRIX_CONTEXT = '{}';
      const client = createClient({ job_name: '' });
      expect((client as any).jobName).toBe('test-job');
    });
  });

  // ── proxy ──────────────────────────────────────────────────────────

  describe('proxy', () => {
    let originalHttpsProxy: string | undefined;
    let originalHTTPSProxy: string | undefined;

    beforeEach(() => {
      originalHttpsProxy = process.env.https_proxy;
      originalHTTPSProxy = process.env.HTTPS_PROXY;
    });

    afterEach(() => {
      if (originalHttpsProxy === undefined) {
        delete process.env.https_proxy;
      } else {
        process.env.https_proxy = originalHttpsProxy;
      }
      if (originalHTTPSProxy === undefined) {
        delete process.env.HTTPS_PROXY;
      } else {
        process.env.HTTPS_PROXY = originalHTTPSProxy;
      }
    });

    it('passes agent to IncomingWebhook when https_proxy is set', () => {
      process.env.https_proxy = 'http://proxy:8080';
      createClient();
      expect(mockIncomingWebhookConstructor).toHaveBeenCalledOnce();
      const options = mockIncomingWebhookConstructor.mock.calls[0][1];
      expect(options?.agent).toBeDefined();
    });

    it('passes agent to IncomingWebhook when HTTPS_PROXY is set', () => {
      process.env.HTTPS_PROXY = 'http://proxy:8080';
      createClient();
      expect(mockIncomingWebhookConstructor).toHaveBeenCalledOnce();
      const options = mockIncomingWebhookConstructor.mock.calls[0][1];
      expect(options?.agent).toBeDefined();
    });

    it('does not pass agent when no proxy env var is set', () => {
      delete process.env.https_proxy;
      delete process.env.HTTPS_PROXY;
      createClient();
      expect(mockIncomingWebhookConstructor).toHaveBeenCalledOnce();
      const options = mockIncomingWebhookConstructor.mock.calls[0][1];
      expect(options?.agent).toBeUndefined();
    });
  });
});
