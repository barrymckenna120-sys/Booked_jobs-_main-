import { useCallback, useEffect, useRef, useState } from "react";

interface ScrollRowProps {
  children: React.ReactNode;
  /** Extra classes for the inner scrolling track (spacing, padding). */
  className?: string;
  /** Extra classes for the outer wrapper (margins, borders). */
  wrapperClassName?: string;
}

/**
 * Horizontal scroller with edge fades that appear only when there is more
 * content in that direction, so cut-off chips/tabs read as "swipe for more"
 * instead of looking broken. Shared by the Jobs filter chips and the Settings
 * tab strip.
 */
const ScrollRow = ({ children, className = "", wrapperClassName = "" }: ScrollRowProps) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setEdges({
      left: el.scrollLeft > 4,
      right: maxScroll > 4 && el.scrollLeft < maxScroll - 4,
    });
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return;
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, children]);

  return (
    <div className={`relative min-w-0 ${wrapperClassName}`}>
      <div
        ref={ref}
        onScroll={measure}
        className={`flex overflow-x-auto no-scrollbar ${className}`}
      >
        {children}
      </div>
      {edges.left && (
        <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent" />
      )}
      {edges.right && (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent" />
      )}
    </div>
  );
};

export default ScrollRow;
