# Vulkan

## Portfolio sync

The projects manager loads the saved `/app/projects` portfolio before contacting
GitHub. A failed fetch or pull leaves the last loaded portfolio available. Successful
reloads replace the cache atomically, so removed projects disappear as expected.

`PROJECTS_REPO_URL` should be a credential-free HTTPS repository URL.
`VULKAN_GIT_TOKEN` supplies authentication through process-only Git configuration
(`http.<origin>/.extraheader`), using `x-access-token` as the Basic-auth username.
Do not embed the token in remote URLs or command-line arguments. Sync also replaces
older persisted authenticated origin URLs with the configured clean URL.

This is an in-memory cache backed by the existing persistent projects volume, not
a new storage service. A fresh installation still needs a successful initial sync.

## Tests

```sh
npm ci --ignore-scripts
npm test
```

Tests cover cached startup when GitHub is unavailable, clone and pull failures,
successful refresh, failed filesystem reloads, and process-only authentication.
They use temporary local fixtures and do not contact GitHub or change live data.
