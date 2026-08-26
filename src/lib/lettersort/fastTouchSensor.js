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

function getHandleBindings({ cancel, completed, getPhase, startDragging }) {
  return [
    {
      eventName: 'touchmove',
      options: { capture: false },
      fn: (event) => {
        const phase = getPhase();
        if (phase.type === 'PENDING') {
          // Tolerate small movements (jitter) during the pending phase so a
          // tap still counts as a tap. A deliberate movement past the
          // tolerance starts the drag immediately so the card follows the
          // finger — no long-press delay, so dragging feels instant, and a
          // stationary press-and-lift never enters DRAGGING so its click is
          // not blocked (the card's onClick audio still plays).
          const touch = event.touches[0];
          const dx = touch.clientX - phase.point.x;
          const dy = touch.clientY - phase.point.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= MOVE_TOLERANCE) {
            event.preventDefault();
            return;
          }
          event.preventDefault();
          startDragging();
          const point = { x: touch.clientX, y: touch.clientY };
          const drag = getPhase();
          if (drag.type === 'DRAGGING') {
            drag.hasMoved = true;
            drag.actions.move(point);
          }
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

  const startDragging = useCallback(
    function startDragging() {
      const phase = getPhase();
      if (phase.type !== 'PENDING') return;
      const actions = phase.actions.fluidLift(phase.point);
      setPhase({ type: 'DRAGGING', actions, hasMoved: false });
    },
    [getPhase, setPhase]
  );

  const bindCapturingEvents = useCallback(
    function bindCapturingEvents() {
      const options = { capture: true, passive: false };
      const args = { cancel, completed: stop, getPhase, startDragging };
      const unbindTarget = bindEvents(window, getHandleBindings(args), options);
      const unbindWindow = bindEvents(window, getWindowBindings(args), options);
      unbindEventsRef.current = function unbindAll() {
        unbindTarget();
        unbindWindow();
      };
    },
    [cancel, getPhase, stop, startDragging]
  );

  const startPendingDrag = useCallback(
    function startPendingDrag(actions, point) {
      // No long-press timer: a drag begins only when the finger deliberately
      // moves past MOVE_TOLERANCE (see the touchmove handler). A stationary
      // press-and-lift stays PENDING, so its click is not blocked and the
      // card's tap-to-play audio fires.
      setPhase({ type: 'PENDING', point, actions, longPressTimerId: null });
      bindCapturingEvents();
    },
    [bindCapturingEvents, setPhase]
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