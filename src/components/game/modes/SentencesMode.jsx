import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { base44 } from '@/api/base44Client';

// ── Sentence lists ────────────────────────────────────────────────────────────
const SENTENCE_BANK = {
  1: [
    { id: 'M1.S001', text: 'Mi mamá me mima.' },
    { id: 'M1.S002', text: 'Memo ama a mamá.' },
    { id: 'M1.S003', text: 'Mimi me ama.' },
    { id: 'M1.S004', text: 'Amo a Mimi.' },
    { id: 'M1.S005', text: 'Mamá ama a Mimi.' },
    { id: 'M1.S006', text: 'Memo mima a mamá.' },
    { id: 'M1.S007', text: 'Amo a mamá.' },
    { id: 'M1.S008', text: 'Amo a Mimi.' },
  ],
  2: [
    { id: 'M2.S001', text: 'Mamá ama a papá.' },
    { id: 'M2.S002', text: 'Sale el sol.' },
    { id: 'M2.S003', text: 'Salió el sol.' },
    { id: 'M2.S004', text: 'Salió la luna.' },
    { id: 'M2.S005', text: 'Papá ama a mamá.' },
    { id: 'M2.S006', text: 'Papá me ama.' },
    { id: 'M2.S007', text: 'Pepe se pasea.' },
    { id: 'M2.S008', text: 'Ese es mi puma.' },
    { id: 'M2.S009', text: 'Ese es mi mapa.' },
    { id: 'M2.S010', text: 'Ese mapa es mío.' },
    { id: 'M2.S011', text: 'Ese puma es mío.' },
    { id: 'M2.S012', text: 'Mamá amasa la masa.' },
    { id: 'M2.S013', text: 'Susi sale a la sala.' },
    { id: 'M2.S014', text: 'Samuel limpia la mesa.' },
    { id: 'M2.S015', text: 'Memo limpia la mesa.' },
    { id: 'M2.S016', text: 'Ese es un limón.' },
    { id: 'M2.S017', text: 'Esa es una mesa.' },
    { id: 'M2.S018', text: 'Pepe usa el mapa.' },
    { id: 'M2.S019', text: 'Ese es un pino.' },
    { id: 'M2.S020', text: 'Me peino mi pelo.' },
    { id: 'M2.S021', text: 'Mi mamá me puso a limpiar el piso.' },
    { id: 'M2.S022', text: 'Papá sale de la sala.' },
    { id: 'M2.S023', text: 'Mi mamá limpia la mesa.' },
    { id: 'M2.S024', text: 'Limpia el piso.' },
    { id: 'M2.S025', text: 'Puse mi puma en la mesa.' },
    { id: 'M2.S026', text: 'Puse el pepino en la mesa.' },
    { id: 'M2.S027', text: 'Mi mamá puso la sopa en la mesa.' },
    { id: 'M2.S028', text: 'Unas palomas son malas.' },
    { id: 'M2.S029', text: 'No pesa nada.' },
    { id: 'M2.S030', text: 'Ana pela la piel de un pepino.' },
    { id: 'M2.S031', text: 'Comí pepino con limón y sal.' },
    { id: 'M2.S032', text: 'Susi pasa la sal.' },
    { id: 'M2.S033', text: 'Nina usa el mapa.' },
  ],
  3: [
    { id: 'M3.S001', text: 'Mamá se toma su soda.' },
    { id: 'M3.S002', text: 'Papá salta alto.' },
    { id: 'M3.S003', text: 'La sopa está lista.' },
    { id: 'M3.S004', text: 'El té está listo.' },
    { id: 'M3.S005', text: 'Mi mamá está lista.' },
    { id: 'M3.S006', text: 'Pepe se alista.' },
    { id: 'M3.S007', text: 'La mesa está en la sala.' },
    { id: 'M3.S008', text: 'Pepe está al lado de la mesa.' },
    { id: 'M3.S009', text: 'Puse mi dona en la mesa.' },
    { id: 'M3.S010', text: '¿Me puedes poner la tele?' },
    { id: 'M3.S011', text: 'Puse dos tamales en el piso.' },
    { id: 'M3.S012', text: 'La dama tiene una falda.' },
    { id: 'M3.S013', text: 'Me falta mi dado.' },
    { id: 'M3.S014', text: '¿Dónde está mi dado?' },
    { id: 'M3.S015', text: 'Mamá, ¿dónde estás?' },
    { id: 'M3.S016', text: 'El sapo saltó en la sala.' },
    { id: 'M3.S017', text: 'Pepe se mete en la tina.' },
    { id: 'M3.S018', text: 'Tenemos dos mesas.' },
    { id: 'M3.S019', text: 'Uso los dos dados.' },
    { id: 'M3.S020', text: 'Me topé el pie en la pata de la mesa.' },
    { id: 'M3.S021', text: 'El sapo salta con dos patas.' },
    { id: 'M3.S022', text: 'Dime dónde está el mapa.' },
    { id: 'M3.S023', text: 'Susi se siente mal.' },
    { id: 'M3.S024', text: 'El pato patea la pelota.' },
    { id: 'M3.S025', text: 'Pásame la pelota.' },
    { id: 'M3.S026', text: 'Puedo patear la pelota a la luna.' },
    { id: 'M3.S027', text: 'Las palomas se posan en palos.' },
    { id: 'M3.S028', text: 'La ola topa con mi pie.' },
    { id: 'M3.S029', text: 'La ola topa con la isla.' },
    { id: 'M3.S030', text: 'El elefante es pesado.' },
    { id: 'M3.S031', text: 'Le falta sal a la sopa.' },
  ],
  4: [
    { id: 'M4.S001', text: 'Rita baila sola.' },
    { id: 'M4.S002', text: 'El perro corre.' },
    { id: 'M4.S003', text: 'La reina baila bien.' },
    { id: 'M4.S004', text: 'Rita come sopa.' },
    { id: 'M4.S005', text: 'El carro pasa.' },
    { id: 'M4.S006', text: 'La rana corre.' },
    { id: 'M4.S007', text: 'Rita baila un poco mal.' },
    { id: 'M4.S008', text: 'El coco cae desde arriba.' },
    { id: 'M4.S009', text: 'La paleta está rica.' },
    { id: 'M4.S010', text: 'Rita toma té caliente.' },
    { id: 'M4.S011', text: 'Beto camina lento.' },
    { id: 'M4.S012', text: 'Quito el palo de mi camino.' },
    { id: 'M4.S013', text: 'Unos quesos son ricos.' },
    { id: 'M4.S014', text: 'Me alisté rápido.' },
    { id: 'M4.S015', text: 'Se rompió mi camisa.' },
    { id: 'M4.S016', text: 'Tu camisa es de tela bonita.' },
    { id: 'M4.S017', text: 'El caldo está demasiado salado.' },
    { id: 'M4.S018', text: 'Al león le encanta comer.' },
    { id: 'M4.S019', text: 'El mono se comió mis bananas.' },
    { id: 'M4.S020', text: 'Aquí está el puma.' },
    { id: 'M4.S021', text: 'Aquí está mi pelota.' },
    { id: 'M4.S022', text: 'Me duele el pie.' },
    { id: 'M4.S023', text: 'Milo se sube a la mesa.' },
    { id: 'M4.S024', text: 'Comí ensalada con tomate.' },
    { id: 'M4.S025', text: 'Mi mamá le pone tomate a la sopa.' },
    { id: 'M4.S026', text: 'Mia lee en la sala.' },
    { id: 'M4.S027', text: 'Liam lee en el salón.' },
    { id: 'M4.S028', text: 'Lian apila seis cubos.' },
    { id: 'M4.S029', text: 'Limpió la pelusa del piso.' },
    { id: 'M4.S030', text: 'Busco pistas con la lupa.' },
    { id: 'M4.S031', text: 'La sopa es tan rica que quiero más.' },
    { id: 'M4.S032', text: 'Casi se cae mi torre de cubos.' },
    { id: 'M4.S033', text: 'Corrí lento y me quedé en quinto.' },
    { id: 'M4.S034', text: 'Rita barre el piso.' },
  ],
  5: [
    { id: 'M5.S001', text: 'Llámame, por favor.' },
    { id: 'M5.S002', text: 'La llanta rueda por la calle.' },
    { id: 'M5.S003', text: 'El villano se robó el tesoro.' },
    { id: 'M5.S004', text: 'Quiero buscar tesoro con un mapa.' },
    { id: 'M5.S005', text: 'Mi papá es valiente y fuerte.' },
    { id: 'M5.S006', text: 'Las palomas tienen alas para volar.' },
    { id: 'M5.S007', text: 'Unas aves no pueden volar.' },
    { id: 'M5.S008', text: 'El loro es colorido.' },
    { id: 'M5.S009', text: 'El loro vuela por el aire.' },
    { id: 'M5.S010', text: 'Los pavos reales tienen plumas bellas.' },
    { id: 'M5.S011', text: 'Los cuervos son curiosos.' },
    { id: 'M5.S012', text: 'Miro la roca con mi lupa.' },
    { id: 'M5.S013', text: 'Puedo tender mi cama.' },
    { id: 'M5.S014', text: 'Casi se me cae mi ensalada.' },
    { id: 'M5.S015', text: 'Puse mi osito en la silla.' },
    { id: 'M5.S016', text: 'Le puse miel a mi té.' },
    { id: 'M5.S017', text: 'El oso se llenó las manos de miel.' },
    { id: 'M5.S018', text: 'Los imanes son divertidos.' },
    { id: 'M5.S019', text: 'Las galletas son ricas.' },
    { id: 'M5.S020', text: 'Me encanta patinar.' },
    { id: 'M5.S021', text: 'Sentí la lluvia en mi cara.' },
    { id: 'M5.S022', text: 'Lavo el pepino antes de pelarlo.' },
    { id: 'M5.S023', text: 'Vivi lava la olla.' },
    { id: 'M5.S024', text: 'El villano esconde la llave del candado.' },
  ],
  6: [
    { id: 'M6.S001', text: 'Ella hace mejor su tarea.' },
  ],
  7: [
    { id: 'M7.S001', text: 'El libro nuevo está dentro.' },
  ],
  8: [
    { id: 'M8.S001', text: 'La música crece en el grupo.' },
  ],
  9: [
    { id: 'M9.S001', text: 'Los niños observan árboles.' },
  ],
};

