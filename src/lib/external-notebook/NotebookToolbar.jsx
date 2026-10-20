// Fully controlled toolbar. Parent owns settings, permissions and async errors.
// No network, storage, microphone, laser or zoom.

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeftRight,
  CircleDashed,
  Eraser,
  Highlighter,
  PenLine,
  Redo2,
  Trash2,
  Undo2,
  X,
} from "lucide-react";

export const NOTEBOOK_INK = [
  { name: "Black", value: "#000000" },
  { name: "Dark Grey", value: "#374151" },
  { name: "Grey", value: "#9ca3af" },
  { name: "White", value: "#ffffff" },
  { name: "Navy", value: "#1e3a8a" },
  { name: "Blue", value: "#2563eb" },
  { name: "Sky", value: "#38bdf8" },
  { name: "Dark Green", value: "#166534" },
  { name: "Green", value: "#16a34a" },
  { name: "Lime", value: "#84cc16" },
  { name: "Red", value: "#dc2626" },
  { name: "Pink", value: "#ec4899" },
  { name: "Rose", value: "#fda4af" },
  { name: "Orange", value: "#ea580c" },
  { name: "Yellow", value: "#facc15" },
  { name: "Brown", value: "#78350f" },
  { name: "Purple", value: "#9333ea" },
  { name: "Violet", value: "#6d28d9" },
  { name: "Skin 1", value: "#fddbb4" },
  { name: "Skin 2", value: "#f5c89a" },
  { name: "Skin 3", value: "#e8a87c" },
  { name: "Skin 4", value: "#c68642" },
  { name: "Skin 5", value: "#8d5524" },
  { name: "Skin 6", value: "#4a2010" },
];

export const NOTEBOOK_PEN_WIDTHS = [
  0.0025,
  0.005,
  0.009,
];

export const NOTEBOOK_ERASER_WIDTHS = [
  0.018,
  0.035,
  0.065,
];

const TOOLS = [
  ["pen", PenLine, "Pen", ""],
  ["highlighter", Highlighter, "Highlighter", ""],
  ["eraser", Eraser, "Stroke eraser", "Stroke"],
  ["pixel-eraser", CircleDashed, "Pixel eraser", "Pixel"],
];

const slug = name =>
  name.toLowerCase().replace(/ /g, "-");

