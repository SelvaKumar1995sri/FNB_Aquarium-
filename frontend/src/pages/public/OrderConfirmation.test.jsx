import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { customerApiClient } from "../../api/customerClient";
import OrderConfirmation from "./OrderConfirmation";

vi.mock("../../api/customerClient", () => ({
  customerApiClient: { get: vi.fn() },
}));

const mockRefreshCart = vi.fn();
vi.mock("../../context/CartContext", () => ({
  useCart: () => ({ refresh: mockRefreshCart }),
}));

function renderConfirmation(props = {}) {
  return render(
    <MemoryRouter initialEntries={["/order-confirmation/order_test1"]}>
      <Routes>
        <Route path="/order-confirmation/:razorpayOrderId" element={<OrderConfirmation {...props} />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("OrderConfirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows a confirming state while polling", () => {
    customerApiClient.get.mockReturnValue(new Promise(() => {})); // never resolves

    renderConfirmation({ pollIntervalMs: 10, pollTimeoutMs: 100 });

    expect(screen.getByText("Confirming your payment…")).toBeTruthy();
  });

  it("shows the order summary once the order appears", async () => {
    customerApiClient.get.mockResolvedValueOnce({
      data: { id: 42, total_amount: "200.00", status: "placed", items: [] },
    });

    renderConfirmation({ pollIntervalMs: 10, pollTimeoutMs: 100 });

    expect(await screen.findByText(/Thank you for your order/i)).toBeTruthy();
    expect(screen.getByText("Order #42 — ₹200.00")).toBeTruthy();
    expect(mockRefreshCart).toHaveBeenCalled();
  });

  it("retries after a 404 and eventually shows the order", async () => {
    customerApiClient.get
      .mockRejectedValueOnce({ response: { status: 404 } })
      .mockResolvedValueOnce({ data: { id: 7, total_amount: "50.00", status: "placed", items: [] } });

    renderConfirmation({ pollIntervalMs: 10, pollTimeoutMs: 200 });

    expect(await screen.findByText(/Thank you for your order/i)).toBeTruthy();
  });

  it("shows the reassuring fallback message after the poll times out", async () => {
    customerApiClient.get.mockRejectedValue({ response: { status: 404 } });

    renderConfirmation({ pollIntervalMs: 10, pollTimeoutMs: 30 });

    expect(await screen.findByText("Payment received")).toBeTruthy();
  });
});
