import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ShareButton from "./ShareButton";

describe("ShareButton", () => {
  afterEach(() => {
    cleanup();
    delete navigator.share;
    delete navigator.clipboard;
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the Web Share API when the browser supports it", async () => {
    navigator.share = vi.fn().mockResolvedValue(undefined);
    navigator.clipboard = { writeText: vi.fn() };

    render(<ShareButton title="Filter Pump" url="https://fnbaqua.test/product/filter-pump" />);
    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() =>
      expect(navigator.share).toHaveBeenCalledWith({
        title: "Filter Pump",
        url: "https://fnbaqua.test/product/filter-pump",
      })
    );
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it("falls back to copying the link when the Web Share API is unavailable", async () => {
    delete navigator.share;
    navigator.clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };

    render(<ShareButton title="Filter Pump" url="https://fnbaqua.test/product/filter-pump" />);
    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://fnbaqua.test/product/filter-pump")
    );
    expect(await screen.findByText("Link copied!")).toBeTruthy();
  });

  it("reverts the copied confirmation back to the share label after a delay", async () => {
    delete navigator.share;
    navigator.clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };

    render(
      <ShareButton
        title="Filter Pump"
        url="https://fnbaqua.test/product/filter-pump"
        resetDelayMs={10}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    expect(await screen.findByText("Link copied!")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: /share/i }).textContent).toBe("Share"));
  });

  it("does not fall back to clipboard when the user cancels the native share sheet", async () => {
    navigator.share = vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError"));
    navigator.clipboard = { writeText: vi.fn() };

    render(<ShareButton title="Filter Pump" url="https://fnbaqua.test/product/filter-pump" />);
    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() => expect(navigator.share).toHaveBeenCalled());
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });
});
