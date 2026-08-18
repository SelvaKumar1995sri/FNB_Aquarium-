import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../api/client";
import { AdminNotificationsProvider, useAdminNotifications } from "./AdminNotificationsContext";

vi.mock("../api/client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

let mockAuthState = { isAuthenticated: true, isStaff: true };
vi.mock("./AuthContext", () => ({
  useAuth: () => mockAuthState,
}));

const EMPTY_RESPONSE = {
  unread_orders_count: 0,
  unread_inquiries_count: 0,
  latest_orders: [],
  latest_inquiries: [],
};

const WITH_UNREAD_RESPONSE = {
  unread_orders_count: 2,
  unread_inquiries_count: 1,
  latest_orders: [
    { id: 5, status: "placed", customer_name: "Asha", customer_email: "a@example.com", total_amount: "100.00", created_at: "2026-08-18T00:00:00Z" },
  ],
  latest_inquiries: [{ id: 3, name: "Ravi", type: "general", created_at: "2026-08-18T00:00:00Z" }],
};

describe("AdminNotificationsContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState = { isAuthenticated: true, isStaff: true };
  });

  it("fetches notifications on mount when authenticated staff", async () => {
    apiClient.get.mockResolvedValueOnce({ data: EMPTY_RESPONSE });

    const { result } = renderHook(() => useAdminNotifications(), { wrapper: AdminNotificationsProvider });

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith("/admin/notifications/"));
    await waitFor(() => expect(result.current.unreadOrdersCount).toBe(0));
  });

  it("does not fetch when not staff", async () => {
    mockAuthState = { isAuthenticated: true, isStaff: false };

    renderHook(() => useAdminNotifications(), { wrapper: AdminNotificationsProvider });

    await waitFor(() => {});
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it("stores unread counts and latest items from the response", async () => {
    apiClient.get.mockResolvedValueOnce({ data: WITH_UNREAD_RESPONSE });

    const { result } = renderHook(() => useAdminNotifications(), { wrapper: AdminNotificationsProvider });

    await waitFor(() => expect(result.current.unreadOrdersCount).toBe(2));
    expect(result.current.unreadInquiriesCount).toBe(1);
    expect(result.current.latestOrders).toEqual(WITH_UNREAD_RESPONSE.latest_orders);
    expect(result.current.latestInquiries).toEqual(WITH_UNREAD_RESPONSE.latest_inquiries);
  });

  it("polls again after 30 seconds while authenticated staff", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    apiClient.get.mockResolvedValue({ data: EMPTY_RESPONSE });

    renderHook(() => useAdminNotifications(), { wrapper: AdminNotificationsProvider });

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(1));

    await act(async () => {
      vi.advanceTimersByTime(30000);
    });

    expect(apiClient.get).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("markSeen posts to the seen endpoint and zeroes unread counts locally", async () => {
    apiClient.get.mockResolvedValueOnce({ data: WITH_UNREAD_RESPONSE });
    apiClient.post.mockResolvedValueOnce({ status: 204 });

    const { result } = renderHook(() => useAdminNotifications(), { wrapper: AdminNotificationsProvider });
    await waitFor(() => expect(result.current.unreadOrdersCount).toBe(2));

    await act(async () => {
      await result.current.markSeen();
    });

    expect(apiClient.post).toHaveBeenCalledWith("/admin/notifications/seen/");
    expect(result.current.unreadOrdersCount).toBe(0);
    expect(result.current.unreadInquiriesCount).toBe(0);
  });

  it("resets to empty state on a fetch error", async () => {
    apiClient.get.mockRejectedValueOnce(new Error("network error"));

    const { result } = renderHook(() => useAdminNotifications(), { wrapper: AdminNotificationsProvider });

    await waitFor(() => expect(result.current.unreadOrdersCount).toBe(0));
    expect(result.current.latestOrders).toEqual([]);
  });
});
