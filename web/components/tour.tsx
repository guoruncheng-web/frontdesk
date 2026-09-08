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
    title: "12 张尚未阅读的工单",
    body: "这是您的独立演示空间，24 小时后自动清理。可以逐张分类，也可以一次处理全部待分类工单。",
  },
  {
    anchor: "classify",
    title: "观察一次实时分类",
    body: "模型生成的 JSON 会逐字流式显示，完成后展示类别、优先级和置信度。",
  },
  {
    anchor: "fault",
    title: "主动模拟异常",
    body: "模拟 JSON 损坏时，首次解析会真实失败，系统携带错误信息重新请求并恢复；模拟限流时则按服务商规则退避重试。",
  },
  {
    anchor: "cache",
    title: "同一工单再次分类",
    body: "第二次运行会命中缓存，成本为零；勾选“跳过缓存”可重新调用并对比。",
  },
  {
    anchor: "draft",
    title: "人工审核后才生效",
    body: "生成回复后可以任意修改，再点击审核通过。系统保存的是您修改后的文字，不是模型原文。",
  },
  {
    anchor: "meter",
    title: "实时查看调用成本",
    body: "每次调用按百万分之一美元记录并汇总，重试和失败也会计入，让成本数据可核验。",
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
            第 {index + 1} 步，共 {STEPS.length} 步
          </span>
          <button className="ghost tour-skip" onClick={finish} aria-label="跳过使用引导">
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
            上一步
          </button>
          <button className="primary" onClick={next}>
            {last ? "开始体验" : "下一步"}
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
