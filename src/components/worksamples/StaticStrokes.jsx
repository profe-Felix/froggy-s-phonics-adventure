import { useRef, useEffect } from 'react';
import AnnotationCanvas from '@/components/notebook/AnnotationCanvas';

// Read-only stroke renderer. Reuses AnnotationCanvas in view mode so the ink
// matches exactly what the student drew (same smoothing, same normalization).
// `strokes` is the object saved by AnnotationCanvas.getStrokes():
//   { strokes: [...], history: [...], canvasWidth, canvasHeight, normalized }
export default function StaticStrokes({ strokes, width, height, color = '#1e293b', size = 5 }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current && strokes) {
      ref.current.loadStrokes(strokes);
    }
  }, [strokes, width, height]);

  return (
    <AnnotationCanvas
      ref={ref}
      width={width}
      height={height}
      color={color}
      size={size}
      tool="pen"
      mode="view"
    />
  );
}