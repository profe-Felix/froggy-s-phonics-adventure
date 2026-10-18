# Native notebook control synchronization

The native assessment, lesson-step and direct-link notebook pilot is installed
and published in Base44. Server and client readiness gates are ON only for
Felix / 26-27 / Aprende y Demuestra. Other classes and assignments retain their
existing writer. Student picture login is unchanged; recording remains off.

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
It is published with the additive `notebook_base44_bridges.native_controls`
JSONB column and native permission table.

Controls and source versions commit in one class-serialized transaction.
Identical retries return the existing revision without rebroadcasting. Older
or conflicting versions cannot overwrite newer controls. Releasing everybody
ends access; an empty targeted group never becomes a whole-class broadcast.
Native credentials from an older assessment cannot write new operations into a
newer assessment, while exact receipts and authorized save-only recovery remain
available for earlier work.

## Verified and remaining classroom checks

The owner explicitly chose to keep the current teacher page open, with no
account login or private teacher link, after the access consequences were
explained. Exact server-owned app/class/year/assignment matching enables this
only for the fixed Felix pilot. Teacher bootstrap, controls and renewal do not
require user sign-in there. Anyone reaching that teacher interface can view
and control the pilot. Unrelated owner APIs and other scopes remain unchanged.
Fresh saved records still govern groups, pages, pause, release and step limits;
server bridge/admin keys are never exposed to the browser. The non-mutating
start preflight remains, but verifies the approved open scope rather than
requiring an account. Student picture entry and same-source resume are unchanged.

The published Base44 SDK function returned real assessment and lesson teacher
contracts against the correct 206-page template; lesson step and page limits
matched saved records. Checks used inactive disposable records and removed
them afterwards, without starting a class or changing student work.

The real native browser journey on disposable development data verified student
save/reload, teacher thumbnails, same-grant pause/resume, offline queue and
reconnection, retained/recovered released-seat work, enlargement and
non-mutating replay. The default teacher host and forced token renewal/reconnect
passed after its student-only renewal validation was corrected.

Workers does not accept Node's `redirect: "error"` fetch option. Server requests
use manual mode and reject redirects without forwarding the bridge credential.
Server secret changes require republishing to reach the pinned public function.
Actual app source was installed using official sandbox-bridge APIs, with restore
points before installation and after verification.

The physical 20-iPad classroom trial and 60–100-client/multi-class capacity test
remain outstanding. Development browser evidence is not a full Base44
production student picture-login journey or a capacity guarantee.

## Local checks

Node 22.13 or newer:

```sh
npm run test:notebook-controls
```

The tests run real policies/handlers and controller/route/renewal/auth helpers with
controlled SDK and HTTP boundaries. The actual Base44 sandbox production build
also passed. Separate production SDK checks and real development browser checks
are described above; the unit suite alone does not establish those outcomes.