const SUPABASE_AUDIO_BASE = 'https://dmlsiyyqpcupbizpxwhp.supabase.co/storage/v1/object/public/lettersort-audio';
const MODULES = Object.keys(SENTENCE_BANK).map(Number);

function playAudioById(id) {
  const candidates = [
    `${SUPABASE_AUDIO_BASE}/${id}.mp3`,
    `${SUPABASE_AUDIO_BASE}/${id}.wav`,
  ];
  let i = 0;
  const tryNext = () => {
    if (i >= candidates.length) return;
    const a = new Audio(candidates[i++]);
    a.onerror = tryNext;
    a.play().catch(tryNext);
  };
  tryNext();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function createTile(type, value) {
  return { id: Math.random().toString(36).slice(2), type, value };
}

const PLAIN_TO_ACC = { a:'á',e:'é',i:'í',o:'ó',u:'ú',A:'Á',E:'É',I:'Í',O:'Ó',U:'Ú' };
const ACC_TO_PLAIN = { á:'a',é:'e',í:'i',ó:'o',ú:'u',Á:'A',É:'E',Í:'I',Ó:'O',Ú:'U' };

// Ghost element for touch drag (matches WordSentenceBuilder)
function createGhostEl(label) {
  removeGhostEl();
  const ghost = document.createElement('div');
  ghost.id = '__sent_drag_ghost__';
  ghost.textContent = label;
  ghost.style.cssText = `position:fixed;z-index:9999;pointer-events:none;background:white;border:2px solid #4f46e5;border-radius:12px;padding:6px 14px;font-size:1.4rem;font-weight:bold;font-family:Andika,system-ui,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,0.25);opacity:0.92;transform:translate(-50%,-60%);white-space:nowrap;`;
  document.body.appendChild(ghost);
  return ghost;
}
function removeGhostEl() { document.getElementById('__sent_drag_ghost__')?.remove(); }
function moveGhostEl(x, y) { const g = document.getElementById('__sent_drag_ghost__'); if (g) { g.style.left = x+'px'; g.style.top = y+'px'; } }

// Calculate which character index in a tile element the cursor is over
function calcAccentCharIdx(tileEl, clientX) {
  if (!tileEl) return 0;
  const text = tileEl.textContent || '';
  if (text.length <= 1) return 0;
  const r = tileEl.getBoundingClientRect();
  const frac = (clientX - r.left) / r.width;
  return Math.max(0, Math.min(text.length - 1, Math.floor(frac * text.length)));
}

// ── Spanish syllabification ───────────────────────────────────────────────────
const STRONG = 'aeoáéó';
const WEAK_VOWELS = 'iuü';
const ACCENTED_WEAK = 'íú';
const VOWELS_STR = 'aeiouáéíóúü';

function _isVowel(ch) { return VOWELS_STR.includes(ch); }
function _isStrong(ch) { return STRONG.includes(ch); }
function _isAccentedWeak(ch) { return ACCENTED_WEAK.includes(ch); }

function _shouldSplitVowels(v1, v2) {
  if (_isAccentedWeak(v1) || _isAccentedWeak(v2)) return true;
  if (_isStrong(v1) && _isStrong(v2)) return true;
  return false;
}

function _tokenize(word) {
  const w = word.toLowerCase();
  const units = [];
  for (let i = 0; i < w.length; i++) {
    const two = w.slice(i, i + 2);
    if (['ch', 'll', 'rr'].includes(two)) { units.push(two); i++; }
    else units.push(w[i]);
  }
  return units;
}

function syllabify(word) {
  const units = _tokenize(word);
  const syllables = [];
  let current = '';
  const VALID_CLUSTERS = ['br','bl','cr','cl','dr','fr','fl','gr','gl','pr','pl','tr'];

  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    const next = units[i + 1];
    const afterNext = units[i + 2];
    current += unit;

    if (!next) { syllables.push(current); break; }

    const unitIsVowel = unit.length === 1 && _isVowel(unit);
    const nextIsVowel = next.length === 1 && _isVowel(next);
    const afterNextIsVowel = afterNext && afterNext.length === 1 && _isVowel(afterNext);

    // vowel + vowel
    if (unitIsVowel && nextIsVowel) {
      if (_shouldSplitVowels(unit, next)) { syllables.push(current); current = ''; }
      continue;
    }

    // vowel + consonant + vowel → split before consonant
    if (unitIsVowel && !nextIsVowel && afterNextIsVowel) {
      syllables.push(current); current = ''; continue;
    }

    // vowel + consonant + consonant + vowel
    if (unitIsVowel && !nextIsVowel && afterNext && !afterNextIsVowel) {
      const third = units[i + 3];
      if (third && third.length === 1 && _isVowel(third)) {
        const cluster = next + afterNext;
        if (VALID_CLUSTERS.includes(cluster)) {
          syllables.push(current); current = '';
        } else {
          current += next; syllables.push(current); current = ''; i++;
        }
      }
    }
  }

  return syllables.filter(s => s.length > 0);
}

