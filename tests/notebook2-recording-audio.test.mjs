import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { requestMicrophone, createAudioRecorder, microphoneMessage } from '../src/lib/notebook2/recordingAudio.mjs';

test('microphone permission is requested synchronously with stable notebook audio constraints', async () => {
  let called = false, resolve;
  const pending = new Promise(r => { resolve = r; });
  const result = requestMicrophone({ getUserMedia: constraints => {
    called = true;
    assert.deepEqual(constraints, { audio: { echoCancellation: true, noiseSuppression: true } });
    return pending;
  } });
  assert.equal(called, true);
  resolve({ stream: true });
  assert.deepEqual(await result, { stream: true });
});

test('Safari-only MP4 support uses audio recording at the old 64 kbps rate', () => {
  class SafariRecorder {
    static isTypeSupported(type) { return type === 'audio/mp4'; }
    constructor(stream, options) { this.stream = stream; this.options = options; }
  }
  const stream = {};
  const recorder = createAudioRecorder(stream, SafariRecorder);
  assert.equal(recorder.stream, stream);
  assert.deepEqual(recorder.options, { mimeType: 'audio/mp4', audioBitsPerSecond: 64000 });
});

test('a rejected advertised format falls back to another supported audio format', () => {
  const attempts = [];
  class Recorder {
    static isTypeSupported(type) { return ['audio/webm;codecs=opus', 'audio/mp4'].includes(type); }
    constructor(stream, options) {
      attempts.push(options);
      if (options.mimeType !== 'audio/mp4') throw new Error('unsupported');
      this.mimeType = options.mimeType;
    }
  }
  assert.equal(createAudioRecorder({}, Recorder).mimeType, 'audio/mp4');
  assert.equal(attempts.length, 2);
});

test('browser-default audio works when format probing is absent, without claiming WebM output', () => {
  class Recorder {
    constructor(stream, options) { this.options = options; this.mimeType = 'audio/mp4'; }
  }
  const recorder = createAudioRecorder({}, Recorder);
  assert.deepEqual(recorder.options, { audioBitsPerSecond: 64000 });
  assert.equal(recorder.mimeType, 'audio/mp4');
});

test('permission, missing hardware, and busy-microphone failures provide actionable messages', () => {
  assert.match(microphoneMessage({ name: 'NotAllowedError' }), /Safari.*settings/);
  assert.match(microphoneMessage({ name: 'NotFoundError' }), /No microphone/);
  assert.match(microphoneMessage({ name: 'NotReadableError' }), /Close other/);
  assert.throws(() => requestMicrophone({}), /cannot access/);
  assert.match(microphoneMessage(new Error('Storage blocked')), /Storage blocked/);
});

test('V2/V3 startup requests microphone before asynchronous prep and preserves recovery and scope cancellation', async () => {
  const hook = await readFile(new URL('../src/lib/notebook2/useNativeRecording.js', import.meta.url), 'utf8');
  const record = hook.slice(hook.indexOf('const record = async'), hook.indexOf('const cancelStart'));
  assert.ok(record.indexOf('await requestMicrophone()') < record.indexOf('await latest.current.finishGesture'));
  assert.ok(record.indexOf('await requestMicrophone()') < record.indexOf('await draftStorage'));
  assert.ok(record.indexOf('await requestMicrophone()') < record.indexOf('await request(scope'));
  assert.match(record, /startup\.current === attempt && !attempt\.cancelled/);
  assert.match(record, /stream\.getTracks\(\)\.forEach\(t => t\.stop\(\)\)/);
  assert.match(record, /recorder\.start\(1000\)/);
  assert.match(hook, /attempt\.stream\?\.getTracks\(\)/);
  assert.match(hook, /draftStorage\("put", draft.key, draft\)/);
  assert.doesNotMatch(hook, /getDisplayMedia|video:\s*true/);
});
