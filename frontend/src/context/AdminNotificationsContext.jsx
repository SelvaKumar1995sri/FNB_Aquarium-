import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { apiClient } from "../api/client";
import { useAuth } from "./AuthContext";

const AdminNotificationsContext = createContext(null);

const EMPTY_STATE = {
  unreadOrdersCount: 0,
  unreadInquiriesCount: 0,
  latestOrders: [],
  latestInquiries: [],
  asOf: null,
};

const POLL_INTERVAL_MS = 30000;

export function AdminNotificationsProvider({ children }) {
  const { isAuthenticated, isStaff } = useAuth();
  const [state, setState] = useState(EMPTY_STATE);

  const refresh = useCallback(() => {
    if (!isAuthenticated || !isStaff) {
      setState(EMPTY_STATE);
      return Promise.resolve();
    }
    return apiClient
      .get("/admin/notifications/")
      .then((response) => {
        setState({
          unreadOrdersCount: response.data.unread_orders_count,
          unreadInquiriesCount: response.data.unread_inquiries_count,
          latestOrders: response.data.latest_orders,
          latestInquiries: response.data.latest_inquiries,
          asOf: response.data.as_of,
        });
      })
      .catch(() => setState(EMPTY_STATE));
  }, [isAuthenticated, isStaff]);

  useEffect(() => {
    refresh();
    if (!isAuthenticated || !isStaff) return undefined;
    const intervalId = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [isAuthenticated, isStaff, refresh]);

  const markSeen = async () => {
    await apiClient.post("/admin/notifications/seen/", { seen_up_to: state.asOf });
    setState((prev) => ({ ...prev, unreadOrdersCount: 0, unreadInquiriesCount: 0 }));
  };

  return (
    <AdminNotificationsContext.Provider value={{ ...state, refresh, markSeen }}>
      {children}
    </AdminNotificationsContext.Provider>
  );
}

export function useAdminNotifications() {
  return useContext(AdminNotificationsContext);
}
