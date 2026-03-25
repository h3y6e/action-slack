---
title: General Use Case
description: Notify slack of the results of a single job run.
sidebar:
  label: General
  order: 1
---

Notify slack of the results of a single job run.

```yaml
steps:
  - uses: h3y6e/action-slack@v4
    with:
      status: ${{ job.status }}
      fields: repo,message,commit,author,action,eventName,ref,workflow,job,took,pullRequest # selectable (default: repo,message)
    env:
      SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }} # required
    if: always() # Pick up events even if the job fails or is canceled.
```

`status: ${{ job.status }}` allows a job to succeed, fail or cancel etc. to action-slack.
`if: always()` to trigger action-slack even if the job fails.

For the fields, look at [Fields](/action-slack/usage/fields/) to determine what you want.
