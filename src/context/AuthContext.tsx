"use client";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  ApiError,
  BranchStaffMe,
  Clinic,
  authApi,
  branchStaffApi,
  clearTokens,
  ensureActiveSession,
  getAccessTokenExpiryMs,
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

function readStoredStaffBranch(): BranchStaffMe["branch"] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("medinexa.staffBranch");
    return raw ? (JSON.parse(raw) as BranchStaffMe["branch"]) : null;
  } catch {
    return null;
  }
}

function readStoredStaffClinic(): BranchStaffMe["clinic"] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("medinexa.staffClinic");
    return raw ? (JSON.parse(raw) as BranchStaffMe["clinic"]) : null;
  } catch {
    return null;
  }
}

interface AuthContextValue {
  user: User | null;
  clinic: Clinic | null;
  // The clinic/branch a branch_staff user is assigned to, sourced from
  // GET /branch-staff/me rather than any client-supplied id - drives the
  // "my branch" view so staff can never browse into another branch.
  staffClinic: BranchStaffMe["clinic"] | null;
  staffBranch: BranchStaffMe["branch"] | null;
  can: (permission: BranchStaffPermission) => boolean;
  login: (email: string, password: string) => Promise<void>;
  doctorLogin: (email: string, password: string) => Promise<void>;
  register: (input: {
    name: string;
    email: string;
    phone?: string;
    password: string;
    clinicName?: string;
  }) => Promise<{ verified: boolean; message: string }>;
  staffLogin: (email: string) => Promise<void>;
  verifyStaffOtp: (email: string, otp: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [clinic, setClinic] = useState<Clinic | null>(() => readStoredClinic());
  const [staffClinic, setStaffClinic] = useState<BranchStaffMe["clinic"] | null>(() =>
    readStoredStaffClinic()
  );
  const [staffBranch, setStaffBranch] = useState<BranchStaffMe["branch"] | null>(() =>
    readStoredStaffBranch()
  );

  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      setClinic(null);
      setStaffClinic(null);
      setStaffBranch(null);
      window.localStorage.removeItem("medinexa.staffClinic");
      window.localStorage.removeItem("medinexa.staffBranch");
      toast.error("Session expired. Please log in again.");
      router.push("/signin?reason=session_expired");
    });
    return () => setSessionExpiredHandler(null);
  }, [router, setUser, setClinic]);

  // Proactively detect an expired access token instead of waiting for an
  // API call to 401 - so a session that expires while the user is idle on
  // a page that makes no requests still gets logged out.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleNextCheck = () => {
      const expiryMs = getAccessTokenExpiryMs();
      const delay = expiryMs !== null ? Math.max(expiryMs - Date.now(), 0) : 0;
      timer = setTimeout(async () => {
        if (cancelled) return;
        const active = await ensureActiveSession();
        if (active && !cancelled) scheduleNextCheck();
      }, delay);
    };

    scheduleNextCheck();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [user]);

  // Backfills clinic/branch for a branch_staff session that doesn't have it
  // yet - either a page refresh of a session from before this existed, or
  // one where the login-time GET /branch-staff/me call failed transiently.
  // Without this, such a session would be stuck with no branch until the
  // user explicitly logs out and back in.
  useEffect(() => {
    if (!user || user.role !== "branch_staff" || staffBranch) return;
    let cancelled = false;
    branchStaffApi
      .me()
      .then((me) => {
        if (cancelled) return;
        setStaffClinic(me.clinic);
        setStaffBranch(me.branch);
        window.localStorage.setItem("medinexa.staffClinic", JSON.stringify(me.clinic));
        window.localStorage.setItem("medinexa.staffBranch", JSON.stringify(me.branch));
        setUser((prev) => {
          if (!prev) return prev;
          const updated = { ...prev, branch_id: me.branch.id, permissions: me.permissions };
          setStoredUser(updated);
          return updated;
        });
      })
      .catch(() => {
        // Leave staffBranch null; BranchSelect surfaces an explicit
        // "couldn't load your branch" state until this succeeds.
      });
    return () => {
      cancelled = true;
    };
  }, [user, staffBranch]);

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
        toast.success("Signed in successfully.");
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
    async (input: {
      name: string;
      email: string;
      phone?: string;
      password: string;
      clinicName?: string;
    }) => {
      try {
        const { clinicName, ...rest } = input;
        const res = await authApi.registerClinicOwner({
          ...rest,
          clinicName: clinicName || undefined,
        });
        // A freshly registered clinic_owner account is `pending` until the
        // emailed verification link is followed, so no tokens are issued yet
        // and there's nothing to log the user into.
        if (res.access_token && res.refresh_token) {
          setTokens({ access_token: res.access_token, refresh_token: res.refresh_token });
          persist(res.user, res.clinic);
          return { verified: true, message: res.message ?? "Account created." };
        }
        return {
          verified: false,
          message:
            res.message ??
            "Registration successful. Check your email to verify your account before logging in.",
        };
      } catch (err) {
        if (err instanceof ApiError) {
          throw new Error(err.message);
        }
        throw err;
      }
    },
    [persist]
  );

  const doctorLogin = useCallback(
    async (email: string, password: string) => {
      try {
        const res = await authApi.loginDoctor({ email, password });
        setTokens({ access_token: res.access_token, refresh_token: res.refresh_token });
        // POST /auth/doctor/login doesn't echo back the email used to sign in, so it's
        // filled in from the input here to satisfy User.email (used only for display).
        const nextUser: User = {
          id: res.doctor.id,
          name: res.doctor.name,
          email,
          phone: res.doctor.phone,
          role: "doctor",
        };
        setClinic(null);
        setStaffClinic(null);
        setStaffBranch(null);
        window.localStorage.removeItem("medinexa.clinic");
        window.localStorage.removeItem("medinexa.staffClinic");
        window.localStorage.removeItem("medinexa.staffBranch");
        persist(nextUser);
        toast.success("Signed in successfully.");
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

    let userToStore = res.user;
    let nextStaffClinic: BranchStaffMe["clinic"] | null = null;
    let nextStaffBranch: BranchStaffMe["branch"] | null = null;
    if (userToStore.role === "branch_staff") {
      // GET /branch-staff/me is the authoritative source for this staff
      // member's clinic/branch/permissions - drive the whole "my branch"
      // view from it rather than trusting the branch_id on the login
      // response or letting the UI pick a branch out of the full directory.
      try {
        const me = await branchStaffApi.me();
        userToStore = { ...userToStore, branch_id: me.branch.id, permissions: me.permissions };
        nextStaffClinic = me.clinic;
        nextStaffBranch = me.branch;
      } catch {
        // Non-fatal: continue with whatever permissions (if any) were
        // returned by the auth response; the branch panels will show an
        // explicit "couldn't load your branch" state until this succeeds.
      }
    }

    setUser(userToStore);
    setStoredUser(userToStore);
    window.localStorage.removeItem("medinexa.clinic");
    setClinic(null);
    setStaffClinic(nextStaffClinic);
    setStaffBranch(nextStaffBranch);
    if (nextStaffClinic) {
      window.localStorage.setItem("medinexa.staffClinic", JSON.stringify(nextStaffClinic));
    } else {
      window.localStorage.removeItem("medinexa.staffClinic");
    }
    if (nextStaffBranch) {
      window.localStorage.setItem("medinexa.staffBranch", JSON.stringify(nextStaffBranch));
    } else {
      window.localStorage.removeItem("medinexa.staffBranch");
    }
    toast.success("Signed in successfully.");
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
    window.localStorage.removeItem("medinexa.staffClinic");
    window.localStorage.removeItem("medinexa.staffBranch");
    setUser(null);
    setClinic(null);
    setStaffClinic(null);
    setStaffBranch(null);
    toast.success("Signed out.");
    router.push("/signin");
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        clinic,
        staffClinic,
        staffBranch,
        can,
        login,
        doctorLogin,
        register,
        staffLogin,
        verifyStaffOtp,
        logout,
      }}
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
