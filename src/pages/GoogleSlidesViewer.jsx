import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { QRCodeSVG } from 'qrcode.react';
import { ChevronLeft, ChevronRight, QrCode, X, Loader2 } from 'lucide-react';
import SlideMarkup from '@/components/slides/SlideMarkup';
import { extractPresentationId, buildEmbedUrl, generateRoomCode } from '@/lib/slidesUtils';

// Google Slides viewer — embeds the presentation with animations, adds an
// annotation overlay (toggle between interact/draw), and shows a QR code for
// the phone remote. Slide navigation syncs via the PresentationRoom actor.
export default function GoogleSlidesViewer() {
  const params = new URLSearchParams(window.location.search);
  const recordId = params.get('id');

  const [presentation, setPresentation] = useState(null);
  const [slides, setSlides] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchingSlides, setFetchingSlides] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [roomCode] = useState(() => generateRoomCode());
  const containerRef = useRef(null);
  const markupRef = useRef(null);
  const roomRef = useRef(null);
  const presentationRef = useRef(null);
  const roomSetupRef = useRef(false);
  const iframeRef = useRef(null);

  // Load presentation record
  useEffect(() => {
    if (!recordId) { setLoading(false); return; }
    (async () => {
      try {
        const record = await base44.entities.SlidePresentation.get(recordId);
        setPresentation(record);
        presentationRef.current = record;
        if (record.slide_data_fetched && record.slide_data) {
          setSlides(JSON.parse(record.slide_data));
        }
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, [recordId]);

  // Fetch slide data if not yet fetched
  useEffect(() => {
    if (!presentation || presentation.slide_data_fetched || fetchingSlides) return;
    setFetchingSlides(true);
    (async () => {
      try {
        const res = await base44.functions.invoke('fetchPresentationSlides', {
          presentation_id: presentation.presentation_id,
          record_id: presentation.id,
        });
        setSlides(res.data.slides);
      } catch (err) { console.error(err); }
      finally { setFetchingSlides(false); }
    })();
  }, [presentation, fetchingSlides]);

  // Track container size for the annotation canvas — useLayoutEffect runs
  // synchronously after DOM mutations so the size is set before first paint.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Connect to actor and set up the room once slides are available
  useEffect(() => {
    if (!slides.length || roomSetupRef.current) return;
    roomSetupRef.current = true;
    const p = presentationRef.current;
    if (!p) return;

    let connId = sessionStorage.getItem('slides_conn_id');
    if (!connId) { connId = crypto.randomUUID(); sessionStorage.setItem('slides_conn_id', connId); }
    const room = base44.actors.PresentationRoom(roomCode).connect({ id: connId });
    roomRef.current = room;

    const sub = room.subscribe((msg) => {
      if (msg.type === 'state') setCurrentIndex(msg.currentSlideIndex || 0);
      else if (msg.type === 'slide_changed') setCurrentIndex(msg.index);
      else if (msg.type === 'advance_animation') focusIframe();
    });

    room.send({
      type: 'setup',
      slideIds: slides.map(s => s.slideId),
      presentationId: p.presentation_id,
      recordId: p.id,
    });

    return () => { sub.unsubscribe(); room.close(); };
  }, [slides, roomCode]);

  const goNext = () => roomRef.current?.send({ type: 'next' });
  const goPrev = () => roomRef.current?.send({ type: 'prev' });
  const advanceAnimation = () => roomRef.current?.send({ type: 'advance_animation' });

  // Focus the Google Slides iframe so the next physical key press (Space,
  // ArrowRight) or click advances the current slide's animation. Cross-origin
  // security prevents synthetic clicks, but focusing the content window is
  // allowed and routes subsequent keyboard input to the embed.
  const focusIframe = () => {
    try { iframeRef.current?.contentWindow?.focus(); } catch (e) { /* cross-origin */ }
  };

  // Keyboard arrow-key navigation — works when the iframe doesn't have focus.
  // When the iframe has focus, Google Slides handles arrow keys internally
  // (advancing animations). This covers the case where the teacher clicks
  // outside the iframe (on the annotation overlay or page chrome).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === ' ') { e.preventDefault(); focusIframe(); }
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goNext(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goPrev(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Navigate the iframe without a full remount — update the src directly so
  // the iframe stays mounted and navigates internally (smoother, no blank
  // flash). This makes the phone remote feel like a real presentation clicker.
  useEffect(() => {
    if (!iframeRef.current || !presentation) return;
    const slide = slides[currentIndex];
    const pid = presentation.presentation_id || extractPresentationId(presentation.presentation_url);
    const url = buildEmbedUrl(pid, slide?.slideId);
    if (url) iframeRef.current.src = url;
  }, [currentIndex]);

  if (loading) {
    return <div className="fixed inset-0 bg-black flex items-center justify-center"><Loader2 className="w-12 h-12 text-white animate-spin" /></div>;
  }
  if (!presentation) {
    return <div className="fixed inset-0 bg-black flex items-center justify-center text-white">Presentation not found</div>;
  }

  const presentationId = presentation.presentation_id || extractPresentationId(presentation.presentation_url);
  const currentSlide = slides[currentIndex];
  const embedUrl = buildEmbedUrl(presentationId, currentSlide?.slideId);

  return (
    <div className="fixed inset-0 bg-black flex flex-col select-none">
      <div className="bg-zinc-900 px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <a href="/TeacherView" className="text-white/70 hover:text-white text-sm font-bold flex items-center gap-1">
            <ChevronLeft className="w-4 h-4" /> Back
          </a>
          <span className="text-white font-bold">{presentation.title}</span>
          <span className="text-white/50 text-sm">Slide {currentIndex + 1} of {slides.length || '?'}</span>
        </div>
        <button onClick={() => setShowQR(true)} className="flex items-center gap-2 bg-indigo-600 text-white font-bold text-sm px-4 py-2 rounded-lg active:scale-95">
          <QrCode className="w-4 h-4" /> Phone Remote
        </button>
      </div>

      <div ref={containerRef} className="relative flex-1 overflow-hidden">
        {presentationId ? (
          <iframe
            ref={iframeRef}
            src={embedUrl}
            className="absolute inset-0 w-full h-full"
            frameBorder="0"
            allow="autoplay; fullscreen"
            title="Google Slides"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-white/70">Invalid Google Slides URL</div>
        )}

        <SlideMarkup ref={markupRef} width={containerSize.w} height={containerSize.h} slideId={currentSlide?.slideId} />

        <button onClick={goPrev} disabled={currentIndex === 0} className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-black/50 text-white flex items-center justify-center active:scale-90 disabled:opacity-30">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <button onClick={goNext} disabled={currentIndex >= slides.length - 1} className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-black/50 text-white flex items-center justify-center active:scale-90 disabled:opacity-30">
          <ChevronRight className="w-6 h-6" />
        </button>

        {fetchingSlides && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/70 text-white text-sm px-4 py-2 rounded-full flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Fetching slide data...
          </div>
        )}
      </div>

      {showQR && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={() => setShowQR(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">Phone Remote</h3>
              <button onClick={() => setShowQR(false)}><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-slate-600 mb-4">Scan with your phone to control slides and view speaker notes.</p>
            <div className="flex justify-center mb-4">
              <QRCodeSVG value={`${window.location.origin}/PresentationRemote?room=${roomCode}`} size={200} />
            </div>
            <p className="text-center text-xs text-slate-500">Room: {roomCode}</p>
          </div>
        </div>
      )}
    </div>
  );
}