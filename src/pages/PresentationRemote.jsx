import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { ChevronLeft, ChevronRight, Loader2, Wifi, WifiOff } from 'lucide-react';

// Phone remote — connects to the PresentationRoom actor via a QR code, shows
// speaker notes for the current slide, and sends next/prev commands.
export default function PresentationRemote() {
  const params = new URLSearchParams(window.location.search);
  const roomCode = params.get('room');

  const [connected, setConnected] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [slideCount, setSlideCount] = useState(0);
  const [slides, setSlides] = useState([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const roomRef = useRef(null);

  useEffect(() => {
    if (!roomCode) return;
    let connId = sessionStorage.getItem('remote_conn_id');
    if (!connId) { connId = crypto.randomUUID(); sessionStorage.setItem('remote_conn_id', connId); }
    const room = base44.actors.PresentationRoom(roomCode).connect({ id: connId });
    roomRef.current = room;

    const sub = room.subscribe((msg) => {
      if (msg.type === 'state') {
        if (msg.slideCount > 0) {
          setWaiting(false);
          setConnected(true);
          setCurrentIndex(msg.currentSlideIndex || 0);
          setSlideCount(msg.slideCount);
          if (msg.recordId) fetchSlides(msg.recordId);
        }
      } else if (msg.type === 'slide_changed') {
        setCurrentIndex(msg.index);
      }
    });

    return () => { sub.unsubscribe(); room.close(); };
  }, [roomCode]);

  const fetchSlides = async (recordId) => {
    try {
      const record = await base44.entities.SlidePresentation.get(recordId);
      if (record.slide_data) setSlides(JSON.parse(record.slide_data));
    } catch (err) { console.error(err); }
    finally { setLoadingNotes(false); }
  };

  const goNext = () => roomRef.current?.send({ type: 'next' });
  const goPrev = () => roomRef.current?.send({ type: 'prev' });

  if (!roomCode) {
    return (
      <div className="fixed inset-0 bg-slate-900 flex items-center justify-center text-white p-6 text-center">
        <div>
          <WifiOff className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="font-bold">No room code</p>
          <p className="text-sm text-white/60 mt-2">Scan the QR code from the presenter screen.</p>
        </div>
      </div>
    );
  }

  if (waiting) {
    return (
      <div className="fixed inset-0 bg-slate-900 flex items-center justify-center text-white p-6 text-center">
        <div>
          <Loader2 className="w-10 h-10 mx-auto mb-4 animate-spin text-indigo-400" />
          <p className="font-bold">Waiting for presenter...</p>
          <p className="text-sm text-white/60 mt-2">Open the presentation on your computer first.</p>
        </div>
      </div>
    );
  }

  const notes = slides[currentIndex]?.notes || '';

  return (
    <div className="fixed inset-0 bg-slate-900 flex flex-col select-none">
      <div className="bg-slate-800 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          {connected ? <Wifi className="w-5 h-5 text-green-400" /> : <Loader2 className="w-5 h-5 text-white/50 animate-spin" />}
          <span className="text-white font-bold text-sm">{connected ? 'Connected' : 'Connecting...'}</span>
        </div>
        <span className="text-white/60 text-sm">Slide {currentIndex + 1} / {slideCount || '?'}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loadingNotes ? (
          <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 text-white/50 animate-spin" /></div>
        ) : notes ? (
          <p className="text-white text-lg leading-relaxed whitespace-pre-wrap">{notes}</p>
        ) : (
          <p className="text-white/40 text-center mt-8">No speaker notes for this slide</p>
        )}
      </div>

      <div className="bg-slate-800 px-6 py-4 flex items-center justify-between gap-4 shrink-0">
        <button onClick={goPrev} disabled={currentIndex === 0} className="flex-1 flex items-center justify-center gap-2 bg-slate-700 text-white font-bold py-4 rounded-xl active:scale-95 disabled:opacity-30">
          <ChevronLeft className="w-6 h-6" /> Prev
        </button>
        <button onClick={goNext} disabled={currentIndex >= slideCount - 1} className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 text-white font-bold py-4 rounded-xl active:scale-95 disabled:opacity-30">
          Next <ChevronRight className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}