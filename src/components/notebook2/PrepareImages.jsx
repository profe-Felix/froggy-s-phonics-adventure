// Teacher-only: prepares PDF pages into Base44 images (resumable).
import { useEffect, useRef, useState } from "react";
import { findNativeAsset, prepareNativeImages, nativeImage } from "@/lib/notebook2/assets";
import { Notice } from "./shared";

export function useNativeAsset(assignment) {
  const [asset, setAsset] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!assignment) { setAsset(null); return undefined; }
    let live = true; if (!asset) setLoading(true); setError("");
    findNativeAsset(assignment).then(a => live && setAsset(a), e => live && setError(e.message)).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [assignment?.id, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return { asset, setAsset, loading, error, reload: () => setTick(t => t + 1) };
}

export const preparedCount = (asset, total) => { let n = 0; for (let p = 1; p <= total; p++) if (nativeImage(asset, p)) n++; return n; };

export default function PrepareImages({ assignment, asset, setAsset }) {
  const [run, setRun] = useState(null);
  const [error, setError] = useState("");
  const ctrl = useRef(null);
  useEffect(() => () => ctrl.current?.abort(), []);
  const total = assignment.pdf_page_count;
  const done = preparedCount(asset, total);
  const start = async () => {
    setError(""); ctrl.current = new AbortController();
    setRun({ n: done, total });
    try {
      const a = await prepareNativeImages(assignment, (a2, n, t) => { setAsset(a2); setRun({ n, total: t }); }, ctrl.current.signal);
      setAsset(a);
    } catch (e) { setError(e.message); }
    setRun(null);
  };
  return (
    <div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 700 }} data-testid="text-prepared">{done} of {total} pages prepared</span>
        {run ? <button type="button" className="nb2-btn" onClick={() => ctrl.current?.abort()} data-testid="button-pause-prep">Pause</button>
          : <button type="button" className="nb2-btn" data-kind="primary" disabled={done === total} onClick={start} data-testid="button-prepare">
            {done === 0 ? "Prepare images" : done === total ? "All images ready" : "Resume preparing"}</button>}
      </div>
      {run && <div style={{ height: 8, borderRadius: 99, background: "hsl(200 25% 90%)", marginTop: 6, overflow: "hidden" }}>
        <div style={{ height: "100%", width: "100%", background: "hsl(195 55% 36%)", transformOrigin: "left", transform: `scaleX(${run.n / run.total})`, transition: "transform .3s" }} /></div>}
      {error && <Notice tone="warn" data-testid="text-prep-error">{error}</Notice>}
    </div>
  );
}
