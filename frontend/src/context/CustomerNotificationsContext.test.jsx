import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../api/client";
import { CustomerNotificationsProvider, useCustomerNotifications } from "./CustomerNotificationsContext";

vi.mock("../api/client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

let mockAuthState = { isAuthenticated: true, isStaff: false };
vi.mock("./AuthContext", () => ({
  useAuth: () => mockAuthState,
}));

const EMPTY_RESPONSE = { unread_count: 0, notifications: [] };
const WITH_UNREAD_RESPONSE = {
  unread_count: 2,
  notifications: [
    { id: 1, message: '"Discus" is back in stock.', product_slug: "discus", created_at: "2026-08-25T00:00:00Z", read_at: null },
  ],
};

describe("CustomerNotificationsContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState = { isAuthenticated: true, isStaff: false };
  });

  it("fetches notifications on mount for an authenticated customer", async () => {
    apiClient.get.mockResolvedValueOnce({ data: EMPTY_RESPONSE });

    const { result } = renderHook(() => useCustomerNotifications(), { wrapper: CustomerNotificationsProvider });

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith("/notifications/mine/"));
    await waitFor(() => expect(result.current.unreadCount).toBe(0));
  });

  it("does not fetch for staff", async () => {
    mockAuthState = { isAuthenticated: true, isStaff: true };

    renderHook(() => useCustomerNotifications(), { wrapper: CustomerNotificationsProvider });

    await waitFor(() => {});
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it("does not fetch when logged out", async () => {
    mockAuthState = { isAuthenticated: false, isStaff: false };

    renderHook(() => useCustomerNotifications(), { wrapper: CustomerNotificationsProvider });

    await waitFor(() => {});
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it("stores unread count and notifications from the response", async () => {
    apiClient.get.mockResolvedValueOnce({ data: WITH_UNREAD_RESPONSE });

    const { result } = renderHook(() => useCustomerNotifications(), { wrapper: CustomerNotificationsProvider });

    await waitFor(() => expect(result.current.unreadCount).toBe(2));
    expect(result.current.notifications).toEqual(WITH_UNREAD_RESPONSE.notifications);
  });

  it("polls again after 30 seconds while authenticated", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    apiClient.get.mockResolvedValue({ data: EMPTY_RESPONSE });

    renderHook(() => useCustomerNotifications(), { wrapper: CustomerNotificationsProvider });

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(1));

    await act(async () => {
      vi.advanceTimersByTime(30000);
    });

    expect(apiClient.get).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("markRead posts to mark-read and zeroes unread count locally", async () => {
    apiClient.get.mockResolvedValueOnce({ data: WITH_UNREAD_RESPONSE });
    apiClient.post.mockResolvedValueOnce({ status: 204 });

    const { result } = renderHook(() => useCustomerNotifications(), { wrapper: CustomerNotificationsProvider });
    await waitFor(() => expect(result.current.unreadCount).toBe(2));

    await act(async () => {
      await result.current.markRead();
    });

    expect(apiClient.post).toHaveBeenCalledWith("/notifications/mine/mark-read/");
    expect(result.current.unreadCount).toBe(0);
  });

  it("resets to empty state on a fetch error", async () => {
    apiClient.get.mockRejectedValueOnce(new Error("network error"));

    const { result } = renderHook(() => useCustomerNotifications(), { wrapper: CustomerNotificationsProvider });

    await waitFor(() => expect(result.current.unreadCount).toBe(0));
    expect(result.current.notifications).toEqual([]);
  });
});
