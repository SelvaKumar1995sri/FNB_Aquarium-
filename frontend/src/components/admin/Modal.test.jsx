import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Modal from "./Modal";

describe("Modal", () => {
  afterEach(() => cleanup());

  it("renders the title and children", () => {
    render(
      <Modal title="New Category" onClose={() => {}}>
        <p>form goes here</p>
      </Modal>
    );
    expect(screen.getByText("New Category")).toBeTruthy();
    expect(screen.getByText("form goes here")).toBeTruthy();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal title="New Category" onClose={onClose}>
        <p>content</p>
      </Modal>
    );
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal title="New Category" onClose={onClose}>
        <p>content</p>
      </Modal>
    );
    fireEvent.click(screen.getByTestId("modal-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when the panel itself is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal title="New Category" onClose={onClose}>
        <p>content</p>
      </Modal>
    );
    fireEvent.click(screen.getByText("content"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(
      <Modal title="New Category" onClose={onClose}>
        <p>content</p>
      </Modal>
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
