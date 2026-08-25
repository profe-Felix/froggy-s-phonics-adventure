import { useRef, useCallback, useMemo, useLayoutEffect } from 'react';

// Custom touch sensor for @hello-pangea/dnd with a shorter long-press delay
// and tolerance for small finger movements during the pending phase.
//
// The default touch sensor requires a 120ms long press and cancels the drag
// if ANY touchmove is detected during that window. This makes dragging feel
// sluggish and unresponsive on iPad and Promethean touch screens — children
// naturally move their fingers slightly before the 120ms expires, which
// cancels the drag entirely (and touch-action:none prevents scrolling too,
// so the touch does nothing).
//
// This sensor:
//   1. Reduces the long-press delay to 50ms (from 120ms) so dragging starts
//      faster.
//   2. Tolerates small movements (≤10px) during the pending phase instead of
//      immediately cancelling, so slight finger jitter doesn't kill the drag.
//      Large swipes still cancel and allow native scrolling.

const IDLE = { type: 'IDLE' };
const TIME_FOR_LONG_PRESS = 50;
const FORCE_PRESS_THRESHOLD = 0.15;
const MOVE_TOLERANCE = 10; // px — small movements during PENDING are tolerated

function bindEvents(el, bindings, sharedOptions) {
  const unbindings = bindings.map((binding) => {
    const options = { ...sharedOptions, ...binding.options };
    el.addEventListener(binding.eventName, binding.fn, options);
    return function unbind() {
      el.removeEventListener(binding.eventName, binding.fn, options);
    };
  });
  return function unbindAll() {
    unbindings.forEach((u) => u());
  };
}

function noop() {}

function getHandleBindings({ cancel, completed, getPhase }) {
  return [
    {
      eventName: 'touchmove',
      options: { capture: false },
      fn: (event) => {
        const phase = getPhase();
        if (phase.type === 'PENDING') {
          // Tolerate small movements during the pending phase instead of
          // immediately cancelling. This prevents finger jitter from killing
          // the drag on touch devices.
          const touch = event.touches[0];
          const dx = touch.clientX - phase.point.x;
          const dy = touch.clientY - phase.point.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= MOVE_TOLERANCE) {
            event.preventDefault();
            return;
          }
          // Large movement — cancel and allow native scrolling
          cancel();
          return;
        }
        if (phase.type !== 'DRAGGING') {
          cancel();
          return;
        }
        phase.hasMoved = true;
        const point = { x: event.touches[0].clientX, y: event.touches[0].clientY };
        event.preventDefault();
        phase.actions.move(point);
      },
    },
    {
      eventName: 'touchend',
      fn: (event) => {
        const phase = getPhase();
        if (phase.type !== 'DRAGGING') {
          cancel();
          return;
        }
        event.preventDefault();
        phase.actions.drop({ shouldBlockNextClick: true });
        completed();
      },
    },
    {
      eventName: 'touchcancel',
      fn: (event) => {
        if (getPhase().type !== 'DRAGGING') {
          cancel();
          return;
        }
        event.preventDefault();
        cancel();
      },
    },
    {
      eventName: 'touchforcechange',
      fn: (event) => {
        const phase = getPhase();
        const touch = event.touches[0];
        if (!touch) return;
        const isForcePress = touch.force >= FORCE_PRESS_THRESHOLD;
        if (!isForcePress) return;
        const shouldRespect = phase.actions.shouldRespectForcePress();
        if (phase.type === 'PENDING') {
          if (shouldRespect) cancel();
          return;
        }
        if (shouldRespect) {
          if (phase.hasMoved) {
            event.preventDefault();
            return;
          }
          cancel();
          return;
        }
        event.preventDefault();
      },
    },
    {
      eventName: 'visibilitychange',
      fn: cancel,
    },
  ];
}

