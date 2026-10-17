// Student worksheet screen.
// Parent owns persistence, sync, token renewal,
// safe page transitions and finishing/retrying pending work.

import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from "lucide-react";

import {
  NotebookToolbar,
  NOTEBOOK_INK,
  NOTEBOOK_PEN_WIDTHS,
  NOTEBOOK_ERASER_WIDTHS,
} from "./NotebookToolbar";

import { NotebookViewport } from "./NotebookViewport";

const SIDE_KEY = "notebook-toolbar-side";

const fn = value => typeof value === "function";

const num = value =>
  Number.isSafeInteger(value) && value >= 0;

const msg = (error, fallback) =>
  (
    error &&
    typeof error.message === "string" &&
    error.message
  ) ||
  (
    typeof error === "string" &&
    error
  ) ||
  fallback;

const CSS = `
.nbs{
  display:flex;
  flex-direction:column;
  gap:8px;
  height:min(86dvh,960px);
  min-height:420px;
  padding:8px;
  box-sizing:border-box;
  border-radius:18px;
  background:hsl(192 30% 90%);
  font-family:ui-rounded,"Nunito","Segoe UI",system-ui,sans-serif;
  color:hsl(200 30% 18%);
}
.nbs-head{
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  gap:6px;
  flex-shrink:0;
}
.nbs-pill{
  border-radius:999px;
  padding:4px 10px;
  font-size:12px;
  font-weight:700;
  background:hsl(48 60% 98%);
  color:hsl(200 15% 32%);
}
.nbs-pill[data-tone=warn]{
  background:hsl(44 90% 84%);
  color:hsl(36 80% 22%);
}
.nbs-pill[data-tone=bad]{
  background:hsl(4 80% 92%);
  color:hsl(4 70% 32%);
}
.nbs-pill[data-tone=ok]{
  background:hsl(160 40% 88%);
  color:hsl(165 60% 20%);
}
.nbs-alert{
  display:flex;
  align-items:center;
  gap:8px;
  flex-wrap:wrap;
  padding:8px 12px;
  border-radius:12px;
  font-size:13px;
  font-weight:600;
  background:hsl(4 80% 94%);
  color:hsl(4 70% 30%);
  flex-shrink:0;
}
.nbs-alert[hidden]{
  display:none;
}
.nbs-row{
  display:flex;
  flex-direction:column;
  gap:8px;
  flex:1 1 auto;
  min-height:0;
  min-width:0;
}
@media (min-width:768px),(orientation:landscape){
  .nbs-row{
    flex-direction:row;
  }
}
.nbs-main{
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:8px;
  flex:1 1 auto;
  min-height:0;
  min-width:0;
  order:0;
}
.nbs-nav{
  display:flex;
  align-items:center;
  gap:6px;
  flex-shrink:0;
  border-radius:999px;
  background:hsl(48 60% 98%);
  padding:4px 8px;
}
.nbs-btn{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:6px;
  min-width:48px;
  min-height:48px;
  border:0;
  border-radius:12px;
  background:transparent;
  color:inherit;
  font:inherit;
  font-weight:700;
  cursor:pointer;
  touch-action:manipulation;
  -webkit-tap-highlight-color:transparent;
}
.nbs-btn:hover:not(:disabled){
  background:hsl(200 30% 93%);
}
.nbs-btn:focus-visible{
  outline:3px solid hsl(28 90% 52%);
  outline-offset:2px;
}
.nbs-btn:disabled{
  opacity:.4;
  cursor:not-allowed;
}
.nbs-alert .nbs-btn{
  min-height:44px;
  padding:0 12px;
  background:hsl(48 60% 98%);
}
.nbs-page{
  min-width:132px;
  text-align:center;
  font-size:14px;
  font-weight:700;
}
.nbs-sub{
  font-size:12px;
  color:hsl(200 15% 42%);
  text-align:center;
  margin:0;
  flex-shrink:0;
}
`;

