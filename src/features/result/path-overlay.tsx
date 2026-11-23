import { useLayoutEffect, useRef, type RefObject } from "react";

/** Selector of the dot marking the optimal path's cell in each month. */
export const PATH_DOT = "data-path-dot";

/**
 * Draws a line through the optimal-path dots of the matrix: horizontal along the bottom of the
 * cells, vertical on the column boundary where the path changes the tariff. Drawn after layout
 * and on every resize; in environments without layout nothing is drawn and the dots stand alone.
 */
export function PathOverlay({
  containerRef,
  version,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  /** Changes whenever the path or the table content changes. */
  version: string;
}) {
  const pathRef = useRef<SVGPathElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const path = pathRef.current;
    if (!container || !path) return;
    const draw = () => {
      const origin = container.getBoundingClientRect();
      const points = [...container.querySelectorAll<HTMLElement>(`[${PATH_DOT}]`)]
        .map((dot) => {
          const r = dot.getBoundingClientRect();
          return {
            index: Number(dot.getAttribute(PATH_DOT)),
            x: r.left + r.width / 2 - origin.left,
            y: r.top + r.height / 2 - origin.top,
          };
        })
        .filter((p) => p.x !== 0 || p.y !== 0)
        .sort((a, b) => a.index - b.index);
      let d = "";
      points.forEach((p, i) => {
        const prev = points[i - 1];
        if (!prev) {
          d += `M${p.x} ${p.y}`;
        } else if (prev.y === p.y) {
          d += `H${p.x}`;
        } else {
          const mid = (prev.x + p.x) / 2;
          d += `H${mid}V${p.y}H${p.x}`;
        }
      });
      path.setAttribute("d", d);
    };
    draw();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(draw);
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, version]);

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 size-full overflow-visible"
    >
      <path
        ref={pathRef}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        className="text-foreground/45"
      />
    </svg>
  );
}
