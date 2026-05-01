import { useState, useRef, useCallback, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import AnnotationCanvas from '@/components/notebook/AnnotationCanvas';
import AnnotationToolbar from '@/components/notebook/AnnotationToolbar';
import PdfPageRenderer from '@/components/notebook/PdfPageRenderer';
import TeacherInstructionAnnotator from '@/components/notebook/TeacherInstructionAnnotator';

/**
 * AssessmentTemplateEditor
 * Allows teacher to:
 * - Add/remove pages (PDF, image, or blank)
 * - Draw on the template (marks shown as base layer on all student copies)
 * - Add audio speaker pins per page
 */
export default function AssessmentTemplateEditor({ template, onSave, onBack }) {
  const [pages, setPages] = useState(template.pages || []);
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#2563eb');
  const [size, setSize] = useState(4);
  const [side, setSide] = useState('left');
  const [renderedSize, setRenderedSize] = useState(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('draw'); // 'draw' | 'audio' | 'pages'
  const [uploading, setUploading] = useState(false);

  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // strokes per page, keyed by page id
  const [strokesByPage, setStrokesByPage] = useState(() => {
    const map = {};
    Object.entries(template.template_strokes_by_page || {}).forEach(([k, v]) => {
      map[k] = v;
    });
    return map;
  });

  const currentPage = pages[currentPageIdx];

  // Load strokes when switching pages
  useEffect(() => {
    if (!canvasRef.current || !currentPage || !renderedSize) return;
    const raw = strokesByPage[String(currentPageIdx)];
    if (raw) {
      try { canvasRef.current.loadStrokes(JSON.parse(raw)); } catch { canvasRef.current.clearStrokes(); }
    } else {
      canvasRef.current.clearStrokes();
    }
  }, [currentPageIdx, renderedSize]);

  const saveCurrentPageStrokes = useCallback(() => {
    if (!canvasRef.current || !renderedSize) return;
    const strokes = canvasRef.current.getStrokes();
    const payload = { ...strokes, normalized: true };
    setStrokesByPage(prev => ({ ...prev, [String(currentPageIdx)]: JSON.stringify(payload) }));
  }, [currentPageIdx, renderedSize]);

  const goToPage = (idx) => {
    saveCurrentPageStrokes();
    setRenderedSize(null);
    setCurrentPageIdx(idx);
  };

  const handleSave = async () => {
    saveCurrentPageStrokes();
    setSaving(true);
    // Merge latest page strokes
    const latestStrokes = { ...strokesByPage };
    if (canvasRef.current && renderedSize) {
      const strokes = canvasRef.current.getStrokes();
      latestStrokes[String(currentPageIdx)] = JSON.stringify({ ...strokes, normalized: true });
    }
    await onSave({ pages, template_strokes_by_page: latestStrokes });
    setSaving(false);
  };

  const addPage = (type) => {
    const newPage = { id: `page-${Date.now()}`, type, url: null, label: '' };
    setPages(prev => [...prev, newPage]);
  };

  const removePage = (idx) => {
    if (pages.length <= 1) return;
    const newPages = pages.filter((_, i) => i !== idx);
    setPages(newPages);
    if (currentPageIdx >= newPages.length) setCurrentPageIdx(newPages.length - 1);
  };

  const handleUploadPageFile = async (file, type) => {
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    const newPage = { id: `page-${Date.now()}`, type, url: file_url, label: file.name };
    setPages(prev => [...prev, newPage]);
    setUploading(false);
  };

  const handleUpdatePageUrl = async (idx, file, type) => {
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setPages(prev => prev.map((p, i) => i === idx ? { ...p, url: file_url, type } : p));
    setUploading(false);
  };

  const handleSaveAudio = async (annotations) => {
    await onSave({ audio_annotations: annotations });
  };

  return (
    <div className="flex flex-col h-full w-full" style={{ background: '#0f0f1a', color: 'white' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 shrink-0" style={{ background: '#1a1a2e', borderBottom: '2px solid #4338ca' }}>
        <button onClick={onBack} className="text-indigo-300 hover:text-white font-bold text-sm">← Back</button>
        <p className="flex-1 text-white font-black text-sm truncate">✏️ {template.title}</p>
        <div className="flex gap-1">
          {['draw', 'audio', 'pages'].map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${activeTab === t ? 'bg-indigo-600 text-white' : 'text-indigo-400 border border-indigo-700'}`}>
              {t === 'draw' ? '✏️ Draw' : t === 'audio' ? '🔊 Audio' : '📄 Pages'}
            </button>
          ))}
        </div>
        <button onClick={handleSave} disabled={saving}
          className="px-3 py-1.5 rounded-xl text-xs font-bold text-white"
          style={{ background: '#4338ca' }}>
          {saving ? 'Saving…' : '💾 Save'}
        </button>
      </div>

      {/* Page thumbnails strip */}
      <div className="flex gap-2 px-3 py-2 overflow-x-auto shrink-0" style={{ background: '#111122', borderBottom: '1px solid #2d2d5e' }}>
        {pages.map((p, i) => (
          <button key={p.id} onClick={() => goToPage(i)}
            className={`relative flex-shrink-0 w-16 h-20 rounded-lg border-2 overflow-hidden flex items-center justify-center text-xs font-bold transition-all
              ${currentPageIdx === i ? 'border-indigo-400' : 'border-indigo-800 opacity-60'}`}
            style={{ background: '#1a1a2e' }}>
            <span className="text-indigo-300">{i + 1}</span>
            <span className="absolute bottom-1 left-0 right-0 text-center text-indigo-500" style={{ fontSize: 9 }}>
              {p.type}
            </span>
          </button>
        ))}
        <button onClick={() => document.getElementById('at-page-upload').click()}
          className="flex-shrink-0 w-16 h-20 rounded-lg border-2 border-dashed border-indigo-700 flex flex-col items-center justify-center gap-1 text-indigo-500 hover:border-indigo-400 hover:text-indigo-300 transition-all">
          <span className="text-xl">+</span>
          <span style={{ fontSize: 9 }}>Add</span>
        </button>
        <input id="at-page-upload" type="file" accept="application/pdf,image/*" className="hidden"
          onChange={async e => {
            const file = e.target.files?.[0]; e.target.value = '';
            if (!file) return;
            const type = file.type === 'application/pdf' ? 'pdf' : 'image';
            await handleUploadPageFile(file, type);
          }} />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden" style={{ minHeight: 0 }}>
        {activeTab === 'draw' && (
          <>
            {side === 'left' && (
              <div className="p-1.5 shrink-0" style={{ background: '#1a1a2e' }}>
                <AnnotationToolbar
                  tool={tool} setTool={setTool}
                  color={color} setColor={setColor}
                  size={size} setSize={setSize}
                  onUndo={() => canvasRef.current?.undo()}
                  onClear={() => canvasRef.current?.clearStrokes()}
                  side={side} onSwapSide={() => setSide(s => s === 'left' ? 'right' : 'left')}
                />
              </div>
            )}
            <div ref={containerRef} className="flex-1 overflow-auto" style={{ background: '#e8e8e8', position: 'relative' }}>
              {currentPage ? (
                <div style={{ position: 'relative', display: 'block', width: '100%' }}>
                  {currentPage.type === 'blank' ? (
                    <div style={{ width: '100%', paddingBottom: '129%', background: 'white', position: 'relative' }}>
                      {/* blank page */}
                    </div>
                  ) : currentPage.url ? (
                    currentPage.type === 'pdf' ? (
                      <PdfPageRenderer pdfUrl={currentPage.url} pageNumber={1}
                        onRendered={(w, h) => setRenderedSize({ w, h })} />
                    ) : (
                      <img src={currentPage.url} alt="page" style={{ width: '100%', display: 'block' }}
                        onLoad={e => setRenderedSize({ w: e.target.naturalWidth, h: e.target.naturalHeight })} />
                    )
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-3 p-8"
                      style={{ minHeight: 400, background: '#f3f4f6' }}>
                      <p className="text-gray-500 font-bold">No content uploaded for this page</p>
                      <button onClick={() => document.getElementById(`page-upload-${currentPageIdx}`).click()}
                        className="px-4 py-2 rounded-xl text-white font-bold text-sm"
                        style={{ background: '#4338ca' }}>
                        📎 Upload PDF or Image
                      </button>
                      <input id={`page-upload-${currentPageIdx}`} type="file" accept="application/pdf,image/*" className="hidden"
                        onChange={async e => {
                          const file = e.target.files?.[0]; e.target.value = '';
                          if (!file) return;
                          const type = file.type === 'application/pdf' ? 'pdf' : 'image';
                          await handleUpdatePageUrl(currentPageIdx, file, type);
                        }} />
                    </div>
                  )}
                  {renderedSize && (
                    <AnnotationCanvas
                      ref={canvasRef}
                      width={renderedSize.w}
                      height={renderedSize.h}
                      color={color} size={size}
                      tool={tool === 'laser' ? 'none' : tool}
                      mode={tool === 'laser' ? 'none' : 'draw'}
                      onStrokeEnd={saveCurrentPageStrokes}
                    />
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-gray-400">Add a page to get started</p>
                </div>
              )}
            </div>
            {side === 'right' && (
              <div className="p-1.5 shrink-0" style={{ background: '#1a1a2e' }}>
                <AnnotationToolbar
                  tool={tool} setTool={setTool}
                  color={color} setColor={setColor}
                  size={size} setSize={setSize}
                  onUndo={() => canvasRef.current?.undo()}
                  onClear={() => canvasRef.current?.clearStrokes()}
                  side={side} onSwapSide={() => setSide(s => s === 'left' ? 'right' : 'left')}
                />
              </div>
            )}
          </>
        )}

        {activeTab === 'audio' && (
          <div className="flex-1 overflow-auto p-4">
            <TeacherInstructionAnnotator
              assignment={{
                ...template,
                pdf_url: currentPage?.url,
                audio_instructions: template.audio_annotations || [],
                pdf_page_count: pages.length,
              }}
              onSave={handleSaveAudio}
            />
          </div>
        )}

        {activeTab === 'pages' && (
          <div className="flex-1 overflow-auto p-4">
            <div className="max-w-lg mx-auto flex flex-col gap-3">
              <p className="text-indigo-200 font-bold text-sm">Manage Pages</p>
              {pages.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 rounded-xl p-3"
                  style={{ background: '#1a1a2e', border: '1px solid #4338ca' }}>
                  <span className="text-white font-bold w-6 text-center">{i + 1}</span>
                  <div className="flex-1">
                    <p className="text-indigo-200 text-sm font-bold">{p.type.toUpperCase()} page</p>
                    <p className="text-indigo-400 text-xs truncate">{p.label || p.url || 'No content'}</p>
                  </div>
                  <button onClick={() => document.getElementById(`replace-${i}`).click()}
                    className="px-2 py-1 rounded-lg text-xs text-indigo-300 border border-indigo-700 hover:border-indigo-400">
                    Replace
                  </button>
                  <input id={`replace-${i}`} type="file" accept="application/pdf,image/*" className="hidden"
                    onChange={async e => {
                      const file = e.target.files?.[0]; e.target.value = '';
                      if (!file) return;
                      const type = file.type === 'application/pdf' ? 'pdf' : 'image';
                      await handleUpdatePageUrl(i, file, type);
                    }} />
                  {pages.length > 1 && (
                    <button onClick={() => removePage(i)}
                      className="px-2 py-1 rounded-lg text-xs text-red-400 border border-red-800 hover:border-red-500">
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <div className="flex gap-2 mt-2">
                <button onClick={() => addPage('blank')}
                  className="flex-1 py-2 rounded-xl font-bold text-sm text-indigo-300 border border-indigo-700 hover:border-indigo-400">
                  + Blank Page
                </button>
                <button onClick={() => document.getElementById('add-page-file').click()}
                  className="flex-1 py-2 rounded-xl font-bold text-sm text-indigo-300 border border-indigo-700 hover:border-indigo-400">
                  {uploading ? '⏳ Uploading…' : '+ PDF or Image'}
                </button>
                <input id="add-page-file" type="file" accept="application/pdf,image/*" className="hidden"
                  onChange={async e => {
                    const file = e.target.files?.[0]; e.target.value = '';
                    if (!file) return;
                    const type = file.type === 'application/pdf' ? 'pdf' : 'image';
                    await handleUploadPageFile(file, type);
                  }} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}