---
title: Failure and Fixed Use Case
description: Notify only when a job fails or when a previous failure is fixed.
sidebar:
  label: Failure and Fixed
  order: 3
---

Notify only when a job fails, or when a failure of the same workflow and branch is fixed.
Successful runs and cancellations stay quiet in Slack.

```yaml
steps:
  - uses: h3y6e/action-slack@v4
    with:
      status: ${{ job.status }}
      notify: failure,fixed
    env:
      SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }} # required
    if: always() # Required to detect failures and fixes.
```

`if: always()` is required to notify failures.
Without it, the action is skipped when the job fails, so failures go unnoticed. The fix notification is sent on the successful run.

See [notify](/action-slack/usage/with#notify) for details.
