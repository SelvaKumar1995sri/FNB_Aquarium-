import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { customerApiClient } from "../api/customerClient";
import { CartProvider, useCart } from "./CartContext";

vi.mock("../api/customerClient", () => ({
  customerApiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

let mockIsCustomerAuthenticated = true;
vi.mock("./CustomerAuthContext", () => ({
  useCustomerAuth: () => ({ isAuthenticated: mockIsCustomerAuthenticated }),
}));

const EMPTY_CART = { id: null, items: [], subtotal: "0.00" };
const CART_WITH_ONE_ITEM = {
  id: 1,
  items: [{ id: 10, product: 5, product_name: "Tank", quantity: 2, line_total: "200.00" }],
  subtotal: "200.00",
};

describe("CartContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsCustomerAuthenticated = true;
  });

  it("fetches the cart on mount when the customer is authenticated", async () => {
    customerApiClient.get.mockResolvedValueOnce({ data: EMPTY_CART });

    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });

    await waitFor(() => expect(customerApiClient.get).toHaveBeenCalledWith("/cart/"));
    await waitFor(() => expect(result.current.cart).toEqual(EMPTY_CART));
    expect(result.current.itemCount).toBe(0);
  });

  it("does not fetch the cart when the customer is not authenticated", async () => {
    mockIsCustomerAuthenticated = false;

    renderHook(() => useCart(), { wrapper: CartProvider });

    await waitFor(() => {});
    expect(customerApiClient.get).not.toHaveBeenCalled();
  });

  it("addItem posts to /cart/items/ and updates cart state", async () => {
    customerApiClient.get.mockResolvedValueOnce({ data: EMPTY_CART });
    customerApiClient.post.mockResolvedValueOnce({ data: CART_WITH_ONE_ITEM });

    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    await waitFor(() => expect(result.current.cart).toEqual(EMPTY_CART));

    await act(async () => {
      await result.current.addItem(5, 2);
    });

    expect(customerApiClient.post).toHaveBeenCalledWith("/cart/items/", { product: 5, quantity: 2 });
    expect(result.current.cart).toEqual(CART_WITH_ONE_ITEM);
    expect(result.current.itemCount).toBe(2);
  });

  it("updateItem patches the item and updates cart state", async () => {
    customerApiClient.get.mockResolvedValueOnce({ data: CART_WITH_ONE_ITEM });
    const updated = { ...CART_WITH_ONE_ITEM, items: [{ ...CART_WITH_ONE_ITEM.items[0], quantity: 4 }] };
    customerApiClient.patch.mockResolvedValueOnce({ data: updated });

    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    await waitFor(() => expect(result.current.cart).toEqual(CART_WITH_ONE_ITEM));

    await act(async () => {
      await result.current.updateItem(10, 4);
    });

    expect(customerApiClient.patch).toHaveBeenCalledWith("/cart/items/10/", { quantity: 4 });
    expect(result.current.cart.items[0].quantity).toBe(4);
  });

  it("removeItem deletes the item and updates cart state", async () => {
    customerApiClient.get.mockResolvedValueOnce({ data: CART_WITH_ONE_ITEM });
    customerApiClient.delete.mockResolvedValueOnce({ data: EMPTY_CART });

    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    await waitFor(() => expect(result.current.cart).toEqual(CART_WITH_ONE_ITEM));

    await act(async () => {
      await result.current.removeItem(10);
    });

    expect(customerApiClient.delete).toHaveBeenCalledWith("/cart/items/10/");
    expect(result.current.cart).toEqual(EMPTY_CART);
  });
});
