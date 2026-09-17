import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Check } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { listAllImagesJpg } from '@/lib/lettersort/storage';
import { markersToPretty } from '@/lib/lettersort/phonics';

// Noun Gender Editor — scans the letter-sort image bucket, seeds a NounGender
// record for every noun picture found, and lets the teacher assign masculine /
// feminine to each. The phrase game auto-generates el/la + noun phrases from
// these assignments.

// Number is assigned manually by the teacher.
// Do not infer singular/plural from spelling.
// Detect infinitive verbs — not nouns. We use a known-verbs whitelist rather
// than a -ar/-er/-ir regex so real nouns like 'mujer', 'collar', 'altar',
// 'azúcar' (which happen to end in those suffixes) are never false-flagged.
// Part of speech is assigned manually by the teacher.
// Do not guess whether a word is a verb from its spelling.
const articleFor = (gender, number = 'singular') => {
  if (gender === 'masculine') return number === 'plural' ? 'los' : 'el';
  if (gender === 'feminine') return number === 'plural' ? 'las' : 'la';
  return '';
};

export default function NounGenderEditor() {
  const [records, setRecords] = useState(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState('');
  const [filter, setFilter] = useState('all'); // all | unassigned | masculine | feminine
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await base44.entities.NounGender.list('-word', 500);
      setRecords(all);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Sync: scan bucket, add new nouns AND remove records for deleted images
  const sync = useCallback(async () => {
    setSeeding(true);
    setSeedMsg('');
    try {
      const files = await listAllImagesJpg({ bucket: 'lettersort-images' });
      const bucketWords = new Set();
      const bucketUrls = new Map();
      for (const f of files) {
        const word = markersToPretty(f.core || '').toLowerCase().trim();
        if (word) { bucketWords.add(word); bucketUrls.set(word, f.url); }
      }
      const current = records || [];
      // Find records whose word is no longer in the bucket
      const toDelete = current.filter((r) => !bucketWords.has(r.word.toLowerCase()));
      // Find new words in the bucket not yet in the DB
      const existing = new Set(current.map((r) => r.word.toLowerCase()));
      const toCreate = [];
      const seen = new Set();
      for (const w of bucketWords) {
        if (existing.has(w) || seen.has(w)) continue;
        seen.add(w);
        toCreate.push({ word: w, image_url: bucketUrls.get(w) || '', part_of_speech: '', gender: '', article: '', number: '', active: true });
      }

      const parts = [];
      if (toDelete.length > 0) {
        await base44.entities.NounGender.deleteMany({ id: { $in: toDelete.map((r) => r.id) } });
        parts.push(`removed ${toDelete.length} deleted`);
      }
      if (toCreate.length > 0) {
        await base44.entities.NounGender.bulkCreate(toCreate);
        parts.push(`added ${toCreate.length} new`);
      }
      setSeedMsg(parts.length > 0 ? parts.join(' · ') : 'Library is up to date — no changes.');
      await load();
    } catch (e) {
      setSeedMsg('Sync failed — check console.');
    } finally {
      setSeeding(false);
    }
  }, [records, load]);

  const setPartOfSpeech = useCallback(async (id, partOfSpeech) => {
    setRecords((prev) =>
      (prev || []).map((r) =>
        r.id === id ? { ...r, part_of_speech: partOfSpeech } : r
      )
    );

    try {
      await base44.entities.NounGender.update(id, { part_of_speech: partOfSpeech });
    } catch {
      void load();
    }
  }, [load]);


  const setGender = useCallback(async (id, gender, number) => {
    const article = articleFor(gender, number);
    setRecords((prev) => (prev || []).map((r) => (r.id === id ? { ...r, gender, article } : r)));
    try {
      await base44.entities.NounGender.update(id, { gender, article });
    } catch {
      void load();
    }
  }, [load]);

  const setNumber = useCallback(async (id, number) => {
    const record = (records || []).find((r) => r.id === id);
    if (!record) return;

    const article = record.gender ? articleFor(record.gender, number) : '';

    setRecords((prev) =>
      (prev || []).map((r) =>
        r.id === id ? { ...r, number, article } : r
      )
    );

    try {
      await base44.entities.NounGender.update(id, { number, article });
    } catch {
      void load();
    }
  }, [records, load]);


  const toggleActive = useCallback(async (id, active) => {
    setRecords((prev) => (prev || []).map((r) => (r.id === id ? { ...r, active } : r)));
    try {
      await base44.entities.NounGender.update(id, { active });
    } catch {
      void load();
    }
  }, [load]);

  const filtered = useMemo(() => {
    let out = records || [];
    if (filter === 'unassigned') out = out.filter((r) => !r.gender);
    else if (filter !== 'all') out = out.filter((r) => r.gender === filter);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      out = out.filter((r) => r.word.toLowerCase().includes(q));
    }
    return out.sort((a, b) => a.word.localeCompare(b.word, 'es'));
  }, [records, filter, search]);

  const stats = useMemo(() => {
    const r = records || [];
    return {
      total: r.length,
      masc: r.filter((x) => x.gender === 'masculine').length,
      fem: r.filter((x) => x.gender === 'feminine').length,
      unassigned: r.filter((x) => !x.gender).length,
    };
  }, [records]);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b bg-white sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link to="/TeacherHub" className="text-gray-400 hover:text-gray-600"><ArrowLeft className="w-5 h-5" /></Link>
            <div>
              <h1 className="text-lg font-semibold leading-tight">🔤 Noun Gender Library</h1>
              <p className="text-xs text-muted-foreground">
                {loading ? 'Loading…' : `${stats.total} nouns · ${stats.masc} masc · ${stats.fem} fem · ${stats.unassigned} unassigned`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm w-32"
            />
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
              <option value="all">All</option>
              <option value="unassigned">Unassigned</option>
              <option value="masculine">Masculine</option>
              <option value="feminine">Feminine</option>
            </select>
            <button
              onClick={sync}
              disabled={seeding}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 text-sm font-medium disabled:opacity-40"
            >
              <RefreshCw className={`w-4 h-4 ${seeding ? 'animate-spin' : ''}`} /> Sync library
            </button>
          </div>
        </div>
      </header>

      {seedMsg && (
        <div className="max-w-6xl mx-auto px-6 pt-3">
          <p className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg px-3 py-2">{seedMsg}</p>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-6 py-6">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p className="mb-3">No nouns yet. Click <strong>Scan bucket</strong> to seed from the letter-sort image library.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filtered.map((r) => (
              <div key={r.id} className={`bg-white border-2 rounded-xl overflow-hidden shadow-sm ${r.active ? '' : 'opacity-40'}`}>
                <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
                  {r.image_url ? (
                    <img src={r.image_url} alt={r.word} className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-gray-300 text-xs">no image</span>
                  )}
                </div>
                <div className="p-2">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-gray-800 text-sm">{r.word}</span>
                      {r.number === 'plural' && (
                        <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded-full">plural</span>
                      )}

                    </div>
                    <button
                      onClick={() => toggleActive(r.id, !r.active)}
                      className="text-xs text-gray-400 hover:text-gray-600"
                      title={r.active ? 'Active — click to hide' : 'Hidden — click to activate'}
                    >
                      {r.active ? '👁️' : '🚫'}
                    </button>
                  </div>
                  {(r.gender || r.number === 'plural') && (
                    <div className="text-xs text-gray-400 font-bold mb-1.5 text-center">
                      {r.article || articleFor(r.gender, r.number)} {r.word}
                    </div>
                  )}
                  <div className="flex gap-1.5 mb-1.5">
                    <button
                      onClick={() => setNumber(r.id, 'singular')}
                      className={`flex-1 rounded-lg py-1.5 text-xs font-bold border-2 transition ${
                        r.number === 'singular'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-emerald-600 border-emerald-200 hover:border-emerald-400'
                      }`}
                    >
                      Singular
                    </button>
                    <button
                      onClick={() => setNumber(r.id, 'plural')}
                      className={`flex-1 rounded-lg py-1.5 text-xs font-bold border-2 transition ${
                        r.number === 'plural'
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-white text-amber-600 border-amber-200 hover:border-amber-400'
                      }`}
                    >
                      Plural
                    </button>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setGender(r.id, r.gender === 'masculine' ? '' : 'masculine', r.number || 'singular')}
                      className={`flex-1 rounded-lg py-1.5 text-xs font-bold border-2 transition ${
                        r.gender === 'masculine'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-blue-600 border-blue-200 hover:border-blue-400'
                      }`}
                    >
                      {r.number === 'plural' ? 'los' : 'el'} masc
                    </button>
                    <button
                      onClick={() => setGender(r.id, r.gender === 'feminine' ? '' : 'feminine', r.number || 'singular')}
                      className={`flex-1 rounded-lg py-1.5 text-xs font-bold border-2 transition ${
                        r.gender === 'feminine'
                          ? 'bg-pink-600 text-white border-pink-600'
                          : 'bg-white text-pink-600 border-pink-200 hover:border-pink-400'
                      }`}
                    >
                      {r.number === 'plural' ? 'las' : 'la'} fem
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}