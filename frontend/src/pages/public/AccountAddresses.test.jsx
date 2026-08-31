import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import AccountAddresses from "./AccountAddresses";

vi.mock("../../api/client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

let mockProfile;
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ profile: mockProfile }),
}));

const ORDERS = [
  { id: 3, created_at: "2026-08-20T10:00:00Z", status: "delivered", total_amount: "150.00" },
  { id: 2, created_at: "2026-08-15T10:00:00Z", status: "packed", total_amount: "80.00" },
  { id: 1, created_at: "2026-08-01T10:00:00Z", status: "placed", total_amount: "40.00" },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <AccountAddresses />
    </MemoryRouter>
  );
}

describe("AccountAddresses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfile = { id: 1, name: "Selva Kumar", email: "selva@example.com", phone: "9876543210" };
    apiClient.get.mockImplementation((url) => {
      if (url === "/addresses/") return Promise.resolve({ data: { results: [] } });
      if (url === "/orders/") return Promise.resolve({ data: { results: ORDERS } });
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
  });

  afterEach(() => cleanup());

  it("shows the customer's basic account details", async () => {
    renderPage();

    expect(await screen.findByText("Selva Kumar")).toBeTruthy();
    expect(screen.getByText("selva@example.com")).toBeTruthy();
    expect(screen.getByText("9876543210")).toBeTruthy();
  });

  it("shows the most recent orders with a link to the full order history", async () => {
    renderPage();

    expect(await screen.findByText("Order #3")).toBeTruthy();
    expect(screen.getByText("Order #2")).toBeTruthy();
    expect(screen.getByText("Order #1")).toBeTruthy();

    const viewAllLink = screen.getByRole("link", { name: /view all orders/i });
    expect(viewAllLink.getAttribute("href")).toBe("/account/orders");

    const firstOrderLink = screen.getByText("Order #3").closest("a");
    expect(firstOrderLink.getAttribute("href")).toBe("/account/orders/3");
  });

  it("shows a friendly message when the customer hasn't placed any orders yet", async () => {
    apiClient.get.mockImplementation((url) => {
      if (url === "/addresses/") return Promise.resolve({ data: { results: [] } });
      if (url === "/orders/") return Promise.resolve({ data: { results: [] } });
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    renderPage();

    expect(await screen.findByText("You haven't placed any orders yet.")).toBeTruthy();
  });
});
