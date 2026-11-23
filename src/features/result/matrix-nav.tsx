import {
  createContext,
  useContext,
  type KeyboardEvent,
  type ReactNode,
  type ComponentProps,
} from "react";
import { Hint } from "./hint";

export interface MatrixNav {
  /** The one cell that is a tab stop: [row, column]. */
  active: readonly [number, number];
  setActive: (cell: readonly [number, number]) => void;
  rows: number;
  columns: number;
}

const NavContext = createContext<MatrixNav | null>(null);
export const MatrixNavProvider = NavContext.Provider;

const KEYS: Record<string, readonly [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

/**
 * The button inside an amount cell that opens its breakdown. The cells form one tab stop
 * (roving tabindex): Tab enters the cells once, the arrow keys move between them, Home and End
 * jump to the ends of the row. The breakdown opens on focus, hover and tap, and Escape closes it.
 */
export function CellButton({
  row,
  column,
  breakdown,
  children,
  ...props
}: {
  row: number;
  column: number;
  breakdown: ReactNode;
} & Omit<ComponentProps<"button">, "type" | "tabIndex">) {
  const nav = useContext(NavContext);
  const active = nav ? nav.active[0] === row && nav.active[1] === column : true;

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!nav) return;
    let target: [number, number] | null = null;
    const step = KEYS[event.key];
    if (step) {
      target = [
        Math.min(nav.rows - 1, Math.max(0, row + step[0])),
        Math.min(nav.columns - 1, Math.max(0, column + step[1])),
      ];
    } else if (event.key === "Home") target = [row, 0];
    else if (event.key === "End") target = [row, nav.columns - 1];
    if (!target) return;
    event.preventDefault();
    const table = event.currentTarget.closest("table");
    table?.querySelector<HTMLElement>(`[data-mcell="${target[0]}:${target[1]}"]`)?.focus();
  };

  return (
    <Hint content={breakdown}>
      <button
        {...props}
        type="button"
        tabIndex={active ? 0 : -1}
        data-mcell={`${row}:${column}`}
        onFocus={() => nav?.setActive([row, column])}
        onKeyDown={onKeyDown}
      >
        {children}
      </button>
    </Hint>
  );
}
