import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Client, Success, Failure, Cancelled } from './client';
import type { With } from './client';

const mockSend = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@actions/core', () => ({
  debug: vi.fn(),
  setFailed: vi.fn(),
}));

vi.mock('@actions/github', () => ({
  context: {
    job: 'test-job',
    repo: { owner: 'owner', repo: 'repo' },
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
  });

  describe('Webhook URL validation', () => {
    it.each([
      ['undefined', undefined],
      ['empty string', ''],
      ['null', null],
    ])('throws when webhookUrl is %s', (_label, webhookUrl) => {
      expect(() => new Client(defaultWith, 'token', '', webhookUrl)).toThrow(
        'Specify secrets.SLACK_WEBHOOK_URL',
      );
    });
  });

  describe('Attachment color resolution by status', () => {
    it.each([
      [Success, 'good'],
      [Cancelled, 'warning'],
      [Failure, 'danger'],
    ] as const)('returns "%s" for status "%s"', (status, expectedColor) => {
      expect(createClient({ status }).injectColor()).toBe(expectedColor);
    });

    it('throws for an unknown status', () => {
      expect(() => createClient({ status: 'unknown' }).injectColor()).toThrow(
        'invalid status: unknown',
      );
    });
  });

  describe('Mention text generation', () => {
    describe('when if_mention does not match', () => {
      it('returns empty string when mention is empty', () => {
        const client = createClient({ mention: '', if_mention: Success });
        expect(client.mentionText(Success)).toBe('');
      });

      it('returns empty string when if_mention status does not match', () => {
        const client = createClient({ mention: 'user1', if_mention: Failure });
        expect(client.mentionText(Success)).toBe('');
      });
    });

    describe('mention format by type', () => {
      it('formats a user ID as <@id>', () => {
        const client = createClient({ mention: 'user1', if_mention: Success });
        expect(client.mentionText(Success)).toBe('<@user1> ');
      });

      it('formats "here" as <!here>', () => {
        const client = createClient({ mention: 'here', if_mention: Success });
        expect(client.mentionText(Success)).toBe('<!here> ');
      });

      it('formats "channel" as <!channel>', () => {
        const client = createClient({
          mention: 'channel',
          if_mention: Success,
        });
        expect(client.mentionText(Success)).toBe('<!channel> ');
      });

      it('formats "subteam^ID" as <!subteam^ID>', () => {
        const client = createClient({
          mention: 'subteam^ABC123',
          if_mention: Success,
        });
        expect(client.mentionText(Success)).toBe('<!subteam^ABC123> ');
      });
    });

    describe('multiple mentions', () => {
      it('joins comma-separated mentions with spaces', () => {
        const client = createClient({
          mention: 'user1,here',
          if_mention: Success,
        });
        expect(client.mentionText(Success)).toBe('<@user1> <!here> ');
      });

      it('strips spaces inside the mention list', () => {
        const client = createClient({
          mention: 'user1, user2',
          if_mention: Success,
        });
        expect(client.mentionText(Success)).toBe('<@user1> <@user2> ');
      });
    });

    describe('when if_mention is "always"', () => {
      it('returns mention for every status', () => {
        const client = createClient({ mention: 'user1', if_mention: 'always' });
        expect(client.mentionText(Success)).toBe('<@user1> ');
        expect(client.mentionText(Failure)).toBe('<@user1> ');
        expect(client.mentionText(Cancelled)).toBe('<@user1> ');
      });
    });
  });

  describe('Notification text assembly', () => {
    describe('default message fallback', () => {
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

      it('uses failure_message when text is empty', () => {
        expect(createClient({ status: Failure }).injectText('')).toBe(
          'Failed GitHub Actions',
        );
      });
    });

    it('overrides default message when text is provided', () => {
      expect(createClient({ status: Success }).injectText('Deploy done')).toBe(
        'Deploy done',
      );
    });

    it('prepends mention when if_mention matches', () => {
      const client = createClient({
        status: Success,
        mention: 'user1',
        if_mention: Success,
      });
      expect(client.injectText('')).toBe('<@user1> Succeeded GitHub Actions');
    });

    it('throws for an unknown status', () => {
      expect(() => createClient({ status: 'invalid' }).injectText('')).toThrow(
        'invalid status: invalid',
      );
    });
  });

  describe('Slack payload construction', () => {
    it('returns a payload with text, username, icon_emoji, channel, and attachments', async () => {
      const client = createClient({
        status: Success,
        username: 'my-bot',
        icon_emoji: ':robot:',
        channel: '#general',
      });
      const payload = await client.prepare('Build passed');
      expect(payload.text).toBe('Build passed');
      expect(payload.username).toBe('my-bot');
      expect(payload.icon_emoji).toBe(':robot:');
      expect(payload.channel).toBe('#general');
      expect(payload.attachments).toHaveLength(1);
    });

    it.each([
      [Success, 'good'],
      [Failure, 'danger'],
      [Cancelled, 'warning'],
    ] as const)(
      'sets attachment color to "%s" for status "%s"',
      async (status, expectedColor) => {
        const payload = await createClient({ status }).prepare('');
        expect(payload.attachments[0].color).toBe(expectedColor);
      },
    );
  });

  describe('Sending to Slack', () => {
    it('passes a string payload directly to the webhook', async () => {
      await createClient().send('hello');
      expect(mockSend).toHaveBeenCalledWith('hello');
    });

    it('passes an object payload directly to the webhook', async () => {
      const payload = { text: 'hello', attachments: [] };
      await createClient().send(payload);
      expect(mockSend).toHaveBeenCalledWith(payload);
    });
  });

  describe('Custom payload evaluation', () => {
    it('evaluates a JS object expression string and returns the result', async () => {
      const result = await createClient().custom('{ text: "hello world" }');
      expect(result).toEqual({ text: 'hello world' });
    });

    it('evaluates an object expression containing an array', async () => {
      const result = await createClient().custom(
        '{ text: "t", attachments: [{ color: "good" }] }',
      );
      expect(result).toEqual({ text: 't', attachments: [{ color: 'good' }] });
    });
  });
});
