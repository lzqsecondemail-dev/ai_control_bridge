# M3-UI.0 Deferred Ideas

Ideas discussed during M3-UI.0 design that are explicitly deferred. Not in M3-UI.0 scope.

---

## A. Project Control Packet / GPT Project Source Constraint Generator

Generate a Markdown constraint/source file for users to upload into their ChatGPT Project.

### Purpose

- Give ChatGPT Project a precise machine-readable contract about ACB protocol rules.
- Ensure generated task cards comply with ACB format requirements.

### Content would include

- ACB protocol rules
- `messageType` definitions
- `ACB_CARD_META` format
- `ACB_ROLE_MESSAGE` format
- `ACB_TASK_CARD` format and 14 required fields
- User custom project constraints

### Status

Deferred. Not part of M3-UI.0.

---

## B. Local Task API / External Tool Pull Model

Future external tools may pull tasks from ACB rather than ACB pushing to each tool.

### Possible endpoints

```
GET  /acb/v1/tasks/pending
GET  /acb/v1/tasks/{taskCardId}
POST /acb/v1/tasks/{taskCardId}/claim
POST /acb/v1/tasks/{taskCardId}/report
POST /acb/v1/tasks/{taskCardId}/status
```

### Requires later design for

- Authentication
- Local permissions
- Task claim and duplicate execution prevention
- Source metadata validation
- Reporting

### Status

Deferred architecture idea. Not part of M3-UI.0.

---

## C. Future Execution Levels

Execution capability is future work. A possible staged model:

| Level | Description | Recommended for near term |
|---|---|---|
| 0 | Read-only review | Current stage |
| 1 | Copy task card, user manually pastes | Low risk |
| 2 | Open terminal and prefill task card, user manually presses Enter | Low risk |
| 3 | Explicit user-confirmed execution | Requires safety lock design |
| 4 | Automatic execution | Not recommended for near term |

### Status

Deferred. No execution level beyond Level 0 is authorized in current scope.
