import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { motion, AnimatePresence } from 'framer-motion';
import PdfPageRenderer from '@/components/notebook/PdfPageRenderer';
import LaserReplayOverlay from '@/components/notebook/LaserReplayOverlay';

function StudentSessionCard({ session, book, onReview }) {
  const pages = session.pages_completed || [];
  const totalPages = book.pdf_page_count || 1;
  const recs = session.recordings || [];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-3 flex flex-col gap-2"
      style={{ background: '#0f3d3a', border: '1px solid #0d9488' }}>
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 rounded-full flex items-center justify-center font-black text-white text-lg"
          style={{ background: '#0d9488' }}>
          {session.student_number}
        </div>
        <div className="flex-1">
          <p className="text-white font-bold text-sm">Student #{session.student_number}</p>
          <p className="text-teal-400 text-xs">{pages.length} / {totalPages} pages</p>
        </div>
        <div className="flex gap-1 flex-wrap justify-end">
          {recs.map(r => (
            <button key={r.page} onClick={() => onReview(session, r)}
              className="w-7 h-7 rounded-lg font-bold text-xs text-white"
              style={{ background: '#16a34a' }}>
              {r.page}
            </button>
          ))}
        </div>
      </div>
      {recs.length === 0 && <p className="text-teal-600 text-xs italic">No recordings today</p>}
    </motion.div>
  );
}

function ReviewModal({ session, recording, book, onClose }) {
  const audioRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ w: 600, h: 400 });
  const containerRef = useRef(null);
  const laserData = recording.laser_data
    ? (typeof recording.laser_data === 'string' ? JSON.parse(recording.laser_data) : recording.laser_data)
    : [];

  const handleDownload = async () => {
    // Render-to-video approach: canvas + audio → MediaRecorder
    const pdfCanvas = containerRef.current?.querySelector('canvas');
    if (!pdfCanvas || !recording.audio_url) return;

    const offscreen = document.createElement('canvas');
    offscreen.width = pdfCanvas.width;
    offscreen.height = pdfCanvas.height;
    const ctx = offscreen.getContext('2d');

    // Load audio
    const audioEl = new Audio(recording.audio_url);
    audioEl.crossOrigin = 'anonymous';

    const FADE_MS = 400;
    const startTime = Date.now();
    let animFrame;

    const drawFrame = () => {
      ctx.clearRect(0, 0, offscreen.width, offscreen.height);
      ctx.drawImage(pdfCanvas, 0, 0);
      const currentMs = (audioEl.currentTime || 0) * 1000;
      const visible = laserData.filter(p => p.t <= currentMs && p.t >= currentMs - FADE_MS);
      visible.forEach(p => {
        const age = currentMs - p.t;
        const alpha = Math.max(0, 1 - age / FADE_MS);
        const px = p.x_pct * offscreen.width;
        const py = p.y_pct * offscreen.height;
        const grad = ctx.createRadialGradient(px, py, 0, px, py, 18);
        grad.addColorStop(0, `rgba(255,80,80,${alpha * 0.85})`);
        grad.addColorStop(1, `rgba(255,0,0,0)`);
        ctx.beginPath(); ctx.arc(px, py, 18, 0, Math.PI * 2);
        ctx.fillStyle = grad; ctx.fill();
        ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`; ctx.fill();
      });
      animFrame = requestAnimationFrame(drawFrame);
    };

    const chunks = [];
    const videoStream = offscreen.captureStream(30);
    const audioCtx = new AudioContext();
    const response = await fetch(recording.audio_url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const dest = audioCtx.createMediaStreamDestination();
    const src = audioCtx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(dest);

    const combined = new MediaStream([...videoStream.getTracks(), ...dest.stream.getTracks()]);
    const mr = new MediaRecorder(combined, { mimeType: 'video/webm' });
    mr.ondataavailable = e => chunks.push(e.data);
    mr.onstop = () => {
      cancelAnimationFrame(animFrame);
      audioCtx.close();
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `student${session.student_number}-page${recording.page}.webm`;
      a.click();
    };

    drawFrame();
    src.start();
    mr.start(100);
    setTimeout(() => { mr.stop(); src.stop(); }, (audioBuffer.duration + 0.5) * 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)' }}>
      <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }}
        className="rounded-2xl overflow-hidden flex flex-col w-full max-w-2xl"
        style={{ background: '#0f3d3a', border: '2px solid #0d9488', maxHeight: '90vh' }}>
        <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ background: '#042f2e', borderBottom: '1px solid #0d9488' }}>
          <p className="font-black text-white">Student #{session.student_number} — Page {recording.page}</p>
          <div className="flex gap-2">
            <button onClick={handleDownload}
              className="px-3 py-1.5 rounded-xl font-bold text-white text-xs"
              style={{ background: '#0d9488' }}>
              ⬇ Download Video
            </button>
            <button onClick={onClose} className="text-teal-300 font-bold text-lg">✕</button>
          </div>
        </div>

        <div className="relative overflow-auto flex-1" ref={containerRef}>
          {book.pdf_url && (
            <div style={{ position: 'relative' }}>
              <PdfPageRenderer pdfUrl={book.pdf_url} pageNumber={recording.page} />
              {laserData.length > 0 && (
                <LaserReplayOverlay laserData={laserData} audioRef={audioRef} />
              )}
            </div>
          )}
        </div>

        <div className="p-3 shrink-0" style={{ background: '#042f2e', borderTop: '1px solid #0d9488' }}>
          <audio ref={audioRef} controls src={recording.audio_url} className="w-full" />
          {laserData.length > 0 && <p className="text-teal-400 text-xs mt-1">🔴 Laser replays in sync with audio</p>}
        </div>
      </motion.div>
    </div>
  );
}

export default function BookStudentGrid({ book, className, reviewDate }) {
  const [filterPage, setFilterPage] = useState(null);
  const [reviewing, setReviewing] = useState(null); // {session, recording}

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['book-sessions-all', book.id, reviewDate],
    queryFn: () => base44.entities.BookReadingSession.filter({
      book_id: book.id,
      class_name: className,
      session_date: reviewDate,
    }),
    refetchInterval: 10000,
  });

  const totalPages = book.pdf_page_count || 1;

  const filtered = filterPage
    ? sessions.filter(s => (s.pages_completed || []).includes(filterPage))
    : sessions;

  if (isLoading) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-4 border-teal-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Page filter */}
      <div className="flex gap-2 flex-wrap">
        <span className="text-teal-300 text-xs font-bold self-center">Filter by page:</span>
        <button onClick={() => setFilterPage(null)}
          className={`px-3 py-1 rounded-full font-bold text-xs ${!filterPage ? 'bg-teal-600 text-white' : 'text-teal-400 border border-teal-700'}`}>
          All
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map(pg => (
          <button key={pg} onClick={() => setFilterPage(pg)}
            className={`w-8 h-8 rounded-xl font-bold text-xs ${filterPage === pg ? 'bg-teal-600 text-white' : 'text-teal-400 border border-teal-700'}`}>
            {pg}
          </button>
        ))}
      </div>

      <p className="text-teal-400 text-sm">{filtered.length} student{filtered.length !== 1 ? 's' : ''} with recordings</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {filtered.map(s => (
          <StudentSessionCard
            key={s.id}
            session={s}
            book={book}
            onReview={(sess, rec) => setReviewing({ session: sess, recording: rec })}
          />
        ))}
      </div>

      {reviewing && (
        <ReviewModal
          session={reviewing.session}
          recording={reviewing.recording}
          book={book}
          onClose={() => setReviewing(null)}
        />
      )}
    </div>
  );
}