function parseSentenceToTiles(sentence) {
  // Returns: words (array of syllable arrays), puncts, and flat syllable list
  const raw = sentence.trim().split(/\s+/);
  const wordSyllables = []; // [[syll,syll,...], ...]
  const puncts = [];
  raw.forEach(w => {
    const m = w.match(/^([a-záéíóúüñA-ZÁÉÍÓÚÜÑ¿¡]+)([.,!?;:]*)$/);
    const wordPart = m ? m[1].toLowerCase() : w.toLowerCase();
    const punct = m ? m[2] : '';
    wordSyllables.push(syllabify(wordPart));
    if (punct) punct.split('').forEach(p => puncts.push(p));
  });
  // flat list of all syllables in order (for validation)
  const allSyllables = wordSyllables.flat();
  return { wordSyllables, allSyllables, puncts };
}

// ── Writing canvas ─────────────────────────────────────────────────────────────
function SentenceWriteCanvas({ onDone, onPlayAudio }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPos = useRef(null);
  const allStrokes = useRef([]);
  const currentStroke = useRef([]);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [playing, setPlaying] = useState(false);

  const getPos = (e) => {
    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: ((src.clientX - rect.left) / rect.width) * c.width, y: ((src.clientY - rect.top) / rect.height) * c.height, t: Date.now() };
  };
  const onDown = (e) => {
    e.preventDefault();
    const pos = getPos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
    lastPos.current = pos; currentStroke.current = [pos]; drawing.current = true; setHasDrawn(true);
  };
  const onMove = (e) => {
    e.preventDefault();
    if (!drawing.current) return;
    const pos = getPos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1e40af';
    const prev = lastPos.current;
    ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + pos.x) / 2, (prev.y + pos.y) / 2);
    ctx.stroke(); ctx.beginPath(); ctx.moveTo((prev.x + pos.x) / 2, (prev.y + pos.y) / 2);
    lastPos.current = pos; currentStroke.current.push(pos);
  };
  const onUp = (e) => {
    e.preventDefault();
    if (!drawing.current) return;
    drawing.current = false;
    if (currentStroke.current.length > 0) { allStrokes.current = [...allStrokes.current, currentStroke.current]; currentStroke.current = []; }
  };
  const clear = () => {
    const c = canvasRef.current;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    allStrokes.current = []; setHasDrawn(false);
  };

  const handlePlay = () => {
    setPlaying(true);
    onPlayAudio();
    setTimeout(() => setPlaying(false), 2000);
  };

  const W = 800, H = 240;
  const lineRows = [
    { top: 0, mid: H * 0.16, base: H * 0.29 },
    { top: H * 0.35, mid: H * 0.51, base: H * 0.64 },
    { top: H * 0.70, mid: H * 0.85, base: H * 0.96 },
  ];

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Speaker-only prompt */}
      <div className="flex flex-col items-center gap-2">
        <button
          onClick={handlePlay}
          className={`w-20 h-20 rounded-full flex items-center justify-center text-4xl shadow-xl transition-all active:scale-95 ${playing ? 'bg-rose-500 scale-110' : 'bg-rose-400 hover:bg-rose-500'}`}
        >
          🔊
        </button>
        <p className="text-sm text-rose-500 font-bold">{playing ? 'Escuchando…' : 'Toca para escuchar'}</p>
      </div>
      <p className="text-base font-black text-indigo-700 text-center">✏️ Escribe la oración primero</p>
      <div className="relative rounded-2xl border-4 border-indigo-300 overflow-hidden w-full" style={{ height: 180, background: '#f0f7ff' }}>
        <svg className="absolute inset-0 pointer-events-none w-full h-full" preserveAspectRatio="none" viewBox={`0 0 ${W} ${H}`}>
          {lineRows.map((r, i) => (
            <g key={i}>
              <line x1="0" y1={r.top + 4} x2={W} y2={r.top + 4} stroke="#b0c4de" strokeWidth="1.5" />
              <line x1="0" y1={r.mid} x2={W} y2={r.mid} stroke="#b0c4de" strokeWidth="1" strokeDasharray="10,6" />
              <line x1="0" y1={r.base} x2={W} y2={r.base} stroke="#3b82f6" strokeWidth="2" />
            </g>
          ))}
        </svg>
        <canvas ref={canvasRef} width={W} height={H}
          className="absolute inset-0 touch-none w-full h-full"
          style={{ background: 'transparent', cursor: 'crosshair' }}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
        />
      </div>
      <div className="flex gap-3">
        <button onClick={clear} className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-600 font-bold hover:bg-gray-200">🗑 Borrar</button>
        <button onClick={() => onDone(allStrokes.current)} disabled={!hasDrawn}
          className="flex-1 py-3 rounded-2xl bg-indigo-600 text-white font-bold shadow-lg disabled:opacity-40 hover:bg-indigo-700">
          Listo → Construir
        </button>
      </div>
    </div>
  );
}

