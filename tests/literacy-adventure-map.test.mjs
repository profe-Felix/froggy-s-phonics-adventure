import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_MAP } from '../base44/functions/adventureMap/config.js';
import { validateMap, studentScope, progressFromAttempts, levelState,
  assertOpenLevel, assertAttempt, assertRequirement } from '../base44/functions/adventureMap/model.js';
import { adventureGeometry } from '../src/lib/adventure/model.mjs';

const map = validateMap();
const scope = studentScope({ id: 'existing-student', student_number: 1,
  class_name: 'Felix', school_year: '26-27' }, map);
const receipt = (number, extra = {}) => ({ ...scope, level_number: number, status: 'completed', ...extra });

test('exactly 200 configurable levels and 10 sections remain separate from the real curriculum', () => {
  assert.equal(map.levels.length, 200);
  assert.equal(map.sections.length, 10);
  assert.equal(map.levels[199].number, 200);
  assert.equal(map.id, 'adventure-preview');
  assert.ok(map.levels.every(l => l.requirement.type === 'preview_confirmation'));
  const customized = structuredClone(DEFAULT_MAP);
  customized.levels[0] = { number: 1, title: 'Read with me', description: 'Read a real lesson',
    destination: '/LetterGame?studentId=existing', requirement: { type: 'lesson_completion', lessonId: 'week:monday' } };
  assert.equal(validateMap(customized).levels[0].requirement.lessonId, 'week:monday');
  for (const destination of ['https://evil.example', '//evil.example', 'javascript:alert(1)', '/LetterGame\\evil']) {
    assert.throws(() => validateMap({ ...customized, levels: customized.levels.map((l, i) => i ? l : { ...l, destination }) }));
  }
  assert.throws(() => validateMap({ ...map, levels: map.levels.slice(1) }));
  assert.throws(() => validateMap(null), /not available/);
});

test('progress is contiguous and isolated by existing student ID, class, year, map and revision', () => {
  const rows = [receipt(1), receipt(1), receipt(2), receipt(4), receipt(3, { student_id: 'another' }),
    receipt(3, { class_name: 'Valero' }), receipt(3, { school_year: '25-26' }),
    receipt(3, { map_id: 'different' }), receipt(3, { map_revision: 'older' }),
    receipt(3, { status: 'started' })];
  assert.deepEqual(progressFromAttempts(rows, scope),
    { completedCount: 2, completedLevels: [1, 2], currentLevel: 3 });
  assert.throws(() => studentScope({ id: 'new', student_number: 31 }, map));
});

test('locked levels cannot open or skip; completion opens only the next number', () => {
  const p = progressFromAttempts([], scope);
  assert.equal(levelState(1, p), 'current');
  assert.equal(levelState(2, p), 'locked');
  assert.throws(() => assertOpenLevel(2, p, map), /Finish the current/);
  for (const invalid of [0, 201, 1.5, '1', null]) assert.throws(() => assertOpenLevel(invalid, p, map));
  const advanced = progressFromAttempts([receipt(1)], scope);
  assert.equal(levelState(1, advanced), 'completed');
  assert.equal(levelState(2, advanced), 'current');
  assert.equal(levelState(3, advanced), 'locked');
  assert.equal(assertOpenLevel(1, advanced, map).number, 1);
});

test('all 200 completions finish the map without creating a level 201', () => {
  const p = progressFromAttempts(map.levels.map(l => receipt(l.number)), scope);
  assert.equal(p.completedCount, 200);
  assert.equal(p.currentLevel, null);
  assert.equal(p.completedLevels.length, 200);
});

test('attempts reject other students, levels and expired or malformed timestamps', () => {
  const attempt = { ...scope, level_number: 1, status: 'started', expires_at: '2099-01-01T00:00:00Z' };
  assert.doesNotThrow(() => assertAttempt(attempt, scope, 1));
  assert.throws(() => assertAttempt({ ...attempt, student_id: 'another' }, scope, 1), /different student/);
  assert.throws(() => assertAttempt(attempt, scope, 2), /different student/);
  assert.throws(() => assertAttempt({ ...attempt, expires_at: 'invalid' }, scope, 1), /expired/);
  assert.throws(() => assertAttempt({ ...attempt, expires_at: '2020-01-01T00:00:00Z' }, scope, 1), /expired/);
  // Retrying a successfully saved receipt stays idempotent, even later.
  assert.doesNotThrow(() => assertAttempt({ ...attempt, status: 'completed', expires_at: '2020-01-01T00:00:00Z' }, scope, 1));
});

