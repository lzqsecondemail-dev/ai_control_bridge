# Local Execution Report Example

This document shows a simplified local execution report format using fake data.
It is not copied from a private workflow.

```xml
<LOCAL_EXECUTION_REPORT id="SAMPLE-REPORT-001" taskCardId="SAMPLE-TASK-001" executor="local-executor" version="1">
status:
completed

projectDir:
<project-root>

summary:
Created a sample file under examples and verified it exists.

filesChanged:
- examples/sample-output.txt

commandsRun:
- Get-ChildItem -LiteralPath <project-root>

validation:
- Confirmed examples/sample-output.txt exists.

notes:
No secrets, private paths, remotes, or destructive git commands were used.
<LOCAL_EXECUTION_REPORT_END id="SAMPLE-REPORT-001">
```

Use placeholder paths in shared examples, such as `<project-root>`,
`C:\example\project`, or `/tmp/example-project`.
