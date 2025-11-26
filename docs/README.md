# action-slack

You can notify slack of GitHub Actions.

![success](https://user-images.githubusercontent.com/8043276/185978284-4c2c5683-5d0d-4a8e-a0f8-1e74c2c8d1fa.png)

- [Usage](./usage/)
- [Use case](./usecase/)

```yaml
steps:
  - uses: h3y6e/action-slack@v3
    with:
      status: ${{ job.status }}
      fields: repo,message,commit,author,action,eventName,ref,workflow # selectable (default: repo,message)
    env:
      SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }} # required
    if: always() # Pick up events even if the job fails or is canceled.
```

> This is a fork of [8398a7/action-slack](https://github.com/8398a7/action-slack), which was archived on 2025-09-13.
