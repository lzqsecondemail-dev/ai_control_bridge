# Security Policy

ACB is built around a local-first safety model. The VS Code bridge is intended
to run only on the user's local machine, and this seed repository does not
include a remote execution service.

## Default Safety Properties

- No remote execution by default.
- No automatic terminal Enter by default.
- No automatic command execution by default.
- Terminal fill is treated as a review step, not consent to execute.
- Local reports and private workflow records should stay out of git.

## Reporting Vulnerabilities

Please report vulnerabilities through the project's preferred private security
contact once one is published. Until then, avoid disclosing exploitable details
in public issues.

Do not include secrets in reports. Redact access tokens, API keys, passwords,
cookies, authorization headers, private local paths, private task cards, and
private execution reports.

## Scope

Security-sensitive areas include:

- Browser extension content scripts and storage.
- The VS Code local bridge endpoint.
- Project status reporting.
- Terminal launch and terminal fill behavior.
- Any handling of task-card or report payloads.

## Publication Reminder

Before publishing a release or public repository, run a fresh secret scan and
review copied docs for private process details.
