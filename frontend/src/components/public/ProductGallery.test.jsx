import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import ProductGallery from "./ProductGallery";

const IMAGES = [
  { id: 1, image: "/media/products/a.jpg", alt_text: "" },
  { id: 2, image: "/media/products/b.jpg", alt_text: "Side view" },
  { id: 3, image: "/media/products/c.jpg", alt_text: "" },
];

describe("ProductGallery", () => {
  afterEach(() => cleanup());

  it("renders nothing when there are no images", () => {
    const { container } = render(<ProductGallery images={[]} productName="Filter Pump" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a single image with no thumbnail strip when only one image exists", () => {
    render(<ProductGallery images={[IMAGES[0]]} productName="Filter Pump" />);

    expect(screen.getByRole("img", { name: "Filter Pump" }).getAttribute("src")).toBe("/media/products/a.jpg");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("shows the first image as the main image and a thumbnail per image when there are multiple", () => {
    render(<ProductGallery images={IMAGES} productName="Filter Pump" />);

    expect(screen.getByRole("img", { name: "Filter Pump" }).getAttribute("src")).toBe("/media/products/a.jpg");
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("switches the main image when a thumbnail is clicked", () => {
    render(<ProductGallery images={IMAGES} productName="Filter Pump" />);

    fireEvent.click(screen.getByRole("button", { name: /image 2 of 3/i }));

    expect(screen.getByRole("img", { name: "Side view" }).getAttribute("src")).toBe("/media/products/b.jpg");
  });

  it("marks the currently selected thumbnail as current", () => {
    render(<ProductGallery images={IMAGES} productName="Filter Pump" />);

    const secondThumbnail = screen.getByRole("button", { name: /image 2 of 3/i });
    fireEvent.click(secondThumbnail);

    expect(secondThumbnail.getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("button", { name: /image 1 of 3/i }).getAttribute("aria-current")).toBe("false");
  });
});