function connectionLabel(connection) {
  if (!connection) {
    return ["Connection: checking", "warn"];
  }

  if (connection.blocked) {
    return ["Connection blocked", "bad"];
  }

  if (connection.closed) {
    return ["Connection closed", "bad"];
  }

  if (connection.connected) {
    return ["Connected to class", "ok"];
  }

  if (connection.connecting) {
    return ["Connecting...", "warn"];
  }

  return [
    connection.error
      ? "Offline - reconnect needed"
      : "Offline",
    "warn",
  ];
}

function saveLabel(save, failed) {
  if (num(failed) && failed > 0) {
    return [
      `${failed} mark${failed > 1 ? "s" : ""} not saved on this device. Keep this page open.`,
      "bad",
    ];
  }

  if (!save) {
    return ["Save status: checking", "warn"];
  }

  if (save.blocked || save.error) {
    return [
      "Saving is blocked. Keep this page open.",
      "bad",
    ];
  }

  if (
    !num(save.pendingCount) ||
    !num(failed)
  ) {
    return ["Save status: checking", "warn"];
  }

  if (save.pendingCount > 0) {
    return [
      `${save.pendingCount} change${save.pendingCount > 1 ? "s" : ""} waiting for server confirmation`,
      "warn",
    ];
  }

  return ["No queued changes", ""];
}

const REASONS = {
  "control-error":
    "Teacher controls could not be checked.",
  connecting:
    "Waiting for teacher controls...",
  expired:
    "Session expired. Keep this page open and try reconnecting.",
  "source-changed":
    "This lesson changed. Keep this page open.",
  "source-inactive":
    "This activity is not open right now.",
  "outside-group":
    "Your teacher is working with a different group.",
  waiting:
    "Waiting for your teacher to start.",
  paused:
    "Class paused. Pencils down for a moment.",
  ended:
    "This class has ended.",
  "page-not-assigned":
    "This page is not assigned.",
  "read-only":
    "Look only - writing is off for this notebook.",
  loading:
    "Getting the page ready...",
  busy:
    "One moment...",
};

