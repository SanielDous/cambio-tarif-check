/** "auto" for users who prefer reduced motion, otherwise "smooth"; for programmatic scrolling. */
export function scrollBehavior(): ScrollBehavior {
  const reduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return reduced ? "auto" : "smooth";
}
