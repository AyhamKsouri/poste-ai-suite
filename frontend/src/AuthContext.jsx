import React, { createContext, useContext, useEffect, useState } from "react";
import { api, setToken } from "./api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then(setUser)
      .catch(() => {
        // QA audit finding M2: this used to unconditionally clear the token on
        // ANY failure here, including a pure network error (backend
        // unreachable) - silently discarding a perfectly valid session. An
        // actual invalid/expired token (401) is already handled at the source
        // in api/client.js's request(), which clears the token and redirects
        // itself before this ever runs. Anything that reaches this catch is
        // therefore NOT a confirmed bad token, so the stored token is left
        // alone - the user sees the login screen for this page load, but a
        // reload once the backend recovers logs them back in transparently.
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const { access_token } = await api.login(email, password);
    setToken(access_token);
    const me = await api.me();
    setUser(me);
    return me;
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
