import { useEffect, useState } from "react";

export default function useResizeObserver<T extends HTMLElement>(
  elementRef: React.RefObject<T>,
) {
  const [rect, setRect] = useState<DOMRect | undefined>();

  useEffect(() => {
    const el = elementRef.current;
    if (!el) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setRect(entry.contentRect as DOMRect);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [elementRef]);

  return rect;
}
