# Safety Model

ACB's safety model is based on explicit human review. The project may help
prepare instructions, status summaries, and terminal input, but the default
workflow keeps execution decisions with the user.

## Principles

- Local first: project context stays on the user's machine by default.
- Review before action: generated task cards and execution drafts are visible.
- No automatic Enter: filled terminal text is not automatically executed.
- Least surprise: bridge endpoints should have narrow local behavior.
- Keep private process records out of source control.

## Local Bridge Boundary

The local bridge should be treated as a local developer tool. It should bind to
loopback interfaces, avoid public exposure, and return only the information
needed for the current workflow.

## Terminal Fill Boundary

Terminal fill is a convenience for preparing text. It does not mean the user has
approved execution. The final action remains pressing Enter or otherwise running
the command manually.

## Repository Hygiene

Do not commit:

- Secrets or credentials.
- Private task cards.
- Private execution reports.
- Machine-specific paths.
- Internal governance records that have not been approved for publication.

## Review Checklist

Before publication or release:

- Run a secret scan.
- Search for local machine paths.
- Review docs for private process details.
- Confirm no generated reports or queue directories are tracked.
