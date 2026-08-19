import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import Checkout from "./Checkout";

vi.mock("../../api/client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

let mockCart;
let mockIsLoading;
vi.mock("../../context/CartContext", () => ({
  useCart: () => ({ cart: mockCart, isLoading: mockIsLoading }),
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
    mockIsLoading = false;
    delete window.Razorpay;
  });

  afterEach(() => {
    cleanup();
  });

  it("shows an empty-cart message when the cart has no items", () => {
    mockCart = { items: [], subtotal: "0.00" };
    apiClient.get.mockResolvedValueOnce({ data: { results: [] } });

    renderCheckout();

    expect(screen.getByText("Your cart is empty")).toBeTruthy();
  });

  it("shows a loading message instead of the empty-cart message while the cart is still loading", () => {
    mockCart = { items: [], subtotal: "0.00" };
    mockIsLoading = true;
    apiClient.get.mockResolvedValueOnce({ data: { results: [] } });

    renderCheckout();

    expect(screen.getByText("Loading your cart...")).toBeTruthy();
    expect(screen.queryByText("Your cart is empty")).toBeNull();
  });

  it("loads and pre-selects the default address", async () => {
    apiClient.get.mockResolvedValueOnce({ data: { results: ADDRESSES } });

    renderCheckout();

    await screen.findByText("Home");
    const addressRadio = screen.getAllByRole("radio").find((radio) => radio.name === "address");
    expect(addressRadio.checked).toBe(true);
  });

  it("Pay Now posts to /checkout/ with the online payment method and opens Razorpay with the returned order details", async () => {
    apiClient.get.mockResolvedValueOnce({ data: { results: ADDRESSES } });
    apiClient.post.mockResolvedValueOnce({
      data: {
        razorpay_order_id: "order_test1", razorpay_key_id: "rzp_test_key",
        amount: "200.00", order_total: "200.00", cod_amount_due: "0.00", payment_method: "online", currency: "INR",
      },
    });
    const mockOpen = vi.fn();
    window.Razorpay = vi.fn(function () {
      return { open: mockOpen };
    });

    renderCheckout();
    await screen.findAllByRole("radio");
    fireEvent.click(screen.getByRole("button", { name: /pay .* now/i }));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith("/checkout/", { address: 1, payment_method: "online" })
    );
    await waitFor(() =>
      expect(window.Razorpay).toHaveBeenCalledWith(
        expect.objectContaining({ order_id: "order_test1", key: "rzp_test_key", amount: 20000 })
      )
    );
    expect(mockOpen).toHaveBeenCalled();
  });

  it("is always available, regardless of cart subtotal", async () => {
    mockCart = {
      items: [{ id: 1, product_name: "Fish net", quantity: 1, line_total: "3.99" }],
      subtotal: "3.99",
    };
    apiClient.get.mockResolvedValueOnce({ data: { results: ADDRESSES } });

    renderCheckout();

    await screen.findAllByRole("radio");
    expect(screen.getByText(/cash on delivery/i)).toBeTruthy();
  });

  it("selecting Cash on Delivery places the order directly with no Razorpay charge", async () => {
    apiClient.get.mockResolvedValueOnce({ data: { results: ADDRESSES } });
    apiClient.post.mockResolvedValueOnce({
      data: { razorpay_order_id: "cod_abc123", payment_method: "cod", total_amount: "200.00" },
    });
    window.Razorpay = vi.fn();

    renderCheckout();
    await screen.findAllByRole("radio");
    fireEvent.click(screen.getByText(/cash on delivery/i));
    fireEvent.click(screen.getByRole("button", { name: /place order/i }));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith("/checkout/", { address: 1, payment_method: "cod" })
    );
    expect(window.Razorpay).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/order-confirmation/cod_abc123");
  });

  it("adding a new address inline selects it without leaving the page", async () => {
    apiClient.get.mockResolvedValueOnce({ data: { results: [] } });
    apiClient.post.mockResolvedValueOnce({ data: { id: 2, full_name: "Office" } });
    apiClient.get.mockResolvedValueOnce({
      data: { results: [{ ...ADDRESSES[0], id: 2, full_name: "Office", is_default: false }] },
    });

    renderCheckout();
    fireEvent.click(await screen.findByText("+ Add a new address"));

    fireEvent.change(screen.getByPlaceholderText("Full name"), { target: { value: "Office" } });
    fireEvent.change(screen.getByPlaceholderText("Phone"), { target: { value: "9999999999" } });
    fireEvent.change(screen.getByPlaceholderText("Address line 1"), { target: { value: "2 Rd" } });
    fireEvent.change(screen.getByPlaceholderText("City"), { target: { value: "City" } });
    fireEvent.change(screen.getByPlaceholderText("State"), { target: { value: "State" } });
    fireEvent.change(screen.getByPlaceholderText("Pincode"), { target: { value: "500002" } });
    fireEvent.click(screen.getByRole("button", { name: /add address/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith("/addresses/", expect.objectContaining({
      full_name: "Office", phone: "9999999999", line1: "2 Rd", city: "City", state: "State", pincode: "500002",
    })));

    const radios = await screen.findAllByRole("radio");
    const addressRadio = radios.find((radio) => radio.name === "address");
    expect(addressRadio.checked).toBe(true);
  });

  it("navigates to the order-confirmation page when Razorpay's handler fires", async () => {
    apiClient.get.mockResolvedValueOnce({ data: { results: ADDRESSES } });
    apiClient.post.mockResolvedValueOnce({
      data: {
        razorpay_order_id: "order_test2", razorpay_key_id: "rzp_test_key",
        amount: "200.00", order_total: "200.00", cod_amount_due: "0.00", payment_method: "online", currency: "INR",
      },
    });
    let capturedOptions;
    window.Razorpay = vi.fn(function (options) {
      capturedOptions = options;
      return { open: vi.fn() };
    });

    renderCheckout();
    await screen.findAllByRole("radio");
    fireEvent.click(screen.getByRole("button", { name: /pay .* now/i }));
    await waitFor(() => expect(window.Razorpay).toHaveBeenCalled());

    capturedOptions.handler();

    expect(mockNavigate).toHaveBeenCalledWith("/order-confirmation/order_test2");
  });

  it("shows an error message if the checkout request fails", async () => {
    apiClient.get.mockResolvedValueOnce({ data: { results: ADDRESSES } });
    apiClient.post.mockRejectedValueOnce({ response: { data: { cart: "Your cart is empty." } } });
    // Stub Razorpay so loadRazorpayScript() short-circuits instead of appending
    // a real <script> tag — jsdom never fires onload/onerror for injected
    // scripts, and this test is only exercising the failed-POST error path.
    window.Razorpay = vi.fn();

    renderCheckout();
    await screen.findAllByRole("radio");
    fireEvent.click(screen.getByRole("button", { name: /pay .* now/i }));

    expect(await screen.findByText("Your cart is empty.")).toBeTruthy();
  });
});
