import axios from "axios";
import { createContext, useContext, useEffect, useState } from "react";

import { customerApiClient } from "../api/customerClient";

const CustomerAuthContext = createContext(null);

export function CustomerAuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(localStorage.getItem("customer_access"));
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Mirrors context/AuthContext.jsx's fail-closed clearSession pattern, kept
  // as a fully separate copy (not a shared helper) so the staff-auth realm
  // and this customer-auth realm can never accidentally share state.
  const clearSession = () => {
    localStorage.removeItem("customer_access");
    localStorage.removeItem("customer_refresh");
    setAccessToken(null);
    setProfile(null);
  };

  useEffect(() => {
    const interceptorId = customerApiClient.interceptors.request.use((config) => {
      const token = localStorage.getItem("customer_access");
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    });
    return () => customerApiClient.interceptors.request.eject(interceptorId);
  }, []);

  useEffect(() => {
    const interceptorId = customerApiClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        const { config, response } = error;
        if (!config || !response || response.status !== 401) {
          return Promise.reject(error);
        }
        const isAuthEndpoint =
          typeof config.url === "string" &&
          (config.url.includes("/auth/login/") || config.url.includes("/auth/register/") ||
            config.url.includes("/auth/refresh/"));
        if (isAuthEndpoint || config._retriedAfterRefresh) {
          return Promise.reject(error);
        }

        const refreshToken = localStorage.getItem("customer_refresh");
        if (!refreshToken) {
          clearSession();
          return Promise.reject(error);
        }

        try {
          const refreshResponse = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/auth/refresh/`, {
            refresh: refreshToken,
          });
          const newAccess = refreshResponse.data.access;
          localStorage.setItem("customer_access", newAccess);
          setAccessToken(newAccess);

          config._retriedAfterRefresh = true;
          config.headers = { ...config.headers, Authorization: `Bearer ${newAccess}` };
          return customerApiClient(config);
        } catch {
          clearSession();
          return Promise.reject(error);
        }
      }
    );
    return () => customerApiClient.interceptors.response.eject(interceptorId);
  }, []);

  useEffect(() => {
    if (!accessToken) {
      setIsLoading(false);
      return;
    }
    customerApiClient
      .get("/accounts/me/")
      .then((response) => setProfile(response.data))
      .catch(() => clearSession())
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistSession = async (access, refresh) => {
    try {
      const me = await customerApiClient.get("/accounts/me/", { headers: { Authorization: `Bearer ${access}` } });
      localStorage.setItem("customer_access", access);
      localStorage.setItem("customer_refresh", refresh);
      setAccessToken(access);
      setProfile(me.data);
    } catch (error) {
      clearSession();
      throw error;
    }
  };

  const login = async (email, password) => {
    // The backend stores/looks up the email as a case-sensitive `username`
    // (see accounts/serializers.py's RegisterSerializer, which lowercases on
    // register). Normalizing here keeps this the single source of truth for
    // what gets sent, so a customer who typed capitals at registration can
    // still log in later regardless of how they capitalize it.
    const normalizedEmail = email.trim().toLowerCase();
    const response = await customerApiClient.post("/auth/login/", { username: normalizedEmail, password });
    await persistSession(response.data.access, response.data.refresh);
  };

  const register = async ({ name, email, phone, password }) => {
    const normalizedEmail = email.trim().toLowerCase();
    const response = await customerApiClient.post("/auth/register/", { name, email: normalizedEmail, phone, password });
    await persistSession(response.data.access, response.data.refresh);
  };

  const logout = () => {
    clearSession();
  };

  return (
    <CustomerAuthContext.Provider
      value={{ isAuthenticated: Boolean(accessToken), isLoading, profile, login, register, logout }}
    >
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth() {
  return useContext(CustomerAuthContext);
}
