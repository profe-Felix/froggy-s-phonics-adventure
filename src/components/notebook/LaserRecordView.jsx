import { useState, useRef, useCallback } from 'react';
import PdfPageRenderer from './PdfPageRenderer';

export default function LaserRecordView({ assignment }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfSize, setPdfSize] = useState(null);
  const [laserOn, setLaserOn] = useState(false);
  const [laserPos, setLaserPos] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState(null);
  const containerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const maxPage = assignment?.page_range_end || assignment?.pdf_page_count || 999;
  const minPage = assignment?.page_range_start || 1;

  const getPos = (e) => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const handleMove = useCallback((e) => {
    if (!laserOn) return;
    e.preventDefault();
    setLaserPos(getPos(e));
  }, [laserOn]);

  const handleLeave = () => setLaserPos(null);

  const startRecording = async () => {
    chunksRef.current = [];
    setRecordedUrl(null);
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      let micStream = null;
      try { micStream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch {}
      const tracks = [...displayStream.getTracks(), ...(micStream ? micStream.getTracks() : [])];
      const combined = new MediaStream(tracks);
      const mr = new MediaRecorder(combined, { mimeType: 'video/webm' });
      mr.ondataavailable = e => chunksRef.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        setRecordedUrl(URL.createObjectURL(blob));
        tracks.forEach(t => t.stop());
        setRecording(false);
      };
      displayStream.getVideoTracks()[0].onended = () => mr.stop();
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch (err) {
      console.error(err);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
  };

  if (!assignment) {
    return <p className="text-indigo-400 text-center mt-8">Select an assignment from the Assignments tab first</p>;
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl mx-auto">
      {/* Controls */}
      <div className="rounded-2xl p-3 flex items-center gap-3 flex-wrap" style={{ background: '#1a1a2e', border: '1px solid #4338ca' }}>
        {/* Laser toggle */}
        <button
          onClick={() => { setLaserOn(v => !v); setLaserPos(null); }}
          className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${laserOn ? 'bg-red-600 text-white animate-pulse' : 'text-indigo-300 border border-indigo-700'}`}
        >
          🔴 Laser {laserOn ? 'ON' : 'OFF'}
        </button>

        {/* Record */}
        {!recording ? (
          <button onClick={startRecording}
            className="px-4 py-2 rounded-xl font-bold text-sm bg-indigo-600 text-white">
            ⏺ Start Recording
          </button>
        ) : (
          <button onClick={stopRecording}
            className="px-4 py-2 rounded-xl font-bold text-sm bg-red-700 text-white animate-pulse">
            ⏹ Stop Recording
          </button>
        )}

        {recording && <span className="text-xs text-red-400 font-bold animate-pulse">● REC</span>}

        {/* Page nav */}
        <div className="flex items-center gap-2 ml-auto">
          <button disabled={currentPage <= minPage} onClick={() => setCurrentPage(p => Math.max(minPage, p - 1))}
            className="w-8 h-8 rounded-lg font-bold text-white disabled:opacity-30 flex items-center justify-center" style={{ background: '#4338ca' }}>‹</button>
          <span className="text-white font-black text-sm">Pg {currentPage}</span>
          <button disabled={currentPage >= maxPage} onClick={() => setCurrentPage(p => Math.min(maxPage, p + 1))}
            className="w-8 h-8 rounded-lg font-bold text-white disabled:opacity-30 flex items-center justify-center" style={{ background: '#4338ca' }}>›</button>
        </div>
      </div>

      {/* PDF + Laser overlay */}
      <div
        ref={containerRef}
        className="relative rounded-2xl overflow-hidden select-none"
        style={{ background: '#fff', cursor: laserOn ? 'none' : 'default', touchAction: 'none' }}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        onTouchMove={handleMove}
        onTouchEnd={handleLeave}
      >
        <PdfPageRenderer
          pdfUrl={assignment.pdf_url}
          pageNumber={currentPage}
          onRendered={(w, h) => setPdfSize({ w, h })}
        />

        {/* Laser dot */}
        {laserOn && laserPos && (
          <div
            style={{
              position: 'absolute',
              left: laserPos.x - 12,
              top: laserPos.y - 12,
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: 'rgba(255,0,0,0.85)',
              boxShadow: '0 0 12px 6px rgba(255,0,0,0.5)',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>

      {/* Playback */}
      {recordedUrl && (
        <div className="rounded-2xl p-4 flex flex-col gap-2" style={{ background: '#1a1a2e', border: '1px solid #4338ca' }}>
          <p className="text-indigo-200 font-bold text-sm">📽 Recording Ready</p>
          <video controls src={recordedUrl} className="w-full rounded-xl" />
          <a href={recordedUrl} download="recording.webm"
            className="py-2 rounded-xl font-bold text-sm text-white text-center" style={{ background: '#4338ca' }}>
            ⬇ Download
          </a>
        </div>
      )}
    </div>
  );
}