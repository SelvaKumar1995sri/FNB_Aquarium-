import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import ProductsManager from "./ProductsManager";

vi.mock("../../api/client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const CATEGORY = { id: 1, name: "Fish", parent: null };

const PRODUCT = {
  id: 1,
  name: "Discus",
  slug: "discus",
  category: 1,
  price: "100",
  stock_quantity: 10,
  in_stock: true,
  images: [{ id: 1, image: "https://example.com/discus.jpg", alt_text: "Discus" }],
};

function mockInitialLoad(products = []) {
  apiClient.get.mockImplementation((url) => {
    if (url === "/products/") return Promise.resolve({ data: { results: products } });
    if (url === "/categories/") return Promise.resolve({ data: { results: [CATEGORY] } });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

async function openForm() {
  fireEvent.click(screen.getByRole("button", { name: /new product/i }));
  await screen.findByRole("combobox");
}

async function fillAndSubmit({
  name = "Discus",
  slug = "discus",
  price = "100",
  stock = "10",
  note,
  specification,
} = {}) {
  await openForm();
  fireEvent.change(screen.getByPlaceholderText("Name"), { target: { value: name } });
  fireEvent.change(screen.getByPlaceholderText("Slug"), { target: { value: slug } });
  fireEvent.change(screen.getByRole("combobox"), { target: { value: String(CATEGORY.id) } });
  fireEvent.change(screen.getByPlaceholderText("Price"), { target: { value: price } });
  fireEvent.change(screen.getByPlaceholderText("Stock quantity"), { target: { value: stock } });
  if (note !== undefined) {
    fireEvent.change(screen.getByPlaceholderText("Note (optional, e.g. 'Free home delivery')"), {
      target: { value: note },
    });
  }
  if (specification !== undefined) {
    fireEvent.change(screen.getByPlaceholderText("Specification (optional)"), {
      target: { value: specification },
    });
  }
  fireEvent.click(screen.getByRole("button", { name: /add product/i }));
  await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
}

describe("ProductsManager — list + modal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInitialLoad();
  });

  afterEach(() => cleanup());

  it("shows the list without a form until 'New Product' is clicked", async () => {
    render(<ProductsManager />);
    await screen.findByRole("button", { name: /new product/i });
    expect(screen.queryByPlaceholderText("Name")).toBeNull();

    await openForm();

    expect(screen.getByPlaceholderText("Name")).toBeTruthy();
  });

  it("creates a product and shows a success popup", async () => {
    apiClient.post.mockResolvedValueOnce({ data: {} });
    render(<ProductsManager />);
    await screen.findByRole("button", { name: /new product/i });

    await fillAndSubmit();

    expect(await screen.findByText(/product created/i)).toBeTruthy();
    expect(screen.queryByPlaceholderText("Name")).toBeNull();
  });

  it("shows a page-level error when deleting fails", async () => {
    mockInitialLoad([PRODUCT]);
    apiClient.delete.mockRejectedValueOnce({ response: { data: { detail: "Cannot delete." } } });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ProductsManager />);
    await screen.findByText("Discus");

    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => expect(apiClient.delete).toHaveBeenCalledWith("/products/discus/"));
    expect(await screen.findByText("Cannot delete.")).toBeTruthy();
    expect(screen.queryByText(/product deleted/i)).toBeNull();
  });

  it("shows a page-level error when an image upload fails", async () => {
    mockInitialLoad([PRODUCT]);
    apiClient.post.mockImplementation((url) => {
      if (url === "/product-images/") {
        return Promise.reject({ response: { data: { detail: "Image too large." } } });
      }
      return Promise.reject(new Error(`unexpected POST ${url}`));
    });
    render(<ProductsManager />);
    await screen.findByText("Discus");

    const file = new File(["contents"], "photo.png", { type: "image/png" });
    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith("/product-images/", expect.anything()));
    expect(await screen.findByText("Image too large.")).toBeTruthy();
  });

  it("shows a page-level error when an image delete fails", async () => {
    mockInitialLoad([PRODUCT]);
    apiClient.delete.mockRejectedValueOnce({ response: { data: { detail: "Cannot delete image." } } });
    render(<ProductsManager />);
    await screen.findByText("Discus");

    fireEvent.click(screen.getByRole("button", { name: "Delete image" }));

    await waitFor(() => expect(apiClient.delete).toHaveBeenCalledWith("/product-images/1/"));
    expect(await screen.findByText("Cannot delete image.")).toBeTruthy();
  });
});

describe("ProductsManager — note and specification fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInitialLoad();
  });

  afterEach(() => cleanup());

  it("submits the typed note and specification in the create payload", async () => {
    apiClient.post.mockResolvedValueOnce({ data: {} });
    render(<ProductsManager />);
    await screen.findByRole("button", { name: /new product/i });

    await fillAndSubmit({ note: "Free home delivery", specification: "- Tank size: 20L" });

    expect(apiClient.post).toHaveBeenCalledWith(
      "/products/",
      expect.objectContaining({ note: "Free home delivery", specification: "- Tank size: 20L" })
    );
  });

  it("creates a product successfully when note and specification are left blank", async () => {
    apiClient.post.mockResolvedValueOnce({ data: {} });
    render(<ProductsManager />);
    await screen.findByRole("button", { name: /new product/i });

    await fillAndSubmit();

    expect(apiClient.post).toHaveBeenCalledWith(
      "/products/",
      expect.objectContaining({ note: "", specification: "" })
    );
    expect(await screen.findByText(/product created/i)).toBeTruthy();
  });

  it("pre-fills the note and specification textareas when editing an existing product", async () => {
    const productWithNoteAndSpec = {
      ...PRODUCT,
      note: "Free home delivery",
      specification: "- Tank size: 20L",
    };
    mockInitialLoad([productWithNoteAndSpec]);
    render(<ProductsManager />);
    await screen.findByText("Discus");

    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));

    expect(
      await screen.findByPlaceholderText("Note (optional, e.g. 'Free home delivery')")
    ).toHaveProperty("value", "Free home delivery");
    expect(screen.getByPlaceholderText("Specification (optional)")).toHaveProperty(
      "value",
      "- Tank size: 20L"
    );
  });
});

describe("ProductsManager — duplicate-product restock flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInitialLoad();
  });

  afterEach(() => cleanup());

  it("creates a product normally when there is no name/category conflict", async () => {
    apiClient.post.mockResolvedValueOnce({ data: {} });
    render(<ProductsManager />);
    await screen.findByRole("button", { name: /new product/i });

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
    await screen.findByRole("button", { name: /new product/i });
    await fillAndSubmit({ stock: "10" });

    expect(confirmSpy).toHaveBeenCalledWith(
      'A product named "Discus" already exists in Fish with 5 in stock. Add 10 more to make 15?'
    );
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(`/products/${existing.slug}/add-stock/`, { quantity: 10 })
    );
    expect(await screen.findByText(/stock added/i)).toBeTruthy();
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
    await screen.findByRole("button", { name: /new product/i });
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
    await screen.findByRole("button", { name: /new product/i });
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
    await screen.findByRole("button", { name: /new product/i });
    await fillAndSubmit({ stock: "0" });

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(
      await screen.findByText(
        'A product named "Discus" already exists in Fish. Enter a positive stock quantity to add to its existing 5 in stock.'
      )
    ).toBeTruthy();
  });
});
