import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { customerApiClient } from "../api/customerClient";
import { CustomerAuthProvider, useCustomerAuth } from "./CustomerAuthContext";

vi.mock("../api/customerClient", () => ({
  customerApiClient: {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: {
      request: { use: vi.fn(() => 0), eject: vi.fn() },
      response: { use: vi.fn(() => 0), eject: vi.fn() },
    },
  },
}));

describe("CustomerAuthContext", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("starts logged out with no stored token", async () => {
    const { result } = renderHook(() => useCustomerAuth(), { wrapper: CustomerAuthProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("login stores tokens and profile on success", async () => {
    customerApiClient.post.mockResolvedValueOnce({ data: { access: "acc", refresh: "ref" } });
    customerApiClient.get.mockResolvedValueOnce({
      data: { id: 1, email: "a@example.com", name: "Asha", phone: "999", is_staff: false },
    });

    const { result } = renderHook(() => useCustomerAuth(), { wrapper: CustomerAuthProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login("a@example.com", "pw123456789");
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.profile.name).toBe("Asha");
    expect(localStorage.getItem("customer_access")).toBe("acc");
    expect(localStorage.getItem("customer_refresh")).toBe("ref");
  });

  it("login fails closed when the profile fetch fails after a successful token exchange", async () => {
    customerApiClient.post.mockResolvedValueOnce({ data: { access: "acc", refresh: "ref" } });
    customerApiClient.get.mockRejectedValueOnce(new Error("boom"));

    const { result } = renderHook(() => useCustomerAuth(), { wrapper: CustomerAuthProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await expect(result.current.login("a@example.com", "pw123456789")).rejects.toThrow("boom");
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem("customer_access")).toBeNull();
    expect(localStorage.getItem("customer_refresh")).toBeNull();
  });

  it("login normalizes a mixed-case email before sending it to the backend", async () => {
    customerApiClient.post.mockResolvedValueOnce({ data: { access: "acc", refresh: "ref" } });
    customerApiClient.get.mockResolvedValueOnce({
      data: { id: 1, email: "asha@example.com", name: "Asha", phone: "999", is_staff: false },
    });

    const { result } = renderHook(() => useCustomerAuth(), { wrapper: CustomerAuthProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login("Asha@Example.com", "somepassword");
    });

    expect(customerApiClient.post).toHaveBeenCalledWith("/auth/login/", {
      username: "asha@example.com", password: "somepassword",
    });
  });

  it("register normalizes a mixed-case email before sending it to the backend", async () => {
    customerApiClient.post.mockResolvedValueOnce({ data: { access: "acc2", refresh: "ref2" } });
    customerApiClient.get.mockResolvedValueOnce({
      data: { id: 2, email: "bala@example.com", name: "Bala", phone: "888", is_staff: false },
    });

    const { result } = renderHook(() => useCustomerAuth(), { wrapper: CustomerAuthProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.register({
        name: "Bala", email: "Bala@Example.com", phone: "888", password: "pw123456789",
      });
    });

    expect(customerApiClient.post).toHaveBeenCalledWith("/auth/register/", {
      name: "Bala", email: "bala@example.com", phone: "888", password: "pw123456789",
    });
  });

  it("register stores tokens and profile on success", async () => {
    customerApiClient.post.mockResolvedValueOnce({ data: { access: "acc2", refresh: "ref2" } });
    customerApiClient.get.mockResolvedValueOnce({
      data: { id: 2, email: "b@example.com", name: "Bala", phone: "888", is_staff: false },
    });

    const { result } = renderHook(() => useCustomerAuth(), { wrapper: CustomerAuthProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.register({ name: "Bala", email: "b@example.com", phone: "888", password: "pw123456789" });
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(customerApiClient.post).toHaveBeenCalledWith("/auth/register/", {
      name: "Bala", email: "b@example.com", phone: "888", password: "pw123456789",
    });
  });

  it("logout clears stored tokens and profile", async () => {
    localStorage.setItem("customer_access", "acc");
    localStorage.setItem("customer_refresh", "ref");
    customerApiClient.get.mockResolvedValueOnce({
      data: { id: 1, email: "a@example.com", name: "Asha", phone: "999", is_staff: false },
    });

    const { result } = renderHook(() => useCustomerAuth(), { wrapper: CustomerAuthProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(true);

    act(() => result.current.logout());

    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem("customer_access")).toBeNull();
  });
});
