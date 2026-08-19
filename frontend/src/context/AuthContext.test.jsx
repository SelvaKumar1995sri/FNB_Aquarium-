import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../api/client";
import { AuthProvider, useAuth } from "./AuthContext";

vi.mock("../api/client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: {
      request: { use: vi.fn(() => 0), eject: vi.fn() },
      response: { use: vi.fn(() => 0), eject: vi.fn() },
    },
  },
}));

describe("AuthContext", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("starts logged out with no stored token", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("login as a staff user sets isStaff and stores tokens", async () => {
    apiClient.post.mockResolvedValueOnce({ data: { access: "acc", refresh: "ref" } });
    apiClient.get.mockResolvedValueOnce({
      data: { id: 1, username: "selva", email: "", name: "", phone: "", is_staff: true },
    });

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login("selva", "pw123456789");
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isStaff).toBe(true);
    expect(localStorage.getItem("access")).toBe("acc");
    expect(localStorage.getItem("refresh")).toBe("ref");
  });

  it("login as a non-staff customer sets isStaff false and stores the profile", async () => {
    apiClient.post.mockResolvedValueOnce({ data: { access: "acc", refresh: "ref" } });
    apiClient.get.mockResolvedValueOnce({
      data: { id: 2, email: "a@example.com", name: "Asha", phone: "999", is_staff: false },
    });

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login("a@example.com", "pw123456789");
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isStaff).toBe(false);
    expect(result.current.profile.name).toBe("Asha");
  });

  it("login fails closed when the profile fetch fails after a successful token exchange", async () => {
    apiClient.post.mockResolvedValueOnce({ data: { access: "acc", refresh: "ref" } });
    apiClient.get.mockRejectedValueOnce(new Error("boom"));

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await expect(result.current.login("a@example.com", "pw123456789")).rejects.toThrow("boom");
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem("access")).toBeNull();
    expect(localStorage.getItem("refresh")).toBeNull();
  });

  it("login normalizes a mixed-case email but leaves a plain username untouched", async () => {
    apiClient.post.mockResolvedValueOnce({ data: { access: "acc", refresh: "ref" } });
    apiClient.get.mockResolvedValueOnce({
      data: { id: 1, email: "asha@example.com", name: "Asha", phone: "999", is_staff: false },
    });

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login("Asha@Example.com", "somepassword");
    });

    expect(apiClient.post).toHaveBeenCalledWith("/auth/login/", {
      username: "asha@example.com", password: "somepassword",
    });

    apiClient.post.mockResolvedValueOnce({ data: { access: "acc2", refresh: "ref2" } });
    apiClient.get.mockResolvedValueOnce({
      data: { id: 1, username: "Selva", email: "", name: "", phone: "", is_staff: true },
    });

    await act(async () => {
      await result.current.login("Selva", "somepassword");
    });

    expect(apiClient.post).toHaveBeenCalledWith("/auth/login/", {
      username: "Selva", password: "somepassword",
    });
  });

  it("register normalizes email, stores tokens, and marks the new account as non-staff", async () => {
    apiClient.post.mockResolvedValueOnce({ data: { access: "acc2", refresh: "ref2" } });
    apiClient.get.mockResolvedValueOnce({
      data: { id: 2, email: "bala@example.com", name: "Bala", phone: "888", is_staff: false },
    });

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.register({
        name: "Bala", email: "Bala@Example.com", phone: "888", password: "pw123456789",
      });
    });

    expect(apiClient.post).toHaveBeenCalledWith("/auth/register/", {
      name: "Bala", email: "bala@example.com", phone: "888", password: "pw123456789",
    });
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isStaff).toBe(false);
  });

  it("logout clears stored tokens and profile", async () => {
    localStorage.setItem("access", "acc");
    localStorage.setItem("refresh", "ref");
    apiClient.get.mockResolvedValueOnce({
      data: { id: 1, email: "a@example.com", name: "Asha", phone: "999", is_staff: false },
    });

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(true);

    act(() => result.current.logout());

    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem("access")).toBeNull();
  });
});