// ── Sentence Builder ──────────────────────────────────────────────────────────
// Mirrors WordSentenceBuilder exactly: always-visible draggable tool tiles,
// character-level accent targeting via drag hover, touch drag with ghost element.
function SentenceBuilder({ sentence, onComplete, onPlayAudio }) {
  const { wordSyllables, allSyllables, puncts } = parseSentenceToTiles(sentence);
  // Number of words = number of word groups
  const numWords = wordSyllables.length;

  const makeInitialTray = () => {
    // One tile per syllable occurrence (duplicates allowed for repeated syllables), shuffled
    const syllTiles = allSyllables.map(s => createTile('text', s));
    for (let i = syllTiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [syllTiles[i], syllTiles[j]] = [syllTiles[j], syllTiles[i]];
    }
    // Spaces between words (numWords - 1)
    const spaceTiles = Array.from({ length: numWords - 1 }, () => createTile('space', ' '));
    const punctTiles = puncts.map(p => createTile('punc', p));
    return [...syllTiles, ...spaceTiles, ...punctTiles];
  };

  const [tray, setTray] = useState(() => makeInitialTray());
  const [dropZone, setDropZone] = useState([]);
  const [pendingRemove, setPendingRemove] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [playing, setPlaying] = useState(false);
  // For tool hover highlighting: which dropzone tile index is hovered, and which char
  const [toolHoverIdx, setToolHoverIdx] = useState(null);
  const [accentCharIdx, setAccentCharIdx] = useState(null);
  const [dropHoverIdx, setDropHoverIdx] = useState(null); // insertion ghost position
  const [isDraggingNormal, setIsDraggingNormal] = useState(false); // true when dragging a non-tool tile

  const dragRef = useRef(null);
  const dropZoneRef = useRef(null);
  const dropZoneStateRef = useRef(dropZone);
  useEffect(() => { dropZoneStateRef.current = dropZone; }, [dropZone]);

  const reset = () => { setTray(makeInitialTray()); setDropZone([]); setShowResult(false); setPendingRemove(null); setToolHoverIdx(null); setAccentCharIdx(null); setDropHoverIdx(null); setIsDraggingNormal(false); };

  // ── Apply a tool to a tile in the dropzone ────────────────────────────────
  const applyTool = useCallback((tileId, toolType, charIdx) => {
    setDropZone(prev => prev.map(t => {
      if (t.id !== tileId || t.type !== 'text') return t;
      if (toolType === 'captool-up') {
        return { ...t, value: t.value.charAt(0).toUpperCase() + t.value.slice(1) };
      }
      if (toolType === 'captool-down') {
        return { ...t, value: t.value.charAt(0).toLowerCase() + t.value.slice(1) };
      }
      if (toolType === 'accenttool') {
        const chars = [...t.value];
        const ci = charIdx ?? 0;
        if (ci >= 0 && ci < chars.length) {
          const ch = chars[ci];
          chars[ci] = PLAIN_TO_ACC[ch] || ACC_TO_PLAIN[ch] || ch;
        }
        return { ...t, value: chars.join('') };
      }
      return t;
    }));
    setShowResult(false);
  }, []);

  // ── Tray tap → clone into dropzone (tray tile stays) ─────────────────────
  const handleTrayTap = (tile) => {
    if (showResult) return;
    setDropZone(prev => [...prev, { ...tile, id: Math.random().toString(36).slice(2) }]);
    setPendingRemove(null);
  };

  // ── Dropzone tile tap ──────────────────────────────────────────────────────
  const handleDropTap = (tile) => {
    if (showResult) return;
    if (pendingRemove === tile.id) {
      setPendingRemove(null);
      // Just remove from dropzone — tray always has tiles available
      setDropZone(prev => prev.filter(t => t.id !== tile.id));
    } else {
      setPendingRemove(tile.id);
    }
  };

  // ── Mouse drag: tray tiles and tool tiles ─────────────────────────────────
  const handleTrayDragStart = (e, tile, isTool = false) => {
    dragRef.current = { tile: isTool ? tile : { ...tile, id: Math.random().toString(36).slice(2) }, isTool, fromDropZone: false };
    e.dataTransfer.effectAllowed = 'copy';
    if (!isTool) setIsDraggingNormal(true);
  };
  const handleDropZoneDragStart = (e, tile) => {
    dragRef.current = { tile, isTool: false, fromDropZone: true };
    e.dataTransfer.effectAllowed = 'move';
    setIsDraggingNormal(true);
  };

  // Compute insert index from pointer position within the dropzone
  const calcDropHoverIdx = (clientX, clientY) => {
    if (!dropZoneRef.current) return null;
    const slotEls = [...dropZoneRef.current.querySelectorAll('[data-slottile]')];
    for (let i = 0; i < slotEls.length; i++) {
      const r = slotEls[i].getBoundingClientRect();
      if (clientX <= r.left + r.width / 2 && clientY >= r.top && clientY <= r.bottom) return i;
    }
    if (slotEls.length > 0) {
      // Check if past the last tile on its row
      const last = slotEls[slotEls.length - 1].getBoundingClientRect();
      if (clientY >= last.top && clientY <= last.bottom) return slotEls.length;
    }
    return slotEls.length;
  };

  // dragover on the drop zone: for tool tiles, compute hover idx; for normal, show insertion ghost
  const handleDropZoneDragOver = (e) => {
    e.preventDefault();
    const d = dragRef.current;
    if (!d) return;
    if (d.isTool) {
      if (!dropZoneRef.current) return;
      const slotEls = [...dropZoneRef.current.querySelectorAll('[data-slottile]')];
      let hi = null;
      for (let i = 0; i < slotEls.length; i++) {
        const r = slotEls[i].getBoundingClientRect();
        const dz = dropZoneStateRef.current;
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom && dz[i]?.type === 'text') {
          hi = i;
          if (d.tile.type === 'accenttool') setAccentCharIdx(calcAccentCharIdx(slotEls[i], e.clientX));
          break;
        }
      }
      setToolHoverIdx(hi);
    } else {
      setDropHoverIdx(calcDropHoverIdx(e.clientX, e.clientY));
    }
  };
  const handleDropZoneDragLeave = (e) => {
    if (!dropZoneRef.current?.contains(e.relatedTarget)) {
      setToolHoverIdx(null); setAccentCharIdx(null); setDropHoverIdx(null); setIsDraggingNormal(false);
    }
  };

  const handleDropZoneDrop = (e) => {
    e.preventDefault();
    const d = dragRef.current;
    dragRef.current = null;
    const capturedHoverIdx = dropHoverIdx;
    setDropHoverIdx(null); setIsDraggingNormal(false);

    if (!d) return;

    if (d.isTool) {
      const dz = dropZoneStateRef.current;
      if (toolHoverIdx !== null && dz[toolHoverIdx]?.type === 'text') {
        applyTool(dz[toolHoverIdx].id, d.tile.type, accentCharIdx);
      }
      setToolHoverIdx(null); setAccentCharIdx(null);
      return;
    }

    const at = capturedHoverIdx !== null ? capturedHoverIdx : dropZoneStateRef.current.length;

    if (d.fromDropZone) {
      // Dropped inside dropzone → reorder
      setDropZone(prev => {
        const from = prev.findIndex(t => t.id === d.tile.id);
        if (from === -1) return prev;
        const next = prev.filter(t => t.id !== d.tile.id);
        const ins = Math.max(0, Math.min(at, next.length));
        next.splice(ins, 0, d.tile);
        return next;
      });
    } else {
      // From tray → clone and insert
      setDropZone(prev => {
        const next = [...prev];
        const ins = Math.max(0, Math.min(at, next.length));
        next.splice(ins, 0, d.tile);
        return next;
      });
    }
  };

  // Called when a dropzone tile is dragged and released outside the dropzone
  const handleDropZoneDragEnd = (e, tile) => {
    // If dropEffect is 'none', the drag was not dropped onto a valid target (i.e. outside dropzone)
    if (e.dataTransfer.dropEffect === 'none') {
      setDropZone(prev => prev.filter(t => t.id !== tile.id));
      setPendingRemove(null);
    }
    setDropHoverIdx(null);
    setIsDraggingNormal(false);
    dragRef.current = null;
  };

  // ── Touch drag (mirrors WordSentenceBuilder) ───────────────────────────────
  useEffect(() => {
    const DRAG_THRESHOLD = 10;
    const handleTouchStart = (e) => {
      const target = e.target.closest('[data-traytile],[data-slottile],[data-tooltile]');
      if (!target) return;

      const touch0 = e.touches[0];
      const startX = touch0.clientX, startY = touch0.clientY;
      let dragging = false;
      let pendingData = null;
      let touchAccentIdx = 0;

      const isTool = !!target.closest('[data-tooltile]');
      const isTray = !!target.closest('[data-traytile]') && !isTool;
      const tileType = target.dataset.tiletype;
      const tileValue = target.dataset.tilevalue;
      const tileId = target.dataset.tileid;
      const ghostLabel = tileType === 'space' ? '␣' : (tileValue || target.textContent?.trim() || '?');

      if (isTool && tileType) {
        pendingData = { tile: createTile(tileType, tileValue || ''), isTool: true, fromDropZone: false };
      } else if (isTray && tileType) {
        const dz = dropZoneStateRef.current;
        // find tile in tray by id
        pendingData = { tile: createTile(tileType, tileValue || ''), isTool: false, fromDropZone: false };
      } else if (tileId) {
        pendingData = { tile: { id: tileId, type: tileType, value: tileValue }, isTool: false, fromDropZone: true };
      }

      if (!pendingData) return;

      const onTouchMove = (ev) => {
        const t = ev.touches[0];
        const dx = t.clientX - startX, dy = t.clientY - startY;
        if (!dragging) {
          if (Math.sqrt(dx*dx + dy*dy) < DRAG_THRESHOLD) { ev.preventDefault(); return; }
          dragging = true;
          dragRef.current = pendingData;
          createGhostEl(ghostLabel);
          if (!pendingData.isTool) setIsDraggingNormal(true);
        }
        ev.preventDefault();
        moveGhostEl(t.clientX, t.clientY);

        if (pendingData.isTool && dropZoneRef.current) {
          const slotEls = [...dropZoneRef.current.querySelectorAll('[data-slottile]')];
          let hi = null;
          const dz = dropZoneStateRef.current;
          for (let i = 0; i < slotEls.length; i++) {
            const r = slotEls[i].getBoundingClientRect();
            if (t.clientX >= r.left && t.clientX <= r.right && t.clientY >= r.top && t.clientY <= r.bottom && dz[i]?.type === 'text') {
              hi = i;
              if (tileType === 'accenttool') { touchAccentIdx = calcAccentCharIdx(slotEls[i], t.clientX); setAccentCharIdx(touchAccentIdx); }
              break;
            }
          }
          setToolHoverIdx(hi);
        } else if (!pendingData.isTool && dropZoneRef.current) {
          const dzr = dropZoneRef.current.getBoundingClientRect();
          if (t.clientX >= dzr.left && t.clientX <= dzr.right && t.clientY >= dzr.top && t.clientY <= dzr.bottom) {
            const slotEls = [...dropZoneRef.current.querySelectorAll('[data-slottile]')];
            let ins = slotEls.length;
            for (let i = 0; i < slotEls.length; i++) {
              const r = slotEls[i].getBoundingClientRect();
              if (t.clientX <= r.left + r.width / 2 && t.clientY >= r.top && t.clientY <= r.bottom) { ins = i; break; }
            }
            setDropHoverIdx(ins);
          } else {
            setDropHoverIdx(null);
          }
        }
      };

      const onTouchEnd = (ev) => {
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
        if (!dragging) return; // was a tap — let click fire
        ev.preventDefault();
        removeGhostEl();
        dragRef.current = null;
        setDropHoverIdx(null); setIsDraggingNormal(false);
        const ct = ev.changedTouches[0];

        if (pendingData.isTool && dropZoneRef.current) {
          const slotEls = [...dropZoneRef.current.querySelectorAll('[data-slottile]')];
          const dz = dropZoneStateRef.current;
          for (let i = 0; i < slotEls.length; i++) {
            const r = slotEls[i].getBoundingClientRect();
            if (ct.clientX >= r.left && ct.clientX <= r.right && ct.clientY >= r.top && ct.clientY <= r.bottom && dz[i]?.type === 'text') {
              applyTool(dz[i].id, tileType, touchAccentIdx);
              break;
            }
          }
        } else if (dropZoneRef.current) {
          const dzr = dropZoneRef.current.getBoundingClientRect();
          const insideDropZone = ct.clientX >= dzr.left && ct.clientX <= dzr.right && ct.clientY >= dzr.top && ct.clientY <= dzr.bottom;

          if (insideDropZone) {
            // Find insert position
            const slotEls = [...dropZoneRef.current.querySelectorAll('[data-slottile]')];
            let insertIdx = null;
            for (let i = 0; i < slotEls.length; i++) {
              const r = slotEls[i].getBoundingClientRect();
              if (ct.clientX <= r.right && ct.clientY >= r.top && ct.clientY <= r.bottom) { insertIdx = i; break; }
            }

            if (pendingData.fromDropZone) {
              // Reorder
              setDropZone(prev => {
                const from = prev.findIndex(t => t.id === pendingData.tile.id);
                if (from === -1) return prev;
                const next = prev.filter(t => t.id !== pendingData.tile.id);
                const at = insertIdx !== null ? Math.min(insertIdx, next.length) : next.length;
                next.splice(at, 0, pendingData.tile);
                return next;
              });
            } else {
              // Clone from tray and insert
              setDropZone(prev => {
                const next = [...prev];
                const newTile = { ...pendingData.tile, id: Math.random().toString(36).slice(2) };
                const at = insertIdx !== null ? Math.min(insertIdx, next.length) : next.length;
                next.splice(at, 0, newTile);
                return next;
              });
            }
          } else if (pendingData.fromDropZone) {
            // Dragged dropzone tile released outside → delete it
            setDropZone(prev => prev.filter(t => t.id !== pendingData.tile.id));
            setPendingRemove(null);
          }
        }

        setToolHoverIdx(null); setAccentCharIdx(null);
      };

      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', onTouchEnd);
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    return () => document.removeEventListener('touchstart', handleTouchStart);
  }, [applyTool]);

  // ── Check ─────────────────────────────────────────────────────────────────
  const handleCheck = () => {
    // Build expected token list: syllables of word0 (first capitalized), space, syllables of word1, space, ...puncts
    const expected = [];
    wordSyllables.forEach((sylls, wi) => {
      sylls.forEach((s, si) => {
        // Capitalize first letter of very first syllable
        const val = (wi === 0 && si === 0) ? s.charAt(0).toUpperCase() + s.slice(1) : s;
        expected.push({ type: 'text', value: val });
      });
      if (wi < wordSyllables.length - 1) expected.push({ type: 'space', value: ' ' });
    });
    puncts.forEach(p => expected.push({ type: 'punc', value: p }));

    const feedback = dropZone.map((tile, i) => {
      const exp = expected[i];
      if (!exp) return { ...tile, correct: false };
      if (tile.type !== exp.type) return { ...tile, correct: false };
      if (tile.type === 'space') return { ...tile, correct: true };
      return { ...tile, correct: tile.value === exp.value };
    });
    const allCorrect = feedback.length === expected.length && feedback.every(t => t.correct);
    setDropZone(feedback);
    setIsCorrect(allCorrect);
    setShowResult(true);
  };

  const handlePlay = () => { setPlaying(true); onPlayAudio(); setTimeout(() => setPlaying(false), 2000); };

  const syllTilesInTray = tray.filter(t => t.type === 'text');
  const spaceTilesInTray = tray.filter(t => t.type === 'space');
  const punctTilesInTray = tray.filter(t => t.type === 'punc');

  // Tool tiles (always visible, just like WordSentenceBuilder)
  const toolTiles = [
    { type: 'captool-up', label: '↑A', title: 'Capitalizar', cls: 'border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100' },
    { type: 'captool-down', label: '↓a', title: 'Minúscula', cls: 'border-gray-400 bg-gray-50 text-gray-700 hover:bg-gray-100' },
    { type: 'accenttool', label: '´', title: 'Acento (arrastra sobre la vocal)', cls: 'border-purple-400 bg-purple-50 text-purple-800 hover:bg-purple-100' },
  ];

  return (
    <div className="flex flex-col gap-4" style={{ fontFamily: 'Andika, system-ui, sans-serif' }}>

      {/* Speaker */}
      <div className="flex justify-center">
        <button onClick={handlePlay}
          className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl shadow-lg transition-all active:scale-95 ${playing ? 'bg-rose-500 scale-110' : 'bg-rose-400 hover:bg-rose-500'}`}>
          🔊
        </button>
      </div>

      <p className="text-sm font-bold text-indigo-600 text-center">🧩 Toca o arrastra sílabas para construir la oración</p>

      {/* ── Drop zone ── */}
      <div
        ref={dropZoneRef}
        data-dropzone
        onDragOver={handleDropZoneDragOver}
        onDragLeave={handleDropZoneDragLeave}
        onDrop={handleDropZoneDrop}
        className={`min-h-[72px] rounded-2xl border-4 px-4 py-3 flex flex-wrap items-baseline gap-0.5
          ${showResult ? (isCorrect ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50') : 'border-indigo-300 bg-white'}`}
        style={{ fontSize: '1.5rem', lineHeight: 1.6 }}
      >
        {dropZone.length === 0 && dropHoverIdx === null && <span className="text-gray-300 text-base self-center">Toca sílabas abajo…</span>}
        {dropZone.map((tile, i) => {
          const isPending = pendingRemove === tile.id;
          const isToolHover = toolHoverIdx === i;
          const showGhostBefore = isDraggingNormal && dropHoverIdx === i;

          const ghostEl = showGhostBefore ? (
            <div key={`ghost-${i}`} className="inline-flex items-center self-center"
              style={{ width: '2.5ch', minHeight: '1.8rem', borderLeft: '3px solid #3b82f6', background: 'rgba(59,130,246,0.08)', borderRadius: 4, margin: '0 2px', verticalAlign: 'baseline' }} />
          ) : null;

          if (tile.type === 'space') {
            let bg = 'transparent';
            if (showResult) bg = tile.correct ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)';
            else if (isPending) bg = 'rgba(239,68,68,0.15)';
            else if (isToolHover) bg = 'rgba(59,130,246,0.2)';
            return (
              <React.Fragment key={tile.id}>
                {ghostEl}
                <button data-slottile data-tileid={tile.id} data-tiletype="space" data-tilevalue=" "
                  onClick={() => handleDropTap(tile)} disabled={showResult}
                  draggable onDragStart={e => handleDropZoneDragStart(e, tile)} onDragEnd={e => handleDropZoneDragEnd(e, tile)}
                  style={{ width: '0.5em', height: '1.5em', verticalAlign: 'baseline', background: bg, borderRadius: 3, cursor: showResult ? 'default' : 'pointer', border: isToolHover ? '1px solid #3b82f6' : 'none', padding: 0, display: 'inline-block' }}
                />
              </React.Fragment>
            );
          }
          if (tile.type === 'punc') {
            const color = showResult ? (tile.correct ? '#16a34a' : '#ef4444') : isPending ? '#ef4444' : '#1f2937';
            return (
              <React.Fragment key={tile.id}>
                {ghostEl}
                <button data-slottile data-tileid={tile.id} data-tiletype="punc" data-tilevalue={tile.value}
                  onClick={() => handleDropTap(tile)} disabled={showResult}
                  draggable onDragStart={e => handleDropZoneDragStart(e, tile)} onDragEnd={e => handleDropZoneDragEnd(e, tile)}
                  className="inline font-bold disabled:cursor-default transition-colors"
                  style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: showResult ? 'default' : 'pointer', verticalAlign: 'baseline', color }}
                >{tile.value}</button>
              </React.Fragment>
            );
          }
          // text tile — show accent char highlight when accenttool hovers
          const color = showResult ? (tile.correct ? '#16a34a' : '#ef4444') : isPending ? '#ef4444' : isToolHover ? '#1d4ed8' : '#1f2937';
          const outline = isToolHover ? '2px solid rgba(59,130,246,0.6)' : isPending && !showResult ? '2px solid #ef4444' : 'none';

          const displayText = isToolHover && accentCharIdx !== null && dragRef.current?.tile?.type === 'accenttool'
            ? [...tile.value].map((ch, ci) => (
                <span key={ci} style={{
                  color: ci === accentCharIdx ? '#dc2626' : 'inherit',
                  background: ci === accentCharIdx ? 'rgba(220,38,38,0.15)' : 'transparent',
                  borderRadius: ci === accentCharIdx ? '3px' : 0,
                  padding: ci === accentCharIdx ? '0 1px' : 0,
                }}>{ch}</span>
              ))
            : tile.value;

          return (
            <React.Fragment key={tile.id}>
              {ghostEl}
              <button data-slottile data-tileid={tile.id} data-tiletype="text" data-tilevalue={tile.value}
                onClick={() => handleDropTap(tile)}
                disabled={showResult}
                draggable onDragStart={e => handleDropZoneDragStart(e, tile)} onDragEnd={e => handleDropZoneDragEnd(e, tile)}
                className="font-bold transition-colors disabled:cursor-default rounded cursor-grab"
                style={{ background: isPending ? 'rgba(239,68,68,0.08)' : isToolHover ? 'rgba(59,130,246,0.08)' : 'none', outline, border: 'none', padding: '0 1px', font: 'inherit', cursor: showResult ? 'default' : 'pointer', color, verticalAlign: 'baseline' }}
              >{displayText}</button>
            </React.Fragment>
          );
        })}
        {/* Ghost at the end */}
        {isDraggingNormal && dropHoverIdx === dropZone.length && (
          <div className="inline-flex items-center self-center"
            style={{ width: '2.5ch', minHeight: '1.8rem', borderLeft: '3px solid #3b82f6', background: 'rgba(59,130,246,0.08)', borderRadius: 4, margin: '0 2px', verticalAlign: 'baseline' }} />
        )}
      </div>

      {/* ── Trash + Tools bar (always visible, draggable) ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => {
            if (!pendingRemove) return;
            setDropZone(prev => prev.filter(t => t.id !== pendingRemove));
            setPendingRemove(null);
          }}
          className={`flex items-center gap-1.5 border-2 border-dashed rounded-xl px-3 py-2 text-sm font-bold transition-colors ${pendingRemove ? 'bg-red-100 border-red-400 text-red-600 cursor-pointer hover:bg-red-200' : 'bg-red-50 border-red-200 text-red-300 cursor-default'}`}
        >
          🗑️ Borrar
        </button>

        <span className="text-xs font-bold text-gray-400 uppercase ml-1">Herramientas:</span>
        {toolTiles.map(tool => (
          <button
            key={tool.type}
            data-tooltile
            data-tiletype={tool.type}
            data-tilevalue={tool.type}
            draggable
            onDragStart={e => { e.dataTransfer.effectAllowed = 'copy'; dragRef.current = { tile: createTile(tool.type, tool.type), isTool: true, fromDropZone: false }; }}
            onClick={() => {
              // Tap: apply to pendingRemove tile if it's a text tile
              if (!pendingRemove) return;
              const tile = dropZone.find(t => t.id === pendingRemove && t.type === 'text');
              if (!tile) return;
              if (tool.type === 'accenttool') {
                // For tap: cycle through vowels in order
                applyTool(tile.id, 'accenttool', tile.value.split('').findIndex(ch => PLAIN_TO_ACC[ch] || ACC_TO_PLAIN[ch]));
              } else {
                applyTool(tile.id, tool.type, null);
              }
            }}
            title={tool.title}
            className={`cursor-grab rounded-xl border-2 px-3 py-2 font-black text-sm select-none transition-all hover:scale-105 active:scale-95 ${tool.cls}`}
          >
            {tool.label}
          </button>
        ))}
      </div>

      {/* ── Syllable tray ── */}
      {syllTilesInTray.length > 0 && (
        <div className="bg-gray-50 rounded-2xl border border-gray-200 p-3 flex flex-wrap gap-2 justify-center">
          <AnimatePresence>
            {syllTilesInTray.map(tile => (
              <motion.button key={tile.id}
                data-traytile data-tiletype="text" data-tilevalue={tile.value}
                initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
                onClick={() => handleTrayTap(tile)} disabled={showResult}
                draggable onDragStart={e => handleTrayDragStart(e, tile)}
                className="px-3 py-2 rounded-xl font-bold text-lg bg-indigo-500 text-white shadow-md hover:bg-indigo-600 active:scale-95 transition-all disabled:opacity-40 cursor-grab"
                style={{ fontFamily: 'Andika, system-ui, sans-serif' }}
              >{tile.value}</motion.button>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ── Space + Punct tray ── */}
      {(spaceTilesInTray.length > 0 || punctTilesInTray.length > 0) && (
        <div className="flex gap-3 items-center justify-center flex-wrap">
          {spaceTilesInTray.length > 0 && (
            <>
              <span className="text-sm text-gray-500 font-bold">Espacio:</span>
              <AnimatePresence>
                {spaceTilesInTray.map(tile => (
                  <motion.button key={tile.id}
                    data-traytile data-tiletype="space" data-tilevalue=" "
                    initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
                    onClick={() => handleTrayTap(tile)} disabled={showResult}
                    draggable onDragStart={e => handleTrayDragStart(e, tile)}
                    className="w-14 h-10 rounded-xl border-2 border-indigo-300 bg-indigo-50 hover:bg-indigo-100 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center cursor-grab"
                  ><span className="w-6 h-1 rounded-full bg-indigo-300 block" /></motion.button>
                ))}
              </AnimatePresence>
            </>
          )}
          {punctTilesInTray.length > 0 && (
            <>
              <span className="text-sm text-gray-500 font-bold ml-2">Punt:</span>
              <AnimatePresence>
                {punctTilesInTray.map(tile => (
                  <motion.button key={tile.id}
                    data-traytile data-tiletype="punc" data-tilevalue={tile.value}
                    initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
                    onClick={() => handleTrayTap(tile)} disabled={showResult}
                    draggable onDragStart={e => handleTrayDragStart(e, tile)}
                    className="w-12 h-10 rounded-xl border-2 border-yellow-400 bg-yellow-50 text-yellow-800 font-black text-xl hover:bg-yellow-100 active:scale-95 transition-all disabled:opacity-40 cursor-grab"
                  >{tile.value}</motion.button>
                ))}
              </AnimatePresence>
            </>
          )}
        </div>
      )}

      {/* ── Actions ── */}
      {!showResult && (
        <div className="flex gap-3">
          <button onClick={reset} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-bold hover:bg-gray-200">↩ Reiniciar</button>
          <button onClick={handleCheck} disabled={dropZone.length === 0}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-bold shadow disabled:opacity-40 hover:bg-blue-700">
            ✓ Verificar
          </button>
        </div>
      )}

      {showResult && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl p-4 text-center ${isCorrect ? 'bg-green-50 border-2 border-green-400' : 'bg-orange-50 border-2 border-orange-300'}`}>
          <p className="font-black text-lg mb-1">{isCorrect ? '🎉 ¡Perfecto!' : '📖 ¡Corrige las partes en rojo!'}</p>
          <div className="flex gap-2 justify-center mt-2">
            {!isCorrect && <button onClick={reset} className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200">↩ Intentar de nuevo</button>}
            <button onClick={onComplete} className="px-6 py-2 rounded-xl bg-indigo-600 text-white font-bold shadow hover:bg-indigo-700">Siguiente →</button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function SentencesMode({ studentData, onBack }) {
  const [selectedModule, setSelectedModule] = useState(1);
  const [sentences, setSentences] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [phase, setPhase] = useState('write'); // 'write' | 'build'

  useEffect(() => {
    const data = (SENTENCE_BANK[selectedModule] || []);
    const shuffled = [...data].sort(() => Math.random() - 0.5);
    setSentences(shuffled);
    setCurrentIdx(0);
    setPhase('write');
  }, [selectedModule]);

  const currentItem = sentences[currentIdx] || null;
  const currentSentence = currentItem?.text || '';

  const playAudio = () => {
    if (currentItem) playAudioById(currentItem.id);
  };

  const handleWriteDone = async (strokes) => {
    setPhase('build');
    if (studentData) {
      base44.entities.SpellingWritingSample.create({
        student_number: studentData.student_number,
        class_name: studentData.class_name,
        mode: 'sentences',
        word: currentSentence,
        strokes_data: JSON.stringify(strokes),
        was_correct: null,
      }).catch(() => {});
    }
  };

  const handleComplete = () => {
    if (currentIdx + 1 < sentences.length) {
      setCurrentIdx(i => i + 1);
      setPhase('write');
    } else {
      setSentences(s => [...s].sort(() => Math.random() - 0.5));
      setCurrentIdx(0);
      setPhase('write');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-100 via-pink-50 to-white p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={onBack} className="px-3 py-1.5 rounded-xl bg-white shadow font-bold text-gray-600 hover:bg-gray-50">← Back</button>
          <h1 className="text-xl font-black text-rose-700 flex-1">📝 Sentences</h1>
          <span className="text-sm text-gray-500 font-bold">{currentIdx + 1} / {sentences.length}</span>
        </div>

        {/* Module selector */}
        <div className="flex gap-1.5 flex-wrap mb-4">
          {MODULES.map(m => (
            <button key={m} onClick={() => setSelectedModule(m)}
              className={`px-4 py-2 rounded-full font-bold text-sm transition-all ${selectedModule === m ? 'bg-rose-500 text-white shadow' : 'bg-white text-gray-600 border hover:bg-rose-50'}`}>
              Module {m}
            </button>
          ))}
        </div>

        {currentSentence && (
          <div className="bg-white/90 rounded-3xl shadow-xl p-5">
            {phase === 'write' && (
              <SentenceWriteCanvas onDone={handleWriteDone} onPlayAudio={playAudio} />
            )}
            {phase === 'build' && (
              <SentenceBuilder key={currentSentence} sentence={currentSentence} onComplete={handleComplete} onPlayAudio={playAudio} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}