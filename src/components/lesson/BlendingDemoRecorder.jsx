import React, { useState, useRef } from 'react';
import { Mic, Square, Play, Pause, Trash2, RefreshCw, Check, X, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import useAudioRecorder from '@/hooks/useAudioRecorder';

// Teacher-facing recorder for Blending Letters audio demos.
// Shows each word from the lesson's itemsText with record/play/re-record controls.
// Recorded audio uploads to R2 via the r2Video presign action, and the
// resulting public URL is stored in step.config.demos[word].
//
// Props:
//   itemsText — multi-line string, one word per line (same as the lesson textarea)
//   demos — map of word → R2 audio URL (existing recordings)
//   onChange(word, url) — called when a demo is saved or deleted
export default function BlendingDemoRecorder({ itemsText, demos = {}, onChange, onClose }) {
  const words = (itemsText || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  const [activeWord, setActiveWord] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [playbackUrl, setPlaybackUrl] = useState(null);
  const [playing, setPlaying] = useState(false);
  const playRef = useRef(null);
  const recorder = useAudioRecorder();

  const handleStart = async (word) => {
    setActiveWord(word);
    setPlaybackUrl(null);
    await recorder.startRecording();
  };

  const handleStop = async () => {
    const blob = await recorder.stopRecording();
    if (!blob) return;

    // Upload to R2 via presigned URL from r2Video backend function.
    setUploading(true);
    try {
      const ext = blob.type.includes('webm') ? 'webm' : 'ogg';
      const key = `blending-demos/${activeWord}.${ext}`;
      const res = await base44.functions.invoke('r2Video', {
        action: 'presign',
        key,
        contentType: blob.type || 'audio/webm',
      });
      if (!res?.uploadUrl) throw new Error('No upload URL returned');

      const uploadRes = await fetch(res.uploadUrl, {
        method: 'PUT',
        body: blob,
        headers: { 'Content-Type': blob.type || 'audio/webm' },
      });
      if (!uploadRes.ok) throw new Error('Upload failed');

      onChange(activeWord, res.publicUrl);
      setPlaybackUrl(res.publicUrl);
    } catch (e) {
      alert('Upload failed: ' + (e?.message || 'unknown error'));
    } finally {
      setUploading(false);
      setActiveWord(null);
      recorder.reset();
    }
  };

  const handleDelete = (word) => {
    onChange(word, '');
    if (playbackUrl === demos[word]) setPlaybackUrl(null);
  };

  const togglePlay = (url) => {
    if (playing) {
      playRef.current?.pause();
      setPlaying(false);
      return;
    }
    if (playbackUrl !== url) {
      setPlaybackUrl(url);
      // wait for audio element to load new src
      setTimeout(() => {
        playRef.current?.play();
        setPlaying(true);
      }, 100);
    } else {
      playRef.current?.play();
      setPlaying(true);
    }
  };

  if (words.length === 0) {
    return (
      <div className="rounded-2xl bg-white border-2 border-indigo-200 p-6 text-center">
        <p className="text-sm text-gray-500 font-bold">
 Type some words first, then record demos for each one.
        </p>
        <button
          onClick={onClose}
          className="mt-3 px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl text-sm"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white border-2 border-indigo-200 p-3 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-indigo-700">🎙️ Record Audio Demos</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="w-5 h-5" />
        </button>
      </div>
      <p className="text-[11px] text-gray-500">
        Tap a word, hit record, say the sounds slowly then blend them together. The audio saves automatically.
      </p>

      {/* Hidden audio element for playback */}
      <audio
        ref={playRef}
        src={playbackUrl}
        onEnded={() => setPlaying(false)}
        className="hidden"
      />

      <div className="flex flex-col gap-2">
        {words.map((word) => {
          const url = demos[word];
          const isActive = activeWord === word;
          const isRecording = isActive && recorder.state === 'recording';
          const isStarting = isActive && recorder.state === 'starting';

          return (
            <div
              key={word}
              className={`rounded-xl border-2 p-3 flex items-center gap-3 ${
                isActive ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-gray-50'
              }`}
            >
              {/* Word + phonemes */}
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <span className="text-lg font-black text-gray-800">{word}</span>
                <div className="flex gap-0.5">
                  {word.split('').map((l, i) => (
                    <span
                      key={i}
                      className="w-6 h-6 rounded-md bg-white border border-gray-200 flex items-center justify-center text-xs font-bold text-gray-500"
                    >
                      {l}
                    </span>
                  ))}
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2 shrink-0">
                {url && !isActive && (
                  <>
                    <button
                      onClick={() => togglePlay(url)}
                      className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center hover:bg-indigo-200 active:scale-95 transition"
                    >
                      {playing && playbackUrl === url ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4 ml-0.5" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(word)}
                      className="w-9 h-9 rounded-full bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 active:scale-95 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <Check className="w-4 h-4 text-green-500" />
                  </>
                )}

                {!isActive && !url && (
                  <button
                    onClick={() => handleStart(word)}
                    className="px-3 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs flex items-center gap-1 hover:bg-indigo-700 active:scale-95 transition"
                  >
                    <Mic className="w-3.5 h-3.5" /> Record
                  </button>
                )}

                {!isActive && url && (
                  <button
                    onClick={() => handleStart(word)}
                    className="px-3 py-2 rounded-xl bg-white border border-indigo-300 text-indigo-700 font-bold text-xs flex items-center gap-1 hover:bg-indigo-50 active:scale-95 transition"
                  >
                    <RefreshCw className="w-3 h-3" /> Redo
                  </button>
                )}

                {(isRecording || isStarting) && (
                  <button
                    onClick={handleStop}
                    disabled={isStarting || uploading}
                    className="px-3 py-2 rounded-xl bg-red-500 text-white font-bold text-xs flex items-center gap-1 hover:bg-red-600 active:scale-95 transition disabled:opacity-50"
                  >
                    {uploading ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</>
                    ) : isStarting ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Wait...</>
                    ) : (
                      <><Square className="w-3 h-3" fill="currentColor" /> Stop</>
                    )}
                  </button>
                )}

                {isRecording && (
                  <span className="text-xs font-mono font-bold text-red-500">
                    {recorder.formatTime(recorder.elapsed)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}