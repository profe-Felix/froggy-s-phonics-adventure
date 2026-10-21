import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { finishSoundWallStep } from '../src/lib/soundWallCompletion.mjs';

test('sound wall waits for saved progress before advancing', async () => {
  const calls = [];
  let resolveSave;
  const saved = new Promise(resolve => { resolveSave = resolve; });
  const finishing = finishSoundWallStep({
    saveCompletion: () => { calls.push('save'); return saved; },
    advance: () => { calls.push('next'); return true; },
  });
  assert.deepEqual(calls, ['save']);
  resolveSave({ completed_steps: [0] });
  await finishing;
  assert.deepEqual(calls, ['save', 'next']);
});

test('save failures do not advance and a retry can finish', async () => {
  let attempts = 0, advanced = 0;
  const options = {
    saveCompletion: async () => { if (++attempts === 1) throw new Error('offline'); return {}; },
    advance: () => { advanced++; return true; },
  };
  await assert.rejects(finishSoundWallStep(options), /offline/);
  assert.equal(advanced, 0);
  await finishSoundWallStep(options);
  assert.equal(advanced, 1);
  await assert.rejects(finishSoundWallStep({ ...options, saveCompletion: async () => null }), /not saved/);
  assert.equal(advanced, 1);
});

test('already-completed sound wall can advance without another progress write; live stays teacher-paced', async () => {
  const calls = [];
  const options = {
    alreadyComplete: true,
    saveCompletion: () => { throw new Error('duplicate write'); },
    advance: () => { calls.push('next'); return true; },
  };
  await finishSoundWallStep(options);
  await finishSoundWallStep({ ...options, liveMode: true });
  assert.deepEqual(calls, ['next']);
  await assert.rejects(finishSoundWallStep({ ...options, advance: () => false }), /could not open/);
});

test('Done is retryable and independent next navigation keeps save guards, visible order, and last-step overview', async () => {
  const source = async path => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const wall = await source('components/lesson/modes/SoundWallStep.jsx');
  assert.match(wall, /await onComplete\?\.\(\)/);
  assert.match(wall, /finishingRef\.current \|\| done/);
  assert.match(wall, /role="alert"/);
  assert.match(wall, /disabled=\{done \|\| finishing\}/);
  const router = await source('components/lesson/LessonModeRouter.jsx');
  assert.match(router, /step\.mode === 'soundwall' \? completeSoundWall : completeStep/);
  assert.match(router, /saveCompletion: \(\) => markStepComplete\(stepIndex, totalSteps\)/);
  assert.match(router, /onNext\(\{ completedStepIndex: stepIndex \}\)/);
  const stepper = await source('components/lesson/LessonStepper.jsx');
  assert.match(stepper, /activityOwnerRef\.current\?\.key !== currentActivityKey/);
  assert.match(stepper, /return leaveActivity\('next'\)/);
  assert.match(stepper, /destination === 'next' && stepIdx < visibleSteps\.length - 1/);
  assert.match(stepper, /setStepIdx\(stepIdx \+ 1\)/);
  assert.match(stepper, /setViewMode\('overview'\)/);
  assert.match(stepper, /if \(saved !== true\)/);
});
