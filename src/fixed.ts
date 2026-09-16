import { context } from '@actions/github';
import type { Octokit } from './client';

function inconclusive(conclusion: string | null): boolean {
  return conclusion === 'skipped' || conclusion === 'cancelled';
}

export async function detectFixed(octokit: Octokit): Promise<boolean> {
  const { owner, repo } = context.repo;
  const { data: run } = await octokit.rest.actions.getWorkflowRun({
    owner,
    repo,
    run_id: context.runId,
  });

  if (
    await previousRunFailed(
      octokit,
      run.workflow_id,
      run.head_branch,
      run.run_number,
    )
  ) {
    return true;
  }
  const run_attempt = run.run_attempt ?? 1;
  if (run_attempt > 1 && (await previousAttemptFailed(octokit, run_attempt))) {
    return true;
  }
  return false;
}

async function previousRunFailed(
  octokit: Octokit,
  workflow_id: number,
  head_branch: string | null,
  run_number: number,
): Promise<boolean> {
  if (head_branch === null) {
    return false;
  }

  const { owner, repo } = context.repo;
  const { data } = await octokit.rest.actions.listWorkflowRuns({
    owner,
    repo,
    workflow_id,
    branch: head_branch,
    status: 'completed',
    per_page: 20,
  });

  const previous = data.workflow_runs.find(
    run =>
      run.id !== context.runId &&
      run.run_number < run_number &&
      !inconclusive(run.conclusion),
  );
  return previous?.conclusion === 'failure';
}

async function previousAttemptFailed(
  octokit: Octokit,
  run_attempt: number,
): Promise<boolean> {
  const { owner, repo } = context.repo;
  for (let attempt = run_attempt - 1; attempt >= 1; attempt--) {
    const { data } = await octokit.rest.actions.getWorkflowRunAttempt({
      owner,
      repo,
      run_id: context.runId,
      attempt_number: attempt,
    });
    if (inconclusive(data.conclusion)) continue;
    return data.conclusion === 'failure';
  }
  return false;
}
