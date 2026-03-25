---
title: Usage
description: How to use action-slack in your GitHub Actions workflow.
sidebar:
  label: Overview
  order: 1
---

```yaml
steps:
  - uses: h3y6e/action-slack@v4
    with:
      status: ${{ job.status }}
      author_name: Integration Test # default: h3y6e@action-slack
      fields: repo,commit,message,author # default: repo,commit
      mention: here
      if_mention: failure,cancelled
    env:
      SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }} # required
    if: always() # Pick up events even if the job fails or is canceled.
```

- [With Parameters](/action-slack/usage/with/)
- [Fields](/action-slack/usage/fields/)
