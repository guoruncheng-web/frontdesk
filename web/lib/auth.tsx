"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, AuthResponse, AuthUser, api, tokenStore } from "./api";

type AuthState = {
  user: AuthUser | null;
  status: "loading" | "authenticated" | "anonymous";
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: { name: string; organizationName: string; email: string; password: string }) => Promise<void>;
  startDemo: () => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthState["status"]>("loading");

  // A stored token can be expired or signed with a rotated secret, so it is
  // verified against the API before the dashboard is allowed to render.
  useEffect(() => {
    if (!tokenStore.read()) {
      setStatus("anonymous");
      return;
    }

    let cancelled = false;

    api<AuthUser>("/auth/me")
      .then((me) => {
        if (cancelled) return;
        setUser(me);
        setStatus("authenticated");
      })
      .catch(() => {
        if (cancelled) return;
        tokenStore.clear();
        setStatus("anonymous");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const accept = useCallback((response: AuthResponse) => {
    tokenStore.write(response.accessToken);
    setUser(response.user);
    setStatus("authenticated");
  }, []);

  const signIn = useCallback<AuthState["signIn"]>(
    async (email, password) => {
      accept(await api<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }));
    },
    [accept],
  );

  const signUp = useCallback<AuthState["signUp"]>(
    async (input) => {
      accept(await api<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify(input) }));
    },
    [accept],
  );

  /** Mints a throwaway workspace on the server and signs into it. */
  const startDemo = useCallback<AuthState["startDemo"]>(async () => {
    accept(await api<AuthResponse>("/demo/session", { method: "POST" }));
  }, [accept]);

  const signOut = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setStatus("anonymous");
    router.replace("/login");
  }, [router]);

  const value = useMemo<AuthState>(
    () => ({ user, status, signIn, signUp, startDemo, signOut }),
    [user, status, signIn, signUp, startDemo, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }

  return context;
}

/** True when a rejected request means the session is gone rather than the input being bad. */
export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
