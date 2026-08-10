"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Dialog shell shared by every modal in the app.
 *
 * A modal that only *looks* modal is a keyboard trap in reverse: Tab walks
 * straight out of it and onto the page behind, which is still scrollable and
 * still clickable by assistive tech. This keeps focus inside while it is open,
 * closes on Escape, and hands focus back to whatever opened it.
 */
export function Modal({
  labelledBy,
  role = "dialog",
  onClose,
  children,
  as = "div",
  onSubmit,
}: {
  labelledBy: string;
  role?: "dialog" | "alertdialog";
  onClose: () => void;
  children: React.ReactNode;
  as?: "div" | "form";
  onSubmit?: (event: React.FormEvent) => void;
}) {
  const panel = useRef<HTMLDivElement | HTMLFormElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;

    // Focus the first control rather than the panel, so a keyboard user starts
    // where they can type instead of having to Tab in.
    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? (panel.current as HTMLElement | null))?.focus();

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !panel.current) return;

      const focusable = Array.from(
        panel.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      // Wrap at both ends; without this Tab escapes into the page behind.
      if (
        event.shiftKey &&
        (active === first || !panel.current.contains(active))
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, [onClose]);

  const panelProps = {
    className: "modal",
    role,
    "aria-modal": true,
    "aria-labelledby": labelledBy,
    ref: panel as never,
    tabIndex: -1,
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      {as === "form" ? (
        <form {...panelProps} onSubmit={onSubmit}>
          {children}
        </form>
      ) : (
        <div {...panelProps}>{children}</div>
      )}
    </div>
  );
}
