# action-slack

You can notify Slack of GitHub Actions.

> This is a fork of [8398a7/action-slack](https://github.com/8398a7/action-slack), which was archived on 2025-09-13.

## Usage

See [action-slack documentation](https://action-slack.netlify.app/).

```yaml
- uses: h3y6e/action-slack@v3
  with:
    status: ${{ job.status }}
    fields: repo,message,commit,author,action,eventName,ref,workflow,job,took
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
  if: always()
```

## License

MIT
