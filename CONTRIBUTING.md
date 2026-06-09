# Contributing

Thanks for helping improve ACB.

## Ground Rules

- Keep the project local-first and human-reviewed.
- Do not add automatic command execution as a default behavior.
- Do not commit secrets, private workflow records, real task cards, local
  execution reports, or machine-specific paths.
- Keep examples generic and use placeholder paths such as `<project-root>`.
- Prefer small, reviewable changes with focused tests.

## Development

Run the VS Code extension tests from the repository root:

```bash
npm run test:vscode
```

Browser extension changes should be tested by loading
`<project-root>/apps/browser-extension` as an unpacked extension in a local
development browser profile.

## Pull Requests

Include:

- A short description of the change.
- Safety impact, if the change touches bridge, terminal, routing, or payload
  handling behavior.
- Manual test notes or automated test output.

Never include private reports, private task cards, credentials, or sensitive
local paths in pull request text or attachments.
