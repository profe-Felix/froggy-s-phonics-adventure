import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHelpLetters, normalizeLetterHelp, letterHelpForPage } from '../base44/shared/notebookLetterHelp.mjs';
import { letterHelpStrokeColor, LETTER_HELP_STROKE_COLORS } from '../src/lib/notebookLetterHelp.mjs';

const rule = { id: 'help-test', pageStart: 2, pageEnd: 4, letters: ['d', 't', 'p'], x: .82, y: .11, speed: .5, enabled: true };
const book = { id: 'book-test', pageCount: 8, width: 1000, height: 1300 };
const source = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const fresh = suffix => import(`../base44/shared/notebookLetterHelp.mjs?case=${suffix}`);

test('help reuses the original people/fence guide and authored writing-line positions without warping letters', async () => {
  const [replay, original, guide] = await Promise.all([
    source('src/components/notebook/LetterHelpReplay.jsx'),
    source('src/components/game/LetterTracingCanvas.jsx'),
    source('src/components/tracing/GuideKeyVisual.jsx'),
  ]);
  for (const y of ['.10', '.367', '.633', '.90']) assert.ok(replay.includes(`y: ${y},`));
  for (const y of ['0.10', '0.367', '0.633', '0.90']) assert.ok(original.includes(`${y} * CANVAS_H`));
  assert.match(replay, /y: p\.y \* CH/);
  assert.match(replay, /<CachedGuideKeyVisual/);
  assert.match(replay, /const GUIDE_W = 260/);
  assert.match(original, /const GUIDE_W = 260/);
  assert.ok(!replay.includes('y: .42,'));
  assert.match(guide, /<WalkingFigure/);
  assert.match(guide, /href=\{FENCE_URL\}/);
  const cached = guide.slice(guide.indexOf('export function CachedGuideKeyVisual'), guide.indexOf('function GuideKeyDrawing'));
  assert.match(cached, /<GuideKeyDrawing/);
  assert.ok(!cached.includes('useTracingGuideSettings'));
  assert.ok(!cached.includes('base44.entities'));
});

test('contrasting pencil tip follows the real spline arc and stroke colors remain stable', async () => {
  const replay = await source('src/components/notebook/LetterHelpReplay.jsx');
  assert.match(replay, /path\.getPointAtLength\(length \* progress\)/);
  assert.match(replay, /path\.getTotalLength\(\)/);
  assert.match(replay, /const strokeColor = letterHelpStrokeColor\(i\)/);
  assert.match(replay, /stroke=\{strokeColor\}/);
  assert.match(replay, /data-testid="letter-stroke-colors"/);
  assert.match(replay, /data-testid="letter-pencil-tip"/);
  assert.match(replay, /fill="#f97316"/);
  assert.match(replay, /fill="#ffffff" stroke="#0f172a"/);
});

test('separate formation strokes keep blue, green, red order through playback and replay', () => {
  assert.deepEqual([0, 1, 2].map(letterHelpStrokeColor), ['#2563eb', '#16a34a', '#dc2626']);
  assert.equal(new Set(LETTER_HELP_STROKE_COLORS).size, LETTER_HELP_STROKE_COLORS.length);
  assert.ok(!LETTER_HELP_STROKE_COLORS.includes('#f97316'), 'orange remains the pencil tip, not ink');
  assert.equal(letterHelpStrokeColor(0), letterHelpStrokeColor(0));
  assert.throws(() => letterHelpStrokeColor(-1));
  assert.throws(() => letterHelpStrokeColor(1.5));
});

test('letter help targets preserve accents, lowercase by default, uppercase/digraph identity', () => {
  assert.deepEqual(parseHelpLetters('D, t, P, Ñ, ch, D'), ['d', 't', 'p', 'ñ', 'ch']);
  assert.deepEqual(parseHelpLetters('á é í ó ú ü'), ['á', 'é', 'í', 'ó', 'ú', 'ü']);
  assert.throws(() => parseHelpLetters('script, 1, <svg>'));
  assert.throws(() => parseHelpLetters(''));
});

test('page pins cover only enabled pages in the inclusive range', () => {
  assert.deepEqual(letterHelpForPage([rule], 1), []);
  assert.equal(letterHelpForPage([rule], 2)[0].id, rule.id);
  assert.equal(letterHelpForPage([rule], 4)[0].x, .82);
  assert.deepEqual(letterHelpForPage([rule], 5), []);
  assert.deepEqual(letterHelpForPage([{ ...rule, enabled: false }], 3), []);
  assert.deepEqual(normalizeLetterHelp(null), []);
});

