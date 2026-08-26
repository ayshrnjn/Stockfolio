import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { request } from "../api/client";
import { clearAuthToken, getAuthToken, setAuthToken } from "./tokenStorage";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

interface Credentials {
  email: string;
  password: string;
}

interface RegistrationCredentials extends Credentials {
  name: string;
}

interface AuthResponse {
  token: string;
  user: AuthUser;
}

type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  login(credentials: Credentials): Promise<void>;
  register(credentials: RegistrationCredentials): Promise<void>;
  logout(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren): JSX.Element {
  const [status, setStatus] = useState<AuthStatus>(() => (
    getAuthToken() ? "loading" : "anonymous"
  ));
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    if (!getAuthToken()) return;

    const controller = new AbortController();
    request<{ user: AuthUser }>("/api/auth/me", { signal: controller.signal })
      .then(({ user: currentUser }) => {
        setUser(currentUser);
        setStatus("authenticated");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        clearAuthToken();
        setUser(null);
        setStatus("anonymous");
      });

    return () => controller.abort();
  }, []);

  const authenticate = useCallback(async (
    path: "/api/auth/login" | "/api/auth/register",
    credentials: Credentials,
  ): Promise<void> => {
    const response = await request<AuthResponse>(path, {
      method: "POST",
      body: JSON.stringify(credentials),
    });
    setAuthToken(response.token);
    setUser(response.user);
    setStatus("authenticated");
  }, []);

  const login = useCallback(
    (credentials: Credentials) => authenticate("/api/auth/login", credentials),
    [authenticate],
  );
  const register = useCallback(
    (credentials: RegistrationCredentials) => authenticate("/api/auth/register", credentials),
    [authenticate],
  );
  const logout = useCallback(() => {
    clearAuthToken();
    setUser(null);
    setStatus("anonymous");
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    status,
    user,
    login,
    register,
    logout,
  }), [status, user, login, register, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
