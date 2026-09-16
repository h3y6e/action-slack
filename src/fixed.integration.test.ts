/**
 * Integration tests for detectFixed.
 *
 * Uses real library code (no vi.mock) with HTTP interception via undici
 * MockAgent to verify the actual GitHub API paths (octokit parameter names
 * included) that unit tests with hand-written mocks cannot catch.
 */
import {
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
import { getOctokit } from '@actions/github';
import { detectFixed } from './fixed';

const RunId = 99;
const WorkflowId = 111;

describe('detectFixed (integration)', () => {
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
  });

  afterEach(async () => {
    await mockAgent.close();
  });

  function intercept(path: string | RegExp, status: number, body: object) {
    mockAgent
      .get('https://api.github.com')
      .intercept({ path, method: 'GET' })
      .reply(status, body, {
        headers: { 'content-type': 'application/json' },
      });
  }

  function interceptCurrentRun(overrides: object = {}) {
    intercept(/\/actions\/runs\/99$/, 200, {
      id: RunId,
      workflow_id: WorkflowId,
      head_branch: 'main',
      run_attempt: 1,
      run_number: 10,
      conclusion: null,
      ...overrides,
    });
  }

  it('when the previous completed run failed, returns true', async () => {
    // Arrange
    interceptCurrentRun();
    intercept(/\/actions\/workflows\/111\/runs/, 200, {
      workflow_runs: [{ id: 98, run_number: 9, conclusion: 'failure' }],
    });

    // Act
    const result = await detectFixed(getOctokit('fake-token'));

    // Assert
    expect(result).toBe(true);
  });

  it('when the previous completed run succeeded, returns false', async () => {
    // Arrange
    interceptCurrentRun();
    intercept(/\/actions\/workflows\/111\/runs/, 200, {
      workflow_runs: [{ id: 98, run_number: 9, conclusion: 'success' }],
    });

    // Act
    const result = await detectFixed(getOctokit('fake-token'));

    // Assert
    expect(result).toBe(false);
  });

  it('when the current run is a re-run and an earlier attempt failed, returns true', async () => {
    // Arrange
    interceptCurrentRun({ run_attempt: 2 });
    intercept(/\/actions\/workflows\/111\/runs/, 200, { workflow_runs: [] });
    intercept(/\/actions\/runs\/99\/attempts\/1$/, 200, {
      id: RunId,
      conclusion: 'failure',
    });

    // Act
    const result = await detectFixed(getOctokit('fake-token'));

    // Assert
    expect(result).toBe(true);
  });

  it('when the token lacks permission, rejects with the API error', async () => {
    // Arrange
    intercept(/\/actions\/runs\/99$/, 403, {
      message: 'Resource not accessible by integration',
    });

    // Act & Assert
    await expect(detectFixed(getOctokit('fake-token'))).rejects.toThrow(
      'Resource not accessible by integration',
    );
  });
});
