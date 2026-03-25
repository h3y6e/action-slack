---
title: With Parameters
description: Elements that can be specified in the `with` input of action-slack.
sidebar:
  order: 2
---

| key                                     | value                                                                                                                                                                                                | default                                           |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| [status](#status)                       | `'success'` or `'failure'` or `'cancelled'` or `'custom'`                                                                                                                                            | **required**                                      |
| [fields](/action-slack/usage/fields/)   | You can choose the items you want to add to the fields at the time of notification.                                                                                                                  | `'repo,commit'`                                   |
| [text](#text)                           | Specify the text you want to add. All strings will be overwritten.                                                                                                                                   | `''`                                              |
| [author_name](#author_name)             | It can be overwritten by specifying. The job name is recommend.                                                                                                                                      | `'h3y6e@action-slack'`                            |
| [mention](#mention)                     | `'here'` or `'channel'` or [user_group_id](https://api.slack.com/reference/surfaces/formatting#mentioning-groups) or [user_id](https://api.slack.com/reference/surfaces/formatting#mentioning-users) | `''`                                              |
| [if_mention](#mention)                  | Specify `'success'` or `'failure'` or `'cancelled'` or `'always'`.                                                                                                                                   | `''`                                              |
| [username](#username)                   | Override the legacy integration's default name.                                                                                                                                                      | `''`                                              |
| [icon_emoji](#icon_emoji)               | [emoji code](https://www.webfx.com/tools/emoji-cheat-sheet/) string to use in place of the default icon.                                                                                             | `''`                                              |
| [icon_url](#icon_url)                   | icon image URL string to use in place of the default icon.                                                                                                                                           | `''`                                              |
| [channel](#channel)                     | Override the legacy integration's default channel. This should be an ID, such as `C8UJ12P4P`.                                                                                                        | `''`                                              |
| [custom_payload](#custom_payload)       | e.g. `{"text": "Custom Field Check", obj: 'LOWER CASE'.toLowerCase()}`                                                                                                                               | `''`                                              |
| [job_name](#job_name)                   | If you want to overwrite the job name, you must specify it.                                                                                                                                          | `''`                                              |
| [success_message](#success_message)     | Message to use when the status is `'success'` and `text` is empty.                                                                                                                                   | `':white_check_mark: Succeeded GitHub Actions\n'` |
| [cancelled_message](#cancelled_message) | Message to use when the status is `'cancelled'` and `text` is empty.                                                                                                                                 | `':warning: Cancelled GitHub Actions\n'`          |
| [failure_message](#failure_message)     | Message to use when the status is `'failure'` and `text` is empty.                                                                                                                                   | `':no_entry: Failed GitHub Actions\n'`            |
| [github_token](#github_token)           | Use this if you wish to use a different GitHub token than the one provided by the workflow.                                                                                                          | `${{ github.token }}`                             |
| [github_base_url](#github_base_url)     | Specify if you want to use GitHub Enterprise.                                                                                                                                                        | `''`                                              |

## status

Recommend `${{ job.status }}`.

```yaml
steps:
  - uses: h3y6e/action-slack@v4
    with:
      status: ${{ job.status }}
    env:
      SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }} # required
```

## text

```yaml
steps:
  - uses: h3y6e/action-slack@v4
    with:
      text: 'any string'
    env:
      SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }} # required
```

## author_name

```yaml
steps:
  - uses: h3y6e/action-slack@v4
    with:
      author_name: 'my workflow'
    env:
      SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }} # required
```

## mention

This can be mentioned in combination with `if_mention`.

```yaml
steps:
  - uses: h3y6e/action-slack@v4
    with:
      mention: 'here'
      if_mention: failure
    env:
      SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }} # required
```

If you want to mention multiple users in multiple cases, you can specify.

```yaml
steps:
  - uses: h3y6e/action-slack@v4
    with:
      mention: 'user_id,user_id2'
      if_mention: 'failure,cancelled'
    env:
      SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }} # required
```

If you want to mention a user group, you need to add "subteam^" before user group id.

```yaml
steps:
  - uses: h3y6e/action-slack@v4
    with:
      mention: 'subteam^S012ABC3Y4Z' # replace S012ABC3Y4Z with your user group id
      if_mention: 'failure,cancelled'
    env:
      SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }} # required
```

## username

Only legacy incoming webhook supported.

```yaml
steps:
  - uses: h3y6e/action-slack@v4
    with:
      username: 'my workflow bot'
    env:
      SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }} # required
```

## icon_emoji

Only legacy incoming webhook supported.

```yaml
steps:
  - uses: h3y6e/action-slack@v4
    with:
      icon_emoji: ':octocat:'
    env:
      SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }} # required
```

## icon_url

Only legacy incoming webhook supported.

```yaml
steps:
  - uses: h3y6e/action-slack@v4
    with:
      icon_url: 'http://example.com/hoge.png'
    env:
      SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }} # required
```

## channel

Only legacy incoming webhook supported.

```yaml
steps:
  - uses: h3y6e/action-slack@v4
    with:
      channel: '#general'
    env:
      SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }} # required
```

## custom_payload

```yaml
steps:
  - uses: h3y6e/action-slack@v4
    with:
      status: custom
      custom_payload: |
        {
          text: "Custom Field Check",
          attachments: [{
            "author_name": "h3y6e@action-slack", // json
            fallback: 'fallback',
            color: 'good',
            title: 'CI Result',
            text: 'Succeeded',
            fields: [{
              title: 'lower case',
              value: 'LOWER CASE CHECK'.toLowerCase(),
              short: true
            },
            {
              title: 'reverse',
              value: 'gnirts esrever'.split('').reverse().join(''),
              short: true
            },
            {
              title: 'long title1',
              value: 'long value1',
              short: false
            }],
            actions: [{
            }]
          }]
        }
    env:
      SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }} # required
```

See here for `custom_payload` reference.

- [Message Formatting](https://api.slack.com/docs/messages/builder)
  - Enter json and check in preview.
- [Reference: Message payloads](https://api.slack.com/reference/messaging/payload)

## job_name

In the action-slack, there are arguments to get the information about the job.
They are retrieved from the job name and will not work if the job name is overwritten.

If you want to rename a job and get information about it, give the job a `job_name`.

```yaml
jobs:
  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - uses: h3y6e/action-slack@v4
        with:
          job_name: Test # Match the name above.
          fields: job,took
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }} # required
```

## success_message

Message to use when the status is `success` and `text` is empty.

```yaml
steps:
  - uses: h3y6e/action-slack@v4
    with:
      status: ${{ job.status }}
      success_message: ':tada: Build passed!'
    env:
      SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }} # required
```

## cancelled_message

Message to use when the status is `cancelled` and `text` is empty.

```yaml
steps:
  - uses: h3y6e/action-slack@v4
    with:
      status: ${{ job.status }}
      cancelled_message: ':stop_sign: Build was cancelled.'
    env:
      SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }} # required
```

## failure_message

Message to use when the status is `failure` and `text` is empty.

```yaml
steps:
  - uses: h3y6e/action-slack@v4
    with:
      status: ${{ job.status }}
      failure_message: ':fire: Build failed!'
    env:
      SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }} # required
```

## github_token

Use this if you wish to use a different GitHub token than the one provided by the workflow.
Defaults to `${{ github.token }}`.

```yaml
steps:
  - uses: h3y6e/action-slack@v4
    with:
      status: ${{ job.status }}
      github_token: ${{ secrets.CUSTOM_GITHUB_TOKEN }}
    env:
      SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }} # required
```

## github_base_url

Specify if you want to use GitHub Enterprise. When empty, defaults to `https://github.com`.

```yaml
steps:
  - uses: h3y6e/action-slack@v4
    with:
      status: ${{ job.status }}
      github_base_url: 'https://github.example.com'
    env:
      SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }} # required
```
