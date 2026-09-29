import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { CARD_CATEGORIES, CARD_MAP, assembleSentence } from '@/components/data/sentenceCards';
import AnnotationToolbar from '@/components/notebook/AnnotationToolbar';
import AnnotationCanvas from '@/components/notebook/AnnotationCanvas';
import CardSlot from './CardSlot';
import CardPicker from './CardPicker';
import SentenceWritingArea from './SentenceWritingArea';
import SelfChecks from './SelfChecks';
import { Loader2, ArrowLeft, RefreshCw } from 'lucide-react';

const DEFAULT_ROWS = [
  { mode: '2part', who_card: 'who-01', what_card: 'what-01', where_card: 'where-01', typed_text: '', writing_strokes: {}, self_checks: {} },
  { mode: '2part', who_card: 'who-05', what_card: 'what-12', where_card: 'where-10', typed_text: '', writing_strokes: {}, self_checks: {} },
  { mode: '3part', who_card: 'who-10', what_card: 'what-09', where_card: 'where-07', typed_text: '', writing_strokes: {}, self_checks: {} },
  { mode: '2part', who_card: 'who-14', what_card: 'what-17', where_card: 'where-14', typed_text: '', writing_strokes: {}, self_checks: {} },
];

export default function CreandoOraciones({ studentNumber, className, studentName, onBack }) {
  const [session, setSession] = useState(null);
  const [activeRowIndex, setActiveRowIndex] = useState(0);
  const [artMode, setArtMode] = useState('color');
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#4338a');
  const [size, setSize] = useState(4);
  const [side, setSide] = useState('left');
  const [showPicker, setShowPicker] = useState(null);
  const [spinSignals, setSpinSignals] = useState({});
  const [loading, setLoading] = useState(true);

  const writingRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];
  const drawingRef = useRef(null);
  const coloringRefs = { who: useRef(null), what: useRef(null), where: useRef(null) };
  const activeCanvasHandle = useRef(null);
  const saveTimer = useRef(null);
  const sessionRef = useRef(null);
  const artModeRef = useRef('color');
  const activeRowRef = useRef(0);

  useEffect(() => { artModeRef.current = artMode; }, [artMode]);
  useEffect(() => { activeRowRef.current = activeRowIndex; }, [activeRowIndex]);

  // ── Load / create session ──
  useEffect(() => {
    (async () => {
      try {
        const existing = await base44.entities.SentenceActivitySession.filter({
          student_number: studentNumber, class_name: className, school_year: ACTIVE_SCHOOL_YEAR,
        });
        if (existing.length > 0) {
          const s = existing[0];
          setSession(s);
          setArtMode(s.art_mode || 'color');
          sessionRef.current = s;
        } else {
          const s = await base44.entities.SentenceActivitySession.create({
            student_number: studentNumber, class_name: className, school_year: ACTIVE_SCHOOL_YEAR,
            art_mode: 'color', rows: DEFAULT_ROWS, card_coloring: {}, drawing_strokes: {},
            last_active: new Date().toISOString(),
          });
          setSession(s);
          sessionRef.current = s;
        }
      } catch {}
      setLoading(false);
    })();
  }, [studentNumber, className]);

  const rows = session?.rows || DEFAULT_ROWS;
  const activeRow = rows[activeRowIndex] || DEFAULT_ROWS[0];

  // ── Save logic ──
  const doSave = useCallback(async () => {
    if (!sessionRef.current) return;
    const currentRows = (sessionRef.current.rows || DEFAULT_ROWS).map((row, i) => ({
      ...row,
      writing_strokes: writingRefs[i].current?.getStrokes() || row.writing_strokes || {},
    }));
    const drawing_strokes = drawingRef.current?.getStrokes() || {};
    const card_coloring = { ...(sessionRef.current.card_coloring || {}) };
    if (artModeRef.current === 'bw') {
      for (const cat of ['who', 'what', 'where']) {
        const cardId = currentRows[activeRowRef.current]?.[`${cat}_card`];
        if (cardId && coloringRefs[cat].current) {
          card_coloring[cardId] = coloringRefs[cat].current.getStrokes();
        }
      }
    }
    const payload = {
      rows: currentRows, drawing_strokes, card_coloring,
      art_mode: artModeRef.current, last_active: new Date().toISOString(),
    };
    try {
      await base44.entities.SentenceActivitySession.update(sessionRef.current.id, payload);
      sessionRef.current = { ...sessionRef.current, ...payload };
    } catch {}
  }, []);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSave(), 1500);
  }, [doSave]);

  useEffect(() => {
    const onSave = () => { if (saveTimer.current) clearTimeout(saveTimer.current); doSave(); };
    window.addEventListener('beforeunload', onSave);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') onSave();
    });
    return () => window.removeEventListener('beforeunload', onSave);
  }, [doSave]);

  // ── Row updates ──
  const updateRow = (index, patch) => {
    setSession(prev => {
      if (!prev) return prev;
      const newRows = [...(prev.rows || [])];
      newRows[index] = { ...newRows[index], ...patch };
      return { ...prev, rows: newRows };
    });
    sessionRef.current = { ...sessionRef.current, rows: { ...sessionRef.current?.rows } };
    scheduleSave();
  };

  const handleCardSelect = (cat, cardId) => {
    updateRow(activeRowIndex, { [`${cat}_card`]: cardId });
  };

  const handleColoringChange = (cardId, strokes) => {
    setSession(prev => prev ? {
      ...prev, card_coloring: { ...(prev.card_coloring || {}), [cardId]: strokes },
    } : prev);
    if (sessionRef.current) {
      sessionRef.current = {
        ...sessionRef.current,
        card_coloring: { ...(sessionRef.current.card_coloring || {}), [cardId]: strokes },
      };
    }
    scheduleSave();
  };

  const handleGirarTodo = () => {
    const cats = activeRow.mode === '3part' ? ['who', 'what', 'where'] : ['who', 'what'];
    cats.forEach((cat, i) => {
      setTimeout(() => {
        setSpinSignals(prev => ({ ...prev, [cat]: (prev[cat] || 0) + 1 }));
      }, i * 250);
    });
  };

  const handleActivateCanvas = (canvasRef) => {
    activeCanvasHandle.current = canvasRef.current;
  };

  const handleUndo = () => activeCanvasHandle.current?.undo();
  const handleRedo = () => activeCanvasHandle.current?.redo();
  const handleClear = () => activeCanvasHandle.current?.clearStrokes();

  const handleArtModeToggle = (mode) => {
    // Save current coloring before switching
    if (artMode === 'bw' && mode === 'color') {
      doSave();
    }
    setArtMode(mode);
    setSession(prev => prev ? { ...prev, art_mode: mode } : prev);
    if (sessionRef.current) sessionRef.current = { ...sessionRef.current, art_mode: mode };
    scheduleSave();
  };

  // Assembled sentence for the active row
  const whoCard = CARD_MAP[activeRow.who_card];
  const whatCard = CARD_MAP[activeRow.what_card];
  const whereCard = CARD_MAP[activeRow.where_card];
  const assembledSentence = (activeRow.who_card && activeRow.what_card)
    ? assembleSentence(whoCard, whatCard, whereCard, activeRow.mode)
    : '';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-30 px-4 py-2 flex items-center gap-3">
        {onBack && (
          <button onClick={onBack} className="text-slate-400 hover:text-slate-700">
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <h1 className="font-bold text-lg text-slate-800">Creando oraciones</h1>
        <span className="text-xs text-slate-400">©Hola Bilinguals</span>
        <div className="flex-1" />
        {/* Art mode toggle */}
        <div className="flex rounded-lg border border-slate-300 overflow-hidden text-xs font-bold">
          <button
            onClick={() => handleArtModeToggle('color')}
            className={`px-2 py-1 ${artMode === 'color' ? 'bg-indigo-500 text-white' : 'bg-white text-slate-600'}`}
          >
            🎨 Color
          </button>
          <button
            onClick={() => handleArtModeToggle('bw')}
            className={`px-2 py-1 ${artMode === 'bw' ? 'bg-indigo-500 text-white' : 'bg-white text-slate-600'}`}
          >
            ✏️ Blanco y negro
          </button>
        </div>
      </div>

      {/* Worksheet */}
      <div className="flex-1 flex justify-center px-2 py-4">
        <div className="w-full max-w-4xl bg-white rounded-xl shadow-lg border-2 border-slate-800 p-4 sm:p-6 relative">
          {/* Nombre line */}
          <div className="flex items-center gap-2 mb-4">
            <span className="font-bold text-sm text-slate-700">Nombre:</span>
            <div className="flex-1 border-b-2 border-slate-800" />
          </div>

          {/* Card slots */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-3">
            {CARD_CATEGORIES.map((cat) => {
              // Hide 'where' slot in 2-part mode
              if (cat.id === 'where' && activeRow.mode === '2part') {
                return (
                  <div key={cat.id} className="flex flex-col items-center justify-center opacity-30 rounded-xl border-2 border-dashed border-slate-300 p-4">
                    <p className="text-xs text-slate-400 text-center">¿Dónde?<br/>(3 partes)</p>
                  </div>
                );
              }
              return (
                <CardSlot
                  key={cat.id}
                  category={cat}
                  selectedCardId={activeRow[`${cat.id}_card`]}
                  onSelectCard={(cardId, openPicker) => {
                    if (openPicker) setShowPicker(cat.id);
                    else handleCardSelect(cat.id, cardId);
                  }}
                  artMode={artMode}
                  coloringStrokes={session?.card_coloring || {}}
                  onColoringChange={handleColoringChange}
                  tool={tool}
                  color={color}
                  size={size}
                  onStrokeStart={() => {}}
                  onStrokeEnd={scheduleSave}
                  onActivateCanvas={handleActivateCanvas}
                  spinning={false}
                  onSpinStart={() => {}}
                  spinSignal={spinSignals[cat.id] || 0}
                />
              );
            })}
          </div>

          {/* Girar todo + mode toggle */}
          <div className="flex items-center justify-center gap-3 mb-3">
            <button
              onClick={handleGirarTodo}
              className="px-4 py-1.5 rounded-full text-sm font-bold text-white bg-gradient-to-r from-purple-500 to-indigo-500 shadow hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5"
            >
              <RefreshCw className="w-4 h-4" /> Girar todo
            </button>
            <div className="flex rounded-lg border border-slate-300 overflow-hidden text-xs font-bold">
              <button
                onClick={() => updateRow(activeRowIndex, { mode: '2part' })}
                className={`px-2 py-1 ${activeRow.mode === '2part' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600'}`}
              >
                2 partes
              </button>
              <button
                onClick={() => updateRow(activeRowIndex, { mode: '3part' })}
                className={`px-2 py-1 ${activeRow.mode === '3part' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600'}`}
              >
                3 partes
              </button>
            </div>
          </div>

          {/* Assembled sentence display */}
          {assembledSentence && (
            <div className="mb-4 p-2 bg-amber-50 rounded-lg border border-amber-200 text-center">
              <p className="text-sm font-bold text-slate-700" style={{ fontFamily: "'Andika', sans-serif" }}>
                {assembledSentence}
              </p>
            </div>
          )}

          {/* Four sentence writing areas */}
          <div className="space-y-2 mb-4">
            {rows.map((row, i) => {
              const rWhoCard = CARD_MAP[row.who_card];
              const rWhatCard = CARD_MAP[row.what_card];
              const rWhereCard = CARD_MAP[row.where_card];
              const rowSentence = (row.who_card && row.what_card)
                ? assembleSentence(rWhoCard, rWhatCard, rWhereCard, row.mode)
                : '';
              return (
                <div key={i}>
                  <SentenceWritingArea
                    index={i}
                    row={row}
                    sentenceText={rowSentence}
                    artMode={artMode}
                    tool={tool}
                    color={color}
                    size={size}
                    canvasRef={writingRefs[i]}
                    onStrokeStart={() => {}}
                    onStrokeEnd={scheduleSave}
                    onActivateCanvas={handleActivateCanvas}
                    onTypedTextChange={(text) => updateRow(i, { typed_text: text })}
                    onSelfCheckChange={(checks) => updateRow(i, { self_checks: checks })}
                    active={activeRowIndex === i}
                    onActivate={() => setActiveRowIndex(i)}
                  />
                  <div className="px-2">
                    <SelfChecks
                      checks={row.self_checks || {}}
                      onChange={(checks) => updateRow(i, { self_checks: checks })}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Drawing area */}
          <div className="mb-2">
            <p className="text-sm font-bold text-slate-700 mb-1">Dibujo:</p>
            <DrawingArea
              drawingRef={drawingRef}
              strokes={session?.drawing_strokes}
              tool={tool}
              color={color}
              size={size}
              onStrokeStart={() => {}}
              onStrokeEnd={scheduleSave}
              onActivateCanvas={handleActivateCanvas}
            />
          </div>

          {/* Credit */}
          <p className="text-center text-xs text-slate-400 mt-4">©Hola Bilinguals</p>
        </div>
      </div>

      {/* Card picker modal */}
      {showPicker && (
        <CardPicker
          category={CARD_CATEGORIES.find(c => c.id === showPicker)}
          artMode={artMode}
          selectedCardId={activeRow[`${showPicker}_card`]}
          onSelect={(cardId) => handleCardSelect(showPicker, cardId)}
          onClose={() => setShowPicker(null)}
        />
      )}

      {/* Annotation toolbar — reused from the digital notebook */}
      <div className={`fixed top-1/2 -translate-y-1/2 z-40 ${side === 'left' ? 'left-2' : 'right-2'}`}>
        <AnnotationToolbar
          tool={tool}
          setTool={setTool}
          color={color}
          setColor={setColor}
          size={size}
          setSize={setSize}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onClear={handleClear}
          side={side}
          onSwapSide={() => setSide(side === 'left' ? 'right' : 'left')}
        />
      </div>
    </div>
  );
}

// Drawing area — white area with annotation canvas for free drawing
function DrawingArea({ drawingRef, strokes, tool, color, size, onStrokeStart, onStrokeEnd, onActivateCanvas }) {
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ w: 300, h: 150 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const obs = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      setDims({ w: Math.round(width), h: 150 });
    });
    obs.observe(container);
    return () => obs.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!drawingRef.current) return;
    if (strokes && Object.keys(strokes).length > 0) {
      drawingRef.current.loadStrokes(strokes);
    }
  }, [strokes]);

  return (
    <div ref={containerRef} className="relative bg-white border-2 border-slate-400 rounded-lg" style={{ height: 150 }}>
      <AnnotationCanvas
        ref={drawingRef}
        width={dims.w}
        height={dims.h}
        color={color}
        size={size}
        tool={tool}
        onStrokeStart={() => { onStrokeStart?.(); onActivateCanvas?.(drawingRef); }}
        onStrokeEnd={onStrokeEnd}
      />
    </div>
  );
}