# Architecture Overview

ACB is a local-first control bridge for AI-assisted development workflows. It
connects a browser-side console with a VS Code-side local bridge so a user can
review project context and prepare execution handoffs without granting automatic
execution.

## Components

## Browser Extension

The browser extension provides the ACB console. It can display task-card
payloads, show route and readiness information, and prepare handoff text for a
local executor workflow.

## VS Code Extension

The VS Code extension exposes local project status and local bridge endpoints.
It can inspect the currently opened workspace and return summarized status to
the browser extension.

## Local Bridge

The local bridge is a loopback-only development bridge. It is intended for
communication between local tools on the same machine. It is not a hosted
service, and it should not be exposed to the public internet.

## Execution Inbox

The Execution Inbox concept is a local review queue. A task card may be prepared
for an executor profile, but execution remains separate from drafting. The user
reviews the payload before deciding whether anything should run.

## Data Flow

1. The browser extension prepares or receives a task-card payload.
2. The browser extension asks the local VS Code bridge for project status.
3. The bridge returns a compact local status summary.
4. The browser extension displays readiness and route information.
5. The user may choose to fill a terminal with reviewed text.
6. The user decides whether to execute the terminal input.

## Non-Goals In This Seed

- No hosted cloud coordinator.
- No remote execution service.
- No automatic terminal execution.
- No private governance records or production process logs.
