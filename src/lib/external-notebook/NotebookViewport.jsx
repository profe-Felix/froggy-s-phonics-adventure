// Controlled worksheet viewport.
// Parent must provide a bounded height.
// Keep this component mounted while work is saving.
// No fetching, storage, zoom controls or ink-coordinate changes.

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { NotebookCanvas } from "./NotebookCanvas";

const FITS = ["width", "height"];

const positive = value =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value > 0;

export function getNotebookFitWidth({
  fit = "width",
  viewportWidth,
  viewportHeight,
  workbookWidth,
  workbookHeight,
} = {}) {
  if (!FITS.includes(fit)) {
    throw new Error(
      `Invalid notebook fit mode: ${String(fit)}`
    );
  }

  if (
    !positive(viewportWidth) ||
    !positive(viewportHeight) ||
    !positive(workbookWidth) ||
    !positive(workbookHeight)
  ) {
    return 0;
  }

  const ratio = workbookHeight / workbookWidth;

  if (
    !positive(ratio) ||
    !positive(1000 * ratio)
  ) {
    return 0;
  }

  if (fit === "width") {
    return viewportWidth;
  }

  const width = Math.min(
    viewportWidth,
    Math.max(0, viewportHeight - 2) / ratio
  );

  return Number.isFinite(width) && width > 0
    ? width
    : 0;
}

const useIsoLayout =
  typeof window === "undefined"
    ? useEffect
    : useLayoutEffect;

const CSS = `
.nbv{
  display:flex;
  flex:1 1 auto;
  flex-direction:column;
  gap:8px;
  min-height:0;
  min-width:0;
  width:100%;
  font-family:ui-rounded,"Nunito","Segoe UI",system-ui,sans-serif;
  color:hsl(200 30% 18%);
}
.nbv-hint{
  flex-shrink:0;
  text-align:center;
  font-size:12px;
  color:hsl(200 15% 42%);
}
.nbv-scroll{
  flex:1 1 auto;
  min-height:0;
  min-width:0;
  width:100%;
  overflow:auto;
  overscroll-behavior:contain;
  -webkit-overflow-scrolling:touch;
  touch-action:pan-x pan-y;
  border-radius:8px;
}
.nbv-scroll:focus-visible{
  outline:3px solid hsl(28 90% 52%);
  outline-offset:2px;
}
.nbv-page{
  margin:0 auto;
  max-width:100%;
}
`;

export function NotebookViewport({
  ready = false,
  fit = "width",
  ...canvas
}) {
  const ref = useRef(null);

  const [size, setSize] = useState({
    width: 0,
    height: 0,
  });

  const workbook = canvas.workbook;
  const fitOk = FITS.includes(fit);

  const width = getNotebookFitWidth({
    fit: fitOk ? fit : "width",
    viewportWidth: size.width,
    viewportHeight: size.height,
    workbookWidth: workbook?.width,
    workbookHeight: workbook?.height,
  });

  const ratio =
    workbook?.height / workbook?.width;

  const geometryOk =
    positive(workbook?.width) &&
    positive(workbook?.height) &&
    positive(ratio) &&
    positive(1000 * ratio);

  const canDraw =
    ready === true &&
    fitOk &&
    geometryOk &&
    width > 0 &&
    canvas.canDraw === true;

  useIsoLayout(() => {
    const element = ref.current;

    if (!element) return;

    const measure = () => {
      setSize(previous => {
        const next = {
          width: element.clientWidth,
          height: element.clientHeight,
        };

        if (
          previous.width === next.width &&
          previous.height === next.height
        ) {
          return previous;
        }

        return next;
      });
    };

    measure();

    let observer = null;

    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      observer.observe(element);
    }

    window.addEventListener("resize", measure);
    window.addEventListener(
      "orientationchange",
      measure
    );

    // Block pinch zoom only inside this worksheet.
    // Fitting changes display size, not saved ink.
    const preventZoom = event => {
      if (event.cancelable) {
        event.preventDefault();
      }
    };

    const wheel = event => {
      if (event.ctrlKey || event.metaKey) {
        preventZoom(event);
      }
    };

    const gestures = [
      "gesturestart",
      "gesturechange",
      "gestureend",
    ];

    element.addEventListener("wheel", wheel, {
      passive: false,
    });

    gestures.forEach(type => {
      element.addEventListener(
        type,
        preventZoom,
        { passive: false }
      );
    });

    return () => {
      observer?.disconnect();

      window.removeEventListener(
        "resize",
        measure
      );

      window.removeEventListener(
        "orientationchange",
        measure
      );

      element.removeEventListener(
        "wheel",
        wheel
      );

      gestures.forEach(type => {
        element.removeEventListener(
          type,
          preventZoom
        );
      });
    };
  }, []);

  useEffect(() => {
    const element = ref.current;

    if (element) {
      element.scrollTop = 0;
      element.scrollLeft = 0;
    }
  }, [workbook?.id, canvas.page, fit]);

  const onPan = (dx, dy) => {
    const element = ref.current;

    if (element) {
      element.scrollLeft += dx;
      element.scrollTop += dy;
    }
  };

  const status = !fitOk
    ? `Unknown fit mode "${String(fit)}".`
    : !geometryOk
      ? "This workbook has no valid page size."
      : ready !== true
        ? "Getting the page ready..."
        : width <= 0
          ? "Measuring the worksheet..."
          : canvas.canDraw !== true
            ? "Writing is paused. You can still scroll."
            : "One finger draws · Two fingers scroll";

  return (
    <section
      className="nbv"
      aria-label="Worksheet view"
      data-testid="notebook-viewport-root"
    >
      <style>{CSS}</style>

      <p
        className="nbv-hint"
        role="status"
        aria-live="polite"
        style={{ margin: 0 }}
        data-testid="status-viewport"
      >
        {status}
      </p>

      <div
        ref={ref}
        className="nbv-scroll"
        tabIndex={0}
        role="region"
        aria-label={
          `Worksheet page ${canvas.page ?? ""}, ` +
          `fitted to ${fitOk ? fit : "width"}. ` +
          "Scroll to see more."
        }
        data-testid="notebook-viewport"
        data-fit={fit}
      >
        <div
          className="nbv-page"
          style={{
            width: width > 0 ? width : "100%",
          }}
        >
          <NotebookCanvas
            {...canvas}
            canDraw={canDraw}
            onPan={onPan}
          />
        </div>
      </div>
    </section>
  );
}
