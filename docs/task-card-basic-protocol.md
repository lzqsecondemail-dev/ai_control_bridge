# Task Card Basic Protocol

A task card is a structured request that can be reviewed by a human and routed
to an executor profile. This public seed uses a simplified protocol so examples
can be shared without exposing private workflow records.

## Minimal Fields

- `messageType`: the kind of payload, such as `execution`.
- `taskTitle`: short human-readable title.
- `projectDir`: placeholder or local project path.
- `objective`: the requested outcome.
- `allowedActions`: actions the executor may take.
- `forbiddenActions`: actions the executor must not take.
- `acceptanceCriteria`: conditions for completion.

## Safety Expectations

Task cards should state the working directory, write scope, forbidden actions,
and reporting expectations. They should avoid secrets and avoid unnecessary
local machine details.

## Example Envelope

```xml
<ACB_TASK_CARD id="SAMPLE-TASK-001" target="local-executor" version="1">
messageType:
execution

taskTitle:
Create a sample file

projectDir:
<project-root>

objective:
Create a harmless sample file in the examples directory.

allowedActions:
- Read files under <project-root>.
- Write files under <project-root>/examples.

forbiddenActions:
- Do not read secrets.
- Do not push to a remote.
- Do not run destructive git commands.

acceptanceCriteria:
- The sample file exists.
- The final report lists commands and files changed.
<ACB_TASK_CARD_END id="SAMPLE-TASK-001">
```

Real task cards should use project-appropriate IDs and should not include
credentials or private reports.
