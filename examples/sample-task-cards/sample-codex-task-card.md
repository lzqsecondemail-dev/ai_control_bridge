# Sample Codex Task Card

```xml
<ACB_TASK_CARD id="SAMPLE-CODEX-TASK-001" target="codex" version="1">
messageType:
execution

taskTitle:
Create a public-safe sample note

projectDir:
<project-root>

objective:
Create a short sample note under examples without touching any private files.

writeScope:
Only <project-root>/examples is writable.

allowedActions:
- Read public project files under <project-root>.
- Create <project-root>/examples/sample-note.md.
- Run local validation commands.

forbiddenActions:
- Do not read .env files.
- Do not copy credentials.
- Do not use real task reports.
- Do not add a git remote.
- Do not push.
- Do not run destructive git commands.

acceptanceCriteria:
- <project-root>/examples/sample-note.md exists.
- The final report lists the file created and validation performed.

exampleAlternatePaths:
- C:\example\project
- /tmp/example-project
<ACB_TASK_CARD_END id="SAMPLE-CODEX-TASK-001">
```
