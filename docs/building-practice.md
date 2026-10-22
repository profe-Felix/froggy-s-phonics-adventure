# Building practice and level readiness

The existing family carousel now places preparation before all readers, so
later daily sight-word charts no longer follow an earlier book. Original daily
steps and saved source indexes are not reordered or deleted.

Required building activities are added as a derived view, not by rewriting
authored lessons. They cover introduced HFW, reviewed/decodable book-bank
syllables and words, and teacher-authored image-backed phrases. No syllable
building appears before a consonant. An empty bank does not create a fake or
impossible activity. Existing vocabulary-review exclusions remain authoritative.

Every required activity needs **18 first-try correct answers in a 20-item
round**. A hint or wrong first answer removes first-try credit. Students correct
misses before finishing; corrections do not inflate accuracy. A failed round
requires a fresh twenty-item round. Hearing a target is not a hint.

Scoring uses server-owned question snapshots and private append-only answer
events. Duplicate network requests are idempotent; concurrent correct retries
cannot overwrite a wrong first answer. Ordinary clients cannot write the
mastery tables. Student identity comes from existing Student records and their
current permissions; no Student records are created.

Saved levels earned before rollout remain earned. New family completion
checks the private mastery receipt before writing the original daily/weekly
progress, and the path checks readiness before unlocking the following level.
Existing teacher-model account #30 keeps its modeling bypass and teacher labels.
Legacy open LessonProgress permissions are not changed by this feature.

## Teacher setup

Open `/BuildingPracticeSetup` or **Building practice: targets and image phrases**
from a teacher/model level preview. A saved lesson can be selected, and HFW,
syllable and word override lists can be vetted. Empty lists use the automatic
curriculum bank; nonempty lists cannot reintroduce excluded or future targets.

Add phrases explicitly, including the article/gender and order you intend.
Look up the noun in the existing image library or enter an HTTPS image URL.
The builder uses letter tiles for HFW/syllables, syllable tiles for words, and
word tiles for phrases. Phrases appear only when every token is an introduced
HFW or decodable word. The editor shows which targets are currently available.

Teacher edits use the existing Lesson permissions, not an escalated service
write. Concurrent stale edits return a reload message instead of overwriting
a newer configuration. Already-earned levels are not revoked. In-progress
twenty-item rounds keep their original snapshot; new rounds load the latest bank.

With an existing studentId in the setup URL, practice links open
`/BuildingPractice?lessonId=...&studentId=...&kind=...` without creating a student.
That direct practice page does not mark unrelated lesson steps complete.

## Function packaging

Base44 functions cannot import outside their own function folder. Run
`node scripts/build-building-curriculum.mjs` after changing canonical
curriculum or bank rules, and commit the small generated function-local bundle.
Tests compare the bundle against all 180 canonical introduction positions.
The generated file is deployment code, not a separately maintained schedule.
