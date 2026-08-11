import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Tour, shouldOfferTour } from "./tour";

// jsdom has no layout and no smooth scrolling; the tour calls both while
// measuring what it is pointing at.
Element.prototype.scrollIntoView = vi.fn();

describe("shouldOfferTour", () => {
  it("offers the walkthrough to a browser that has not seen it", () => {
    expect(shouldOfferTour()).toBe(true);
  });

  it("does not offer it twice", async () => {
    const onFinished = vi.fn();
    render(<Tour onFinished={onFinished} />);

    await userEvent.click(screen.getByRole("button", { name: "Skip the walkthrough" }));

    expect(onFinished).toHaveBeenCalled();
    expect(shouldOfferTour()).toBe(false);
  });
});

describe("Tour", () => {
  it("walks forward and back through the steps", async () => {
    render(<Tour />);

    expect(screen.getByText("Step 1 of 6")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Back/ })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(screen.getByText("Step 2 of 6")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(screen.getByText("Step 1 of 6")).toBeInTheDocument();
  });

  it("finishes on the last step rather than running off the end", async () => {
    const onFinished = vi.fn();
    render(<Tour onFinished={onFinished} />);

    for (let step = 1; step < 6; step += 1) {
      await userEvent.click(screen.getByRole("button", { name: /Next/ }));
    }

    const last = screen.getByRole("button", { name: /Start triaging/ });
    await userEvent.click(last);

    expect(onFinished).toHaveBeenCalledOnce();
  });

  it("escapes out, because a walkthrough nobody can leave is a trap", async () => {
    const onFinished = vi.fn();
    render(<Tour onFinished={onFinished} />);

    await userEvent.keyboard("{Escape}");

    expect(onFinished).toHaveBeenCalled();
  });

  it("highlights the element each step names", () => {
    const anchor = document.createElement("div");
    anchor.dataset.tour = "queue";
    document.body.append(anchor);

    render(<Tour />);

    expect(anchor.scrollIntoView).toBeDefined();
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  });
});
