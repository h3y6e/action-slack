import { vi, describe, it, expect, beforeEach } from 'vitest';

const { inputs, coreMocks, clientMocks, detectFixedMock } = vi.hoisted(() => ({
  inputs: {} as Record<string, string>,
  coreMocks: {
    debug: vi.fn(),
    warning: vi.fn(),
    setFailed: vi.fn(),
  },
  clientMocks: {
    constructor: vi.fn(),
    send: vi.fn().mockResolvedValue(undefined),
    prepare: vi.fn().mockResolvedValue({ attachments: [] }),
    custom: vi.fn().mockResolvedValue({ text: 'custom' }),
  },
  detectFixedMock: vi.fn(),
}));

vi.mock('@actions/core', () => ({
  getInput: vi.fn((name: string) => inputs[name] ?? ''),
  debug: coreMocks.debug,
  warning: coreMocks.warning,
  setFailed: coreMocks.setFailed,
}));

vi.mock('@actions/github', () => ({
  getOctokit: vi.fn().mockReturnValue({}),
}));

vi.mock('./client', () => ({
  Client: class {
    constructor(...args: unknown[]) {
      clientMocks.constructor(...args);
    }
    send = clientMocks.send;
    prepare = clientMocks.prepare;
    custom = clientMocks.custom;
  },
  Success: 'success',
  Failure: 'failure',
  Cancelled: 'cancelled',
  Custom: 'custom',
  Fixed: 'fixed',
}));

vi.mock('./fixed', () => ({ detectFixed: detectFixedMock }));

import { run } from './main';

function setInputs(values: Record<string, string>) {
  for (const key of Object.keys(inputs)) delete inputs[key];
  Object.assign(inputs, values);
}

function clientProps() {
  return clientMocks.constructor.mock.calls[0][0] as Record<string, unknown>;
}

describe('run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setInputs({ status: 'success', notify: 'all' });
    detectFixedMock.mockResolvedValue(false);
  });

  it('when notify is all, a success notification is sent', async () => {
    // Arrange
    setInputs({ status: 'success', notify: 'all' });

    // Act
    await run();

    // Assert
    expect(detectFixedMock).not.toHaveBeenCalled();
    expect(clientMocks.constructor).toHaveBeenCalledOnce();
    expect(clientProps().status).toBe('success');
    expect(clientMocks.send).toHaveBeenCalledOnce();
  });

  it('when notify is empty, behaves like all', async () => {
    // Arrange
    setInputs({ status: 'success', notify: '' });

    // Act
    await run();

    // Assert
    expect(detectFixedMock).not.toHaveBeenCalled();
    expect(clientMocks.send).toHaveBeenCalledOnce();
  });

  it('when notify includes fixed and the previous run failed, a fixed notification is sent', async () => {
    // Arrange
    setInputs({ status: 'success', notify: 'failure,fixed' });
    detectFixedMock.mockResolvedValue(true);

    // Act
    await run();

    // Assert
    expect(detectFixedMock).toHaveBeenCalledOnce();
    expect(clientProps().status).toBe('fixed');
    expect(clientMocks.send).toHaveBeenCalledOnce();
  });

  it('when notify includes fixed and the previous run succeeded, the notification is skipped', async () => {
    // Arrange
    setInputs({ status: 'success', notify: 'failure,fixed' });
    detectFixedMock.mockResolvedValue(false);

    // Act
    await run();

    // Assert
    expect(clientMocks.constructor).not.toHaveBeenCalled();
    expect(clientMocks.send).not.toHaveBeenCalled();
  });

  it('when notify includes fixed and detection fails, warns and skips the notification', async () => {
    // Arrange
    setInputs({ status: 'success', notify: 'failure,fixed' });
    detectFixedMock.mockRejectedValue(new Error('Resource not accessible'));

    // Act
    await run();

    // Assert
    expect(coreMocks.warning).toHaveBeenCalledOnce();
    expect(coreMocks.setFailed).not.toHaveBeenCalled();
    expect(clientMocks.send).not.toHaveBeenCalled();
  });

  it('when notify includes fixed and success but the previous run succeeded, a success notification is sent', async () => {
    // Arrange
    setInputs({ status: 'success', notify: 'success,fixed' });
    detectFixedMock.mockResolvedValue(false);

    // Act
    await run();

    // Assert
    expect(clientProps().status).toBe('success');
    expect(clientMocks.send).toHaveBeenCalledOnce();
  });

  it('when notify does not include fixed, the fixed detection is not used', async () => {
    // Arrange
    setInputs({ status: 'success', notify: 'failure' });

    // Act
    await run();

    // Assert
    expect(detectFixedMock).not.toHaveBeenCalled();
    expect(clientMocks.send).not.toHaveBeenCalled();
  });

  it('when notify is failure,fixed and the status is cancelled, the notification is skipped', async () => {
    // Arrange
    setInputs({ status: 'cancelled', notify: 'failure,fixed' });

    // Act
    await run();

    // Assert
    expect(detectFixedMock).not.toHaveBeenCalled();
    expect(clientMocks.send).not.toHaveBeenCalled();
  });

  it('when notify is failure,fixed and the status is failure, a failure notification is sent', async () => {
    // Arrange
    setInputs({ status: 'failure', notify: 'failure,fixed' });

    // Act
    await run();

    // Assert
    expect(detectFixedMock).not.toHaveBeenCalled();
    expect(clientProps().status).toBe('failure');
    expect(clientMocks.send).toHaveBeenCalledOnce();
  });

  it('when notify is failure,fixed and the status is custom, the custom payload is sent', async () => {
    // Arrange
    setInputs({
      status: 'custom',
      notify: 'failure,fixed',
      custom_payload: '{ text: "custom" }',
    });

    // Act
    await run();

    // Assert
    expect(detectFixedMock).not.toHaveBeenCalled();
    expect(clientMocks.custom).toHaveBeenCalledOnce();
    expect(clientMocks.send).toHaveBeenCalledWith({ text: 'custom' });
  });

  it('when notify contains an unknown status, the action fails', async () => {
    // Arrange
    setInputs({ status: 'success', notify: 'sometimes' });

    // Act
    await run();

    // Assert
    expect(coreMocks.setFailed).toHaveBeenCalledWith(
      'You can specify all or success,failure,cancelled,fixed for notify',
    );
    expect(clientMocks.send).not.toHaveBeenCalled();
  });

  it('when notify combines all with other statuses, the action fails', async () => {
    // Arrange
    setInputs({ status: 'success', notify: 'all,fixed' });

    // Act
    await run();

    // Assert
    expect(coreMocks.setFailed).toHaveBeenCalledWith(
      'You can specify all or success,failure,cancelled,fixed for notify',
    );
    expect(clientMocks.send).not.toHaveBeenCalled();
  });

  it('when the status is invalid and notify excludes it, the action fails', async () => {
    // Arrange
    setInputs({ status: 'unknown', notify: 'failure,fixed' });

    // Act
    await run();

    // Assert
    expect(coreMocks.setFailed).toHaveBeenCalledWith(
      'You can specify success or failure or cancelled or custom',
    );
    expect(clientMocks.send).not.toHaveBeenCalled();
  });

  it('when the status is invalid, the action fails', async () => {
    // Arrange
    setInputs({ status: 'unknown', notify: 'all' });

    // Act
    await run();

    // Assert
    expect(coreMocks.setFailed).toHaveBeenCalledWith(
      'You can specify success or failure or cancelled or custom',
    );
    expect(clientMocks.send).not.toHaveBeenCalled();
  });
});
