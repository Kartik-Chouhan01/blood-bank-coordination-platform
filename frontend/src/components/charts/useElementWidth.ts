import { useEffect, useRef, useState } from 'react';

/**
 * Measures an element's width so charts draw at real pixel size (text stays legible on phones
 * instead of shrinking with a scaled viewBox). Falls back to `fallback` where ResizeObserver is
 * unavailable (e.g. tests).
 */
export function useElementWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(240, Math.floor(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}