const CSS = `
.nbt{
  --nbt-ink:hsl(200 30% 18%);
  --nbt-muted:hsl(200 15% 42%);
  --nbt-card:hsl(48 60% 98%);
  --nbt-line:hsl(200 20% 85%);
  --nbt-hover:hsl(200 30% 93%);
  --nbt-primary:hsl(204 70% 36%);
  --nbt-on:hsl(48 60% 98%);
  --nbt-ring:hsl(28 90% 52%);
  font-family:ui-rounded,"Nunito","Segoe UI",system-ui,sans-serif;
  color:var(--nbt-ink);
}
.nbt-bar{
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  gap:4px;
  padding:4px;
  border-radius:12px;
  background:var(--nbt-card);
  box-shadow:0 1px 0 var(--nbt-line),0 2px 10px hsl(200 30% 20%/.08);
  max-height:28dvh;
  overflow-y:auto;
  overscroll-behavior:contain;
  -webkit-overflow-scrolling:touch;
}
@media (min-width:768px),(orientation:landscape){
  .nbt-bar{
    flex-direction:column;
    flex-wrap:nowrap;
    width:52px;
    box-sizing:border-box;
    max-height:100%;
    scrollbar-width:none;
    align-self:stretch;
  }
}
.nbt-b{
  flex-shrink:0;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  gap:1px;
  width:44px;
  height:44px;
  padding:0;
  box-sizing:border-box;
  border:0;
  border-radius:10px;
  background:transparent;
  color:inherit;
  cursor:pointer;
  font:inherit;
  -webkit-tap-highlight-color:transparent;
  touch-action:manipulation;
  transition:transform .12s ease,background-color .15s ease;
}
.nbt-b:hover:not(:disabled){
  background:var(--nbt-hover);
}
.nbt-b:active:not(:disabled){
  transform:scale(.94);
}
.nbt-b:focus-visible,.nbt-sw:focus-visible{
  outline:3px solid var(--nbt-ring);
  outline-offset:2px;
}
.nbt-b:disabled{
  opacity:.4;
  cursor:not-allowed;
}
.nbt-b[aria-pressed=true].nbt-tool{
  background:var(--nbt-primary);
  color:var(--nbt-on);
}
.nbt-b[aria-pressed=true].nbt-size{
  background:var(--nbt-hover);
  box-shadow:inset 0 0 0 2px var(--nbt-primary);
}
.nbt-out{
  border:2px solid var(--nbt-line);
}
.nbt-lbl{
  font-size:9px;
  font-weight:700;
  line-height:1;
  white-space:nowrap;
}
.nbt-sep{
  height:1px;
  width:100%;
  background:var(--nbt-line);
}
@media (max-width:767px) and (orientation:portrait){
  .nbt-sep{display:none}
}
.nbt-pop{
  position:fixed;
  z-index:1000;
  padding:12px;
  border-radius:16px;
  background:var(--nbt-card);
  border:1px solid var(--nbt-line);
  box-shadow:0 12px 32px hsl(200 30% 20%/.2);
  max-width:calc(100vw - 24px);
  max-height:calc(100dvh - 24px);
  overflow:auto;
  animation:nbt-in .14s ease-out;
}
.nbt-grid{
  display:grid;
  grid-template-columns:repeat(6,44px);
  gap:8px;
}
.nbt-sw{
  width:44px;
  height:44px;
  border-radius:50%;
  border:3px solid var(--nbt-card);
  box-shadow:inset 0 0 0 1px hsl(200 20% 50%/.35);
  cursor:pointer;
  transition:transform .12s ease;
}
.nbt-sw[aria-pressed=true]{
  border-color:var(--nbt-ink);
  transform:scale(1.1);
}
@keyframes nbt-in{
  from{opacity:0;transform:scale(.97)}
  to{opacity:1;transform:none}
}
@media (max-width:360px){
  .nbt-grid{grid-template-columns:repeat(4,44px)}
}
@media (prefers-reduced-motion:reduce){
  .nbt-b,.nbt-sw,.nbt-pop{
    transition:none;
    animation:none;
  }
  .nbt-b:active:not(:disabled){
    transform:none;
  }
}
`;

function ColorPopup({
  id,
  anchor,
  side,
  color,
  onPick,
  onClose,
}) {
  const ref = useRef(null);
  const [pos, setPos] = useState({
    left: -9999,
    top: 0,
  });

  useLayoutEffect(() => {
    const place = () => {
      const a =
        anchor.current?.getBoundingClientRect();
      const p = ref.current;

      if (!a || !p) return;

      const w = p.offsetWidth;
      const h = p.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const m = 12;

      let left =
        side === "right"
          ? a.left - w - m
          : a.right + m;

      if (
        left < m ||
        left + w > vw - m
      ) {
        left = Math.max(
          m,
          Math.min(
            a.left + a.width / 2 - w / 2,
            vw - w - m
          )
        );
      }

      let top =
        left === (
          side === "right"
            ? a.left - w - m
            : a.right + m
        )
          ? a.top + a.height / 2 - h / 2
          : a.bottom + 8;

      if (top + h > vh - m) {
        top =
          left === a.right + m ||
          left === a.left - w - m
            ? vh - h - m
            : a.top - h - 8;
      }

      setPos({
        left,
        top: Math.max(m, top),
      });
    };

    place();

    const selected =
      ref.current?.querySelector(
        '.nbt-sw[aria-pressed="true"]'
      ) ||
      ref.current?.querySelector(".nbt-sw");

    selected?.focus({
      preventScroll: true,
    });

    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);

    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, side]);

  useEffect(() => {
    // Observe the outside event without blocking it.
    // Do not move focus when drawing closes the popup.
    const down = event => {
      if (
        !ref.current?.contains(event.target) &&
        !anchor.current?.contains(event.target)
      ) {
        onClose(false);
      }
    };

    const key = event => {
      if (event.key === "Escape") {
        onClose(true);
      }
    };

    document.addEventListener(
      "pointerdown",
      down,
      { capture: true, passive: true }
    );

    document.addEventListener("keydown", key);

    return () => {
      document.removeEventListener(
        "pointerdown",
        down,
        true
      );

      document.removeEventListener("keydown", key);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      id={id}
      ref={ref}
      className="nbt nbt-pop"
      style={pos}
      role="dialog"
      aria-modal="false"
      aria-label="Choose ink color"
      data-testid="popup-colors"
    >
      <style>{CSS}</style>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontSize: 15,
            fontWeight: 700,
          }}
        >
          Ink color
        </span>

        <button
          type="button"
          className="nbt-b"
          style={{ width: 44, height: 44 }}
          onClick={() => onClose(true)}
          aria-label="Close color menu"
          data-testid="button-close-colors"
        >
          <X size={18} />
        </button>
      </div>

      <div
        className="nbt-grid"
        role="group"
        aria-label="Ink colors"
        data-testid="group-colors"
      >
        {NOTEBOOK_INK.map(item => (
          <button
            type="button"
            key={item.value}
            className="nbt-sw"
            style={{ background: item.value }}
            title={item.name}
            aria-label={item.name}
            aria-pressed={color === item.value}
            onClick={() => onPick(item.value)}
            data-testid={`button-color-${slug(item.name)}`}
          />
        ))}
      </div>
    </div>,
    // Keep the palette in its native lesson overlay's stacking/focus context.
    // Other notebook hosts retain their existing body portal.
    anchor.current?.closest("[data-notebook-palette-root]") || document.body
  );
}

