import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { customerApiClient } from "../../api/customerClient";
import Checkout from "./Checkout";

vi.mock("../../api/customerClient", () => ({
  customerApiClient: { get: vi.fn(), post: vi.fn() },
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

let mockCart;
vi.mock("../../context/CartContext", () => ({
  useCart: () => ({ cart: mockCart }),
}));

const ADDRESSES = [
  {
    id: 1, full_name: "Home", phone: "1234567890", line1: "1 Rd", line2: "",
    city: "City", state: "State", pincode: "500001", is_default: true,
  },
];

function renderCheckout() {
  return render(
    <MemoryRouter>
      <Checkout />
    </MemoryRouter>
  );
}

describe("Checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCart = {
      items: [{ id: 1, product_name: "Tank", quantity: 2, line_total: "200.00" }],
      subtotal: "200.00",
    };
    delete window.Razorpay;
  });

  afterEach(() => {
    cleanup();
  });

  it("shows an empty-cart message when the cart has no items", () => {
    mockCart = { items: [], subtotal: "0.00" };
    customerApiClient.get.mockResolvedValueOnce({ data: { results: [] } });

    renderCheckout();

    expect(screen.getByText("Your cart is empty")).toBeTruthy();
  });

  it("loads and pre-selects the default address", async () => {
    customerApiClient.get.mockResolvedValueOnce({ data: { results: ADDRESSES } });

    renderCheckout();

    const radio = await screen.findByRole("radio");
    expect(radio.checked).toBe(true);
  });

  it("Pay Now posts to /checkout/ and opens Razorpay with the returned order details", async () => {
    customerApiClient.get.mockResolvedValueOnce({ data: { results: ADDRESSES } });
    customerApiClient.post.mockResolvedValueOnce({
      data: { razorpay_order_id: "order_test1", razorpay_key_id: "rzp_test_key", amount: "200.00", currency: "INR" },
    });
    const mockOpen = vi.fn();
    window.Razorpay = vi.fn(function () {
      return { open: mockOpen };
    });

    renderCheckout();
    await screen.findByRole("radio");
    fireEvent.click(screen.getByRole("button", { name: /pay now/i }));

    await waitFor(() => expect(customerApiClient.post).toHaveBeenCalledWith("/checkout/", { address: 1 }));
    await waitFor(() =>
      expect(window.Razorpay).toHaveBeenCalledWith(
        expect.objectContaining({ order_id: "order_test1", key: "rzp_test_key", amount: 20000 })
      )
    );
    expect(mockOpen).toHaveBeenCalled();
  });

  it("navigates to the order-confirmation page when Razorpay's handler fires", async () => {
    customerApiClient.get.mockResolvedValueOnce({ data: { results: ADDRESSES } });
    customerApiClient.post.mockResolvedValueOnce({
      data: { razorpay_order_id: "order_test2", razorpay_key_id: "rzp_test_key", amount: "200.00", currency: "INR" },
    });
    let capturedOptions;
    window.Razorpay = vi.fn(function (options) {
      capturedOptions = options;
      return { open: vi.fn() };
    });

    renderCheckout();
    await screen.findByRole("radio");
    fireEvent.click(screen.getByRole("button", { name: /pay now/i }));
    await waitFor(() => expect(window.Razorpay).toHaveBeenCalled());

    capturedOptions.handler();

    expect(mockNavigate).toHaveBeenCalledWith("/order-confirmation/order_test2");
  });

  it("shows an error message if the checkout request fails", async () => {
    customerApiClient.get.mockResolvedValueOnce({ data: { results: ADDRESSES } });
    customerApiClient.post.mockRejectedValueOnce({ response: { data: { cart: "Your cart is empty." } } });
    // Stub Razorpay so loadRazorpayScript() short-circuits instead of appending
    // a real <script> tag — jsdom never fires onload/onerror for injected
    // scripts, and this test is only exercising the failed-POST error path.
    window.Razorpay = vi.fn();

    renderCheckout();
    await screen.findByRole("radio");
    fireEvent.click(screen.getByRole("button", { name: /pay now/i }));

    expect(await screen.findByText("Your cart is empty.")).toBeTruthy();
  });
});
