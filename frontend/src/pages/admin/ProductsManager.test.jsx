import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import ProductsManager from "./ProductsManager";

vi.mock("../../api/client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const CATEGORY = { id: 1, name: "Fish" };

function mockInitialLoad() {
  apiClient.get.mockImplementation((url) => {
    if (url === "/products/") return Promise.resolve({ data: { results: [] } });
    if (url === "/categories/") return Promise.resolve({ data: { results: [CATEGORY] } });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

async function fillAndSubmit({ name = "Discus", slug = "discus", price = "100", stock = "10" } = {}) {
  fireEvent.change(screen.getByPlaceholderText("Name"), { target: { value: name } });
  fireEvent.change(screen.getByPlaceholderText("Slug"), { target: { value: slug } });
  fireEvent.change(screen.getByRole("combobox"), { target: { value: String(CATEGORY.id) } });
  fireEvent.change(screen.getByPlaceholderText("Price"), { target: { value: price } });
  fireEvent.change(screen.getByPlaceholderText("Stock quantity"), { target: { value: stock } });
  fireEvent.click(screen.getByRole("button", { name: /add product/i }));
  await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
}

describe("ProductsManager — duplicate-product restock flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInitialLoad();
  });

  afterEach(() => cleanup());

  it("creates a product normally when there is no name/category conflict", async () => {
    apiClient.post.mockResolvedValueOnce({ data: {} });
    render(<ProductsManager />);
    await screen.findByRole("combobox");

    await fillAndSubmit();

    expect(apiClient.post).toHaveBeenCalledWith(
      "/products/",
      expect.objectContaining({ name: "Discus", slug: "discus", stock_quantity: 10 })
    );
  });

  it("shows a confirm dialog on a 409 and restocks the existing product when confirmed", async () => {
    const existing = { slug: "discus", name: "Discus", category_name: "Fish", stock_quantity: 5 };
    apiClient.post.mockImplementation((url) => {
      if (url === "/products/") {
        return Promise.reject({ response: { status: 409, data: { existing_product: existing } } });
      }
      if (url === `/products/${existing.slug}/add-stock/`) {
        return Promise.resolve({ data: { ...existing, stock_quantity: 15 } });
      }
      return Promise.reject(new Error(`unexpected POST ${url}`));
    });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<ProductsManager />);
    await screen.findByRole("combobox");
    await fillAndSubmit({ stock: "10" });

    expect(confirmSpy).toHaveBeenCalledWith(
      'A product named "Discus" already exists in Fish with 5 in stock. Add 10 more to make 15?'
    );
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(`/products/${existing.slug}/add-stock/`, { quantity: 10 })
    );
  });

  it("does nothing further when the duplicate confirm is cancelled", async () => {
    const existing = { slug: "discus", name: "Discus", category_name: "Fish", stock_quantity: 5 };
    apiClient.post.mockImplementation((url) => {
      if (url === "/products/") {
        return Promise.reject({ response: { status: 409, data: { existing_product: existing } } });
      }
      return Promise.reject(new Error(`unexpected POST ${url}`));
    });
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<ProductsManager />);
    await screen.findByRole("combobox");
    await fillAndSubmit({ stock: "10" });

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
    expect(screen.getByPlaceholderText("Name").value).toBe("Discus");
  });

  it("shows an error if the add-stock call itself fails after confirming", async () => {
    const existing = { slug: "discus", name: "Discus", category_name: "Fish", stock_quantity: 5 };
    apiClient.post.mockImplementation((url) => {
      if (url === "/products/") {
        return Promise.reject({ response: { status: 409, data: { existing_product: existing } } });
      }
      if (url === `/products/${existing.slug}/add-stock/`) {
        return Promise.reject({ response: { data: { detail: "Something went wrong." } } });
      }
      return Promise.reject(new Error(`unexpected POST ${url}`));
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<ProductsManager />);
    await screen.findByRole("combobox");
    await fillAndSubmit({ stock: "10" });

    expect(await screen.findByText("Something went wrong.")).toBeTruthy();
  });

  it("shows a clear error without prompting when the entered quantity is not positive", async () => {
    const existing = { slug: "discus", name: "Discus", category_name: "Fish", stock_quantity: 5 };
    apiClient.post.mockImplementation((url) => {
      if (url === "/products/") {
        return Promise.reject({ response: { status: 409, data: { existing_product: existing } } });
      }
      return Promise.reject(new Error(`unexpected POST ${url}`));
    });
    const confirmSpy = vi.spyOn(window, "confirm");

    render(<ProductsManager />);
    await screen.findByRole("combobox");
    await fillAndSubmit({ stock: "0" });

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(
      await screen.findByText(
        'A product named "Discus" already exists in Fish. Enter a positive stock quantity to add to its existing 5 in stock.'
      )
    ).toBeTruthy();
  });
});
