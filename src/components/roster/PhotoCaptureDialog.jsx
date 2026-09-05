import { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useCropGestures } from '@/hooks/useCropGestures';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera, Check, RotateCcw, Loader2, Upload, Image as ImageIcon } from 'lucide-react';

const VIEWPORT = 280;
const MAX_OUTPUT = 800;

// Camera capture + crop-to-square + upload. Opens the device camera on mobile
// (capture="user"), lets the teacher pinch-zoom/pan to frame the face, then
// uploads a square JPEG and saves it as the student's photo_url.
export default function PhotoCaptureDialog({ student, open, onOpenChange, onSaved }) {
  const [step, setStep] = useState('capture');
  const [rawUrl, setRawUrl] = useState(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const imgRef = useRef(null);
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  const { zoom, pan, zoomRef, panRef, reset, setViewportRef, handlePointerDown, handlePointerMove, handlePointerUp } = useCropGestures({ maxZoom: 8 });

  useEffect(() => {
    if (open) {
      setStep('capture');
      setRawUrl(null);
      setImgSize({ w: 0, h: 0 });
      reset();
      setError('');
      setUploading(false);
    }
  }, [open]);

  useEffect(() => {
    if (!rawUrl || step !== 'crop') return;
    const img = new Image();
    img.onload = () => setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = rawUrl;
  }, [rawUrl, step]);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setRawUrl(URL.createObjectURL(file));
    setStep('crop');
  };

  const fitScale = imgSize.w ? VIEWPORT / Math.min(imgSize.w, imgSize.h) : 1;
  const displayScale = fitScale * zoom;

  const handleSave = useCallback(async () => {
    const img = imgRef.current;
    if (!img || !imgSize.w) return;
    setUploading(true);
    setError('');
    try {
      const { w: W, h: H } = imgSize;
      const minDim = Math.min(W, H);
      const cropSize = minDim / zoomRef.current;
      const cx = W / 2 - panRef.current.x / displayScale;
      const cy = H / 2 - panRef.current.y / displayScale;
      let sx = cx - cropSize / 2;
      let sy = cy - cropSize / 2;
      sx = Math.max(0, Math.min(sx, W - cropSize));
      sy = Math.max(0, Math.min(sy, H - cropSize));
      const out = Math.min(MAX_OUTPUT, Math.round(cropSize));
      const canvas = document.createElement('canvas');
      canvas.width = out;
      canvas.height = out;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, out, out);
      ctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, out, out);
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
      if (!blob) throw new Error('Crop failed');
      const file = new File([blob], `student-${student.student_number}.jpg`, { type: 'image/jpeg' });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.entities.Student.update(student.id, { photo_url: file_url });
      onSaved?.({ ...student, photo_url: file_url });
      onOpenChange(false);
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [imgSize, displayScale, student, onSaved, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-fit p-0 overflow-hidden gap-0">
        <DialogHeader className="px-5 pt-5 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Camera className="w-4 h-4" /> Photo — {student?.name || `#${student?.student_number}`}
          </DialogTitle>
        </DialogHeader>

        {step === 'capture' && (
          <div className="flex flex-col items-center gap-3 px-5 pb-5">
            <p className="text-sm text-muted-foreground text-center">
              Take a photo or pick from the gallery, then crop to a square.
            </p>
            <div className="flex gap-2">
              <Button onClick={() => cameraRef.current?.click()}>
                <Camera className="w-4 h-4 mr-2" /> Take Photo
              </Button>
              <Button variant="outline" onClick={() => galleryRef.current?.click()}>
                <ImageIcon className="w-4 h-4 mr-2" /> Gallery
              </Button>
            </div>
            <input ref={cameraRef} type="file" accept="image/*" capture="user" className="hidden" onChange={handleFile} />
            <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </div>
        )}

        {step === 'crop' && (
          <>
            <div className="flex flex-col items-center px-5 pb-2">
              <div
                ref={setViewportRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="relative overflow-hidden bg-slate-800 cursor-move touch-none select-none rounded-lg"
                style={{ width: VIEWPORT, height: VIEWPORT }}
              >
                {imgSize.w > 0 && (
                  <img
                    ref={imgRef}
                    src={rawUrl}
                    alt="crop preview"
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      maxWidth: 'none',
                      maxHeight: 'none',
                      transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${displayScale})`,
                      transformOrigin: 'center center',
                    }}
                    draggable={false}
                  />
                )}
                <div className="absolute inset-0 pointer-events-none border-2 border-white/40 rounded-lg" />
              </div>
              <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                <span className="tabular-nums">Zoom: {zoom.toFixed(1)}x</span>
                <Button size="sm" variant="outline" onClick={reset}>
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center mt-1.5">
                Pinch or scroll to zoom · Drag to pan
              </p>
            </div>
            <DialogFooter className="px-5 pb-5 pt-2">
              <Button variant="outline" onClick={() => { setStep('capture'); setRawUrl(null); }} disabled={uploading}>
                Back
              </Button>
              <Button onClick={handleSave} disabled={imgSize.w === 0 || uploading}>
                {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                Save photo
              </Button>
            </DialogFooter>
          </>
        )}

        {error && <p className="text-sm text-destructive px-5 pb-3">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}