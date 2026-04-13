import { useState, useEffect, useRef, useCallback } from 'react';

const SUPABASE_URL = "https://dmlsiyyqpcupbizpxwhp.supabase.co";

// ── Grapheme / syllable helpers (ported from original) ──
const DIGRAPHS = ["ch", "ll", "rr", "qu"];

function parseWord(word) {
  const out = [];
  const w = word || "";
  for (let i = 0; i < w.length;) {
    const ch = w[i];
    if (ch === " ") { out.push({ text: " ", isSpace: true }); i++; continue; }
    if (/[.,!?;]/.test(ch)) { out.push({ text: ch, isPunctuation: true }); i++; continue; }
    const lower = w.toLowerCase();
    const dg = DIGRAPHS.find(d => lower.startsWith(d, i));
    if (dg) {
      out.push({ text: dg, soundType: getSoundType(dg) });
      i += dg.length;
    } else {
      out.push({ text: w[i], soundType: getSoundType(lower[i], lower[i + 1]) });
      i++;
    }
  }
  return out;
}

function getSoundType(letter, nextLetter = "") {
  if (letter === "c") return /[ei]/.test(nextLetter) ? "continuous" : "stop";
  if (["p", "t", "k", "b", "d", "g", "ch"].includes(letter)) return "stop";
  if (letter === "h") return "silent";
  return "continuous";
}

function groupIntoWords(letters) {
  const out = [];
  let current = [];
  letters.forEach(l => {
    if (l.isSpace) { if (current.length) out.push(current); current = []; }
    else current.push(l);
  });
  if (current.length) out.push(current);
  return out;
}

function normalizeName(s) {
  return (s || "").toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zñü]+/g, '');
}

function isVowelChar(ch) { return /[aeiouáéíóúü]/i.test(ch || ""); }

function graphemeIsVowel(g) {
  if (!g) return false;
  if (["ch", "ll", "rr", "qu"].includes(g)) return false;
  return isVowelChar(g);
}

function tileDisplayFor(g) {
  if (!g) return "";
  return g.toLowerCase().replace(/á/g,'a').replace(/é/g,'e').replace(/í/g,'i').replace(/ó/g,'o').replace(/ú/g,'u');
}

function normalizeForGrade(s) {
  let x = (s || "").toLowerCase();
  x = x.replace(/ñ/g, "__ENYE__");
  x = x.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  x = x.replace(/__ENYE__/g, "ñ");
  return x;
}

function splitIntoSyllables(graphemes) {
  const allowedOnset2 = new Set(["bl","br","cl","cr","dr","fl","fr","gl","gr","pl","pr","tr"]);
  const syls = [];
  let i = 0;
  while (i < graphemes.length) {
    let onset = [];
    while (i < graphemes.length && !graphemeIsVowel(graphemes[i])) { onset.push(graphemes[i]); i++; }
    let nucleus = [];
    if (i < graphemes.length && graphemeIsVowel(graphemes[i])) {
      nucleus.push(graphemes[i]); i++;
      if (i < graphemes.length && graphemeIsVowel(graphemes[i])) { nucleus.push(graphemes[i]); i++; }
    }
    let cons = [];
    let j = i;
    while (j < graphemes.length && !graphemeIsVowel(graphemes[j])) { cons.push(graphemes[j]); j++; }
    if (j >= graphemes.length) { syls.push(onset.concat(nucleus).concat(cons)); break; }
    if (cons.length === 0) { syls.push(onset.concat(nucleus)); }
    else if (cons.length === 1) { syls.push(onset.concat(nucleus)); }
    else if (cons.length === 2) {
      const pair = (cons[0] + cons[1]).replace(/[^a-zñ]/g,'');
      if (allowedOnset2.has(pair)) { syls.push(onset.concat(nucleus)); }
      else { syls.push(onset.concat(nucleus).concat([cons[0]])); i += 1; }
    } else {
      const last2 = (cons[cons.length-2] + cons[cons.length-1]).replace(/[^a-zñ]/g,'');
      if (allowedOnset2.has(last2)) { syls.push(onset.concat(nucleus).concat([cons[0]])); i += 1; }
      else { syls.push(onset.concat(nucleus).concat(cons.slice(0,2))); i += 2; }
    }
  }
  return syls;
}

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  r = Math.max(0, Math.min(r, w/2, h/2));
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

