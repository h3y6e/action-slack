import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FieldFactory } from './fields';

// vi.hoisted ensures this object is available inside the vi.mock factory
const mockContext = vi.hoisted(() => ({
  job: 'build',
  repo: { owner: 'h3y6e', repo: 'test' },
  sha: 'abc123def456789',
  ref: 'refs/heads/main',
  workflow: 'CI',
  runId: 99,
  eventName: 'push',
  payload: {} as Record<string, unknown>,
}));

vi.mock('@actions/github', () => ({
  context: mockContext,
}));

function createMockOctokit(overrides?: {
  commitData?: unknown;
  paginateResult?: unknown[];
}) {
  const paginateResult = overrides?.paginateResult ?? [];
  return {
    rest: {
      repos: {
        getCommit: vi.fn().mockResolvedValue(
          overrides?.commitData ?? {
            data: {
              html_url: 'https://github.com/h3y6e/test/commit/abc123',
              commit: {
                message: 'Initial commit',
                author: { name: 'Octocat', email: 'octocat@github.com' },
              },
            },
          },
        ),
      },
      actions: {
        listJobsForWorkflowRun: vi.fn(),
      },
    },
    paginate: vi.fn().mockImplementation((_fn, _params, callback) => {
      if (typeof callback === 'function') {
        const done = vi.fn();
        const result = callback({ data: paginateResult }, done);
        return Promise.resolve(result ?? paginateResult);
      }
      return Promise.resolve(paginateResult);
    }),
  };
}

function createFactory(
  fields: string,
  octokit = createMockOctokit(),
  gitHubBaseUrl = '',
) {
  return new FieldFactory(fields, 'build', gitHubBaseUrl, octokit as never);
}

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

describe('FieldFactory', () => {
  beforeEach(() => {
    mockContext.eventName = 'push';
    mockContext.payload = {};
    for (const key of AS_ENV_VARS) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns an empty array when no fields match', async () => {
    const factory = createFactory('nonexistent');
    expect(await factory.attachments()).toHaveLength(0);
  });

  // ── gitHubBaseUrl ──────────────────────────────────────────────────

  describe('gitHubBaseUrl', () => {
    it('repo uses gitHubBaseUrl when provided', async () => {
      const result = await createFactory(
        'repo',
        createMockOctokit(),
        'https://github.example.com',
      ).attachments();
      expect(result[0].value).toBe(
        '<https://github.example.com/h3y6e/test|h3y6e/test>',
      );
    });

    it('commit uses gitHubBaseUrl when provided', async () => {
      const result = await createFactory(
        'commit',
        createMockOctokit(),
        'https://github.example.com',
      ).attachments();
      expect(result[0].value).toContain(
        'https://github.example.com/h3y6e/test/commit/',
      );
    });

    it('workflow uses gitHubBaseUrl when provided', async () => {
      const result = await createFactory(
        'workflow',
        createMockOctokit(),
        'https://github.example.com',
      ).attachments();
      expect(result[0].value).toMatch(/^<https:\/\/github\.example\.com\//);
    });

    it('workflowRun uses gitHubBaseUrl when provided', async () => {
      const result = await createFactory(
        'workflowRun',
        createMockOctokit(),
        'https://github.example.com',
      ).attachments();
      expect(result[0].value).toMatch(/^<https:\/\/github\.example\.com\//);
    });

    it('action uses gitHubBaseUrl when provided', async () => {
      const result = await createFactory(
        'action',
        createMockOctokit(),
        'https://github.example.com',
      ).attachments();
      expect(result[0].value).toMatch(/^<https:\/\/github\.example\.com\//);
    });

    it('job uses gitHubBaseUrl when provided', async () => {
      const octokit = createMockOctokit({
        paginateResult: [{ id: 42, name: 'build' }],
      });
      const result = await createFactory(
        'job',
        octokit,
        'https://github.example.com',
      ).attachments();
      expect(result[0].value).toContain('https://github.example.com/');
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────

  describe('message', () => {
    it('escapes &, <, > in the commit message', async () => {
      const octokit = createMockOctokit({
        commitData: {
          data: {
            html_url: 'https://github.com/h3y6e/test/commit/abc123',
            commit: {
              message: 'Fix <bug> & issue',
              author: { name: 'Octocat', email: 'octocat@github.com' },
            },
          },
        },
      });
      const result = await createFactory('message', octokit).attachments();
      expect(result[0].value).toBe(
        '<https://github.com/h3y6e/test/commit/abc123|Fix &lt;bug&gt; &amp; issue>',
      );
    });

    it('uses only the first line of a multi-line commit message', async () => {
      const octokit = createMockOctokit({
        commitData: {
          data: {
            html_url: 'https://github.com/h3y6e/test/commit/abc123',
            commit: {
              message: 'Subject line\n\nBody paragraph',
              author: { name: 'Octocat', email: 'octocat@github.com' },
            },
          },
        },
      });
      const result = await createFactory('message', octokit).attachments();
      expect(result[0].value).toBe(
        '<https://github.com/h3y6e/test/commit/abc123|Subject line>',
      );
    });
  });

  describe('action', () => {
    it('generates a checks page link for push events', async () => {
      const result = await createFactory('action').attachments();
      expect(result[0]).toEqual({
        title: 'action',
        value:
          '<https://github.com/h3y6e/test/commit/abc123def456789/checks|action>',
        short: true,
      });
    });
  });

  describe('took', () => {
    it('omits zero-value units', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-01T12:00:30Z'));
      const octokit = createMockOctokit({
        paginateResult: [
          { id: 42, name: 'build', started_at: '2024-01-01T12:00:00Z' },
        ],
      });
      const result = await createFactory('took', octokit).attachments();
      expect(result[0].value).toBe('30 sec');
    });

    it('omits seconds when exactly on the minute', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-01T12:02:00Z'));
      const octokit = createMockOctokit({
        paginateResult: [
          { id: 42, name: 'build', started_at: '2024-01-01T12:00:00Z' },
        ],
      });
      const result = await createFactory('took', octokit).attachments();
      expect(result[0].value).toBe('2 min ');
    });

    it('includes hour unit for long-running jobs', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-01T14:30:15Z'));
      const octokit = createMockOctokit({
        paginateResult: [
          { id: 42, name: 'build', started_at: '2024-01-01T12:00:00Z' },
        ],
      });
      const result = await createFactory('took', octokit).attachments();
      expect(result[0].value).toBe('2 hour 30 min 15 sec');
    });

    it('returns "Job is not found" when no job matches', async () => {
      const octokit = createMockOctokit({
        paginateResult: [
          { id: 42, name: 'other-job', started_at: '2024-01-01T12:00:00Z' },
        ],
      });
      const result = await createFactory('took', octokit).attachments();
      expect(result[0].value).toContain('Job is not found');
    });
  });

  // ── Multiple fields ────────────────────────────────────────────────

  describe('multiple fields', () => {
    it('returns fields in the specified order', async () => {
      const result = await createFactory('repo,eventName,ref').attachments();
      expect(result).toHaveLength(3);
      expect(result.map(f => f.title)).toEqual(['repo', 'eventName', 'ref']);
    });
  });
});
