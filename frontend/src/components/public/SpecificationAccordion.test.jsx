import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import SpecificationAccordion from "./SpecificationAccordion";

describe("SpecificationAccordion", () => {
  it("renders nothing when content is empty", () => {
    const { container } = render(<SpecificationAccordion content="" />);
    expect(container.firstChild).toBeNull();
  });

  it("is collapsed by default", () => {
    render(<SpecificationAccordion content="Some spec text" />);
    expect(screen.queryByText("Some spec text")).toBeNull();
  });

  it("shows the content after clicking the toggle", () => {
    render(<SpecificationAccordion content="Some spec text" />);
    fireEvent.click(screen.getByText("SPECIFICATION"));
    expect(screen.getByText("Some spec text")).toBeTruthy();
  });

  it("hides the content again after clicking twice", () => {
    render(<SpecificationAccordion content="Some spec text" />);
    const toggle = screen.getByText("SPECIFICATION");
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(screen.queryByText("Some spec text")).toBeNull();
  });
});