// ── Main component ──
export default function SpanishReadingGame({ onBack }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const spellInputRef = useRef(null);

  // Data
  const [allLists, setAllLists] = useState({});
  const [loading, setLoading] = useState(true);

  // UI state
  const [selectedList, setSelectedList] = useState('');
  const [selectedModule, setSelectedModule] = useState('M1');
  const [scopeMode, setScopeMode] = useState('all'); // 'all' | 'new'
  const [gameMode, setGameMode] = useState('read'); // 'read' | 'spell_kb' | 'spell_tiles'
  const [tileMode, setTileMode] = useState('exact');
  const [showModuleUI, setShowModuleUI] = useState(false);

  // Words
  const wordsRef = useRef([]);
  const [wordIndex, setWordIndex] = useState(0);
  const wordIndexRef = useRef(0);

  // Read mode canvas state (refs for canvas drawing)
  const lettersRef = useRef([]);
  const readLayoutRef = useRef(null);
  const sliderXRef = useRef(0);
  const sliderStartRef = useRef(0);
  const sliderEndRef = useRef(0);
  const activeRowRef = useRef(0);
  const rowCountRef = useRef(1);
  const isDraggingRef = useRef(false);
  const freshWordRef = useRef(true);
  const gameModeRef = useRef('read');

  // Spelling state
  const targetGraphemesRef = useRef([]);
  const userGraphemesRef = useRef([]);
  const cursorSlotRef = useRef(0);
  const spellingSubmittedRef = useRef(false);
  const perSlotCorrectRef = useRef([]);
  const pendingDigraphRef = useRef(null);
  const tilesRef = useRef([]);
  const tilesUsedRef = useRef([]);

  // Recording
  const [recording, setRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const recorderRef = useRef(null); // RecordRTC
  const streamRef = useRef(null);

  // Force re-render for tile rack UI
  const [tileRackKey, setTileRackKey] = useState(0);
  const [spellingDone, setSpellingDone] = useState(false);

  // Load lists from Supabase
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/app-presets/slidetoread/lists.json`);
        if (res.ok) {
          const data = await res.json();
          setAllLists(data);
          const first = Object.keys(data)[0];
          if (first) setSelectedList(first);
        }
      } catch (e) { console.warn('Could not load lists', e); }
      setLoading(false);
    })();
  }, []);

  // When list/module/scope changes → rebuild word list
  useEffect(() => {
    if (!selectedList || !allLists[selectedList]) return;
    const entry = allLists[selectedList];

    let wordArr = [];

    if (Array.isArray(entry)) {
      setShowModuleUI(false);
      wordArr = entry.slice();
    } else {
      // module-based
      const hasModules = !!(entry.M1 || entry.M2);
      setShowModuleUI(hasModules);

      if (hasModules) {
        const modKeys = Object.keys(entry).sort();
        const modIdx = modKeys.indexOf(selectedModule);
        const upToIdx = scopeMode === 'new' ? modIdx : modKeys.length - 1;
        let collected = [];
        for (let i = (scopeMode === 'new' ? modIdx : 0); i <= upToIdx; i++) {
          const mod = entry[modKeys[i]];
          let arr = Array.isArray(mod) ? mod : (mod?.new || mod?.all || []);
          if (!Array.isArray(arr)) arr = [];
          collected = collected.concat(arr);
        }
        wordArr = collected;
      } else {
        wordArr = Object.values(entry).flat().filter(Boolean);
      }
    }

    // shuffle
    wordArr = wordArr.map(w => typeof w === 'object' ? w.text : w).filter(Boolean);
    wordArr = wordArr.slice().sort(() => Math.random() - 0.5);
    wordsRef.current = wordArr;
    wordIndexRef.current = 0;
    setWordIndex(0);
    setRecordedUrl(null);
    // Directly setup the first word now (don't rely on wordIndex effect which may not re-fire if index stays 0)
    if (wordArr.length > 0) {
      // setupWord needs layout computed, defer until after render
      requestAnimationFrame(() => setupWord(wordArr[0]));
    }
  }, [selectedList, selectedModule, scopeMode, allLists]);

  // When word changes → setup
  useEffect(() => {
    const word = wordsRef.current[wordIndexRef.current] || '';
    if (!word) return;
    setupWord(word);
  }, [wordIndex]);

  // Canvas resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const word = wordsRef.current[wordIndexRef.current];
      if (word) { typesetReadingLayout(); drawCanvas(); }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Canvas pointer events
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;

    const getX = (e) => {
      const r = c.getBoundingClientRect();
      const src = e.touches ? e.touches[0] : e;
      return (src.clientX ?? 0) - r.left;
    };

    const onDown = (e) => {
      if (gameModeRef.current !== 'read') return;
      e.preventDefault();
      isDraggingRef.current = true;
      if (e.pointerId != null) { try { c.setPointerCapture(e.pointerId); } catch(_) {} }
      moveSlider(getX(e));
    };
    const onMove = (e) => {
      if (gameModeRef.current !== 'read' || !isDraggingRef.current) return;
      e.preventDefault();
      moveSlider(getX(e));
    };
    const onUp = (e) => {
      if (gameModeRef.current !== 'read') return;
      isDraggingRef.current = false;
      drawCanvas();
      tryAdvanceRow();
    };
    const onTouchStart = (e) => {
      if (gameModeRef.current !== 'read') return;
      e.preventDefault();
      isDraggingRef.current = true;
      moveSlider(getX(e));
    };
    const onTouchMove = (e) => {
      if (gameModeRef.current !== 'read' || !isDraggingRef.current) return;
      e.preventDefault();
      moveSlider(getX(e));
    };
    const onTouchEnd = () => {
      if (gameModeRef.current !== 'read') return;
      isDraggingRef.current = false;
      drawCanvas();
      tryAdvanceRow();
    };
    const onClick = () => {
      if (gameModeRef.current === 'spell_kb') spellInputRef.current?.focus();
    };

    c.addEventListener('pointerdown', onDown);
    c.addEventListener('pointermove', onMove);
    c.addEventListener('pointerup', onUp);
    c.addEventListener('pointercancel', onUp);
    c.addEventListener('touchstart', onTouchStart, { passive: false });
    c.addEventListener('touchmove', onTouchMove, { passive: false });
    c.addEventListener('touchend', onTouchEnd);
    c.addEventListener('click', onClick);
    return () => {
      c.removeEventListener('pointerdown', onDown);
      c.removeEventListener('pointermove', onMove);
      c.removeEventListener('pointerup', onUp);
      c.removeEventListener('pointercancel', onUp);
      c.removeEventListener('touchstart', onTouchStart);
      c.removeEventListener('touchmove', onTouchMove);
      c.removeEventListener('touchend', onTouchEnd);
      c.removeEventListener('click', onClick);
    };
  }, []);

  // Keyboard input for spell_kb
  useEffect(() => {
    const inp = spellInputRef.current;
    if (!inp) return;
    const onKey = (e) => {
      if (gameModeRef.current !== 'spell_kb') return;
      if (spellingSubmittedRef.current) { e.preventDefault(); return; }
      const key = e.key;
      if (key === 'Backspace') { e.preventDefault(); spellingBackspace(); return; }
      if (key === 'Enter') { e.preventDefault(); if (!spellingSubmittedRef.current) submitSpelling(); return; }
      if (!/^[a-zñáéíóúü]$/i.test(key)) return;
      e.preventDefault();
      typeSpellChar(key.toLowerCase());
    };
    inp.addEventListener('keydown', onKey);
    return () => inp.removeEventListener('keydown', onKey);
  }, []);

  const moveSlider = (x) => {
    sliderXRef.current = Math.min(Math.max(x, sliderStartRef.current), sliderEndRef.current);
    drawCanvas();
  };

  const tryAdvanceRow = () => {
    const SNAP = 60;
    if (sliderXRef.current >= sliderEndRef.current - SNAP) {
      if (activeRowRef.current < rowCountRef.current - 1) {
        activeRowRef.current++;
        isDraggingRef.current = false;
      }
      drawCanvas();
    }
  };

  const setupWord = useCallback((word) => {
    const rawText = typeof word === 'object' ? word.text : word;
    lettersRef.current = parseWord(rawText);
    freshWordRef.current = true;
    activeRowRef.current = 0;

    const targetRaw = rawText.toLowerCase().trim();
    const g = parseWord(targetRaw).filter(l => !l.isSpace && !l.isPunctuation).map(l => l.text);
    targetGraphemesRef.current = g;
    userGraphemesRef.current = new Array(g.length).fill('');
    cursorSlotRef.current = 0;
    spellingSubmittedRef.current = false;
    perSlotCorrectRef.current = [];
    pendingDigraphRef.current = null;
    tilesRef.current = [];
    tilesUsedRef.current = [];
    setSpellingDone(false);

    if (gameModeRef.current === 'spell_tiles') buildTilesForWord(g);

    typesetReadingLayout();
    drawCanvas();
    setTileRackKey(k => k + 1);
  }, []);

  const buildTilesForWord = (graphemes) => {
    const display = graphemes.map(g => tileDisplayFor(g));
    let pool = display.slice().sort(() => Math.random() - 0.5);
    tilesRef.current = pool;
    tilesUsedRef.current = new Array(pool.length).fill(false);
  };

  // ── Canvas layout + draw (ported from original) ──
  const typesetReadingLayout = useCallback(() => {
    const c = canvasRef.current;
    const el = containerRef.current;
    if (!c || !el || !lettersRef.current.length) return;

    const usableW = el.clientWidth;
    const usableH = el.clientHeight;
    const DPR = window.devicePixelRatio || 1;
    c.width = Math.round(usableW * DPR);
    c.height = Math.round(usableH * DPR);
    c.style.width = usableW + 'px';
    c.style.height = usableH + 'px';

    const ctx = c.getContext('2d');
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    const scale = Math.min(usableW / 768, usableH / 432);
    let fp = Math.round(64 * scale * 1.5);
    fp = Math.max(26, Math.min(130, fp));

    ctx.font = `bold ${fp}px Andika, sans-serif`;

    const em = fp;
    const minPill = Math.max(8, Math.round(em * 0.22));
    const innerPad = Math.max(2, Math.round(em * 0.03));

    lettersRef.current.forEach(l => {
      if (l.isPunctuation) { l.gw = 0; l.w = 0; return; }
      if (l.isSpace) return;
      let gw = ctx.measureText(l.text).width;
      l.gw = gw;
      l.w = Math.max(gw + innerPad * 2, minPill);
    });

    const padding = Math.max(2, Math.round(fp * 0.005));
    const wordGap = padding * 12;
    const pillH = Math.max(8, Math.round(fp * 0.10));
    const maxRowWidth = usableW * 0.9;

    const wordsBlocks = groupIntoWords(lettersRef.current);
    const blockRow = [];
    const rowWidthsLocal = [];
    let row = 0, x = 0;

    for (let bi = 0; bi < wordsBlocks.length; bi++) {
      const block = wordsBlocks[bi];
      const blockWidth = block.reduce((s, l) => s + (l.isPunctuation ? Math.max(10, ctx.measureText(l.text).width) : (l.w || 0)), 0) + padding * (block.length - 1);
      if (x > 0 && (x + blockWidth) > maxRowWidth) { row++; x = 0; }
      blockRow[bi] = row;
      x += blockWidth;
      rowWidthsLocal[row] = Math.max(rowWidthsLocal[row] || 0, x);
      if (bi !== wordsBlocks.length - 1) { x += wordGap; rowWidthsLocal[row] = Math.max(rowWidthsLocal[row] || 0, x); }
    }

    const rowCountLocal = row + 1;
    const leftMargin = 30;
    const rowStartX = new Array(rowCountLocal).fill(leftMargin);
    const baseRowStep = fp * 1.6;
    const sliderGap = Math.round(fp * 0.25);
    const layoutTopY = Math.round(fp * 0.35);

    readLayoutRef.current = {
      fontPx: fp, padding, wordGap, pillH,
      realTextY: Math.round(fp * 1.25),
      pillYOff: Math.round(fp * 1.25) + Math.max(16, Math.round(fp * 0.5)),
      maxRowWidth, wordsBlocks, blockRow,
      rowWidths: rowWidthsLocal, rowStartX,
      rowCount: rowCountLocal, baseRowStep, sliderGap, layoutTopY
    };

    rowCountRef.current = rowCountLocal;
    activeRowRef.current = 0;
    sliderStartRef.current = rowStartX[0];
    sliderEndRef.current = rowStartX[0] + (rowWidthsLocal[0] || maxRowWidth);
    sliderXRef.current = rowStartX[0];
    freshWordRef.current = true;
  }, []);

  const drawCanvas = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    const DPR = window.devicePixelRatio || 1;

    if (gameModeRef.current === 'read') {
      drawReading(ctx, DPR);
    } else {
      drawSpelling(ctx, DPR);
    }
  }, []);

  const drawReading = (ctx, DPR) => {
    const c = canvasRef.current;
    const L = readLayoutRef.current;
    if (!L) return;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, c.width / DPR, c.height / DPR);
    ctx.font = `bold ${L.fontPx}px Andika, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    const rowY = (r) => L.layoutTopY + r * L.baseRowStep;

    for (let bi = 0; bi < L.wordsBlocks.length; bi++) {
      const block = L.wordsBlocks[bi];
      const r = L.blockRow[bi];
      let drawX = L.rowStartX[r];

      for (let bj = bi - 1; bj >= 0; bj--) {
        if (L.blockRow[bj] !== r) break;
        const prev = L.wordsBlocks[bj];
        const prevW = prev.reduce((s, l) => s + (l.isPunctuation ? Math.max(10, ctx.measureText(l.text).width) : (l.w || 0)), 0) + L.padding * (prev.length - 1);
        drawX += prevW + L.wordGap;
      }

      for (let li = 0; li < block.length; li++) {
        const letter = block[li];
        if (letter.isPunctuation) {
          const pw = Math.max(10, ctx.measureText(letter.text).width);
          ctx.fillStyle = (r === activeRowRef.current && sliderXRef.current >= drawX + 1) ? 'black' : 'lightgrey';
          ctx.fillText(letter.text, drawX + pw / 2, rowY(r) + L.realTextY);
          drawX += pw + L.padding;
          continue;
        }
        const pillW = letter.w || 0;
        ctx.fillStyle = (r === activeRowRef.current && sliderXRef.current >= drawX + 1) ? 'black' : 'lightgrey';
        if (letter.text === 'h' && letter.soundType === 'silent') ctx.fillStyle = '#ccc';
        ctx.fillText(letter.text, drawX + pillW / 2, rowY(r) + L.realTextY);

        if (r === activeRowRef.current) {
          ctx.strokeStyle = letter.soundType === 'silent' ? '#aaa' : letter.soundType === 'stop' ? 'red' : 'green';
          ctx.lineWidth = 3;
          ctx.fillStyle = (sliderXRef.current >= drawX + 1) ? ctx.strokeStyle : 'white';
          const rr = Math.max(2, Math.min(10, L.pillH / 2, pillW / 2 - 1));
          roundRect(ctx, drawX, rowY(r) + L.pillYOff, pillW, L.pillH, rr, true, true);
        }
        drawX += pillW + L.padding;
      }
    }

    // Slider
    const thisRowW = L.rowWidths[activeRowRef.current] || L.maxRowWidth;
    sliderStartRef.current = L.rowStartX[activeRowRef.current];
    sliderEndRef.current = sliderStartRef.current + thisRowW;

    const lineY = rowY(activeRowRef.current) + L.pillYOff + L.pillH + L.sliderGap;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#ccc'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(sliderStartRef.current, lineY); ctx.lineTo(sliderEndRef.current, lineY); ctx.stroke();
    ctx.strokeStyle = '#007bff';
    ctx.beginPath(); ctx.moveTo(sliderStartRef.current, lineY); ctx.lineTo(sliderXRef.current, lineY); ctx.stroke();
    ctx.beginPath(); ctx.fillStyle = '#007bff';
    ctx.arc(sliderXRef.current, lineY, 10, 0, Math.PI * 2); ctx.fill();

    if (freshWordRef.current) { sliderXRef.current = sliderStartRef.current; freshWordRef.current = false; }
    else { sliderXRef.current = Math.min(Math.max(sliderXRef.current, sliderStartRef.current), sliderEndRef.current); }
  };

  const drawSpelling = (ctx, DPR) => {
    const c = canvasRef.current;
    const w = c.width / DPR;
    const h = c.height / DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, w, h);

    const graphemes = targetGraphemesRef.current;
    if (!graphemes.length) return;

    const syls = splitIntoSyllables(graphemes);
    let fp = Math.max(24, Math.min(72, Math.round(64 * (w / 768))));

    const computeLayout = (fp) => {
      ctx.font = `700 ${fp}px Andika, sans-serif`;
      const slotGap = Math.max(10, Math.round(fp * 0.22));
      const sylGap = Math.max(18, Math.round(fp * 0.55));
      const slotMinW = Math.max(34, Math.round(fp * 0.95));
      const slotInnerPad = Math.max(8, Math.round(fp * 0.20));
      const slotWidths = graphemes.map(g => {
        const tw = ctx.measureText(tileDisplayFor(g)).width;
        return Math.max(slotMinW, Math.round(tw + slotInnerPad * 2));
      });
      let idx = 0;
      const sylMeta = syls.map(sg => { const start = idx; const end = start + sg.length; idx = end; return { start, end }; });
      let totalW = slotWidths.reduce((a, b) => a + b, 0) + slotGap * (graphemes.length - 1);
      totalW += (sylMeta.length - 1) * (sylGap - slotGap);
      const startX = Math.round((w - totalW) / 2);
      const rowH = Math.round(fp * 2.15);
      const gapY = Math.round(fp * 0.70);
      const rows = spellingSubmittedRef.current ? 2 : 1;
      const neededH = rows * rowH + (rows - 1) * gapY + Math.round(fp * 0.9);
      return { fp, slotGap, sylGap, slotWidths, sylMeta, startX, rowH, gapY, neededH };
    };

    let L = computeLayout(fp);
    while (L.neededH > h * 0.92 && fp > 22) { fp -= 2; L = computeLayout(fp); }

    const topY = spellingSubmittedRef.current ? Math.round(h * 0.10) : Math.round(h * 0.18);
    const textY = topY + Math.round(L.fp * 0.95);
    const underlineY = textY + Math.round(L.fp * 0.35);
    const sylUnderlineY = underlineY + Math.round(L.fp * 0.28);

    const getSlotX = () => {
      const xs = new Array(graphemes.length).fill(0);
      let x = L.startX;
      let sylIndex = 0;
      let nextSylEnd = L.sylMeta[0]?.end ?? graphemes.length;
      for (let i = 0; i < graphemes.length; i++) {
        xs[i] = x;
        x += L.slotWidths[i];
        if (i < graphemes.length - 1) {
          if (i === nextSylEnd - 1) { sylIndex++; nextSylEnd = L.sylMeta[sylIndex]?.end ?? graphemes.length; x += L.sylGap; }
          else x += L.slotGap;
        }
      }
      return xs;
    };

    const sylCorrect = spellingSubmittedRef.current ? L.sylMeta.map(({ start, end }) => {
      for (let i = start; i < end; i++) if (!perSlotCorrectRef.current[i]) return false;
      return true;
    }) : null;

    const drawRow = (rowTopY, rowLetters, mode) => {
      ctx.font = `700 ${L.fp}px Andika, sans-serif`;
      ctx.textAlign = 'center';
      const slotX = getSlotX();
      for (let i = 0; i < graphemes.length; i++) {
        const sw = L.slotWidths[i];
        const sx = slotX[i];
        const raw = rowLetters[i] || '';
        const display = tileDisplayFor(raw);
        let letterColor = '#111', ulineColor = '#111';
        if (mode === 'correct') { letterColor = '#16a34a'; ulineColor = '#16a34a'; }
        else if (spellingSubmittedRef.current) {
          const ok = !!perSlotCorrectRef.current[i];
          letterColor = ok ? '#16a34a' : '#dc2626';
          ulineColor = ok ? '#16a34a' : '#dc2626';
        }
        ctx.fillStyle = letterColor;
        ctx.fillText(display, sx + sw / 2, rowTopY + (textY - topY));
        ctx.strokeStyle = ulineColor; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(sx + 10, rowTopY + (underlineY - topY)); ctx.lineTo(sx + sw - 10, rowTopY + (underlineY - topY)); ctx.stroke();
        if (mode === 'attempt' && !spellingSubmittedRef.current && i === cursorSlotRef.current) {
          ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 3;
          roundRect(ctx, sx + 4, rowTopY + 6, sw - 8, Math.round(L.fp * 1.45), 12, false, true);
        }
      }
      for (let s = 0; s < L.sylMeta.length; s++) {
        const { start, end } = L.sylMeta[s];
        const left = slotX[start] + 8;
        const right = slotX[end - 1] + L.slotWidths[end - 1] - 8;
        let color = '#111';
        if (mode === 'correct') color = '#16a34a';
        else if (spellingSubmittedRef.current) color = sylCorrect[s] ? '#16a34a' : '#dc2626';
        ctx.strokeStyle = color; ctx.lineWidth = 8; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(left, rowTopY + (sylUnderlineY - topY)); ctx.lineTo(right, rowTopY + (sylUnderlineY - topY)); ctx.stroke();
      }
    };

    drawRow(topY, userGraphemesRef.current, 'attempt');
    if (spellingSubmittedRef.current) {
      const correctG = targetGraphemesRef.current;
      drawRow(topY + L.rowH + L.gapY, correctG, 'correct');
    } else {
      ctx.font = `700 ${Math.max(18, Math.round(L.fp * 0.50))}px Andika, sans-serif`;
      ctx.fillStyle = '#666';
      ctx.fillText('Escucha y escribe la palabra.', w / 2, topY + L.rowH + Math.round(L.fp * 0.70));
    }
  };

  // ── Word navigation ──
  const changeWord = (dir) => {
    const len = wordsRef.current.length;
    if (!len) return;
    let next = wordIndexRef.current + dir;
    if (next >= len) next = 0;
    if (next < 0) next = len - 1;
    wordIndexRef.current = next;
    setWordIndex(next);
    setRecordedUrl(null);
    setSpellingDone(false);
  };

  // ── Audio ──
  const playAudio = () => {
    const word = wordsRef.current[wordIndexRef.current];
    if (!word) return;
    const rawText = typeof word === 'object' ? word.text : word;
    const norm = normalizeName(rawText);
    const urls = [
      `${SUPABASE_URL}/storage/v1/object/public/app-presets/slidetoread/audio/${encodeURIComponent(rawText)}.mp3`,
      `${SUPABASE_URL}/storage/v1/object/public/app-presets/slidetoread/audio/${norm}.mp3`,
    ];
    let i = 0;
    const tryNext = () => {
      if (i >= urls.length) return;
      const a = new Audio(urls[i++]);
      a.onerror = tryNext;
      a.play().catch(tryNext);
    };
    tryNext();
  };

  // ── Spelling mechanics ──
  const typeSpellChar = (ch) => {
    if (spellingSubmittedRef.current) return;
    const expected = targetGraphemesRef.current[cursorSlotRef.current] || '';
    const isDg = DIGRAPHS.includes(expected);
    if (isDg) {
      if (!pendingDigraphRef.current) {
        if (ch === expected[0]) {
          userGraphemesRef.current[cursorSlotRef.current] = ch;
          pendingDigraphRef.current = { expected, first: ch };
        } else {
          userGraphemesRef.current[cursorSlotRef.current] = ch;
        }
      } else {
        if (ch === expected[1] && userGraphemesRef.current[cursorSlotRef.current] === pendingDigraphRef.current.first) {
          userGraphemesRef.current[cursorSlotRef.current] = expected;
          pendingDigraphRef.current = null;
          advanceCursor();
        } else {
          userGraphemesRef.current[cursorSlotRef.current] = (userGraphemesRef.current[cursorSlotRef.current] || '') + ch;
        }
      }
    } else {
      if (!userGraphemesRef.current[cursorSlotRef.current]) {
        userGraphemesRef.current[cursorSlotRef.current] = ch;
        advanceCursor();
      } else {
        advanceCursor();
        if (!userGraphemesRef.current[cursorSlotRef.current]) {
          userGraphemesRef.current[cursorSlotRef.current] = ch;
          advanceCursor();
        }
      }
    }
    drawCanvas();
  };

  const advanceCursor = () => {
    let i = cursorSlotRef.current;
    while (i < userGraphemesRef.current.length && (userGraphemesRef.current[i] || '').length > 0) i++;
    cursorSlotRef.current = Math.min(i, userGraphemesRef.current.length - 1);
  };

  const spellingBackspace = () => {
    if (spellingSubmittedRef.current) return;
    if (pendingDigraphRef.current) {
      userGraphemesRef.current[cursorSlotRef.current] = '';
      pendingDigraphRef.current = null;
      drawCanvas(); return;
    }
    let i = cursorSlotRef.current;
    if (i >= targetGraphemesRef.current.length) i = targetGraphemesRef.current.length - 1;
    if (userGraphemesRef.current[i]) {
      userGraphemesRef.current[i] = ''; cursorSlotRef.current = i;
    } else {
      for (let j = i - 1; j >= 0; j--) {
        if (userGraphemesRef.current[j]) { userGraphemesRef.current[j] = ''; cursorSlotRef.current = j; break; }
      }
    }
    drawCanvas();
  };

  const submitSpelling = () => {
    if (spellingSubmittedRef.current) return;
    perSlotCorrectRef.current = targetGraphemesRef.current.map((tg, i) => normalizeForGrade(userGraphemesRef.current[i] || '') === normalizeForGrade(tg));
    spellingSubmittedRef.current = true;
    setSpellingDone(true);
    drawCanvas();
  };

  const clearSpelling = () => {
    userGraphemesRef.current = new Array(targetGraphemesRef.current.length).fill('');
    cursorSlotRef.current = 0;
    spellingSubmittedRef.current = false;
    perSlotCorrectRef.current = [];
    pendingDigraphRef.current = null;
    setSpellingDone(false);
    if (gameMode === 'spell_tiles') { tilesUsedRef.current = new Array(tilesRef.current.length).fill(false); setTileRackKey(k => k + 1); }
    drawCanvas();
  };

  const placeTile = (tile, tileIndex) => {
    if (spellingSubmittedRef.current) return;
    const slot = userGraphemesRef.current.findIndex(x => !x);
    if (slot === -1) return;
    userGraphemesRef.current[slot] = tile;
    tilesUsedRef.current[tileIndex] = true;
    cursorSlotRef.current = slot;
    advanceCursor();
    setTileRackKey(k => k + 1);
    drawCanvas();
  };

  // ── Mode change ──
  const handleModeChange = (m) => {
    setGameMode(m);
    gameModeRef.current = m;
    const word = wordsRef.current[wordIndexRef.current];
    if (word) setupWord(word);
    if (m === 'spell_kb') setTimeout(() => spellInputRef.current?.focus(), 50);
  };

  // ── Recording ──
  const startRecording = async () => {
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      let mr;
      try {
        // Try canvas+audio video recording
        const c = canvasRef.current;
        const canvasStream = c.captureStream(30);
        const combined = new MediaStream([...canvasStream.getVideoTracks(), ...audioStream.getAudioTracks()]);
        streamRef.current = combined;
        mr = new MediaRecorder(combined, { mimeType: 'video/webm;codecs=vp8,opus' });
        mr.onstop = () => {
          combined.getTracks().forEach(t => t.stop());
          const blob = new Blob(chunksRef.current, { type: 'video/webm' });
          setRecordedUrl(URL.createObjectURL(blob));
        };
      } catch (_) {
        // Fallback: audio only
        streamRef.current = audioStream;
        mr = new MediaRecorder(audioStream);
        mr.onstop = () => {
          audioStream.getTracks().forEach(t => t.stop());
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          setRecordedUrl(URL.createObjectURL(blob));
        };
      }
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start(100);
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch (e) { alert('Microphone access needed for recording.'); }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    setRecording(false);
  };

  const allFilled = userGraphemesRef.current.length > 0 && userGraphemesRef.current.every(x => (x || '').length > 0);
  const inSpell = gameMode !== 'read';

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-white"><p className="text-gray-400 text-lg animate-pulse">Cargando…</p></div>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-white" style={{ fontFamily: 'Andika, sans-serif', userSelect: 'none', margin: 6 }}>
      <link href="https://fonts.googleapis.com/css2?family=Andika&display=swap" rel="stylesheet" />

      {/* Title */}
      <div style={{ textAlign: 'center', margin: '6px 0 4px' }}>
        <button onClick={onBack} style={{ float: 'left', fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', color: '#666' }}>← Back</button>
        <h2 style={{ display: 'inline', fontSize: 22, fontWeight: 'bold' }}>Spanish Reading Game</h2>
      </div>

      {/* Row 1: list + module selects */}
      <div style={{ textAlign: 'center', margin: '2px 0' }}>
        <select value={selectedList} onChange={e => setSelectedList(e.target.value)} style={{ fontSize: 15, padding: '4px 8px', margin: 2 }}>
          <option value="" disabled>Selecciona una lista</option>
          {Object.keys(allLists).map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        {showModuleUI && (<>
          <select value={selectedModule} onChange={e => setSelectedModule(e.target.value)} style={{ fontSize: 15, padding: '4px 8px', margin: 2 }}>
            {['M1','M2','M3','M4','M5','M6','M7','M8','M9'].map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={scopeMode} onChange={e => setScopeMode(e.target.value)} style={{ fontSize: 15, padding: '4px 8px', margin: 2, background: '#dcfce7' }}>
            <option value="all">📚 Hasta este módulo</option>
            <option value="new">⭐ Solo este módulo</option>
          </select>
        </>)}
      </div>

      {/* Row 2: control bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap', margin: '4px 0' }}>
        <button onClick={spellingBackspace} disabled={!inSpell} style={{ fontSize: 15, padding: '4px 8px' }}>⌫</button>
        <button onClick={clearSpelling} disabled={!inSpell} style={{ fontSize: 15, padding: '4px 8px' }}>🧽 Clear</button>
        <span style={{ fontWeight: 600 }}>Modo:</span>
        <select value={gameMode} onChange={e => handleModeChange(e.target.value)} style={{ fontSize: 15, padding: '4px 8px' }}>
          <option value="read">📖 Leer (Slider)</option>
          <option value="spell_kb">⌨️ Deletrear (Teclado)</option>
          <option value="spell_tiles">🧩 Deletrear (Fichas)</option>
        </select>
        {gameMode === 'spell_tiles' && (
          <select value={tileMode} onChange={e => { setTileMode(e.target.value); }} style={{ fontSize: 15, padding: '4px 8px' }}>
            <option value="exact">Fichas: Exactas</option>
            <option value="vowels">Fichas: Consonantes + Vocales</option>
            <option value="distractors">Fichas: + Distractores</option>
          </select>
        )}
        <button onClick={playAudio} disabled={!wordsRef.current.length} style={{ fontSize: 15, padding: '4px 8px' }}>🔊 Play Audio</button>
        <button onClick={() => changeWord(-1)} style={{ fontSize: 15, padding: '4px 8px' }}>⟵ Prev</button>
        <button onClick={() => changeWord(1)} style={{ fontSize: 15, padding: '4px 8px' }}>Next ⟶</button>
        <button onClick={submitSpelling} disabled={!inSpell || !allFilled || spellingDone} style={{ fontSize: 15, padding: '4px 8px' }}>✅ Submit</button>
      </div>

      {/* Tile rack */}
      {gameMode === 'spell_tiles' && (
        <div key={tileRackKey} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, maxWidth: 900, margin: '0 auto 10px', padding: 6 }}>
          {tilesRef.current.map((t, i) => (
            <button key={i} onClick={() => placeTile(t, i)}
              disabled={!!tilesUsedRef.current[i] || spellingDone}
              style={{ fontFamily: 'Andika, sans-serif', fontSize: 22, padding: '10px 14px', border: '2px solid #111', background: '#fff', borderRadius: 14, cursor: 'pointer', minWidth: 54, opacity: tilesUsedRef.current[i] ? 0.35 : 1 }}>
              {t}
            </button>
          ))}
        </div>
      )}

      {/* Canvas */}
      <div ref={containerRef} style={{ width: '95%', maxWidth: 900, margin: '0 auto', height: 300, border: '1px solid #ddd', position: 'relative' }}>
        <canvas ref={canvasRef} style={{ display: 'block', position: 'absolute', inset: 0, touchAction: 'none', cursor: 'default' }} />
      </div>

      {/* Recording controls */}
      <div style={{ textAlign: 'center', margin: '8px 0' }}>
        <button onClick={startRecording} disabled={recording} style={{ fontSize: 15, padding: '4px 8px', margin: 2 }}>🎙 Start Recording</button>
        <button onClick={stopRecording} disabled={!recording} style={{ fontSize: 15, padding: '4px 8px', margin: 2 }}>⏹ Stop Recording</button>
      </div>

      {/* Playback */}
      {recordedUrl && (
        <div style={{ textAlign: 'center', margin: '4px 0 10px' }}>
          <video src={recordedUrl} controls style={{ maxWidth: '95%', borderRadius: 8 }} onError={(e) => {
            // If video fails, try as audio
            const audio = document.createElement('audio');
            audio.src = recordedUrl;
            audio.controls = true;
            e.target.replaceWith(audio);
          }} />
        </div>
      )}

      {/* hidden spell input */}
      <input ref={spellInputRef} autoComplete="off" autoCapitalize="none" spellCheck={false}
        style={{ position: 'absolute', left: -9999, top: -9999 }} />
    </div>
  );
}