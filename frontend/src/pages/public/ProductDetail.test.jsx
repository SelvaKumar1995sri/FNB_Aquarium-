import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import ProductDetail from "./ProductDetail";

vi.mock("../../api/client", () => ({
  apiClient: { get: vi.fn() },
}));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

vi.mock("../../context/CartContext", () => ({
  useCart: () => ({ addItem: vi.fn() }),
}));

const PRODUCT = {
  id: 16,
  name: "Rimless Tank 75L",
  slug: "rimless-tank-75l",
  category: 21,
  description: "",
  price: "199.99",
  in_stock: true,
  stock_quantity: 10,
  images: [],
};

const CATEGORIES = [{ id: 21, slug: "tank", name: "Tank", parent: null }];

function renderProductDetail() {
  return render(
    <MemoryRouter initialEntries={["/product/rimless-tank-75l"]}>
      <Routes>
        <Route path="/product/:slug" element={<ProductDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ProductDetail breadcrumb", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("links the breadcrumb back to the product's own category instead of a generic Products link", async () => {
    apiClient.get.mockImplementation((url) => {
      if (url === "/products/rimless-tank-75l/") return Promise.resolve({ data: PRODUCT });
      if (url === "/categories/") return Promise.resolve({ data: { results: CATEGORIES } });
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    renderProductDetail();

    const categoryLink = await screen.findByRole("link", { name: "Tank" });
    expect(categoryLink.getAttribute("href")).toBe("/category/tank");
    expect(screen.queryByRole("link", { name: "Products" })).toBeNull();
  });

  it("falls back to the generic Products breadcrumb if the product's category can't be resolved", async () => {
    apiClient.get.mockImplementation((url) => {
      if (url === "/products/rimless-tank-75l/") return Promise.resolve({ data: PRODUCT });
      if (url === "/categories/") return Promise.resolve({ data: { results: [] } });
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    renderProductDetail();

    const productsLink = await screen.findByRole("link", { name: "Products" });
    expect(productsLink.getAttribute("href")).toBe("/products");
  });
});
