import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { sightWordIntroductions, newSightWordsAt, knownSightWordsAt, latestSightWordIntroduction } from '../src/lib/literacy/sightWordProgression.mjs';
import { elkoninTargets } from '../src/lib/literacy/elkoninTargets.mjs';
import { createElkoninPromptQueue } from '../src/lib/literacy/elkoninPromptQueue.mjs';

const at = (moduleNumber, lessonNumber) => ({ moduleNumber, lessonNumber });
const source = name => readFile(new URL(`../src/${name}`, import.meta.url), 'utf8');

test('M3.L1 HFW are dice, también, tiene; M3.L5 introduces none', () => {
  assert.deepEqual(newSightWordsAt(at(3, 1)), ['dice', 'también', 'tiene']);
  assert.deepEqual(newSightWordsAt(at(3, 5)), []);
  assert.equal(latestSightWordIntroduction(at(3, 5)).curriculum_lesson_number, 1);
  assert.deepEqual(newSightWordsAt(at(3, 6)), ['agua', 'pero', 'su']);
});

test('cumulative HFW stop at the selected day, preserve accents, and exclude dictation', () => {
  const known = knownSightWordsAt(at(3, 5));
  assert.equal(known.length, 23);
  assert.ok(known.includes('aquí') && known.includes('también'));
  for (const word of ['agua', 'pero', 'su', 'dado', 'nido', 'pedí', 'dudó']) {
    assert.ok(!known.includes(word), `${word} is not an introduced HFW at M3.L5`);
  }
  assert.deepEqual(knownSightWordsAt(at(0, 5)), []);
  assert.deepEqual(knownSightWordsAt(at(3, NaN)), []);
});

test('real fluency builder ignores dictation and week vocabulary even if supplied', async () => {
  const raw = await source('lib/literacy/curriculumContentBuilder.js');
  const context = vm.createContext({
    sightWordIntroductions, newSightWordsAt, knownSightWordsAt,
    normalizeSpanish: value => value,
    ES_GRAPHEME_SEQUENCE: [],
    compareCurriculumPositions: () => { throw new Error('HFW must not use a grapheme estimate'); },
  });
  vm.runInContext(raw.replace(/^import[\s\S]*?from ['"][^'"]+['"];$/gm, '')
    .replace(/^export /gm, '') + '\nglobalThis.build = buildFluencyPreset;', context);
  const lessons = [{
    literacy_progression: { sightWords: 'invented' },
    daily_lessons: [{ active: true, module_number: 3, curriculum_lesson_number: 5,
      steps: [{ mode: 'dictation', config: { lines: ['dado', 'nido', 'pedí', 'dudó'] } }] }],
  }];
  for (const contentType of ['sight_words_new', 'sight_words_all', 'sight_words']) {
    const preset = context.build({ ...at(3, 5), contentType, lessons });
    const content = Array.from(preset.content);
    assert.ok(!content.some(word => ['dado', 'nido', 'pedí', 'dudó', 'invented', 'agua'].includes(word)));
    if (contentType === 'sight_words_new') assert.equal(content.length, 0);
    else assert.deepEqual(new Set(content), new Set(knownSightWordsAt(at(3, 5))));
  }
});

test('teacher targets preserve their exact order, including words beyond the curriculum', () => {
  assert.deepEqual(elkoninTargets(['toro', 'foca', 'gota', 'zapato', 'tomate']),
    ['toro', 'foca', 'gota', 'zapato', 'tomate']);
  assert.deepEqual(elkoninTargets('toro,\ncamión; tomate, TORO'), ['toro', 'camión', 'tomate']);
  assert.deepEqual(elkoninTargets(undefined), []);
  assert.deepEqual(elkoninTargets([null, {}]), []);
});

test('lesson wiring forwards targets and resolves them before curriculum-generated words', async () => {
  const parent = await source('components/lesson/LessonConfiguredActivity.jsx');
  const step = await source('components/lesson/modes/SyllableBlenderStep.jsx');
  assert.match(parent, /case 'syllable_blender':[\s\S]*?targets=\{config\.targets\}/);
  assert.ok(step.indexOf('if (explicit.length) return explicit') < step.indexOf('const built = buildSyllableBlenderWords'));
  assert.match(step, /\[targets, curriculumPosition, curriculumPositionOverride\]/);
});

