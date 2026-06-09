# ACB - AI Control Bridge

ACB is an early-stage, local-first bridge for coordinating AI assistant work
with human review. The project explores a browser extension plus a VS Code
local bridge that can receive task-card style instructions, show local project
status, and prepare terminal input for a human to review before execution.

This seed repository contains a public-safe foundation. It intentionally omits
private governance records, real execution reports, real task cards, private
process history, and local machine paths.

## Architecture

ACB has two main application surfaces:

- `apps/browser-extension`: a Manifest V3 browser extension that provides the
  ACB console and task-card handling UI.
- `apps/vscode-extension`: a VS Code extension that exposes local project
  status and a local-only bridge endpoint for the browser extension.

The browser extension can communicate with a local bridge hosted by the VS Code
extension. The bridge is designed for local development workflows where the
human remains in control of what is sent to a terminal.

## Local-First Principle

ACB is intended to run on the user's own machine. The local bridge is not a
remote execution service, and this seed does not include any hosted backend.
The default posture is to keep project status, execution drafts, and reports
local unless a user deliberately chooses otherwise.

## Execution Safety

ACB does not auto-execute terminal commands by default. Its Execution Inbox and
terminal fill concepts are designed around reviewable handoff:

1. A task card is prepared or received.
2. The user reviews the task card and target executor profile.
3. A terminal may be opened or focused by explicit user action.
4. Text may be filled into the terminal for review.
5. The user decides whether to press Enter and run anything.

No automatic Enter behavior is part of the default safety model.

## Development Status

This repository is a seed, not a finished product. APIs, extension UX, and local
protocols may change. Review the code and docs before using ACB with sensitive
projects.

## Getting Started

Prerequisites:

- Node.js suitable for VS Code extension development.
- VS Code for running the local bridge extension.
- A Chromium-based browser for loading the browser extension during local
  development.

Run local extension tests:

```bash
npm run test:vscode
```

Load the browser extension from:

```text
<project-root>/apps/browser-extension
```

Open the VS Code extension project at:

```text
<project-root>/apps/vscode-extension
```

## Documentation

- `docs/architecture-overview.md`
- `docs/safety-model.md`
- `docs/task-card-basic-protocol.md`
- `docs/local-execution-report-example.md`
- `docs/examples/README.md`

## Security

See `SECURITY.md`. Do not publish secrets, local credentials, private task
cards, private reports, or sensitive local paths in issues or pull requests.

## License

Licensed under the Apache License, Version 2.0. See `LICENSE` and `NOTICE`.

## No Warranty

This software is provided as-is, without warranty. It is early-stage tooling for
local AI workflow experiments and should be reviewed carefully before use.
