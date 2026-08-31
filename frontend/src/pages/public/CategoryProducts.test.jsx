import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import CategoryProducts from "./CategoryProducts";

vi.mock("../../api/client", () => ({
  apiClient: { get: vi.fn() },
}));

const CATEGORIES = [
  { id: 1, slug: "tank", name: "Tank", parent: null },
  { id: 2, slug: "marine", name: "Marine", parent: null },
];

function renderAt(path, routePath, props) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={routePath} element={<CategoryProducts {...props} />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("CategoryProducts", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("does not show the 'no products' message on the generic /products page, which only browses categories", async () => {
    apiClient.get.mockResolvedValueOnce({ data: { results: CATEGORIES } });

    renderAt("/products", "/products", { title: "Products" });

    expect(await screen.findByText("Tank")).toBeTruthy();
    expect(screen.queryByText("No products in this category yet.")).toBeNull();
    expect(apiClient.get).not.toHaveBeenCalledWith("/products/", expect.anything());
  });

  it("shows the 'no products' message when a selected category genuinely has none", async () => {
    apiClient.get.mockImplementation((url) => {
      if (url === "/categories/") return Promise.resolve({ data: { results: CATEGORIES } });
      if (url === "/products/") return Promise.resolve({ data: { results: [] } });
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    renderAt("/category/tank", "/category/:slug", {});

    expect(await screen.findByText("No products in this category yet.")).toBeTruthy();
  });
});
