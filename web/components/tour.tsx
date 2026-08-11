"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

/**
 * A first-run walkthrough of the console.
 *
 * A visitor arriving from a portfolio link has no idea what any of this is.
 * They see twelve tickets and a row of dropdowns, and the parts worth showing —
 * that a corrupt response is recovered from, that the second classification of
 * the same ticket costs nothing — are the ones nobody finds by guessing. The
 * tour points at each control in the order a person would use it, and gets out
 * of the way for good once it has been seen.
 *
 * It highlights real elements rather than describing them, so what is being
 * talked about is never ambiguous, and every step is skippable from the first
 * frame.
 */

const SEEN_KEY = "frontdesk.tour.v1";

type Step = {
  /** Matches a `data-tour` attribute on the element being pointed at. */
  anchor: string;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    anchor: "queue",
    title: "Twelve tickets, none of them read",
    body: "This inbox is yours alone and disappears after a day. Classify them one at a time below, or press Triage to work the whole queue.",
  },
  {
    anchor: "classify",
    title: "Classify one and watch it happen",
    body: "The model's JSON streams in token by token, then the category, priority and confidence land underneath it.",
  },
  {
    anchor: "fault",
    title: "Now break it on purpose",
    body: "Corrupt the model's JSON and the first attempt fails with the real parser error, then it is re-asked with the complaint attached and recovers. Rate-limit it and the backoff obeys the provider.",
  },
  {
    anchor: "cache",
    title: "Classify the same ticket twice",
    body: "The second run is served from cache at no cost. Tick Skip cache to pay again and compare.",
  },
  {
    anchor: "draft",
    title: "Nothing is sent without you",
    body: "Draft a reply, edit it however you like, then approve. What gets stored is your text, not the model's.",
  },
  {
    anchor: "meter",
    title: "The bill, as it happens",
    body: "Every call is recorded in millionths of a dollar and summed here — retries and failures included, because a cost panel without them is lying.",
  },
];

function target(step: Step): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`);
}

export function Tour({ onFinished }: { onFinished?: () => void }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const step = STEPS[index];

  const finish = useCallback(() => {
    try {
      window.localStorage.setItem(SEEN_KEY, "seen");
    } catch {
      // A browser refusing storage is not a reason to trap someone in the tour.
    }
    onFinished?.();
  }, [onFinished]);

  // Measure the highlighted element, and keep the highlight on it while the
  // page moves underneath — scrolling a step into view is itself a scroll.
  useLayoutEffect(() => {
    const element = target(step);
    if (!element) {
      setRect(null);
      return;
    }

    element.scrollIntoView({ block: "center", behavior: "smooth" });

    const measure = () => setRect(element.getBoundingClientRect());
    measure();

    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const timer = window.setInterval(measure, 250);

    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.clearInterval(timer);
    };
  }, [step]);

  useEffect(() => {
    cardRef.current?.focus();
  }, [index]);

  const next = useCallback(() => {
    setIndex((current) => {
      if (current + 1 >= STEPS.length) {
        finish();
        return current;
      }
      return current + 1;
    });
  }, [finish]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
      else if (event.key === "ArrowRight") next();
      else if (event.key === "ArrowLeft") setIndex((current) => Math.max(0, current - 1));
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish, next]);

  const last = index === STEPS.length - 1;

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {/* The scrim is one element with a hole in it: a huge spread shadow around
          the target beats four positioned panels and stays put while it moves. */}
      <div
        className="tour-scrim"
        style={
          rect
            ? { top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }
            : { top: "50%", left: "50%", width: 0, height: 0 }
        }
        onClick={finish}
      />

      <div className="tour-card" ref={cardRef} tabIndex={-1} style={cardPosition(rect)}>
        <div className="tour-card-head">
          <span className="label">
            Step {index + 1} of {STEPS.length}
          </span>
          <button className="ghost tour-skip" onClick={finish} aria-label="Skip the walkthrough">
            <X size={14} />
          </button>
        </div>

        <h3 id="tour-title">{step.title}</h3>
        <p>{step.body}</p>

        <div className="tour-actions">
          <button
            className="ghost"
            onClick={() => setIndex((current) => Math.max(0, current - 1))}
            disabled={index === 0}
          >
            <ChevronLeft size={14} />
            Back
          </button>
          <button className="primary" onClick={next}>
            {last ? "Start triaging" : "Next"}
            {!last && <ChevronRight size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Puts the card under the highlighted element, or above it when there is no
 * room below, and keeps it inside the viewport either way. Below 720px the
 * card is pinned to the bottom of the screen by CSS instead — there is no
 * useful "beside" on a phone.
 */
function cardPosition(rect: DOMRect | null): React.CSSProperties {
  if (!rect || typeof window === "undefined") return {};

  const CARD_WIDTH = 340;
  const GAP = 14;
  const below = window.innerHeight - rect.bottom;
  const placeBelow = below > 220 || below > rect.top;

  const left = Math.min(
    Math.max(GAP, rect.left + rect.width / 2 - CARD_WIDTH / 2),
    Math.max(GAP, window.innerWidth - CARD_WIDTH - GAP),
  );

  return placeBelow
    ? { top: rect.bottom + GAP, left }
    : { bottom: window.innerHeight - rect.top + GAP, left };
}

/** True when this browser has not been walked through the console yet. */
export function shouldOfferTour(): boolean {
  try {
    return !window.localStorage.getItem(SEEN_KEY);
  } catch {
    return false;
  }
}
