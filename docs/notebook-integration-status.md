# Native notebook control synchronization

This branch implements native assessment, lesson-step and direct-link notebooks without enabling them.
It does not change main, publish the app, change student picture login, or
activate recordings or route students away from the existing writer.

## Implemented in this branch

- `externalNotebookControl` authenticates the Base44 account before any
  service-role record read. App administrators are allowed; other teachers must
  appear in the server-only mapping's `teacherUserIds` list.
- Only an activity ID and request UUID come from the browser. Class, assignment,
  source versions, page, pause/end, targeting and releases come from fresh records.
- The existing teacher panel already calls this function after acknowledged
  assessment changes and displays a retryable error if synchronization fails.
- Only the fixed notebook backend receives the bridge credential; redirects,
  foreign origins, arbitrary policy fields and malformed acknowledgments fail.
- Teacher bootstrap authenticates before record reads and reconciles active
  saved controls once before opening the native class monitor.
- The monitor has sharp page images with normalized ink, configurable columns,
  lazy per-thumbnail scrub history and an enlarged replay view.
- Lesson grants derive assignment/pages from the saved Lesson or SmallGroupLesson.
  Watch pauses writing; own-pace release respects the teacher's step floor.
- `/LiveNotebook?assessment=SOURCE_ID&class=Felix` opens an assessment directly.
  `/LiveNotebook?lesson=SESSION_ID&step=0&class=Felix` opens a notebook lesson step.
  Numberless links reuse the existing picture chooser; `&number=4` selects that seat.
  Links contain no credentials and cannot create, start or retarget an activity.
- Activity exits, group releases and step changes retain the same mounted slot
  until its save/recovery and close guards finish, including lesson recovery.

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

All client configuration and readiness switches remain OFF. The current Base44
server gate has not been inspected; it must remain OFF until the
backend is published and the installed Base44 configuration is verified.
Teacher bootstrap and monitoring are implemented, but installed Base44 SDK and
native browser handoff verification remain incomplete. Do not toggle flags yet.
No 20-iPad capacity claim is made.

The current published Replit backend returned 404 for both native-session and
native-controls during preflight. A Replit Publish action and separate Base44
authorization are still required; GitHub Contents permission does not provide
Base44 secret/configuration or publishing access.

The attempted browser pass could not reach the native surface; it did not verify
canvas save/reload or mounted-slot recovery. An HTTP fixture's teacher-review
failure was traced to using its POST-only helper for a GET route. The corrected
GET check passed; do not misreport that fixture mistake as a production auth bug.

## Local checks

Node 22.13 or newer:

```sh
npm run test:notebook-controls
```

The 29 tests run real policies/handlers and controller/route helpers with controlled SDK and HTTP boundaries;
they do not access production records or establish installed Base44 SDK behavior.
The full local app import graph also bundles with esbuild (package dependencies
external), which is not a Vite production build or browser verification.
