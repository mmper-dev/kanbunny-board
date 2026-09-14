/**
 * Sign-in state.
 *
 * Only meaningful when the app runs against the real backend. In demo mode there is no account and
 * no token, so `AuthGate` renders the board straight away.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { IS_DEMO_MODE } from "@/api";
import { login as requestToken } from "@/api/http-api";
import { getToken, setToken, subscribeToToken } from "@/api/token";

type AuthContextValue = {
  token: string | null;
  authenticated: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getToken());

  // The HTTP client clears the token when the server answers 401, so an expired session drops
  // back to the sign-in screen without anything else having to notice.
  useEffect(() => subscribeToToken(setTokenState), []);

  const signIn = useCallback(async (username: string, password: string) => {
    setToken(await requestToken(username, password));
  }, []);

  const signOut = useCallback(() => setToken(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({ token, authenticated: IS_DEMO_MODE || token !== null, signIn, signOut }),
    [token, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
