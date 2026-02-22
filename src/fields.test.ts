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

  describe('Attachment data generation per field', () => {
    it('returns an empty array when no fields match', async () => {
      const factory = createFactory('nonexistent');
      expect(await factory.attachments()).toHaveLength(0);
    });

    describe('repo field', () => {
      it('generates a Slack link to the repository and sets AS_REPO', async () => {
        const result = await createFactory('repo').attachments();
        expect(result).toEqual([
          {
            title: 'repo',
            value: '<https://github.com/h3y6e/test|h3y6e/test>',
            short: true,
          },
        ]);
        expect(process.env.AS_REPO).toBe(
          '<https://github.com/h3y6e/test|h3y6e/test>',
        );
      });

      it('uses the specified gitHubBaseUrl host when provided', async () => {
        const result = await createFactory(
          'repo',
          createMockOctokit(),
          'https://github.example.com',
        ).attachments();
        expect(result[0].value).toBe(
          '<https://github.example.com/h3y6e/test|h3y6e/test>',
        );
      });
    });

    describe('commit field', () => {
      it('generates a commit link showing the first 8 chars of the SHA and sets AS_COMMIT', async () => {
        const result = await createFactory('commit').attachments();
        // sha is 'abc123def456789'; first 8 chars are 'abc123de'
        expect(result[0]).toEqual({
          title: 'commit',
          value:
            '<https://github.com/h3y6e/test/commit/abc123def456789|abc123de>',
          short: true,
        });
        expect(process.env.AS_COMMIT).toBe(
          '<https://github.com/h3y6e/test/commit/abc123def456789|abc123de>',
        );
      });

      it('uses gitHubBaseUrl for commit link when provided', async () => {
        const result = await createFactory(
          'commit',
          createMockOctokit(),
          'https://github.example.com',
        ).attachments();
        expect(result[0].value).toContain(
          'https://github.example.com/h3y6e/test/commit/',
        );
      });
    });

    describe('message field', () => {
      it('generates a link to the commit message and sets AS_MESSAGE', async () => {
        const result = await createFactory('message').attachments();
        expect(result[0]).toEqual({
          title: 'message',
          value: '<https://github.com/h3y6e/test/commit/abc123|Initial commit>',
          short: true,
        });
        expect(process.env.AS_MESSAGE).toBe(
          '<https://github.com/h3y6e/test/commit/abc123|Initial commit>',
        );
      });

      it('escapes HTML special characters in the commit message', async () => {
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

    describe('author field', () => {
      it('generates author info in "Name <email>" format and sets AS_AUTHOR', async () => {
        const result = await createFactory('author').attachments();
        expect(result[0]).toEqual({
          title: 'author',
          value: 'Octocat <octocat@github.com>',
          short: true,
        });
        expect(process.env.AS_AUTHOR).toBe('Octocat <octocat@github.com>');
      });
    });

    describe('eventName field', () => {
      it('returns the GitHub event name and sets AS_EVENT_NAME', async () => {
        const result = await createFactory('eventName').attachments();
        expect(result[0]).toEqual({
          title: 'eventName',
          value: 'push',
          short: true,
        });
        expect(process.env.AS_EVENT_NAME).toBe('push');
      });
    });

    describe('ref field', () => {
      it('returns the Git ref and sets AS_REF', async () => {
        const result = await createFactory('ref').attachments();
        expect(result[0]).toEqual({
          title: 'ref',
          value: 'refs/heads/main',
          short: true,
        });
        expect(process.env.AS_REF).toBe('refs/heads/main');
      });
    });

    describe('workflow field', () => {
      it('generates a checks page link using the commit SHA and sets AS_WORKFLOW', async () => {
        const result = await createFactory('workflow').attachments();
        expect(result[0]).toEqual({
          title: 'workflow',
          value:
            '<https://github.com/h3y6e/test/commit/abc123def456789/checks|CI>',
          short: true,
        });
        expect(process.env.AS_WORKFLOW).toBe(
          '<https://github.com/h3y6e/test/commit/abc123def456789/checks|CI>',
        );
      });

      it('uses the PR head SHA for pull_request events', async () => {
        mockContext.eventName = 'pull_request';
        mockContext.payload = {
          pull_request: { head: { sha: 'pr-head-sha' } },
        };
        const result = await createFactory('workflow').attachments();
        expect(result[0].value).toBe(
          '<https://github.com/h3y6e/test/commit/pr-head-sha/checks|CI>',
        );
      });

      it('uses gitHubBaseUrl for workflow link when provided', async () => {
        const result = await createFactory(
          'workflow',
          createMockOctokit(),
          'https://github.example.com',
        ).attachments();
        expect(result[0].value).toMatch(/^<https:\/\/github\.example\.com\//);
      });
    });

    describe('workflowRun field', () => {
      it('generates a link to the workflow run and sets AS_WORKFLOW_RUN', async () => {
        const result = await createFactory('workflowRun').attachments();
        expect(result[0]).toEqual({
          title: 'workflowRun',
          value: '<https://github.com/h3y6e/test/actions/runs/99|CI>',
          short: true,
        });
        expect(process.env.AS_WORKFLOW_RUN).toBe(
          '<https://github.com/h3y6e/test/actions/runs/99|CI>',
        );
      });

      it('uses gitHubBaseUrl for workflowRun link when provided', async () => {
        const result = await createFactory(
          'workflowRun',
          createMockOctokit(),
          'https://github.example.com',
        ).attachments();
        expect(result[0].value).toMatch(/^<https:\/\/github\.example\.com\//);
      });
    });

    describe('action field', () => {
      it('generates a link to the checks page', async () => {
        const result = await createFactory('action').attachments();
        expect(result[0]).toEqual({
          title: 'action',
          value:
            '<https://github.com/h3y6e/test/commit/abc123def456789/checks|action>',
          short: true,
        });
      });

      it('uses the PR head SHA for pull_request events', async () => {
        mockContext.eventName = 'pull_request';
        mockContext.payload = {
          pull_request: { head: { sha: 'pr-head-sha' } },
        };
        const result = await createFactory('action').attachments();
        expect(result[0].value).toBe(
          '<https://github.com/h3y6e/test/commit/pr-head-sha/checks|action>',
        );
      });

      it('uses gitHubBaseUrl for action link when provided', async () => {
        const result = await createFactory(
          'action',
          createMockOctokit(),
          'https://github.example.com',
        ).attachments();
        expect(result[0].value).toMatch(/^<https:\/\/github\.example\.com\//);
      });
    });

    describe('pullRequest field', () => {
      describe('non-pull_request events', () => {
        it('returns "n/a" and sets AS_PULL_REQUEST', async () => {
          const result = await createFactory('pullRequest').attachments();
          expect(result[0]).toEqual({
            title: 'pullRequest',
            value: 'n/a',
            short: true,
          });
          expect(process.env.AS_PULL_REQUEST).toBe('n/a');
        });
      });

      describe('pull_request events', () => {
        beforeEach(() => {
          mockContext.eventName = 'pull_request';
        });

        it('generates a Slack link containing the PR title and number', async () => {
          mockContext.payload = {
            pull_request: {
              head: { sha: 'pr-head-sha' },
              html_url: 'https://github.com/h3y6e/test/pull/1',
              title: 'Fix the bug',
              number: 1,
            },
          };
          const result = await createFactory('pullRequest').attachments();
          expect(result[0].value).toBe(
            '<https://github.com/h3y6e/test/pull/1|Fix the bug #1>',
          );
        });

        it('escapes HTML special characters in the PR title', async () => {
          mockContext.payload = {
            pull_request: {
              head: { sha: 'pr-head-sha' },
              html_url: 'https://github.com/h3y6e/test/pull/2',
              title: 'Fix <bug> & issue',
              number: 2,
            },
          };
          const result = await createFactory('pullRequest').attachments();
          expect(result[0].value).toBe(
            '<https://github.com/h3y6e/test/pull/2|Fix &lt;bug&gt; &amp; issue #2>',
          );
        });

        it('also matches pull_request_target event', async () => {
          mockContext.eventName = 'pull_request_target';
          mockContext.payload = {
            pull_request: {
              head: { sha: 'pr-head-sha' },
              html_url: 'https://github.com/h3y6e/test/pull/3',
              title: 'Dependabot update',
              number: 3,
            },
          };
          const result = await createFactory('pullRequest').attachments();
          expect(result[0].value).toBe(
            '<https://github.com/h3y6e/test/pull/3|Dependabot update #3>',
          );
        });
      });
    });

    describe('job field', () => {
      it('generates a link to the job run and sets AS_JOB when the job is found', async () => {
        const octokit = createMockOctokit({
          paginateResult: [{ id: 42, name: 'build' }],
        });
        const result = await createFactory('job', octokit).attachments();
        expect(result[0]).toEqual({
          title: 'job',
          value: '<https://github.com/h3y6e/test/runs/42|build>',
          short: true,
        });
        expect(process.env.AS_JOB).toBe(
          '<https://github.com/h3y6e/test/runs/42|build>',
        );
      });

      it('also matches matrix job names in "matrix / jobName" format', async () => {
        const octokit = createMockOctokit({
          paginateResult: [{ id: 42, name: 'matrix / build' }],
        });
        const result = await createFactory('job', octokit).attachments();
        expect(result[0].value).toContain('/runs/42|');
      });

      it('returns a guide link message when the job is not found', async () => {
        const octokit = createMockOctokit({
          paginateResult: [{ id: 42, name: 'other-job' }],
        });
        const result = await createFactory('job', octokit).attachments();
        expect(result[0].value).toContain('Job is not found');
      });

      it('uses gitHubBaseUrl for job link when provided', async () => {
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

    describe('took field', () => {
      it('formats elapsed time with h/m/s units and sets AS_TOOK', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-01-01T12:01:05Z'));
        const octokit = createMockOctokit({
          paginateResult: [
            { id: 42, name: 'build', started_at: '2024-01-01T12:00:00Z' },
          ],
        });
        const result = await createFactory('took', octokit).attachments();
        expect(result[0]).toEqual({
          title: 'took',
          value: '1 min 5 sec',
          short: true,
        });
        expect(process.env.AS_TOOK).toBe('1 min 5 sec');
      });

      it('omits zero-value units when formatting elapsed time', async () => {
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

      it('returns a guide link message when the job is not found', async () => {
        const octokit = createMockOctokit({
          paginateResult: [
            { id: 42, name: 'other-job', started_at: '2024-01-01T12:00:00Z' },
          ],
        });
        const result = await createFactory('took', octokit).attachments();
        expect(result[0].value).toContain('Job is not found');
      });
    });

    describe('multiple fields combined', () => {
      it('returns fields in the specified order', async () => {
        const result = await createFactory('repo,eventName,ref').attachments();
        expect(result).toHaveLength(3);
        expect(result.map(f => f.title)).toEqual(['repo', 'eventName', 'ref']);
      });

      it('includes all fields when "all" is specified', async () => {
        const octokit = createMockOctokit({
          paginateResult: [
            { id: 42, name: 'build', started_at: new Date().toISOString() },
          ],
        });
        const result = await createFactory('all', octokit).attachments();
        const titles = result.map(f => f.title);
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
    });
  });
});
