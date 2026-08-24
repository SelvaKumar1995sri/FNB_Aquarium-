import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import CategoriesManager from "./CategoriesManager";

vi.mock("../../api/client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const FISH = { id: 1, name: "Fish", slug: "fish", parent: null };
const CICHLID = { id: 2, name: "Cichlid", slug: "cichlid", parent: 1 };

function mockInitialLoad(categories = [FISH, CICHLID]) {
  apiClient.get.mockImplementation((url) => {
    if (url === "/categories/") return Promise.resolve({ data: { results: categories } });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

describe("CategoriesManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInitialLoad();
  });

  afterEach(() => cleanup());

  it("shows the list without a form until 'New Category' is clicked", async () => {
    render(<CategoriesManager />);
    expect(await screen.findByText("fish")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Name")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /new category/i }));

    expect(screen.getByPlaceholderText("Name")).toBeTruthy();
  });

  it("creates a category and shows a success popup", async () => {
    apiClient.post.mockResolvedValueOnce({ data: {} });
    render(<CategoriesManager />);
    await screen.findByText("fish");

    fireEvent.click(screen.getByRole("button", { name: /new category/i }));
    fireEvent.change(screen.getByPlaceholderText("Name"), { target: { value: "Plants" } });
    fireEvent.change(screen.getByPlaceholderText("Slug"), { target: { value: "plants" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    expect(await screen.findByText(/category created/i)).toBeTruthy();
    expect(screen.queryByPlaceholderText("Name")).toBeNull();
  });

  it("pre-fills the modal when editing, with an indented parent dropdown", async () => {
    render(<CategoriesManager />);
    await screen.findByText("fish");

    const editButtons = screen.getAllByRole("button", { name: /edit/i });
    fireEvent.click(editButtons[1]); // Cichlid row

    expect(screen.getByDisplayValue("Cichlid")).toBeTruthy();
    const options = screen.getAllByRole("option").map((option) => option.textContent);
    expect(options).toContain("Fish");
  });

  it("shows a success popup after deleting", async () => {
    apiClient.delete.mockResolvedValueOnce({ data: {} });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<CategoriesManager />);
    await screen.findByText("fish");

    fireEvent.click(screen.getAllByRole("button", { name: /delete/i })[0]);

    await waitFor(() => expect(apiClient.delete).toHaveBeenCalled());
    expect(await screen.findByText(/category deleted/i)).toBeTruthy();
  });
});
