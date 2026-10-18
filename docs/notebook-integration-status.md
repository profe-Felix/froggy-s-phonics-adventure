# Native notebook control synchronization

This branch implements teacher control synchronization without enabling it.
It does not change main, publish the app, change student picture login, or
activate recordings or lesson steps.

## Implemented in this branch

- `externalNotebookControl` authenticates the Base44 account before any
  service-role record read. App administrators are allowed; other teachers must
  appear in the server-only mapping's `teacherUserIds` list.
- Only an assessment ID and request UUID come from the browser. Class, assignment,
  source versions, page, pause/end, targeting and releases come from fresh records.
- The existing teacher panel already calls this function after acknowledged
  assessment changes and displays a retryable error if synchronization fails.
- Only the fixed notebook backend receives the bridge credential; redirects,
  foreign origins, arbitrary policy fields and malformed acknowledgments fail.

## Companion notebook backend

The separate Replit backend adds POST `/api/notebook/base44/native-controls`.
It must be published with the additive `notebook_base44_bridges.native_controls`
JSONB column before this function can be used.

Controls and source versions commit in one class-serialized transaction.
Identical retries return the existing revision without rebroadcasting. Older
or conflicting versions cannot overwrite newer controls. Releasing everybody
ends access; an empty targeted group never becomes a whole-class broadcast.
Native credentials from an older assessment cannot write new operations into a
newer assessment, while exact receipts and authorized save-only recovery remain
available for earlier work.

## Still disabled / not verified in a live Base44 classroom

All configuration and readiness switches remain OFF, including the server's
`NOTEBOOK_NATIVE_ENABLED`. Teacher bootstrap/native monitoring UI and remaining
handoff verification are not completed by this branch. Do not toggle flags yet.
No 20-iPad capacity claim is made. Publish/activation requires a separate review.

## Local checks

Node 22.13 or newer:

```sh
npm run test:notebook-controls
```

The tests run the real function/policy with controlled SDK and HTTP boundaries;
they do not access production records or establish installed Base44 SDK behavior.