test('student Elkonin has numbered navigation, no answer text or syllable tooltip', async () => {
  const activity = await source('components/workstations/ElkoninActivity.jsx');
  assert.match(activity, /<option[^>]+>Palabra \{i \+ 1\}<\/option>/);
  assert.doesNotMatch(activity, /<h2|>\{w\}<\/option>|Escuchar: \$\{s\}/);
  assert.match(activity, /onError: failed/);
  assert.match(activity, /if \(i !== null\) setHeard/);
  assert.doesNotMatch(activity, /No audio for this syllable → counts as already heard/);
  assert.doesNotMatch(activity, /'Escuchar palabra'/);
});

test('rapid counter taps queue in order, coalesce repeated taps, and continue after errors', async () => {
  const queue = createElkoninPromptQueue();
  const played = [];
  let finish;
  const first = queue.enqueue('0', () => new Promise(resolve => { played.push(0); finish = resolve; }));
  assert.equal(queue.enqueue('0', () => { throw new Error('Duplicate'); }), first);
  const second = queue.enqueue('1', () => { played.push(1); throw new Error('Audio unavailable'); });
  const handled = second.catch(() => false);
  const third = queue.enqueue('2', () => { played.push(2); return true; });
  await Promise.resolve();
  assert.deepEqual(played, [0]);
  finish(true);
  await first; await handled; await third;
  assert.deepEqual(played, [0, 1, 2]);
});

test('leaving a word discards its queued prompts', async () => {
  const queue = createElkoninPromptQueue();
  let finish;
  const first = queue.enqueue('0', () => new Promise(resolve => { finish = resolve; }));
  const second = queue.enqueue('1', () => { throw new Error('Old word must not play'); });
  await Promise.resolve();
  queue.stop(); finish(false);
  await first;
  assert.equal(await second, false);
});

