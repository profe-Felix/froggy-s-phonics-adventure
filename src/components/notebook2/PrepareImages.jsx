// Teacher-only: prepares PDF pages into Base44 images (resumable).
import { useEffect, useRef, useState } from "react";
import { findNativeAsset, prepareNativeImages, prepareNativePdfPages, nativeImage } from "@/lib/notebook2/assets";
import { Notice } from "./shared";

export function useNativeAsset(assignment, variant = 2) {
  const [asset, setAsset] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!assignment) { setAsset(null); return undefined; }
    let live = true; if (!asset) setLoading(true); setError("");
    findNativeAsset(assignment, variant).then(a => live && setAsset(a), e => live && setError(e.message)).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [assignment?.id, variant, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return { asset, setAsset, loading, error, reload: () => setTick(t => t + 1) };
}

export const preparedCount = (asset, total) => { let n = 0; for (let p = 1; p <= total; p++) if (nativeImage(asset, p)) n++; return n; };

export default function PrepareImages({ assignment, asset, setAsset, variant = 2, page = 1 }) {
  const [run, setRun] = useState(null);
  const [error, setError] = useState("");
  const ctrl = useRef(null);
  useEffect(() => () => ctrl.current?.abort(), []);
  const total = assignment.pdf_page_count;
  const done = preparedCount(asset, total);
  const start = async (onlyPage) => {
    setError(""); ctrl.current = new AbortController();
    setRun({ n: done, total });
    try {
      const prepare = variant === 3 ? prepareNativePdfPages : prepareNativeImages;
      const a = await prepare(assignment, (a2, n, t) => { setAsset(a2); setRun({ n, total: t }); }, ctrl.current.signal, { onlyPage });
      setAsset(a);
    } catch (e) { setError(e.message); }
    setRun(null);
  };
  return (
    <div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 700 }} data-testid="text-prepared">{done} of {total} pages prepared</span>
        {run ? <button type="button" className="nb2-btn" onClick={() => ctrl.current?.abort()} data-testid="button-pause-prep">Pause</button>
          : <><button type="button" className="nb2-btn" disabled={!!nativeImage(asset, page)} onClick={() => start(page)} data-testid="button-prepare-page">
            Prepare page {page} only</button>
            <button type="button" className="nb2-btn" data-kind="primary" disabled={done === total} onClick={() => start()} data-testid="button-prepare">
            {done === 0 ? (variant === 3 ? "Split all PDF pages" : "Prepare all images") : done === total ? "All pages ready" : "Resume all pages"}</button></>}
      </div>
      {run && <div style={{ height: 8, borderRadius: 99, background: "hsl(200 25% 90%)", marginTop: 6, overflow: "hidden" }}>
        <div style={{ height: "100%", width: "100%", background: "hsl(195 55% 36%)", transformOrigin: "left", transform: `scaleX(${run.n / run.total})`, transition: "transform .3s" }} /></div>}
      {error && <Notice tone="warn" data-testid="text-prep-error">{error}</Notice>}
    </div>
  );
}
