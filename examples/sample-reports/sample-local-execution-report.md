# Sample Local Execution Report

```xml
<LOCAL_EXECUTION_REPORT id="SAMPLE-LOCAL-REPORT-001" taskCardId="SAMPLE-CODEX-TASK-001" executor="codex" version="1">
status:
completed

projectDir:
<project-root>

summary:
Created a public-safe sample note under examples.

filesChanged:
- examples/sample-note.md

commandsRun:
- Get-ChildItem -LiteralPath <project-root>/examples

validation:
- Confirmed the file exists.
- Confirmed no remote was added.

notes:
No credentials, private records, or real local paths were included.
<LOCAL_EXECUTION_REPORT_END id="SAMPLE-LOCAL-REPORT-001">
```
