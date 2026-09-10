import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Printer, ZoomIn, ZoomOut, Images, Type } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { listAllImagesJpg } from '@/lib/lettersort/storage';
import { markersToPretty } from '@/lib/lettersort/phonics';

// ─── Source ──────────────────────────────────────────────────────────────────
// Spanish Reading high-frequency word lists live in Supabase storage as
// slidetoread/lists.json. Structure: { "Palabras 💙": { M1: { new: [...] }, ... }, ... }
const LISTS_URL =
  'https://dmlsiyyqpcupbizpxwhp.supabase.co/storage/v1/object/public/app-presets/slidetoread/lists.json';

const SECTIONS = ['Palabras 💙', 'Palabras'];
const CARDS_PER_SHEET = 12; // 3 cols × 4 rows (portrait)
const COLS = 3;

// ─── Image map (sight-words mode) ────────────────────────────────────────────
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
  const [mode, setMode] = useState('words'); // 'words' | 'pictures'
  const [lists, setLists] = useState(null);
  const [section, setSection] = useState('Palabras 💙');
  const [presetKey, setPresetKey] = useState('M1');
  const [imageMap, setImageMap] = useState(null);
  const [loadingImgs, setLoadingImgs] = useState(true);
  const [zoom, setZoom] = useState(1.3);

  // Pictures mode: NounGender records
  const [nouns, setNouns] = useState(null);
  const [genderFilter, setGenderFilter] = useState('all'); // all | masculine | feminine

  // Load word lists from Supabase (sight-words mode)
  useEffect(() => {
    fetch(LISTS_URL, { cache: 'no-store' })
      .then((r) => r.json())
      .then(setLists)
      .catch(() => setLists(null));
  }, []);

  // Enumerate the letter-sort image bucket once (sight-words mode)
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

  // Load NounGender records (pictures mode)
  const loadNouns = useCallback(async () => {
    try {
      const all = await base44.entities.NounGender.filter({ active: true }, 'word', 500);
      setNouns(all);
    } catch {
      setNouns([]);
    }
  }, []);

  useEffect(() => {
    if (mode === 'pictures' && nouns === null) void loadNouns();
  }, [mode, nouns, loadNouns]);

  const sectionPresets = useMemo(() => {
    if (!lists || !lists[section]) return {};
    return lists[section];
  }, [lists, section]);

  const presetKeys = useMemo(
    () => Object.keys(sectionPresets).sort((a, b) => a.localeCompare(b, 'es', { numeric: true })),
    [sectionPresets]
  );

  useEffect(() => {
    if (presetKeys.length && !presetKeys.includes(presetKey)) {
      setPresetKey(presetKeys[0]);
    }
  }, [presetKeys, presetKey]);

  // Build the card list for the current mode
  const cards = useMemo(() => {
    if (mode === 'pictures') {
      let out = nouns || [];
      if (genderFilter !== 'all') out = out.filter((r) => r.gender === genderFilter);
      return out.map((r) => ({ word: r.word, imageUrl: r.image_url || null }));
    }
    // words mode
    const p = sectionPresets[presetKey];
    if (!p) return [];
    const out = [];
    if (Array.isArray(p.new)) out.push(...p.new);
    if (Array.isArray(p.review)) out.push(...p.review);
    return out.map((w) => ({ word: w, imageUrl: imageMap ? lookupImage(w, imageMap) : null }));
  }, [mode, nouns, genderFilter, sectionPresets, presetKey, imageMap]);

  // Paginate into sheets
  const sheets = useMemo(() => {
    const out = [];
    for (let i = 0; i < cards.length; i += CARDS_PER_SHEET) {
      out.push(cards.slice(i, i + CARDS_PER_SHEET));
    }
    return out.length ? out : [[]];
  }, [cards]);

  const cardCount = cards.length;
  const loading = mode === 'words' ? !lists : nouns === null;

  return (
    <div className="min-h-screen bg-slate-200 print:bg-white">
      <header className="no-print border-b bg-white sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link to="/TeacherHub" className="text-gray-400 hover:text-gray-600"><ArrowLeft className="w-5 h-5" /></Link>
            <div>
              <h1 className="text-lg font-semibold leading-tight">🃏 HFW Cards</h1>
              <p className="text-xs text-muted-foreground">
                {loading ? 'Loading…' : `${cardCount} cards · ${sheets.length} sheet${sheets.length > 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Mode toggle */}
            <div className="flex items-center bg-gray-100 rounded-md p-0.5">
              <button
                onClick={() => setMode('words')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition ${mode === 'words' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}
              >
                <Type className="w-4 h-4" /> Sight Words
              </button>
              <button
                onClick={() => setMode('pictures')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition ${mode === 'pictures' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}
              >
                <Images className="w-4 h-4" /> Pictures
              </button>
            </div>

            {mode === 'words' ? (
              <>
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
              </>
            ) : (
              <>
                <select
                  value={genderFilter}
                  onChange={(e) => setGenderFilter(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="all">All nouns</option>
                  <option value="masculine">Masculine (el)</option>
                  <option value="feminine">Feminine (la)</option>
                </select>
                <Link
                  to="/NounGenderEditor"
                  className="h-9 flex items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm text-indigo-600 hover:bg-indigo-50"
                >
                  Edit genders
                </Link>
              </>
            )}

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
        {loading ? (
          <div className="text-muted-foreground">Loading…</div>
        ) : cardCount === 0 ? (
          <div className="text-center text-muted-foreground py-20 max-w-sm">
            {mode === 'pictures'
              ? 'No nouns yet. Open "Edit genders" and click "Scan bucket" to seed the library, then assign masculine/feminine.'
              : 'No words in this preset.'}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6">
            {sheets.map((sheetCards, si) => (
              <div key={si} className="hfw-sheet-wrap" style={{ '--zoom': zoom }}>
                <div className="hfw-sheet">
                  <div className="hfw-grid">
                    {Array.from({ length: CARDS_PER_SHEET }).map((_, ci) => {
                      const card = sheetCards[ci];
                      if (!card) return <div key={ci} className="hfw-card hfw-card--empty" />;
                      return (
                        <div key={ci} className="hfw-card">
                          {card.imageUrl ? (
                            <img src={card.imageUrl} alt={card.word} className="hfw-card__img" />
                          ) : (
                            <div className="hfw-card__img-placeholder" />
                          )}
                          <div className="hfw-card__word">{card.word}</div>
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