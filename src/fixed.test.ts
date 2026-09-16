import { vi, describe, it, expect, beforeEach } from 'vitest';
import { detectFixed } from './fixed';
import type { Octokit } from './client';

vi.mock('@actions/github', () => ({
  context: {
    repo: { owner: 'h3y6e', repo: 'test' },
    runId: 12345,
  },
}));

const RunId = 12345;

interface WorkflowRunData {
  id: number;
  conclusion: string | null;
  run_attempt: number;
  run_number: number;
  workflow_id: number;
  head_branch: string | null;
}

function workflowRun(
  overrides: Partial<WorkflowRunData> = {},
): WorkflowRunData {
  return {
    id: 777,
    conclusion: 'failure',
    run_attempt: 1,
    run_number: 9,
    workflow_id: 111,
    head_branch: 'main',
    ...overrides,
  };
}

function createOctokit(
  options: {
    run?: Partial<WorkflowRunData>;
    previousRuns?: WorkflowRunData[];
    attempts?: Record<number, WorkflowRunData>;
  } = {},
) {
  const getWorkflowRun = vi.fn().mockResolvedValue({
    data: workflowRun({
      id: RunId,
      conclusion: null,
      run_number: 10,
      ...options.run,
    }),
  });
  const listWorkflowRuns = vi.fn().mockResolvedValue({
    data: { workflow_runs: options.previousRuns ?? [] },
  });
  const getWorkflowRunAttempt = vi
    .fn()
    .mockImplementation(({ attempt_number }: { attempt_number: number }) =>
      Promise.resolve({
        data: options.attempts?.[attempt_number] ?? workflowRun(),
      }),
    );

  return {
    octokit: {
      rest: {
        actions: { getWorkflowRun, listWorkflowRuns, getWorkflowRunAttempt },
      },
    } as unknown as Octokit,
    getWorkflowRun,
    listWorkflowRuns,
    getWorkflowRunAttempt,
  };
}

describe('detectFixed', () => {
  let mocks: ReturnType<typeof createOctokit>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('when the latest completed run of the same workflow and branch failed, returns true', async () => {
    // Arrange
    mocks = createOctokit({
      previousRuns: [workflowRun({ id: 777, conclusion: 'failure' })],
    });

    // Act
    const result = await detectFixed(mocks.octokit);

    // Assert
    expect(result).toBe(true);
    expect(mocks.listWorkflowRuns).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'h3y6e',
        repo: 'test',
        workflow_id: 111,
        branch: 'main',
        status: 'completed',
      }),
    );
  });

  it('when the newest previous runs are skipped or cancelled, returns true for an older failure', async () => {
    // Arrange
    mocks = createOctokit({
      previousRuns: [
        workflowRun({ id: 778, conclusion: 'skipped' }),
        workflowRun({ id: 777, conclusion: 'cancelled' }),
        workflowRun({ id: 776, conclusion: 'failure' }),
      ],
    });

    // Act
    const result = await detectFixed(mocks.octokit);

    // Assert
    expect(result).toBe(true);
  });

  it('when the latest completed run succeeded, returns false', async () => {
    // Arrange
    mocks = createOctokit({
      previousRuns: [workflowRun({ id: 777, conclusion: 'success' })],
    });

    // Act
    const result = await detectFixed(mocks.octokit);

    // Assert
    expect(result).toBe(false);
  });

  it('when there is no previous completed run, returns false', async () => {
    // Arrange
    mocks = createOctokit({ previousRuns: [] });

    // Act
    const result = await detectFixed(mocks.octokit);

    // Assert
    expect(result).toBe(false);
  });

  it('when the current run is a re-run and the newest previous attempt failed, returns true', async () => {
    // Arrange
    mocks = createOctokit({
      run: { run_attempt: 3 },
      previousRuns: [],
      attempts: {
        2: workflowRun({ conclusion: 'cancelled' }),
        1: workflowRun({ conclusion: 'failure' }),
      },
    });

    // Act
    const result = await detectFixed(mocks.octokit);

    // Assert
    expect(result).toBe(true);
  });

  it('when the current run is a re-run and previous attempts are skipped or cancelled, returns false', async () => {
    // Arrange
    mocks = createOctokit({
      run: { run_attempt: 2 },
      previousRuns: [],
      attempts: { 1: workflowRun({ conclusion: 'cancelled' }) },
    });

    // Act
    const result = await detectFixed(mocks.octokit);

    // Assert
    expect(result).toBe(false);
  });

  it('when the current run is not a re-run, does not request previous attempts', async () => {
    // Arrange
    mocks = createOctokit({
      run: { run_attempt: 1 },
      previousRuns: [workflowRun({ id: 777, conclusion: 'success' })],
    });

    // Act
    await detectFixed(mocks.octokit);

    // Assert
    expect(mocks.getWorkflowRunAttempt).not.toHaveBeenCalled();
  });

  it('when the run history contains the current run, ignores it', async () => {
    // Arrange
    mocks = createOctokit({
      previousRuns: [
        workflowRun({ id: RunId, conclusion: 'failure' }),
        workflowRun({ id: 777, conclusion: 'success' }),
      ],
    });

    // Act
    const result = await detectFixed(mocks.octokit);

    // Assert
    expect(result).toBe(false);
  });

  it('when the current run has no branch, returns false', async () => {
    // Arrange
    mocks = createOctokit({
      run: { head_branch: null },
      previousRuns: [workflowRun({ id: 777, conclusion: 'failure' })],
    });

    // Act
    const result = await detectFixed(mocks.octokit);

    // Assert
    expect(result).toBe(false);
    expect(mocks.listWorkflowRuns).not.toHaveBeenCalled();
  });

  it('when a newer run than the current one failed, ignores it', async () => {
    // Arrange
    mocks = createOctokit({
      previousRuns: [
        workflowRun({ id: 779, run_number: 11, conclusion: 'failure' }),
        workflowRun({ id: 777, run_number: 9, conclusion: 'success' }),
      ],
    });

    // Act
    const result = await detectFixed(mocks.octokit);

    // Assert
    expect(result).toBe(false);
  });

  it('when the GitHub API rejects, rejects with the error', async () => {
    // Arrange
    mocks = createOctokit();
    mocks.getWorkflowRun.mockRejectedValue(
      new Error('Resource not accessible'),
    );

    // Act & Assert
    await expect(detectFixed(mocks.octokit)).rejects.toThrow(
      'Resource not accessible',
    );
  });
});
