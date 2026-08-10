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
    // Runs once on mount only (not on every accessToken change) — login()/logout()
    // already manage accessToken/isStaff state directly and correctly, so re-running
    // this on every accessToken change just risks a spurious second /auth/me/ call
    // (e.g. right after a successful login()) clobbering already-verified state if
    // that second call fails transiently. This effect's job is solely to restore
    // (or fail-closed reject) a pre-existing session on page load.
    if (!accessToken) {
      setIsLoading(false);
      return;
    }
    apiClient
      .get("/auth/me/")
      .then((response) => {
        if (!response.data.is_staff) {
          // Token belongs to a non-staff user (e.g. staff flag revoked mid-session,
          // or a stale token from before staff was enforced at login time). Fail
          // closed: clear the session instead of leaving isAuthenticated true with
          // isStaff false, which would otherwise loop between /admin and
          // /admin/login (Login redirects on isAuthenticated, AdminGuard redirects
          // back on !isStaff).
          setAccessToken(null);
          setIsStaff(false);
          localStorage.removeItem("access");
          localStorage.removeItem("refresh");
          return;
        }
        setIsStaff(true);
      })
      .catch(() => {
        setAccessToken(null);
        localStorage.removeItem("access");
        localStorage.removeItem("refresh");
      })
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
