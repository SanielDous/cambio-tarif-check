import { useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import { Slot } from "@radix-ui/react-slot";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

/**
 * A tooltip that also works on touch screens: it opens on hover, on keyboard focus and on tap,
 * and closes on leave, blur, Escape or a tap elsewhere. The text is linked to the trigger with
 * `aria-describedby`, so screen readers announce it without opening anything.
 */
export function Hint({
  content,
  children,
  side = "top",
}: {
  content: ReactNode;
  /** A single focusable element, usually a button. */
  children: ReactElement;
  side?: "top" | "bottom" | "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const anchorRef = useRef<HTMLElement>(null);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Slot
          ref={anchorRef}
          aria-describedby={id}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onClick={() => setOpen(true)}
        >
          {children}
        </Slot>
      </PopoverAnchor>
      <span id={id} hidden>
        {content}
      </span>
      <PopoverContent
        side={side}
        role="tooltip"
        className="w-auto max-w-72 px-3 py-2 text-xs leading-relaxed"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        // Focus or a click on the trigger itself is not "outside": keyboard focus must keep the
        // text open (the trigger's own blur, leave and Escape close it).
        onInteractOutside={(event) => {
          if (event.target instanceof Node && anchorRef.current?.contains(event.target)) {
            event.preventDefault();
          }
        }}
      >
        {content}
      </PopoverContent>
    </Popover>
  );
}
