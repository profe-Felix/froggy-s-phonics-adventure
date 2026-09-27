import React, { useState, useEffect, useMemo, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Upload, Trash2, Loader2, Image as ImageIcon, FileText, ArrowLeft, Layers } from 'lucide-react';
import { getCurriculumPositionList, getGraphemesAtKey } from '@/lib/literacy/curriculumPositions';
import { pdfFirstPageToPng, isPdfFile } from '@/lib/pdfToImage';
import CardCoverEditor from '@/components/soundwall/CardCoverEditor';

// Sound Wall Manager — teacher tool for uploading phoneme and grapheme cards
// tied to the M#.L# curriculum progression. Cards are stored as SoundWallCard
// entities and auto-feed the Sound Wall lesson step and letter introduction
// activity.
export default function SoundWallManager() {
  const positions = useMemo(() => getCurriculumPositionList(), []);
  const [selectedKey, setSelectedKey] = useState(positions[0]?.key || '');
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(null); // { grapheme, cardType } | null
  const [editingCoverCard, setEditingCoverCard] = useState(null); // SoundWallCard | null

  const graphemes = useMemo(() => getGraphemesAtKey(selectedKey), [selectedKey]);
  const positionInfo = positions.find((p) => p.key === selectedKey);

  // Load cards for the selected curriculum position.
  const loadCards = async (key) => {
    if (!key) return;
    setLoading(true);
    try {
      const recs = await base44.entities.SoundWallCard.filter({ curriculum_key: key });
      setCards(recs || []);
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCards(selectedKey);
  }, [selectedKey]);

  const handleUpload = async (file, grapheme, cardType) => {
    if (!file || !grapheme || !selectedKey) return;
    setUploading({ grapheme, cardType });
    try {
      let imageFile = file;
      let label = grapheme;

      // If it's a PDF, convert the first page to a PNG image.
      if (isPdfFile(file)) {
        const pngBlob = await pdfFirstPageToPng(file);
        imageFile = new File([pngBlob], `${grapheme}_${cardType}.png`, { type: 'image/png' });
      }

      // Upload the image (or converted PNG) to public storage.
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file: imageFile });

      // Check if a card already exists for this grapheme + type at this position.
      const existing = cards.find(
        (c) => c.grapheme === grapheme && c.card_type === cardType && c.curriculum_key === selectedKey
      );

      const payload = {
        card_type: cardType,
        grapheme,
        label,
        image_url: file_url,
        curriculum_key: selectedKey,
        module_number: positionInfo?.moduleNumber,
        lesson_number: positionInfo?.lessonNumber,
        sort_order: cardType === 'phoneme' ? 0 : 1,
        active: true,
      };

      if (existing) {
        await base44.entities.SoundWallCard.update(existing.id, payload);
      } else {
        await base44.entities.SoundWallCard.create(payload);
      }

      await loadCards(selectedKey);
    } catch (err) {
      alert('Upload failed: ' + (err.message || 'Unknown error'));
    } finally {
      setUploading(null);
    }
  };

  const handleDelete = async (cardId) => {
    if (!confirm('Delete this card?')) return;
    try {
      await base44.entities.SoundWallCard.delete(cardId);
      setCards((prev) => prev.filter((c) => c.id !== cardId));
    } catch {
      alert('Could not delete card.');
    }
  };

  const getCardFor = (grapheme, cardType) =>
    cards.find((c) => c.grapheme === grapheme && c.card_type === cardType);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <a href="/" className="text-slate-400 hover:text-slate-700">
            <ArrowLeft className="w-5 h-5" />
          </a>
          <h1 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <span>🔊</span> Sound Wall Manager
          </h1>
          <div className="flex-1" />
          <a
            href="/LessonEditor"
            className="text-sm font-bold text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded-lg hover:bg-indigo-50"
          >
            📚 Lesson Editor
          </a>
        </div>
      </div>

      <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        {/* Curriculum position selector */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-4">
          <label className="text-sm font-bold text-slate-700 block mb-2">
            Curriculum position (M#.L#)
          </label>
          <select
            value={selectedKey}
            onChange={(e) => setSelectedKey(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold text-slate-800"
          >
            {positions.map((p) => (
              <option key={p.key} value={p.key}>
                {p.key}
                {p.graphemes.length > 0 ? ` — ${p.graphemes.join(', ')}` : ' — (no new graphemes)'}
              </option>
            ))}
          </select>
          {graphemes.length > 0 ? (
            <p className="text-xs text-slate-500 mt-2">
              Graphemes introduced at this lesson: <span className="font-bold">{graphemes.join(', ')}</span>
            </p>
          ) : (
            <p className="text-xs text-amber-600 mt-2">
              No new graphemes at this lesson. You can still upload review cards for earlier graphemes.
            </p>
          )}
        </div>

        {/* Cards grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          </div>
        ) : graphemes.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400">
            No new graphemes at this lesson position.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {graphemes.map((grapheme) => {
              const phonemeCard = getCardFor(grapheme, 'phoneme');
              const graphemeCard = getCardFor(grapheme, 'grapheme');
              return (
                <GraphemeCardEditor
                  key={grapheme}
                  grapheme={grapheme}
                  phonemeCard={phonemeCard}
                  graphemeCard={graphemeCard}
                  onUpload={handleUpload}
                  onDelete={handleDelete}
                  onEditCovers={setEditingCoverCard}
                  uploading={uploading}
                />
              );
            })}
          </div>
        )}

        {/* Help text */}
        <div className="mt-6 bg-indigo-50 rounded-xl border border-indigo-100 p-4 text-sm text-indigo-800">
          <p className="font-bold mb-1">How this works</p>
          <ul className="list-disc list-inside space-y-1 text-xs text-indigo-700">
            <li>Upload a <b>phoneme card</b> (mouth/articulation photo) and a <b>grapheme card</b> (letter card) for each grapheme.</li>
            <li>Both image files (PNG/JPG) and PDF files are accepted — PDFs are converted to images automatically.</li>
            <li>In the Lesson Editor, add a Sound Wall step and pick this M#.L# position — cards load automatically.</li>
            <li>For Letter Sounds steps, pick the M#.L# position to auto-fill the target letters from your progression.</li>
          </ul>
        </div>
        {editingCoverCard && (
          <CardCoverEditor
            card={editingCoverCard}
            onClose={() => setEditingCoverCard(null)}
            onSaved={() => loadCards(selectedKey)}
          />
        )}
      </div>
    </div>
  );
}

// ── Single grapheme card editor (phoneme + grapheme upload slots) ─────────────
function GraphemeCardEditor({ grapheme, phonemeCard, graphemeCard, onUpload, onDelete, onEditCovers, uploading }) {
  const phonemeInputRef = useRef(null);
  const graphemeInputRef = useRef(null);

  const isUploading = (cardType) =>
    uploading?.grapheme === grapheme && uploading?.cardType === cardType;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-3 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
        <span className="text-xl font-black text-slate-800">{grapheme}</span>
        <span className="text-xs text-slate-400">Grapheme</span>
      </div>

      <div className="grid grid-cols-2 gap-2 p-3">
        {/* Phoneme card slot */}
        <CardSlot
          label="Phoneme"
          card={phonemeCard}
          onPick={() => phonemeInputRef.current?.click()}
          onDelete={() => phonemeCard && onDelete(phonemeCard.id)}
          onDropFile={(f) => onUpload(f, grapheme, 'phoneme')}
          onEditCovers={onEditCovers}
          uploading={isUploading('phoneme')}
        />
        <input
          ref={phonemeInputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f, grapheme, 'phoneme');
            e.target.value = '';
          }}
        />

        {/* Grapheme card slot */}
        <CardSlot
          label="Grapheme"
          card={graphemeCard}
          onPick={() => graphemeInputRef.current?.click()}
          onDelete={() => graphemeCard && onDelete(graphemeCard.id)}
          onDropFile={(f) => onUpload(f, grapheme, 'grapheme')}
          onEditCovers={onEditCovers}
          uploading={isUploading('grapheme')}
        />
        <input
          ref={graphemeInputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f, grapheme, 'grapheme');
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

// ── Upload slot showing preview or upload button ─────────────────────────────
function CardSlot({ label, card, onPick, onDelete, onDropFile, onEditCovers, uploading }) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onDropFile?.(f);
  };

  if (uploading) {
    return (
      <div className="aspect-[3/4] rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50 flex flex-col items-center justify-center gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
        <span className="text-xs font-bold text-indigo-600">Converting…</span>
      </div>
    );
  }

  if (card?.image_url) {
    return (
      <div
        className="relative group"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div className={`aspect-[3/4] rounded-xl overflow-hidden border-2 bg-slate-50 transition soundwall-card-frame ${dragOver ? 'border-indigo-500 ring-2 ring-indigo-300' : 'border-slate-200'}`}>
          <img src={card.image_url} alt={card.label || label} className="w-full h-full object-contain" />
        </div>
        <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/50 text-white text-[10px] font-bold">
          {label}
        </div>
        {dragOver && (
          <div className="absolute inset-0 rounded-xl bg-indigo-500/20 flex items-center justify-center pointer-events-none">
            <span className="text-xs font-black text-indigo-700">Drop to replace</span>
          </div>
        )}
        <button
          onClick={onDelete}
          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-lg"
          title="Delete card"
        >
          <Trash2 className="w-3 h-3" />
        </button>
        <button
          onClick={onPick}
          className="absolute bottom-1 right-1 px-2 py-0.5 rounded bg-black/50 text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition"
          title="Replace"
        >
          Replace
        </button>
        <button
          onClick={() => onEditCovers?.(card)}
          className="absolute bottom-1 left-1 px-2 py-0.5 rounded bg-red-500/80 text-white text-[10px] font-bold flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition"
          title="Edit covers & reveal"
        >
          <Layers className="w-3 h-3" /> Covers
          {Array.isArray(card?.covers) && card.covers.length > 0 && (
            <span className="ml-0.5 px-1 rounded-full bg-white/30">{card.covers.length}</span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={onPick}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`aspect-[3/4] rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition cursor-pointer ${
        dragOver
          ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-300'
          : 'border-slate-300 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-300'
      }`}
    >
      <div className="flex items-center gap-1 text-slate-400">
        <Upload className="w-5 h-5" />
      </div>
      <span className="text-xs font-bold text-slate-400">{label}</span>
      <span className="text-[10px] text-slate-300">{dragOver ? 'Drop here' : 'Drag or click'}</span>
    </div>
  );
}