function getWindowBindings({ cancel, getPhase }) {
  return [
    { eventName: 'orientationchange', fn: cancel },
    { eventName: 'resize', fn: cancel },
    { eventName: 'contextmenu', fn: (event) => event.preventDefault() },
    {
      eventName: 'keydown',
      fn: (event) => {
        if (getPhase().type !== 'DRAGGING') {
          cancel();
          return;
        }
        if (event.keyCode === 27) event.preventDefault();
        cancel();
      },
    },
    { eventName: 'visibilitychange', fn: cancel },
  ];
}

export function useFastTouchSensor(api) {
  const phaseRef = useRef(IDLE);
  const unbindEventsRef = useRef(noop);

  const getPhase = useCallback(() => phaseRef.current, []);
  const setPhase = useCallback((phase) => {
    phaseRef.current = phase;
  }, []);

  const startCaptureBinding = useMemo(
    () => ({
      eventName: 'touchstart',
      fn: function onTouchStart(event) {
        if (event.defaultPrevented) return;
        const draggableId = api.findClosestDraggableId(event);
        if (!draggableId) return;
        const actions = api.tryGetLock(draggableId, stop, {
          sourceEvent: event,
        });
        if (!actions) return;
        const touch = event.touches[0];
        const point = { x: touch.clientX, y: touch.clientY };
        unbindEventsRef.current();
        startPendingDrag(actions, point);
      },
    }),
    [api]
  );

  const listenForCapture = useCallback(
    function listenForCapture() {
      const options = { capture: true, passive: false };
      unbindEventsRef.current = bindEvents(window, [startCaptureBinding], options);
    },
    [startCaptureBinding]
  );

  const stop = useCallback(() => {
    const current = phaseRef.current;
    if (current.type === 'IDLE') return;
    if (current.type === 'PENDING') clearTimeout(current.longPressTimerId);
    setPhase(IDLE);
    unbindEventsRef.current();
    listenForCapture();
  }, [listenForCapture, setPhase]);

  const cancel = useCallback(() => {
    const phase = phaseRef.current;
    stop();
    if (phase.type === 'DRAGGING') phase.actions.cancel({ shouldBlockNextClick: true });
    if (phase.type === 'PENDING') phase.actions.abort();
  }, [stop]);

  const bindCapturingEvents = useCallback(
    function bindCapturingEvents() {
      const options = { capture: true, passive: false };
      const args = { cancel, completed: stop, getPhase };
      const unbindTarget = bindEvents(window, getHandleBindings(args), options);
      const unbindWindow = bindEvents(window, getWindowBindings(args), options);
      unbindEventsRef.current = function unbindAll() {
        unbindTarget();
        unbindWindow();
      };
    },
    [cancel, getPhase, stop]
  );

  const startDragging = useCallback(
    function startDragging() {
      const phase = getPhase();
      if (phase.type !== 'PENDING') return;
      const actions = phase.actions.fluidLift(phase.point);
      setPhase({ type: 'DRAGGING', actions, hasMoved: false });
    },
    [getPhase, setPhase]
  );

  const startPendingDrag = useCallback(
    function startPendingDrag(actions, point) {
      const longPressTimerId = setTimeout(startDragging, TIME_FOR_LONG_PRESS);
      setPhase({ type: 'PENDING', point, actions, longPressTimerId });
      bindCapturingEvents();
    },
    [bindCapturingEvents, setPhase, startDragging]
  );

  useLayoutEffect(
    function mount() {
      listenForCapture();
      return function unmount() {
        unbindEventsRef.current();
        const phase = phaseRef.current;
        if (phase.type === 'PENDING') {
          clearTimeout(phase.longPressTimerId);
          setPhase(IDLE);
        }
      };
    },
    [listenForCapture, setPhase]
  );

  // WebKit hack: bind a no-op touchmove on window with passive:false to
  // prevent the browser from defaulting to passive touchmove listeners.
  useLayoutEffect(
    function webkitHack() {
      const unbind = bindEvents(window, [
        {
          eventName: 'touchmove',
          fn: () => {},
          options: { capture: false, passive: false },
        },
      ]);
      return unbind;
    },
    []
  );
}