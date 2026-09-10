import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Printer, ZoomIn, ZoomOut } from 'lucide-react';
import { listAllImagesJpg } from '@/lib/lettersort/storage';
import { markersToPretty } from '@/lib/lettersort/phonics';

// ─── Source ──────────────────────────────────────────────────────────────────
// Spanish Reading high-frequency word lists live in Supabase storage as
// slidetoread/lists.json. Structure: { "Palabras 💙": { M1: { new: [...] }, ... }, ... }
const LISTS_URL =
  'https://dmlsiyyqpcupbizpxwhp.supabase.co/storage/v1/object/public/app-presets/slidetoread/lists.json';

const SECTIONS = ['Palabras 💙', 'Palabras'];
const CARDS_PER_SHEET = 8; // 4 cols × 2 rows
const COLS = 4;

// ─── Image map ───────────────────────────────────────────────────────────────
// Enumerate the letter-sort image bucket once, build word→url map so we don't
// fire a HEAD request per card. Words without a matching image (articles,
// prepositions) render as text-only cards.
function buildImageMap(files) {
  const map = new Map();
  for (const f of files) {
    const core = (f.core || '').toLowerCase();
    if (core && !map.has(core)) map.set(core, f.url);
  }
  return map;
}

const lookupImage = (word, map) => {
  const pretty = markersToPretty(word || '').toLowerCase();
  return map.get(pretty) || null;
};

export default function HfwCards() {
  const [lists, setLists] = useState(null);
  const [section, setSection] = useState('Palabras 💙');
  const [presetKey, setPresetKey] = useState('M1');
  const [imageMap, setImageMap] = useState(null);
  const [loadingImgs, setLoadingImgs] = useState(true);
  const [zoom, setZoom] = useState(1.3);

  // Load word lists from Supabase
  useEffect(() => {
    fetch(LISTS_URL, { cache: 'no-store' })
      .then((r) => r.json())
      .then(setLists)
      .catch(() => setLists(null));
  }, []);

  // Enumerate the letter-sort image bucket once
  useEffect(() => {
    let cancelled = false;
    listAllImagesJpg({ bucket: 'lettersort-images' })
      .then((files) => {
        if (!cancelled) {
          setImageMap(buildImageMap(files));
          setLoadingImgs(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setImageMap(new Map());
          setLoadingImgs(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const sectionPresets = useMemo(() => {
    if (!lists || !lists[section]) return {};
    return lists[section];
  }, [lists, section]);

  const presetKeys = useMemo(
    () => Object.keys(sectionPresets).sort((a, b) => a.localeCompare(b, 'es', { numeric: true })),
    [sectionPresets]
  );

  // Keep presetKey valid when section changes
  useEffect(() => {
    if (presetKeys.length && !presetKeys.includes(presetKey)) {
      setPresetKey(presetKeys[0]);
    }
  }, [presetKeys, presetKey]);

  const words = useMemo(() => {
    const p = sectionPresets[presetKey];
    if (!p) return [];
    // Each preset is { new: [...], review: [...] } — combine both, new first
    const out = [];
    if (Array.isArray(p.new)) out.push(...p.new);
    if (Array.isArray(p.review)) out.push(...p.review);
    return out;
  }, [sectionPresets, presetKey]);

  // Paginate into sheets of 8
  const sheets = useMemo(() => {
    const out = [];
    for (let i = 0; i < words.length; i += CARDS_PER_SHEET) {
      out.push(words.slice(i, i + CARDS_PER_SHEET));
    }
    return out.length ? out : [[]];
  }, [words]);

  const cardCount = words.length;

  return (
    <div className="min-h-screen bg-slate-200 print:bg-white">
      <header className="no-print border-b bg-white sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link to="/TeacherHub" className="text-gray-400 hover:text-gray-600"><ArrowLeft className="w-5 h-5" /></Link>
            <div>
              <h1 className="text-lg font-semibold leading-tight">🃏 HFW Picture Cards</h1>
              <p className="text-xs text-muted-foreground">
                {loadingImgs ? 'Loading images…' : `${cardCount} words · ${sheets.length} sheet${sheets.length > 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={section}
              onChange={(e) => setSection(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={presetKey}
              onChange={(e) => setPresetKey(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {presetKeys.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <div className="flex items-center border rounded-md overflow-hidden">
              <button className="px-2 py-1.5 hover:bg-gray-50" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(2)))}>
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="px-2 text-xs text-muted-foreground w-12 text-center">{Math.round(zoom * 100)}%</span>
              <button className="px-2 py-1.5 hover:bg-gray-50" onClick={() => setZoom((z) => Math.min(2.2, +(z + 0.2).toFixed(2)))}>
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => window.print()}
              disabled={cardCount === 0}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 text-sm font-medium disabled:opacity-40"
            >
              <Printer className="w-4 h-4" /> Print
            </button>
          </div>
        </div>
      </header>

      <main className="py-8 flex justify-center print:block print:py-0">
        {!lists ? (
          <div className="text-muted-foreground">Loading word lists…</div>
        ) : (
          <div className="flex flex-col items-center gap-6">
            {sheets.map((sheetWords, si) => (
              <div key={si} className="sheet-wrap" style={{ '--zoom': zoom }}>
                <div className="sheet">
                  <div className="hfw-grid">
                    {Array.from({ length: CARDS_PER_SHEET }).map((_, ci) => {
                      const word = sheetWords[ci];
                      if (!word) return <div key={ci} className="hfw-card hfw-card--empty" />;
                      const img = imageMap ? lookupImage(word, imageMap) : null;
                      return (
                        <div key={ci} className="hfw-card">
                          {img ? (
                            <img src={img} alt={word} className="hfw-card__img" />
                          ) : (
                            <div className="hfw-card__img-placeholder" />
                          )}
                          <div className="hfw-card__word">{word}</div>
                        </div>
                      );
                    })}
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