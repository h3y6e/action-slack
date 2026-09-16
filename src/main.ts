import * as core from '@actions/core';
import { getOctokit } from '@actions/github';
import { Client, Success, Failure, Cancelled, Custom, Fixed } from './client';
import { detectFixed } from './fixed';

const NotifyAll = 'all';
const NotifyableStatuses = [Success, Failure, Cancelled, Fixed];

function parseNotify(value: string): string[] | undefined {
  const statuses = value.replace(/ /g, '').split(',');
  if (
    statuses.length === 1 &&
    (statuses[0] === '' || statuses[0] === NotifyAll)
  ) {
    return undefined;
  }
  if (!statuses.every(status => NotifyableStatuses.includes(status))) {
    throw new Error(
      'You can specify all or success,failure,cancelled,fixed for notify',
    );
  }
  return statuses;
}

export async function run(): Promise<void> {
  try {
    const status = core.getInput('status', { required: true }).toLowerCase();
    if (![Success, Failure, Cancelled, Custom].includes(status)) {
      throw new Error(
        'You can specify success or failure or cancelled or custom',
      );
    }

    const notify = parseNotify(core.getInput('notify').toLowerCase());
    const mention = core.getInput('mention');
    const author_name = core.getInput('author_name');
    const if_mention = core.getInput('if_mention').toLowerCase();
    const text = core.getInput('text');
    const username = core.getInput('username');
    const icon_emoji = core.getInput('icon_emoji');
    const icon_url = core.getInput('icon_url');
    const channel = core.getInput('channel');
    const custom_payload = core.getInput('custom_payload');
    const fields = core.getInput('fields');
    const job_name = core.getInput('job_name');
    const success_message = core.getInput('success_message');
    const cancelled_message = core.getInput('cancelled_message');
    const failure_message = core.getInput('failure_message');
    const fixed_message = core.getInput('fixed_message');
    const github_token = core.getInput('github_token');
    const github_base_url = core.getInput('github_base_url');

    core.debug(`status: ${status}`);
    core.debug(`notify: ${notify?.join(',') ?? NotifyAll}`);
    core.debug(`mention: ${mention}`);
    core.debug(`author_name: ${author_name}`);
    core.debug(`if_mention: ${if_mention}`);
    core.debug(`text: ${text}`);
    core.debug(`username: ${username}`);
    core.debug(`icon_emoji: ${icon_emoji}`);
    core.debug(`icon_url: ${icon_url}`);
    core.debug(`channel: ${channel}`);
    core.debug(`custom_payload: ${custom_payload}`);
    core.debug(`fields: ${fields}`);
    core.debug(`job_name: ${job_name}`);
    core.debug(`success_message: ${success_message}`);
    core.debug(`cancelled_message: ${cancelled_message}`);
    core.debug(`failure_message: ${failure_message}`);
    core.debug(`fixed_message: ${fixed_message}`);
    core.debug(`github_base_url: ${github_base_url}`);

    let effectiveStatus = status;
    if (status === Success && notify?.includes(Fixed)) {
      try {
        if (await detectFixed(getOctokit(github_token))) {
          effectiveStatus = Fixed;
        }
      } catch (error) {
        core.warning(
          `Failed to detect fixed status: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (
      notify !== undefined &&
      effectiveStatus !== Custom &&
      !notify.includes(effectiveStatus)
    ) {
      core.debug(
        `skip notification: notify=${notify.join(',')}, status=${effectiveStatus}`,
      );
      return;
    }

    const client = new Client(
      {
        status: effectiveStatus,
        mention,
        author_name,
        if_mention,
        username,
        icon_emoji,
        icon_url,
        channel,
        fields,
        job_name,
        success_message,
        cancelled_message,
        failure_message,
        fixed_message,
      },
      github_token,
      github_base_url,
      process.env.SLACK_WEBHOOK_URL,
    );

    switch (effectiveStatus) {
      case Success:
      case Failure:
      case Cancelled:
      case Fixed:
        await client.send(await client.prepare(text));
        break;
      case Custom:
        await client.send(await client.custom(custom_payload));
        break;
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
}
