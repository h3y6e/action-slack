# Usage

```yaml
steps:
  - uses: h3y6e/action-slack@v3
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

- [With Parameters](./with.md)
- [Fields](./fields.md)
