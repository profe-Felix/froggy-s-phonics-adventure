import { useState, useEffect, useMemo } from 'react';
import BackButton from '@/components/ui/BackButton';
import SyllableBlenderLobby from '@/components/workstations/SyllableBlenderLobby';
import ElkoninActivity from '@/components/workstations/ElkoninActivity';
import { markersToPretty } from '@/lib/markers';
import { shuffleInPlace } from '@/lib/seededShuffle';
import { SB_URL, wordsFromImageBucket } from '@/lib/supabaseStorage';

const PRESETS_URL = `${SB_URL}/storage/v1/object/public/app-presets/syllableblender/presets.json`;
const DEFAULT_MEDIA = {
  images: { bucket: 'lettersort-images', prefix: '' },
  syllableAudio: { bucket: 'syllable-audio', prefix: '' },
  wordAudio: { bucket: 'audio', prefix: 'es/words' },
};
const DEFAULT_WORDS = ['manzana', 'guitarra', 'camión', 'helado', 'caracol'];

export default function SyllableBlender() {
  const params = new URLSearchParams(window.location.search);
  const isTeacher = params.get('role') === 'teacher';
  const presetId = params.get('preset');
  const [presets, setPresets] = useState({});
  const [bucketWords, setBucketWords] = useState(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(PRESETS_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((obj) => { if (obj) setPresets(obj); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const media = useMemo(() => {
    const p = presets[presetId]?.media || {};
    return {
      images: { ...DEFAULT_MEDIA.images, ...(p.images || {}) },
      syllableAudio: { ...DEFAULT_MEDIA.syllableAudio, ...(p.syllableAudio || {}) },
      wordAudio: { ...DEFAULT_MEDIA.wordAudio, ...(p.wordAudio || {}) },
    };
  }, [presets, presetId]);

  const usingPreset = !!presets[presetId]?.content?.words?.length;

  // When no preset word list is selected, fall back to listing every image in
  // the image bucket (matching the reference app behaviour).
  useEffect(() => {
    if (loading || usingPreset) return;
    let cancelled = false;
    setBucketWords(undefined);
    wordsFromImageBucket(media.images)
      .then((list) => { if (!cancelled) setBucketWords(list && list.length ? list : null); })
      .catch(() => { if (!cancelled) setBucketWords(null); });
    return () => { cancelled = true; };
  }, [loading, usingPreset, media.images]);

  const bucketLoading = !usingPreset && bucketWords === undefined;

  const words = useMemo(() => {
    const preset = presets[presetId];
    let list = preset?.content?.words?.length
      ? preset.content.words.map((w) => markersToPretty(w))
      : (bucketWords && bucketWords.length ? bucketWords.slice() : DEFAULT_WORDS.slice());
    const b = preset?.behavior || {};
    if (b.shuffle && list.length > 1) shuffleInPlace(list, b.seed || '');
    return list;
  }, [presets, presetId, bucketWords]);

  if (loading || bucketLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (isTeacher) return <SyllableBlenderLobby presets={presets} />;

  const behavior = presets[presetId]?.behavior || {};

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f7f8fc', fontFamily: "'Andika', system-ui, sans-serif" }}>
      <div className="flex items-center gap-3 p-3 bg-white border-b sticky top-0 z-20">
        <BackButton onClick={() => window.history.back()} />
        <h1 className="font-bold text-lg">Cajas de Elkonin</h1>
      </div>
      <ElkoninActivity words={words} behavior={behavior} media={media} />
    </div>
  );
}