export function NotebookStudentView({
  workbook,
  page,
  imageUrl,
  strokes = [],
  ready = false,
  controls = null,
  syncState = null,
  canUndo = false,
  canRedo = false,
  canClear = false,
  busy = false,
  error = "",
  finishRef,
  onStroke,
  onErase,
  onPixelErase,
  onUndo,
  onRedo,
  onClear,
  onChoosePage,
  onRetry,
  onError,
  style,
}) {
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState(
    NOTEBOOK_INK[0].value
  );

  const [width, setWidth] = useState(
    NOTEBOOK_PEN_WIDTHS[1]
  );

  const [eraserWidth, setEraserWidth] = useState(
    NOTEBOOK_ERASER_WIDTHS[1]
  );

  const [side, setSide] = useState(() => {
    try {
      return (
        typeof localStorage !== "undefined" &&
        localStorage.getItem(SIDE_KEY) === "right"
      )
        ? "right"
        : "left";
    } catch {
      return "left";
    }
  });

  const [fit, setFit] = useState("width");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [localError, setLocalError] = useState("");

  const busyRef = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(SIDE_KEY, side);
    } catch {
      // Handedness still works when storage is unavailable.
    }
  }, [side]);

  // Only explicit UI actions use this busy flag.
  // Individual strokes keep their original persistence promises.
  const run = async (
    label,
    action,
    strict,
    onOk
  ) => {
    if (
      busy === true ||
      busyRef.current ||
      !fn(action)
    ) {
      return;
    }

    busyRef.current = true;
    setActionBusy(true);
    setActionError("");

    try {
      const result = await action();

      if (
        strict
          ? result !== true
          : result === false
      ) {
        setActionError(
          `${label} did not finish. Your page stays open.`
        );
      } else {
        onOk?.();
      }
    } catch (reason) {
      setActionError(
        `${label} failed: ${msg(reason, "unknown problem")}`
      );
    } finally {
      busyRef.current = false;
      setActionBusy(false);
    }
  };

  const reportError = reason => {
    setLocalError(
      msg(
        reason,
        "A mark could not be saved on this device."
      )
    );

    if (!fn(onError)) return;

    try {
      const result = onError(reason);

      if (result && fn(result.then)) {
        result.then(undefined, () => {});
      }
    } catch {
      // An observer error must not hide the original save error.
    }
  };

  const requested = controls?.page ?? null;
  const mismatch = requested !== page;
  const anyBusy = busy === true || actionBusy;

  const externalError = error
    ? msg(
        error,
        "This notebook needs attention. Keep this page open."
      )
    : "";

  const localHealthy =
    num(syncState?.failedLocalCount) &&
    syncState.failedLocalCount === 0 &&
    syncState.save?.closed !== true &&
    syncState.save?.blocked !== true &&
    syncState.connection?.closed !== true;

  const blockingError =
    !!externalError ||
    !!actionError ||
    !!localError ||
    !localHealthy;

  const count =
    Number.isSafeInteger(workbook?.pageCount) &&
    workbook.pageCount > 0
      ? workbook.pageCount
      : 0;

  const validPage =
    Number.isSafeInteger(page) &&
    page >= 1 &&
    page <= count;

  const canWrite =
    ready === true &&
    controls?.canDraw === true &&
    !mismatch &&
    !anyBusy &&
    !blockingError &&
    validPage &&
    fn(onStroke) &&
    fn(onErase) &&
    fn(onPixelErase);

  const allowed = Array.isArray(
    controls?.allowedPages
  )
    ? controls.allowedPages
    : null;

  const neighbor = direction => {
    if (!Number.isSafeInteger(page) || !count) {
      return null;
    }

    if (!allowed) {
      const nextPage = page + direction;

      return nextPage >= 1 && nextPage <= count
        ? nextPage
        : null;
    }

    const index = allowed.indexOf(page);

    if (index < 0) {
      return null;
    }

    const nextPage = allowed[index + direction];

    return (
      Number.isSafeInteger(nextPage) &&
      nextPage >= 1 &&
      nextPage <= count
    )
      ? nextPage
      : null;
  };

  const navOk =
    ready === true &&
    validPage &&
    !blockingError &&
    !!controls &&
    controls.followTeacher !== true &&
    controls.canNavigate === true &&
    !mismatch &&
    !anyBusy &&
    fn(onChoosePage);

  const previous = navOk ? neighbor(-1) : null;
  const next = navOk ? neighbor(1) : null;

  const go = targetPage => {
    if (targetPage !== null) {
      run(
        "Changing page",
        () => onChoosePage(targetPage),
        false
      );
    }
  };

  const [connectionText, connectionTone] =
    connectionLabel(syncState?.connection);

  const [saveText, saveTone] = saveLabel(
    syncState?.save,
    syncState?.failedLocalCount
  );

  const why = !controls
    ? "Waiting for teacher controls..."
    : controls.error
      ? `Teacher controls: ${controls.error}`
      : controls.reason
        ? (
            REASONS[controls.reason] ??
            `Writing paused (${controls.reason}).`
          )
        : mismatch
          ? "Finishing before the new page opens..."
          : null;

  const shownError =
    externalError ||
    actionError ||
    localError ||
    (
      num(syncState?.failedLocalCount) &&
      syncState.failedLocalCount > 0
        ? saveText
        : ""
    ) ||
    msg(controls?.error, "") ||
    msg(syncState?.save?.error, "") ||
    (
      syncState?.save?.blocked
        ? "Saving is blocked. Keep this page open and try again."
        : ""
    ) ||
    (
      syncState?.connection?.blocked
        ? msg(
            syncState.connection.error,
            "The connection is blocked. Keep this page open."
          )
        : ""
    );

  return (
    <div
      className="nbs"
      style={style}
      data-testid="notebook-student-view"
    >
      <style>{CSS}</style>

      <div className="nbs-head">
        <span
          className="nbs-pill"
          data-tone={connectionTone}
          role="status"
          aria-live="polite"
          data-testid="status-connection"
        >
          {connectionText}
        </span>

        <span
          className="nbs-pill"
          data-tone={saveTone}
          role="status"
          aria-live="polite"
          data-testid="status-save"
        >
          {saveText}
        </span>

        <span
          className="nbs-pill"
          data-tone={canWrite ? "ok" : "warn"}
          role="status"
          aria-live="polite"
          data-testid="status-writing"
        >
          {canWrite
            ? "You can write"
            : why || (
                anyBusy
                  ? "One moment..."
                  : "Writing paused"
              )}
        </span>

        {controls?.followTeacher === true && (
          <span
            className="nbs-pill"
            data-testid="status-follow"
          >
            Following your teacher
          </span>
        )}
      </div>

      <div
        className="nbs-alert"
        role="alert"
        hidden={!shownError}
        data-testid="text-student-error"
      >
        <span style={{ flex: "1 1 200px" }}>
          {shownError}
        </span>

        <button
          type="button"
          className="nbs-btn"
          disabled={!fn(onRetry) || anyBusy}
          aria-label="Retry notebook connection and saves"
          data-testid="button-retry"
          onClick={() =>
            run(
              "Retry",
              onRetry,
              true,
              () => {
                setLocalError("");
                setActionError("");
              }
            )
          }
        >
          <RotateCcw size={18} />
          Try again
        </button>
      </div>

      <div className="nbs-row">
        <NotebookToolbar
          tool={tool}
          color={color}
          width={width}
          eraserWidth={eraserWidth}
          side={side}
          fit={fit}
          paletteOpen={paletteOpen}
          canDraw={canWrite}
          busy={anyBusy}
          canUndo={canUndo === true}
          canRedo={canRedo === true}
          canClear={canClear === true}
          onToolChange={setTool}
          onColorChange={setColor}
          onWidthChange={setWidth}
          onEraserWidthChange={setEraserWidth}
          onSideChange={setSide}
          onFitChange={setFit}
          onPaletteOpenChange={setPaletteOpen}
          onUndo={
            fn(onUndo)
              ? () => run("Undo", onUndo, false)
              : undefined
          }
          onRedo={
            fn(onRedo)
              ? () => run("Redo", onRedo, false)
              : undefined
          }
          onClear={
            fn(onClear)
              ? () =>
                  run(
                    "Clearing the page",
                    onClear,
                    false
                  )
              : undefined
          }
        />

        <main
          className="nbs-main"
          aria-label="Worksheet"
        >
          <NotebookViewport
            ready={ready === true}
            fit={fit}
            workbook={workbook}
            page={page}
            imageUrl={imageUrl}
            strokes={strokes}
            canDraw={canWrite}
            tool={tool}
            color={color}
            width={width}
            eraserWidth={eraserWidth}
            onStroke={onStroke}
            onErase={onErase}
            onPixelErase={onPixelErase}
            finishRef={finishRef}
            onDrawStart={() =>
              setPaletteOpen(false)
            }
            onError={reportError}
          />

          <nav
            className="nbs-nav"
            aria-label="Pages"
          >
            <button
              type="button"
              className="nbs-btn"
              disabled={previous === null}
              onClick={() => go(previous)}
              aria-label="Previous page"
              data-testid="button-student-prev"
            >
              <ChevronLeft size={22} />
            </button>

            <span
              className="nbs-page"
              role="status"
              aria-live="polite"
              data-testid="text-page"
            >
              Page {page ?? "-"}
              {count ? ` of ${count}` : ""}
            </span>

            <button
              type="button"
              className="nbs-btn"
              disabled={next === null}
              onClick={() => go(next)}
              aria-label="Next page"
              data-testid="button-student-next"
            >
              <ChevronRight size={22} />
            </button>
          </nav>

          <p
            className="nbs-sub"
            data-testid="text-requested-page"
          >
            {mismatch && requested != null
              ? (
                  `Opening page ${requested} - ` +
                  `still showing page ${page ?? "-"}.`
                )
              : requested == null && controls
                ? "No assigned page right now."
                : "\u00a0"}
          </p>
        </main>
      </div>
    </div>
  );
}