test('invalid coordinates, page ranges, duplicate IDs, target strings and speeds cannot be saved', () => {
  for (const patch of [
    { x: NaN }, { y: 1.01 }, { pageStart: 0 }, { pageEnd: 9 },
    { pageStart: 6, pageEnd: 2 }, { speed: 2 }, { letters: ['d', '2'] },
  ]) assert.throws(() => normalizeLetterHelp([{ ...rule, ...patch }], 8));
  assert.throws(() => normalizeLetterHelp([rule, rule]));
});

test('old assignments without help keep their exact workbook and make no new reads', async () => {
  const { withNotebookLetterHelp } = await fresh('old');
  assert.equal(await withNotebookLetterHelp(book, {}, {}), book);
});

test('concurrent student bootstraps share teacher model lookup, only send target cases, and preserve ink-independent book fields', async () => {
  const { withNotebookLetterHelp } = await fresh('burst');
  let calls = 0;
  const strokes = [[{ x: .2, y: .1, corner: true }, { x: .4, y: .633 }]];
  const svc = { entities: { LetterWaypoint: { list: async () => {
    calls++; await new Promise(resolve => setTimeout(resolve, 10));
    return [
      { letter: 'd', strokes_data: JSON.stringify(strokes) },
      { letter: 'D', strokes_data: JSON.stringify(strokes) },
      { letter: 'z', strokes_data: JSON.stringify(strokes) },
    ];
  } } } };
  const assignment = { letter_help: [rule] };
  const results = await Promise.all(Array.from({ length: 100 }, () => withNotebookLetterHelp(book, assignment, svc)));
  assert.equal(calls, 1);
  for (const result of results) {
    assert.equal(result.id, book.id);
    assert.equal(result.width, book.width);
    assert.equal(result.letterHelp.length, 1);
    assert.deepEqual(Object.keys(result.letterHelpWaypoints).sort(), ['D', 'd']);
    assert.equal(result.letterHelpWaypoints.d.strokes[0][0].corner, true);
    assert.equal(result.strokes, undefined);
  }
  await withNotebookLetterHelp(book, assignment, svc);
  assert.equal(calls, 1);
});

test('disabled help does not read waypoints; optional help failures cannot prevent opening or writing', async () => {
  const { withNotebookLetterHelp } = await fresh('optional');
  const off = await withNotebookLetterHelp(book, { letter_help: [{ ...rule, enabled: false }] }, {});
  assert.equal(off.letterHelp[0].enabled, false);
  const bad = await withNotebookLetterHelp(book, { letter_help: [{ ...rule, pageEnd: 99 }] }, {});
  assert.equal(bad.id, book.id); assert.equal(bad.pageCount, book.pageCount);
  assert.ok(bad.letterHelpError); assert.deepEqual(bad.letterHelp, []);
  const unavailable = await withNotebookLetterHelp(book, { letter_help: [rule] },
    { entities: { LetterWaypoint: { list: async () => { throw new Error('Network unavailable'); } } } });
  assert.ok(unavailable.letterHelpError); assert.equal(unavailable.id, book.id);
});

test('assessment, lesson and direct-assignment bootstrap all enrich the same student workbook', async () => {
  const assessment = await source('base44/functions/externalNotebookBootstrap/entry.ts');
  const extension = await source('base44/shared/externalNotebookLessonPolicy.mjs');
  assert.match(assessment, /workbook: await withNotebookLetterHelp\(session\.workbook, assignment, svc\)/);
  assert.match(extension, /workbook: await withNotebookLetterHelp\(session\.workbook, assignment, svc\)/);
  const canvas = await source('src/lib/external-notebook/NotebookCanvas.jsx');
  const view = await source('src/lib/external-notebook/NotebookStudentView.jsx');
  assert.match(canvas, /<\/svg>\s*\{pageOverlay\}/);
  assert.match(view, /pageOverlay=\{<NotebookLetterHelp/);
  assert.match(view, /finishGesture=.*finishRef\.current\(\)/);
});

test('student help has no waypoint requests and cannot draw or survive a teacher page change', async () => {
  const ui = await source('src/components/notebook/NotebookLetterHelp.jsx');
  assert.doesNotMatch(ui, /base44|loadLetterHelpWaypoints|useLetterHelpWaypoints/);
  assert.match(ui, /scopeRef\.current !== started/);
  assert.match(ui, /await finishGesture\(\)/);
  assert.match(ui, /onPointerDown=\{stop\}/);
  assert.match(ui, /useState\(false\)/);
});
