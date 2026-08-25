import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { apiClient } from "../api/client";
import { useAuth } from "./AuthContext";

const CustomerNotificationsContext = createContext(null);

const EMPTY_STATE = { unreadCount: 0, notifications: [] };
const POLL_INTERVAL_MS = 30000;

export function CustomerNotificationsProvider({ children }) {
  const { isAuthenticated, isStaff } = useAuth();
  const isCustomer = isAuthenticated && !isStaff;
  const [state, setState] = useState(EMPTY_STATE);

  const refresh = useCallback(() => {
    if (!isCustomer) {
      setState(EMPTY_STATE);
      return Promise.resolve();
    }
    return apiClient
      .get("/notifications/mine/")
      .then((response) => {
        setState({ unreadCount: response.data.unread_count, notifications: response.data.notifications });
      })
      .catch(() => setState(EMPTY_STATE));
  }, [isCustomer]);

  useEffect(() => {
    refresh();
    if (!isCustomer) return undefined;
    const intervalId = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [isCustomer, refresh]);

  const markRead = async () => {
    await apiClient.post("/notifications/mine/mark-read/");
    setState((prev) => ({ ...prev, unreadCount: 0 }));
  };

  return (
    <CustomerNotificationsContext.Provider value={{ ...state, refresh, markRead }}>
      {children}
    </CustomerNotificationsContext.Provider>
  );
}

export function useCustomerNotifications() {
  return useContext(CustomerNotificationsContext);
}
