import { createContext, useContext, useEffect, useState } from "react";

import { apiClient } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(localStorage.getItem("access"));
  const [isStaff, setIsStaff] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const interceptorId = apiClient.interceptors.request.use((config) => {
      const token = localStorage.getItem("access");
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    });
    return () => apiClient.interceptors.request.eject(interceptorId);
  }, []);

  useEffect(() => {
    if (!accessToken) {
      setIsLoading(false);
      return;
    }
    apiClient
      .get("/auth/me/")
      .then((response) => setIsStaff(response.data.is_staff))
      .catch(() => {
        setAccessToken(null);
        localStorage.removeItem("access");
        localStorage.removeItem("refresh");
      })
      .finally(() => setIsLoading(false));
  }, [accessToken]);

  const login = async (username, password) => {
    const response = await apiClient.post("/auth/login/", { username, password });
    const { access, refresh } = response.data;
    // Verify staff status before persisting anything, so a valid-but-non-staff
    // login fails the same way as bad credentials instead of bouncing between
    // /admin and /admin/login while the isStaff check races the navigation.
    const me = await apiClient.get("/auth/me/", { headers: { Authorization: `Bearer ${access}` } });
    if (!me.data.is_staff) {
      throw new Error("Not staff");
    }
    localStorage.setItem("access", access);
    localStorage.setItem("refresh", refresh);
    setIsStaff(true);
    setAccessToken(access);
  };

  const logout = () => {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    setAccessToken(null);
    setIsStaff(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated: Boolean(accessToken), isStaff, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
