import axios from "axios";
import { createContext, useContext, useEffect, useState } from "react";

import { apiClient } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(localStorage.getItem("access"));
  const [isStaff, setIsStaff] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Single fail-closed helper: clears both tokens from storage and resets
  // in-memory state to logged-out. Every place in this file that needs to
  // give up on a session (login()'s non-staff branch, logout(), the
  // mount-verify effect's failure branches, and the response interceptor's
  // failure branches below) calls this instead of repeating the four
  // statements inline — that repetition is exactly what let an earlier copy
  // (the mount-verify effect's plain .catch()) drift out of sync and miss
  // setIsStaff(false).
  const clearSession = () => {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    setAccessToken(null);
    setIsStaff(false);
  };

  useEffect(() => {
    const interceptorId = apiClient.interceptors.request.use((config) => {
      const token = localStorage.getItem("access");
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    });
    return () => apiClient.interceptors.request.eject(interceptorId);
  }, []);

  useEffect(() => {
    // Transparently refresh an expired access token on a 401 and retry the
    // failed request once. Registered on mount (same lifecycle as the request
    // interceptor above), so it's already in place before the mount-verify
    // effect below fires its /auth/me/ call.
    const interceptorId = apiClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        const { config, response } = error;

        // Only 401s from a request we can actually retry are ours to handle;
        // network errors, other status codes, or errors with no config pass
        // straight through.
        if (!config || !response || response.status !== 401) {
          return Promise.reject(error);
        }

        // A 401 from the login or refresh endpoints themselves is a real
        // credential failure, not an expired-access-token situation — never
        // attempt a refresh for those. This check is now a belt-and-braces
        // safety net rather than the only thing preventing recursion: the
        // refresh call below is dispatched via plain `axios`, not the
        // configured `apiClient`, so it structurally never re-enters this
        // interceptor regardless of whether this string match stays correct.
        const isAuthEndpoint =
          typeof config.url === "string" &&
          (config.url.includes("/auth/login/") || config.url.includes("/auth/refresh/"));
        if (isAuthEndpoint) {
          return Promise.reject(error);
        }

        // Already retried this exact request once after a refresh — if it's
        // still 401ing, a fresh token isn't the fix. Stop here instead of
        // looping.
        if (config._retriedAfterRefresh) {
          return Promise.reject(error);
        }

        const refreshToken = localStorage.getItem("refresh");
        if (!refreshToken) {
          // Nothing to refresh with. Fail closed: log out and let the
          // original 401 propagate so callers (and AdminGuard) react to it.
          clearSession();
          return Promise.reject(error);
        }

        try {
          // Deliberately a bare `axios.post`, not `apiClient.post`: apiClient
          // carries this very interceptor, so routing the refresh call
          // through it would make recursion-safety depend entirely on the
          // isAuthEndpoint string check above never drifting out of sync.
          // Going around apiClient makes a refresh-call 401 structurally
          // unable to re-enter this code at all.
          const refreshResponse = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/auth/refresh/`, {
            refresh: refreshToken,
          });
          const newAccess = refreshResponse.data.access;
          localStorage.setItem("access", newAccess);
          setAccessToken(newAccess);

          config._retriedAfterRefresh = true;
          config.headers = { ...config.headers, Authorization: `Bearer ${newAccess}` };
          return apiClient(config);
        } catch {
          // Refresh token expired/invalid, or the refresh request itself
          // failed (e.g. network error). Fail closed the same way as above,
          // and propagate the ORIGINAL 401 (not refreshError) so existing
          // .catch() handlers keep seeing the failure shape they expect.
          clearSession();
          return Promise.reject(error);
        }
      }
    );
    return () => apiClient.interceptors.response.eject(interceptorId);
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
          clearSession();
          return;
        }
        setIsStaff(true);
      })
      .catch(() => {
        clearSession();
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
      // Fail closed here too: a valid-but-non-staff login must not leave any
      // stale prior session lingering in storage/state.
      clearSession();
      throw new Error("Not staff");
    }
    localStorage.setItem("access", access);
    localStorage.setItem("refresh", refresh);
    setIsStaff(true);
    setAccessToken(access);
  };

  const logout = () => {
    clearSession();
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