async function counterHarness(lookup) {
  let heard = [false, false], pending = [];
  const started = [];
  const recordings = [0, 1].map(i => ({
    currentTime: 0, pause() {},
    async play() { started.push(i); this.onplaying?.(); },
  }));
  const context = vm.createContext({
    promptRef: { current: null }, queueRef: { current: createElkoninPromptQueue() },
    lookupsRef: { current: { syllables: [lookup || Promise.resolve(), Promise.resolve()] } },
    syllAudioRefs: { current: recordings }, wordAudioRef: { current: null },
    word: 'toro', syllables: ['to', 'ro'], markersToPretty: value => value,
    setHeard: update => { heard = update(heard); },
    setPendingCounters: update => { pending = update(pending); },
    setAudioError() {}, setSpeaking() {}, AbortController, setTimeout, clearTimeout,
    playTts: async () => { throw new Error('Recording should play first'); },
  });
  const raw = await source('components/workstations/ElkoninActivity.jsx');
  vm.runInContext(raw.slice(raw.indexOf('  const runPrompt ='), raw.indexOf('  const onReveal ='))
    + '\nglobalThis.tap = playPrompt;', context);
  return { tap: context.tap, recordings, started, heard: () => Array.from(heard), pending: () => Array.from(pending),
    cancel: () => { context.queueRef.current.stop(); context.promptRef.current?.abort(); } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('rapid taps turn each counter green at its playback start, not its ending', async () => {
  const h = await counterHarness();
  h.tap(0); h.tap(1); h.tap(0);
  assert.deepEqual(h.pending(), [0, 1]);
  await tick();
  assert.deepEqual(h.started, [0]);
  assert.deepEqual(h.heard(), [true, false]);
  h.recordings[0].onended();
  await tick();
  assert.deepEqual(h.heard(), [true, true]);
  assert.deepEqual(h.started, [0, 1]);
  h.recordings[1].onended();
  await tick();
  assert.deepEqual(h.heard(), [true, true]);
  assert.deepEqual(h.pending(), []);
});

test('a counter tapped before its recording lookup finishes is retained', async () => {
  let ready;
  const h = await counterHarness(new Promise(resolve => { ready = resolve; }));
  h.tap(0);
  await tick();
  assert.deepEqual(h.started, []);
  assert.deepEqual(h.heard(), [false, false]);
  assert.deepEqual(h.pending(), [0]);
  ready(); await tick();
  assert.deepEqual(h.started, [0]);
  assert.deepEqual(h.heard(), [true, false]);
  h.recordings[0].onended();
  await tick();
  assert.deepEqual(h.heard(), [true, false]);
});

async function audioHarness({ rejectAudio = false, cloudUrl = 'https://example.invalid/audio.mp3', browser = true } = {}) {
  const requests = [], audios = [], spoken = [];
  class FakeAudio extends EventTarget {
    constructor(url) { super(); this.src = url; this.currentTime = 0; this.paused = false; audios.push(this); }
    async play() { if (rejectAudio) throw new Error('Playback failed'); }
    pause() { this.paused = true; }
  }
  class Utterance extends EventTarget { constructor(text) { super(); this.text = text; } }
  const context = vm.createContext({
    base44: { functions: { invoke: async (name, body) => { requests.push({ name, body }); return { data: { url: cloudUrl } }; } } },
    getDefaultVoice: async () => 'es-US-Neural2-A',
    langFromVoice: () => 'es-US',
    Audio: FakeAudio, SpeechSynthesisUtterance: Utterance,
    window: browser ? { speechSynthesis: { cancel() {}, speak: u => spoken.push(u) } } : {},
    Set, Map, console,
  });
  vm.runInContext((await source('lib/audio.js')).replace(/^import .*$/gm, '').replace(/^export /gm, '')
    + '\nglobalThis.tts = playTts;', context);
  return { tts: context.tts, requests, audios, spoken };
}

test('TTS uses the configured voice and keeps completion separate from playback start', async () => {
  const h = await audioHarness();
  let heard = false;
  assert.equal(await h.tts('toro', 'es', .85, '', () => { heard = true; }), true);
  assert.equal(h.requests[0].body.voice, 'es-US-Neural2-A');
  assert.equal(h.requests[0].body.text, 'toro');
  assert.equal(heard, false);
  h.audios[0].dispatchEvent(new Event('ended'));
  assert.equal(heard, true);
});

test('cloud TTS start fires only when audio actually plays, once, before completion', async () => {
  const h = await audioHarness();
  let starts = 0, ends = 0;
  await h.tts('to', 'es', .85, '', () => ends++, { onStart: () => starts++ });
  assert.equal(starts, 0);
  h.audios[0].dispatchEvent(new Event('playing'));
  assert.equal(starts, 1);
  assert.equal(ends, 0);
  h.audios[0].dispatchEvent(new Event('playing'));
  assert.equal(starts, 1);
  h.audios[0].dispatchEvent(new Event('ended'));
  assert.equal(ends, 1);
});

test('browser TTS start and aborted late events follow the same timing rule', async () => {
  const h = await audioHarness({ rejectAudio: true });
  let starts = 0;
  const owner = new AbortController();
  await h.tts('to', 'es', .85, '', undefined, { signal: owner.signal, onStart: () => starts++ });
  assert.equal(starts, 0);
  h.spoken[0].dispatchEvent(new Event('start'));
  assert.equal(starts, 1);
  const late = await audioHarness();
  await late.tts('ro', 'es', .85, '', undefined, { signal: owner.signal, onStart: () => starts++ });
  owner.abort();
  late.audios[0].dispatchEvent(new Event('playing'));
  assert.equal(starts, 1);
});

test('failed or cancelled counter audio never marks a new counter green', async () => {
  const failed = await counterHarness();
  failed.recordings[0].play = async () => { throw new Error('Unavailable'); };
  failed.tap(0); await tick();
  assert.deepEqual(failed.heard(), [false, false]);
  assert.deepEqual(failed.pending(), []);
  let ready;
  const stale = await counterHarness(new Promise(resolve => { ready = resolve; }));
  stale.tap(0); await tick(); stale.cancel(); ready(); await tick();
  assert.deepEqual(stale.heard(), [false, false]);
});

test('rejected cloud playback tries browser speech; total failure is explicit', async () => {
  const h = await audioHarness({ rejectAudio: true });
  assert.equal(await h.tts('to'), true);
  assert.equal(h.spoken[0].text, 'to');
  const unavailable = await audioHarness({ rejectAudio: true, browser: false });
  assert.equal(await unavailable.tts('to'), false);
});

test('word navigation cancels pending or playing TTS and prevents late completion', async () => {
  const h = await audioHarness();
  const owner = new AbortController();
  let completed = false;
  await h.tts('tomate', 'es', .85, '', () => { completed = true; }, { signal: owner.signal });
  owner.abort();
  assert.equal(h.audios[0].paused, true);
  h.audios[0].dispatchEvent(new Event('ended'));
  assert.equal(completed, false);
  const alreadyCancelled = await audioHarness();
  assert.equal(await alreadyCancelled.tts('toro', 'es', .85, '', null, { signal: owner.signal }), false);
  assert.equal(alreadyCancelled.requests.length, 0);
});
