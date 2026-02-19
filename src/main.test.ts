import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Client, Success, Failure, Cancelled } from './client';
import type { With } from './client';

const mockSend = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@actions/core', () => ({
  debug: vi.fn(),
  setFailed: vi.fn(),
}));

const mockContext = vi.hoisted(() => ({
  job: 'deploy',
  repo: { owner: 'h3y6e', repo: 'test' },
  sha: 'a1b2c3d4e5f6a7b8',
  ref: 'refs/heads/main',
  workflow: 'Deploy',
  runId: 100,
  eventName: 'push',
  payload: {} as Record<string, unknown>,
}));

vi.mock('@actions/github', () => ({
  context: mockContext,
  getOctokit: vi.fn().mockReturnValue({
    rest: {
      repos: {
        getCommit: vi.fn().mockResolvedValue({
          data: {
            html_url: 'https://github.com/h3y6e/test/commit/a1b2c3d4',
            commit: {
              message: 'deploy: update config',
              author: { name: 'Alice', email: 'alice@example.com' },
            },
          },
        }),
      },
      actions: {
        listJobsForWorkflowRun: vi.fn(),
      },
    },
    paginate: vi
      .fn()
      .mockResolvedValue([
        { id: 200, name: 'deploy', started_at: new Date().toISOString() },
      ]),
  }),
}));

vi.mock('@slack/webhook', () => ({
  IncomingWebhook: class {
    send = mockSend;
  },
}));

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

const defaultWith: With = {
  status: Success,
  mention: '',
  author_name: 'ci-bot',
  if_mention: '',
  username: '',
  icon_emoji: '',
  icon_url: '',
  channel: '',
  fields: 'repo,commit',
  job_name: '',
  success_message: 'Succeeded',
  cancelled_message: 'Cancelled',
  failure_message: 'Failed',
};

function createClient(props: Partial<With> = {}, gitHubBaseUrl = '') {
  return new Client(
    { ...defaultWith, ...props },
    'token',
    gitHubBaseUrl,
    'https://hooks.slack.com/test',
  );
}

describe('Client + FieldFactory integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue(undefined);
    mockContext.job = 'deploy';
    mockContext.eventName = 'push';
    mockContext.payload = {};
    for (const key of AS_ENV_VARS) {
      delete process.env[key];
    }
  });

  describe('prepare builds a complete payload with real fields', () => {
    it('includes repo and commit fields for a success notification', async () => {
      const client = createClient();
      const payload = await client.prepare('');

      expect(payload.text).toBe('Succeeded');
      expect(payload.attachments).toHaveLength(1);
      expect(payload.attachments[0].color).toBe('good');
      expect(payload.attachments[0].author_name).toBe('ci-bot');

      const fieldList = payload.attachments[0].fields;
      expect(fieldList).toHaveLength(2);
      expect(fieldList[0].title).toBe('repo');
      expect(fieldList[0].value).toContain('h3y6e/test');
      expect(fieldList[1].title).toBe('commit');
      expect(fieldList[1].value).toContain('a1b2c3d4');
    });

    it('includes mention in text and failure color', async () => {
      const client = createClient({
        status: Failure,
        mention: 'here',
        if_mention: 'failure',
      });
      const payload = await client.prepare('');

      expect(payload.text).toBe('<!here> Failed');
      expect(payload.attachments[0].color).toBe('danger');
    });

    it('includes cancelled color and message', async () => {
      const client = createClient({ status: Cancelled });
      const payload = await client.prepare('');

      expect(payload.text).toBe('Cancelled');
      expect(payload.attachments[0].color).toBe('warning');
    });

    it('overrides text when a custom message is provided', async () => {
      const client = createClient({ status: Success });
      const payload = await client.prepare('Deploy complete!');

      expect(payload.text).toBe('Deploy complete!');
    });

    it('includes all fields when fields is "all"', async () => {
      const client = createClient({ fields: 'all' });
      const payload = await client.prepare('');

      const titles = payload.attachments[0].fields.map(
        (f: { title: string }) => f.title,
      );
      expect(titles).toHaveLength(12);
      expect(titles).toContain('repo');
      expect(titles).toContain('commit');
      expect(titles).toContain('message');
      expect(titles).toContain('author');
      expect(titles).toContain('action');
      expect(titles).toContain('job');
      expect(titles).toContain('took');
      expect(titles).toContain('eventName');
      expect(titles).toContain('ref');
      expect(titles).toContain('workflow');
      expect(titles).toContain('workflowRun');
      expect(titles).toContain('pullRequest');
    });

    it('sets AS_* environment variables for requested fields', async () => {
      const client = createClient({
        fields: 'repo,commit,eventName,ref',
      });
      await client.prepare('');

      expect(process.env.AS_REPO).toBeDefined();
      expect(process.env.AS_COMMIT).toBeDefined();
      expect(process.env.AS_EVENT_NAME).toBe('push');
      expect(process.env.AS_REF).toBe('refs/heads/main');
    });
  });

  describe('prepare with pull_request event', () => {
    let savedPayload: Record<string, unknown>;
    let savedEventName: string;

    beforeEach(() => {
      savedPayload = mockContext.payload;
      savedEventName = mockContext.eventName;
      mockContext.eventName = 'pull_request';
      mockContext.payload = {
        pull_request: {
          head: { sha: 'pr-sha-123' },
          html_url: 'https://github.com/h3y6e/test/pull/42',
          title: 'Add feature',
          number: 42,
        },
      };
    });

    afterEach(() => {
      mockContext.payload = savedPayload;
      mockContext.eventName = savedEventName;
    });

    it('uses PR head SHA in workflow and action fields', async () => {
      const client = createClient({
        fields: 'workflow,action,pullRequest',
      });
      const payload = await client.prepare('');
      const fieldList = payload.attachments[0].fields;

      const workflowField = fieldList.find(
        (f: { title: string }) => f.title === 'workflow',
      );
      expect(workflowField?.value).toContain('pr-sha-123');

      const actionField = fieldList.find(
        (f: { title: string }) => f.title === 'action',
      );
      expect(actionField?.value).toContain('pr-sha-123');

      const prField = fieldList.find(
        (f: { title: string }) => f.title === 'pullRequest',
      );
      expect(prField?.value).toContain('Add feature');
      expect(prField?.value).toContain('#42');
    });
  });

  describe('send delivers the prepared payload to Slack', () => {
    it('calls webhook.send with the full payload object', async () => {
      const client = createClient();
      const payload = await client.prepare('');
      await client.send(payload);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const sentPayload = mockSend.mock.calls[0][0];
      expect(sentPayload.text).toBe('Succeeded');
      expect(sentPayload.attachments).toHaveLength(1);
    });
  });

  describe('custom payload with real field factory', () => {
    it('populates AS_* environment variables before evaluating the custom payload', async () => {
      const client = createClient({ fields: 'repo,commit' });
      const result = await client.custom('{ text: process.env.AS_REPO }');

      expect(result.text).toContain('h3y6e/test');
    });
  });

  describe('GitHub Enterprise base URL propagation', () => {
    it('uses gitHubBaseUrl across all generated field links', async () => {
      const client = createClient(
        { fields: 'repo,commit,workflow,workflowRun,action' },
        'https://ghe.example.com',
      );
      const payload = await client.prepare('');
      const fieldList = payload.attachments[0].fields;

      for (const field of fieldList) {
        expect(field.value).toContain('https://ghe.example.com');
      }
    });
  });
});
