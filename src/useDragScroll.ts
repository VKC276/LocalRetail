import { useEffect, type RefObject } from "react";

/** Click-and-drag (or finger) scrolling for kiosk touch screens that also emit mouse events. */
export function useDragScroll(ref: RefObject<HTMLElement | null>, onActivity?: () => void) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let active = false;
    let dragging = false;
    let startY = 0;
    let startScroll = 0;
    let pointerId: number | null = null;

    const end = () => {
      if (!active) return;
      active = false;
      if (pointerId != null) {
        try {
          el.releasePointerCapture(pointerId);
        } catch {
          /* already released */
        }
      }
      pointerId = null;
      if (dragging) {
        el.classList.remove("drag-scrolling");
        const suppress = (ev: Event) => {
          ev.preventDefault();
          ev.stopPropagation();
        };
        el.addEventListener("click", suppress, true);
        window.setTimeout(() => el.removeEventListener("click", suppress, true), 0);
      }
      dragging = false;
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, a")) return;
      active = true;
      dragging = false;
      startY = e.clientY;
      startScroll = el.scrollTop;
      pointerId = e.pointerId;
    };

    const onMove = (e: PointerEvent) => {
      if (!active || pointerId !== e.pointerId) return;
      const dy = e.clientY - startY;
      if (!dragging) {
        if (Math.abs(dy) < 8) return;
        dragging = true;
        el.classList.add("drag-scrolling");
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        onActivity?.();
      }
      el.scrollTop = startScroll - dy;
      e.preventDefault();
    };

    const onUp = (e: PointerEvent) => {
      if (pointerId !== e.pointerId) return;
      end();
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      end();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [ref, onActivity]);
}