export function NotebookToolbar({
  tool = "pen",
  color = "#000000",
  width = 0.005,
  eraserWidth = 0.035,
  side = "left",
  fit = "width",
  paletteOpen = false,
  canDraw = false,
  canUndo = false,
  canRedo = false,
  canClear = false,
  busy = false,
  onToolChange,
  onColorChange,
  onWidthChange,
  onEraserWidthChange,
  onSideChange,
  onFitChange,
  onPaletteOpenChange,
  onUndo,
  onRedo,
  onClear,
}) {
  const colorBtn = useRef(null);
  const paletteId = useId();

  const isEraser =
    tool === "eraser" ||
    tool === "pixel-eraser";

  const canPickColor =
    typeof onColorChange === "function" &&
    typeof onPaletteOpenChange === "function" &&
    (
      !isEraser ||
      typeof onToolChange === "function"
    );

  const ready = canDraw && !busy;

  const openRef = useRef(onPaletteOpenChange);
  openRef.current = onPaletteOpenChange;

  const closeRef = useRef(refocus => {
    openRef.current?.(false);

    if (refocus) {
      colorBtn.current?.focus({
        preventScroll: true,
      });
    }
  });

  const pick = value => {
    if (!canPickColor) return;

    onColorChange(value);

    if (isEraser) {
      onToolChange?.("pen");
    }

    onPaletteOpenChange?.(false);
  };

  const clear = () => {
    if (
      !onClear ||
      !ready ||
      !canClear
    ) {
      return;
    }

    const confirmed = window.confirm(
      "Clear all ink on this page, including partner ink? " +
      "Teacher replay will keep the saved history. " +
      "The PDF will not change."
    );

    if (confirmed) {
      onClear();
    }
  };

  const colorName =
    NOTEBOOK_INK.find(item => item.value === color)?.name ??
    color;

  return (
    <aside
      className="nbt nbt-bar"
      style={{
        order: side === "right" ? 1 : 0,
      }}
      aria-label="Drawing tools"
      data-testid="notebook-toolbar"
      data-side={side}
    >
      <style>{CSS}</style>

      <button
        type="button"
        className="nbt-b"
        disabled={!onSideChange}
        onClick={() =>
          onSideChange?.(
            side === "left" ? "right" : "left"
          )
        }
        aria-label={
          side === "left"
            ? "Move toolbar to the right side"
            : "Move toolbar to the left side"
        }
        title="Move toolbar"
        data-testid="button-toolbar-side"
      >
        <ArrowLeftRight size={20} />
        <span className="nbt-lbl">
          {side === "left" ? "To right" : "To left"}
        </span>
      </button>

      <button
        type="button"
        className="nbt-b nbt-tool"
        disabled={!onFitChange}
        aria-pressed={fit === "height"}
        onClick={() =>
          onFitChange?.(
            fit === "width" ? "height" : "width"
          )
        }
        aria-label={
          fit === "width"
            ? "Fitting width. Switch to fit height"
            : "Fitting height. Switch to fit width"
        }
        data-testid="button-fit-toggle"
      >
        <span
          style={{
            fontSize: 15,
            fontWeight: 800,
          }}
        >
          {fit === "width" ? "W" : "H"}
        </span>

        <span className="nbt-lbl">
          Fit {fit}
        </span>
      </button>

      {TOOLS.map(([value, Icon, label, sub]) => (
        <button
          type="button"
          key={value}
          className="nbt-b nbt-tool"
          disabled={!onToolChange}
          onClick={() => onToolChange?.(value)}
          aria-pressed={tool === value}
          aria-label={label}
          title={label}
          data-testid={`button-tool-${value}`}
        >
          <Icon size={24} />

          {sub && (
            <span className="nbt-lbl">{sub}</span>
          )}
        </button>
      ))}

      <button
        type="button"
        className="nbt-b"
        disabled={
          !onClear ||
          !ready ||
          !canClear
        }
        onClick={clear}
        aria-label="Clear page ink"
        title="Clear page ink"
        data-testid="button-clear-page"
      >
        <Trash2 size={22} />
      </button>

      <div className="nbt-sep" />

      <button
        ref={colorBtn}
        type="button"
        className="nbt-b"
        disabled={!canPickColor}
        onClick={() =>
          onPaletteOpenChange?.(!paletteOpen)
        }
        aria-expanded={paletteOpen}
        aria-haspopup="dialog"
        aria-controls={
          paletteOpen && canPickColor
            ? paletteId
            : undefined
        }
        aria-label={`Ink color: ${colorName}. Choose a color`}
        title="Choose ink color"
        data-testid="button-ink-color"
      >
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            border: "2px solid var(--nbt-line)",
            background: color,
          }}
        />
        <span className="nbt-lbl">Color</span>
      </button>

      {paletteOpen &&
        canPickColor &&
        typeof document !== "undefined" && (
          <ColorPopup
            id={paletteId}
            anchor={colorBtn}
            side={side}
            color={color}
            onPick={pick}
            onClose={closeRef.current}
          />
        )}

      <div className="nbt-sep" />

      {(
        isEraser
          ? NOTEBOOK_ERASER_WIDTHS
          : NOTEBOOK_PEN_WIDTHS
      ).map((value, index) => {
        const setValue = isEraser
          ? onEraserWidthChange
          : onWidthChange;

        const diameter = isEraser
          ? 10 + index * 9
          : 6 + index * 6;

        return (
          <button
            type="button"
            key={value}
            className="nbt-b nbt-size"
            disabled={!setValue}
            onClick={() => setValue?.(value)}
            aria-pressed={
              (
                isEraser
                  ? eraserWidth
                  : width
              ) === value
            }
            data-testid={
              isEraser
                ? `button-eraser-size-${index}`
                : `button-width-${index}`
            }
            aria-label={
              isEraser
                ? [
                    "Small eraser",
                    "Medium eraser",
                    "Large eraser",
                  ][index]
                : ["Thin", "Medium", "Thick"][index]
            }
          >
            <span
              style={{
                width: diameter,
                height: diameter,
                borderRadius: "50%",
                ...(isEraser
                  ? {
                      border: `1px solid ${
                        tool === "eraser"
                          ? "#dc2626"
                          : "#4b5563"
                      }`,
                      background:
                        tool === "eraser"
                          ? "#ef44444d"
                          : "#6b72804d",
                    }
                  : {
                      background: "var(--nbt-ink)",
                    }),
              }}
            />
          </button>
        );
      })}

      <button
        type="button"
        className="nbt-b nbt-out"
        disabled={
          !onUndo ||
          !ready ||
          !canUndo
        }
        onClick={() => onUndo?.()}
        aria-label="Undo my last change"
        title="Undo my last change"
        data-testid="button-undo"
      >
        <Undo2 size={24} />
      </button>

      <button
        type="button"
        className="nbt-b nbt-out"
        disabled={
          !onRedo ||
          !ready ||
          !canRedo
        }
        onClick={() => onRedo?.()}
        aria-label="Redo"
        title="Redo"
        data-testid="button-redo"
      >
        <Redo2 size={24} />
      </button>
    </aside>
  );
}
