import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { LETTER_WAYPOINTS } from '@/components/data/letterWaypoints';

// Merges the built-in letter waypoints with teacher-authored DB overrides.
// Same merge used by the tracing model canvas and student tracing mode.
export function useMergedWaypoints() {
  const [waypoints, setWaypoints] = useState(LETTER_WAYPOINTS);

  useEffect(() => {
    let cancelled = false;
    base44.entities.LetterWaypoint.list()
      .then((records) => {
        if (cancelled || !Array.isArray(records) || !records.length) return;
        setWaypoints((prev) => {
          const merged = { ...prev };
          for (const r of records) {
            if (!r.letter || !r.strokes_data) continue;
            try {
              const strokes = JSON.parse(r.strokes_data);
              if (Array.isArray(strokes) && strokes.length) {
                merged[r.letter] = { strokes, hint: r.hint || prev[r.letter]?.hint || '' };
              }
            } catch { /* ignore malformed */ }
          }
          return merged;
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return waypoints;
}