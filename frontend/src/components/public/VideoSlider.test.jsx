import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VideoSlider from "./VideoSlider";

const videos = [
  { id: 1, title: "Video 1", thumbnail_url: "/1.jpg", youtube_url: "https://youtube.com/watch?v=1" },
  { id: 2, title: "Video 2", thumbnail_url: "/2.jpg", youtube_url: "https://youtube.com/watch?v=2" },
  { id: 3, title: "Video 3", thumbnail_url: "/3.jpg", youtube_url: "https://youtube.com/watch?v=3" },
];

beforeEach(() => {
  Element.prototype.setPointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete Element.prototype.setPointerCapture;
});

function renderSlider() {
  const { container } = render(<VideoSlider videos={videos} />);
  return container.firstChild;
}

describe("VideoSlider", () => {
  it("renders one link for the active tile and one button per inactive tile", () => {
    renderSlider();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getAllByRole("button")).toHaveLength(videos.length - 1);
  });

  it("still renders one tile per video after the layout-animation wrapper is added", () => {
    renderSlider();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getAllByRole("button")).toHaveLength(videos.length - 1);
  });

  it("does not capture the pointer on a plain click with no movement", () => {
    const root = renderSlider();
    fireEvent.pointerDown(root, { clientX: 100, pointerId: 1 });
    fireEvent.pointerUp(root, { clientX: 100, pointerId: 1 });
    expect(Element.prototype.setPointerCapture).not.toHaveBeenCalled();
  });

  it("captures the pointer once, only after real dragging crosses the move threshold", () => {
    const root = renderSlider();
    fireEvent.pointerDown(root, { clientX: 100, pointerId: 1, buttons: 1 });
    fireEvent.pointerMove(root, { clientX: 80, pointerId: 1, buttons: 1 });
    expect(Element.prototype.setPointerCapture).toHaveBeenCalledTimes(1);
    fireEvent.pointerMove(root, { clientX: 60, pointerId: 1, buttons: 1 });
    expect(Element.prototype.setPointerCapture).toHaveBeenCalledTimes(1);
  });

  it("clicking an inactive thumbnail brings it to center with the correct video", () => {
    renderSlider();
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[1]);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe(videos[1].youtube_url);
    expect(link.textContent).toContain("Video 2");
  });

  it("does not block navigation when the active tile receives a genuine tap", () => {
    renderSlider();
    const link = screen.getByRole("link");
    const notPrevented = fireEvent.click(link, { detail: 1 });
    expect(notPrevented).toBe(true);
  });

  it("blocks navigation when a mouse click follows an in-place drag on the active tile", () => {
    const root = renderSlider();
    fireEvent.pointerDown(root, { clientX: 100, pointerId: 1, buttons: 1 });
    fireEvent.pointerMove(root, { clientX: 80, pointerId: 1, buttons: 1 });
    fireEvent.pointerUp(root, { clientX: 80, pointerId: 1 });
    const link = screen.getByRole("link");
    const notPrevented = fireEvent.click(link, { detail: 1 });
    expect(notPrevented).toBe(false);
  });

  it("ignores a phantom mouse click on an inactive tile that follows a completed drag", () => {
    const root = renderSlider();
    fireEvent.pointerDown(root, { clientX: 100, pointerId: 1, buttons: 1 });
    fireEvent.pointerMove(root, { clientX: 40, pointerId: 1, buttons: 1 });
    fireEvent.pointerUp(root, { clientX: 40, pointerId: 1 });
    const activeHrefAfterDrag = screen.getByRole("link").getAttribute("href");
    expect(activeHrefAfterDrag).toBe(videos[1].youtube_url);

    const buttonsAfterDrag = screen.getAllByRole("button");
    fireEvent.click(buttonsAfterDrag[0], { detail: 1 });
    expect(screen.getByRole("link").getAttribute("href")).toBe(activeHrefAfterDrag);
  });

  it("does not swallow a keyboard-triggered click even if a drag left the moved flag set", () => {
    const root = renderSlider();
    fireEvent.pointerDown(root, { clientX: 100, pointerId: 1, buttons: 1 });
    fireEvent.pointerMove(root, { clientX: 40, pointerId: 1, buttons: 1 });
    fireEvent.pointerUp(root, { clientX: 40, pointerId: 1 });
    const buttonsAfterDrag = screen.getAllByRole("button");
    fireEvent.click(buttonsAfterDrag[0], { detail: 0 });
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe(videos[0].youtube_url);
  });

  it("resets a stuck drag state when the pointer moves with no button held", () => {
    const root = renderSlider();
    fireEvent.pointerDown(root, { clientX: 100, pointerId: 1, buttons: 1 });
    fireEvent.pointerMove(root, { clientX: 50, pointerId: 1, buttons: 0 });
    expect(Element.prototype.setPointerCapture).not.toHaveBeenCalled();
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[1]);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe(videos[1].youtube_url);
  });

  it("keeps rel=noopener noreferrer and target=_blank on the active tile's link", () => {
    renderSlider();
    const link = screen.getByRole("link");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });
});
