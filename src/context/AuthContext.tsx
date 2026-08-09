"use client";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  Clinic,
  authApi,
  clearTokens,
  getRefreshToken,
  getStoredUser,
  setSessionExpiredHandler,
  setStoredUser,
  setTokens,
  User,
} from "@/lib/api";
import {
  BranchStaffPermission,
  hasPermission,
} from "@/lib/permissions";

function readStoredClinic(): Clinic | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("medinexa.clinic");
    return raw ? (JSON.parse(raw) as Clinic) : null;
  } catch {
    return null;
  }
}

interface AuthContextValue {
  user: User | null;
  clinic: Clinic | null;
  can: (permission: BranchStaffPermission) => boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    name: string;
    email: string;
    phone?: string;
    password: string;
  }) => Promise<void>;
  staffLogin: (email: string) => Promise<void>;
  verifyStaffOtp: (email: string, otp: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [clinic, setClinic] = useState<Clinic | null>(() => readStoredClinic());

  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      setClinic(null);
      router.push("/signin?reason=session_expired");
    });
    return () => setSessionExpiredHandler(null);
  }, [router, setUser, setClinic]);

  const persist = useCallback(
    (nextUser: User, nextClinic?: Clinic) => {
      setUser(nextUser);
      setStoredUser(nextUser);
      if (nextClinic) {
        setClinic(nextClinic);
        window.localStorage.setItem("medinexa.clinic", JSON.stringify(nextClinic));
      }
    },
    []
  );

  const login = useCallback(
    async (email: string, password: string) => {
      try {
        const res = await authApi.loginClinicOwner({ email, password });
        setTokens({ access_token: res.access_token, refresh_token: res.refresh_token });
        persist(res.user, res.clinic);
      } catch (err) {
        if (err instanceof ApiError) {
          throw new Error(err.message);
        }
        throw err;
      }
    },
    [persist]
  );

  const register = useCallback(
    async (input: { name: string; email: string; phone?: string; password: string }) => {
      try {
        const res = await authApi.registerClinicOwner(input);
        setTokens({ access_token: res.access_token, refresh_token: res.refresh_token });
        persist(res.user, res.clinic);
      } catch (err) {
        if (err instanceof ApiError) {
          throw new Error(err.message);
        }
        throw err;
      }
    },
    [persist]
  );

  const staffLogin = useCallback(async (email: string) => {
    await authApi.branchStaffLogin(email);
  }, []);

  const verifyStaffOtp = useCallback(async (email: string, otp: string) => {
    const res = await authApi.verifyStaffOtp({ email, otp });
    setTokens({ access_token: res.access_token, refresh_token: res.refresh_token });
    setUser(res.user);
    setStoredUser(res.user);
    window.localStorage.removeItem("medinexa.clinic");
    setClinic(null);
  }, []);

  const can = useCallback(
    (permission: BranchStaffPermission): boolean => {
      if (!user) return false;
      if (user.role === "clinic_owner" || user.role === "sys_admin") return true;
      if (user.role === "branch_staff") {
        return hasPermission(user.permissions, permission);
      }
      return false;
    },
    [user]
  );

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        await authApi.logout({ refresh_token: refreshToken });
      } catch {
        // best-effort revocation
      }
    }
    clearTokens();
    setStoredUser(null);
    window.localStorage.removeItem("medinexa.clinic");
    setUser(null);
    setClinic(null);
    router.push("/signin");
  }, [router]);

  return (
    <AuthContext.Provider
      value={{ user, clinic, can, login, register, staffLogin, verifyStaffOtp, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
