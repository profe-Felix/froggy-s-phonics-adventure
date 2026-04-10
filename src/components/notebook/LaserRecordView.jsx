import { useState, useRef, useCallback, useEffect } from 'react';
import PdfPageRenderer from './PdfPageRenderer';
import { base44 } from '@/api/base44Client';

export default function LaserRecordView({ assignment, session, onRecordingSaved, initialPage = 1 }) {
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [laserOn, setLaserOn] = useState(false);
  const [laserPos, setLaserPos] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [laserTrail, setLaserTrail] = useState([]);

  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const animFrameRef = useRef(null);
  const trailRef = useRef([]);

  // Draw laser trail on canvas overlay
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!laserPos) return;
    // Glow effect
    ctx.beginPath();
    ctx.arc(laserPos.x, laserPos.y, 14, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,0,0,0.25)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(laserPos.x, laserPos.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,50,50,0.9)';
    ctx.fill();
  }, [laserPos]);

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
    const pos = getPos(e);
    setLaserPos(pos);
    if (recording && pos) {
      trailRef.current.push({ ...pos, t: Date.now() });
    }
  }, [laserOn, recording]);

  const handleLeave = () => {
    setLaserPos(null);
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  };

  const syncCanvasSize = () => {
    if (!containerRef.current || !canvasRef.current) return;
    const { width, height } = containerRef.current.getBoundingClientRect();
    canvasRef.current.width = width;
    canvasRef.current.height = height;
  };

  const startRecording = async () => {
    trailRef.current = [];
    chunksRef.current = [];
    setRecordedUrl(null);
    let micStream = null;
    try { micStream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch {}

    // Record the PDF canvas + laser overlay using canvas.captureStream
    const pdfCanvas = containerRef.current?.querySelector('canvas');
    if (!pdfCanvas) return;

    // Merge PDF canvas + laser overlay into a recording canvas
    const recCanvas = document.createElement('canvas');
    recCanvas.width = pdfCanvas.width;
    recCanvas.height = pdfCanvas.height;
    const recCtx = recCanvas.getContext('2d');

    const laser = canvasRef.current;
    const drawFrame = () => {
      recCtx.clearRect(0, 0, recCanvas.width, recCanvas.height);
      recCtx.drawImage(pdfCanvas, 0, 0);
      if (laser) recCtx.drawImage(laser, 0, 0, recCanvas.width, recCanvas.height);
      animFrameRef.current = requestAnimationFrame(drawFrame);
    };
    drawFrame();

    const videoStream = recCanvas.captureStream(30);
    const tracks = [...videoStream.getTracks(), ...(micStream ? micStream.getTracks() : [])];
    const combined = new MediaStream(tracks);

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    const mr = new MediaRecorder(combined, { mimeType });
    mr.ondataavailable = e => chunksRef.current.push(e.data);
    mr.onstop = async () => {
      cancelAnimationFrame(animFrameRef.current);
      tracks.forEach(t => t.stop());
      setRecording(false);
      setUploading(true);
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const localUrl = URL.createObjectURL(blob);
      setRecordedUrl(localUrl);
      try {
        const file = new File([blob], `recording-p${currentPage}.webm`, { type: 'video/webm' });
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        if (session && onRecordingSaved) {
          const updated = { ...(session.recordings_by_page || {}), [String(currentPage)]: file_url };
          await base44.entities.NotebookSession.update(session.id, { recordings_by_page: updated });
          onRecordingSaved(updated);
        }
      } catch (e) { console.error(e); }
      setUploading(false);
    };
    mr.start(100);
    mediaRecorderRef.current = mr;
    setRecording(true);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
  };

  if (!assignment) {
    return <p className="text-indigo-400 text-center mt-8">Select an assignment from the Assignments tab first</p>;
  }

  return (
    <div className="flex flex-col" style={{ background: '#0f0f1a', minHeight: '100%' }}>
      {/* Controls bar */}
      <div className="flex items-center gap-3 px-3 py-2 flex-wrap shrink-0"
        style={{ background: '#1a1a2e', borderBottom: '1px solid #4338ca' }}>
        <button
          onClick={() => { setLaserOn(v => !v); setLaserPos(null); }}
          className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${laserOn ? 'bg-red-600 text-white' : 'border border-indigo-700 text-indigo-300'}`}
        >
          🔴 Laser {laserOn ? 'ON' : 'OFF'}
        </button>

        {!recording ? (
          <button onClick={startRecording}
            className="px-4 py-2 rounded-xl font-bold text-sm bg-indigo-600 text-white">
            ⏺ Start Recording
          </button>
        ) : (
          <button onClick={stopRecording}
            className="px-4 py-2 rounded-xl font-bold text-sm bg-red-700 text-white animate-pulse">
            ⏹ Stop
          </button>
        )}
        {recording && <span className="text-xs text-red-400 font-bold animate-pulse">● REC</span>}
      {uploading && <span className="text-xs text-yellow-400 font-bold animate-pulse">⬆ Uploading…</span>}

        <div className="flex items-center gap-2 ml-auto">
          <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            className="w-8 h-8 rounded-lg font-bold text-white flex items-center justify-center" style={{ background: '#4338ca' }}>‹</button>
          <span className="text-white font-black text-sm">Pg {currentPage}</span>
          <button onClick={() => setCurrentPage(p => p + 1)}
            className="w-8 h-8 rounded-lg font-bold text-white flex items-center justify-center" style={{ background: '#4338ca' }}>›</button>
        </div>
      </div>

      {/* PDF + Laser canvas */}
      <div
        ref={containerRef}
        className="relative overflow-auto"
        style={{ background: '#e8e8e8', cursor: laserOn ? 'crosshair' : 'default', touchAction: laserOn ? 'none' : 'auto' }}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        onTouchMove={handleMove}
        onTouchEnd={handleLeave}
      >
        <PdfPageRenderer
          pdfUrl={assignment.pdf_url}
          pageNumber={currentPage}
          onRendered={syncCanvasSize}
        />
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', width: '100%', height: '100%' }}
        />
      </div>

      {/* Playback */}
      {recordedUrl && (
        <div className="p-4 flex flex-col gap-2" style={{ background: '#1a1a2e', borderTop: '1px solid #4338ca' }}>
          <p className="text-indigo-200 font-bold text-sm">📽 Recording Ready</p>
          <video controls src={recordedUrl} className="w-full rounded-xl" style={{ maxHeight: 240 }} />
          <a href={recordedUrl} download="recording.webm"
            className="py-2 rounded-xl font-bold text-sm text-white text-center block" style={{ background: '#4338ca' }}>
            ⬇ Download
          </a>
        </div>
      )}
    </div>
  );
}