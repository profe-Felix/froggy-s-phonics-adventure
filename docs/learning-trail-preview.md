# Separate 200-level learning trail

Open `/LearningTrailPreview`. This is a separate test route. It does not replace
the existing pathway, its 67 lessons, student records, or real lesson progress.

Without a student, the page is an interactive demo; its initial completed
levels are illustrative and changes are not saved. Select an existing student
to save preview-only progress, or pass `?studentId=EXISTING_STUDENT_ID`.
The resolver never creates students. Duplicate class/number matches require
a direct student link rather than picking a record arbitrarily.

## Configure educational activities

The default catalog is `base44/functions/adventureMap/config.js`. It has 200
test stops requiring explicit preview confirmation—not 200 authored lessons.
Each level provides `number`, `title`, `description`, `destination`, and
`requirement`. Destinations are validated app-relative activity URLs.

For a real lesson, use:

```js
{
  number: 1,
  title: 'Read with me',
  description: 'Complete the assigned reading lesson.',
  destination: '/LetterGame?studentId={studentId}',
  requirement: { type: 'lesson_completion', lessonId: 'EXISTING_LESSON_ID:monday', label: 'Check lesson completion' }
}
```

The function checks actual saved `LessonProgress` for this student, class and
school year. Visiting a URL or clicking a client-side confirmation is not
evidence that a lesson was finished.

Destination placeholders `{studentId}`, `{className}`, `{number}`, and
`{schoolYear}` are replaced with the selected student's URL-encoded identity.
Demo mode does not launch destinations needing a real student.

An administrator can instead provide one `AdventureMapDefinition` per `map_id`
in Base44: `revision`, `title`, `sections_data` (JSON array of 10 names), and
`levels_data` (JSON array of 200 ordered definitions). Invalid definitions fail
explicitly. Change the revision when changing the meaning/order of a progression.
The default preview never changes the existing curriculum.

## Persistence and permissions

The function uses the caller's existing Base44 permissions to resolve/read the
Student. Attempt metadata is admin-only; clients cannot write completions
directly. Writes verify current-level unlocks, attempt ownership/expiry, and
server-owned requirements. Completed attempts form append-style receipts;
progress is the contiguous completed prefix, not an overwriteable counter.
Retries and concurrent confirmations of the same stop cannot regress progress.

Progress is scoped by existing Student ID, class, school year, map and revision.
No Student records or existing LessonProgress are created/updated by the map.
The reusable `LearningAdventureMap` renders geometry and calls supplied
handlers; it does not own identity or persistence.