test('preview confirmation cannot impersonate evidence for real-lesson requirements', () => {
  assert.throws(() => assertRequirement(map.levels[0], {}), /Confirm/);
  assert.doesNotThrow(() => assertRequirement(map.levels[0], { confirmed: true }));
  const lesson = { requirement: { type: 'lesson_completion', lessonId: 'week:monday' } };
  assert.throws(() => assertRequirement(lesson, { confirmed: true, completed: true }, []), /Finish the assigned/);
  assert.throws(() => assertRequirement(lesson, {}, [{ lesson_id: 'different', completed: true }]));
  assert.throws(() => assertRequirement(lesson, {}, [{ lesson_id: 'week:monday', completed: false }]));
  assert.doesNotThrow(() => assertRequirement(lesson, {}, [{ lesson_id: 'week:monday', completed: true }]));
});

test('shared geometry has 200 monotonic positions, smooth SVG connections and 10 visible milestones', () => {
  const geometry = adventureGeometry();
  assert.equal(geometry.points.length, 200);
  assert.equal(geometry.milestones.length, 10);
  assert.equal((geometry.path.match(/C /g) || []).length, 199);
  for (let i = 0; i < geometry.points.length; i++) {
    const p = geometry.points[i];
    assert.ok(p.x > 80 && p.x < geometry.width - 80);
    if (i) assert.ok(p.y > geometry.points[i - 1].y);
  }
  assert.ok(geometry.milestones.at(-1).y + 60 < geometry.height);
  for (const viewport of [320, 390, 768, 1024, 1440]) {
    const width = Math.min(viewport, geometry.width);
    for (const p of geometry.points) assert.ok(p.x / geometry.width * width > 40);
  }
});

test('new persistence is server validated, permissions gated and never creates students or writes old progress', async () => {
  const entry = await readFile(new URL('../base44/functions/adventureMap/entry.ts', import.meta.url), 'utf8');
  const hook = await readFile(new URL('../src/hooks/useAdventureMap.js', import.meta.url), 'utf8');
  assert.match(entry, /caller\.entities\.Student\.get/);
  assert.match(entry, /assertOpenLevel\(body.level/);
  assert.match(entry, /assertAttempt\(attempt/);
  assert.match(entry, /assertRequirement\(level/);
  assert.doesNotMatch(entry, /Student\.(?:create|update)|LessonProgress\.(?:create|update)/);
  assert.match(hook, /identity\.current === origin && generation\.current === turn/);
  assert.match(hook, /if \(response\.data\?\.error\)/);
  assert.match(hook, /setMap\(null\); setProgress\(studentId \? emptyState : demoState\)/);
  for (const entity of ['AdventureMapAttempt', 'AdventureMapDefinition']) {
    const schema = JSON.parse(await readFile(new URL(`../base44/entities/${entity}.jsonc`, import.meta.url), 'utf8'));
    assert.equal(schema.rls.create.user_condition.role, 'admin');
    assert.equal(schema.rls.update.user_condition.role, 'admin');
  }
});

test('responsive map keeps full-sized HTML touch targets and does not scale the whole path on phones', async () => {
  const component = await readFile(new URL('../src/components/adventure/LearningAdventureMap.jsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/components/adventure/adventure-map.css', import.meta.url), 'utf8');
  assert.match(component, /preserveAspectRatio="none"/);
  assert.doesNotMatch(component, /transform:\s*`scale/);
  assert.match(component, /disabled=\{state === 'locked' \|\| disabled\}/);
  assert.match(css, /width:64px;height:64px/);
  assert.match(css, /prefers-reduced-motion/);
});
