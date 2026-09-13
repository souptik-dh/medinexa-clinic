"use client";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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
import { getSecureItem, setSecureItem } from "@/lib/secureStorage";

function readStoredClinic(): Promise<Clinic | null> {
  return getSecureItem<Clinic>("medinexa.clinic");
}

function readStoredStaffBranch(): Promise<BranchStaffMe["branch"] | null> {
  return getSecureItem<BranchStaffMe["branch"]>("medinexa.staffBranch");
}

function readStoredStaffClinic(): Promise<BranchStaffMe["clinic"] | null> {
  return getSecureItem<BranchStaffMe["clinic"]>("medinexa.staffClinic");
}

interface AuthContextValue {
  user: User | null;
  isAuthReady: boolean;
  clinic: Clinic | null;
  staffClinic: BranchStaffMe["clinic"] | null;
  staffBranch: BranchStaffMe["branch"] | null;
  can: (permission: BranchStaffPermission) => boolean;
  /** Clinic owner login step 1: sends OTP to phone. */
  sendOwnerLoginOtp: (phone: string) => Promise<string>;
  /** Clinic owner login step 2: verifies OTP, stores session. */
  verifyOwnerOtp: (phone: string, otp: string) => Promise<void>;
  /** Clinic owner login: phone + password (alternative to OTP). */
  loginOwnerWithPassword: (phone: string, password: string) => Promise<void>;
  /** Sets a password for the current session (e.g. after an OTP-only login). */
  setPassword: (newPassword: string, confirmPassword: string) => Promise<string>;
  /** Doctor login step 1: sends OTP to phone. */
  sendDoctorLoginOtp: (phone: string) => Promise<string>;
  /** Doctor login step 2: verifies OTP, stores session. */
  verifyDoctorOtp: (phone: string, otp: string) => Promise<void>;
  /** Super admin: phone + password login. */
  superAdminLogin: (phone: string, password: string) => Promise<void>;
  /** Clinic owner registration step 1: sends OTP. */
  sendOwnerRegisterOtp: (input: {
    name: string;
    clinicName: string;
    phone: string;
    email?: string;
  }) => Promise<string>;
  /** Clinic owner registration step 2: verifies OTP, creates account + clinic. */
  verifyOwnerRegisterOtp: (input: {
    name: string;
    clinicName: string;
    phone: string;
    email?: string;
    otp: string;
  }) => Promise<{ clinicId?: string }>;
  /** Branch staff login step 1: sends OTP to phone. */
  staffLogin: (phone: string) => Promise<void>;
  /** Branch staff login step 2: verifies OTP, stores session. */
  verifyStaffOtp: (phone: string, otp: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [staffClinic, setStaffClinic] = useState<BranchStaffMe["clinic"] | null>(null);
  const [staffBranch, setStaffBranch] = useState<BranchStaffMe["branch"] | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // Reads localStorage only after mount (client-only) so the first client
  // render matches the server's null-state render - reading it in the useState
  // initializer above would make the client's first render diverge from SSR
  // and trigger a hydration mismatch. useLayoutEffect (rather than useEffect)
  // runs this before the browser paints, so protected layouts that gate on
  // `user` skip a blank frame instead of flashing it after paint.
  useLayoutEffect(() => {
    let cancelled = false;
    Promise.all([
      getStoredUser(),
      readStoredClinic(),
      readStoredStaffClinic(),
      readStoredStaffBranch(),
    ]).then(([storedUser, storedClinic, storedStaffClinic, storedStaffBranch]) => {
      if (cancelled) return;
      setUser(storedUser);
      setClinic(storedClinic);
      setStaffClinic(storedStaffClinic);
      setStaffBranch(storedStaffBranch);
      setIsAuthReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Mirrors `user`'s role so the session-expired handler below (registered
  // once, not re-registered per render) can read the latest role
  // synchronously instead of re-reading (now-async) storage.
  const userRoleRef = useRef<User["role"] | null>(null);
  useEffect(() => {
    userRoleRef.current = user?.role ?? null;
  }, [user]);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      // Super admins sign in through their own portal, so send them back
      // there rather than to the clinic/staff login.
      const wasSuperAdmin = userRoleRef.current === "sys_admin";
      setUser(null);
      setClinic(null);
      setStaffClinic(null);
      setStaffBranch(null);
      window.localStorage.removeItem("medinexa.staffClinic");
      window.localStorage.removeItem("medinexa.staffBranch");
      toast.error("Session expired. Please log in again.");
      router.push(
        wasSuperAdmin
          ? "/super-admin-login?reason=session_expired"
          : "/signin?reason=session_expired"
      );
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
      const delay = expiryMs !== null
        ? Math.max(expiryMs - Date.now(), 0)
        : 5 * 60 * 1000; // Default 5 min when token has no exp claim
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
        void setSecureItem("medinexa.staffClinic", me.clinic);
        void setSecureItem("medinexa.staffBranch", me.branch);
        setUser((prev) => {
          if (!prev) return prev;
          const updated = { ...prev, branch_id: me.branch.id, permissions: me.permissions };
          void setStoredUser(updated);
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
    async (nextUser: User, nextClinic?: Clinic) => {
      setUser(nextUser);
      await setStoredUser(nextUser);
      if (nextClinic) {
        setClinic(nextClinic);
        await setSecureItem("medinexa.clinic", nextClinic);
      }
    },
    []
  );

  const sendOwnerLoginOtp = useCallback(async (phone: string) => {
    try {
      const res = await authApi.sendClinicOwnerLoginOtp(phone);
      return res.message;
    } catch (err) {
      if (err instanceof ApiError) throw new Error(err.message);
      throw err;
    }
  }, []);

  // After an OTP login on an account with no password yet, nudge the owner
  // toward setting one so next time they can skip the OTP round-trip.
  const promptSetPasswordIfNeeded = useCallback(
    (requiresPasswordSetup?: boolean) => {
      if (!requiresPasswordSetup) return;
      toast(
        (t) => (
          <div className="flex items-center gap-3">
            <span>Add a password for faster sign-in next time?</span>
            <button
              type="button"
              className="shrink-0 rounded-md bg-brand-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-600"
              onClick={() => {
                toast.dismiss(t.id);
                router.push("/settings");
              }}
            >
              Set password
            </button>
          </div>
        ),
        { duration: 8000 }
      );
    },
    [router]
  );

  const verifyOwnerOtp = useCallback(async (phone: string, otp: string) => {
    try {
      const res = await authApi.verifyClinicOwnerOtp({ phone, otp });
      setTokens({ access_token: res.access_token, refresh_token: res.refresh_token });
      await persist(res.user, res.clinic);
      toast.success("Signed in successfully.");
      promptSetPasswordIfNeeded(res.requires_password_setup);
    } catch (err) {
      if (err instanceof ApiError) throw new Error(err.message);
      throw err;
    }
  }, [persist, promptSetPasswordIfNeeded]);

  const loginOwnerWithPassword = useCallback(async (phone: string, password: string) => {
    try {
      const res = await authApi.loginClinicOwnerWithPassword({ phone, password });
      setTokens({ access_token: res.access_token, refresh_token: res.refresh_token });
      await persist(res.user, res.clinic);
      toast.success("Signed in successfully.");
    } catch (err) {
      if (err instanceof ApiError) throw new Error(err.message);
      throw err;
    }
  }, [persist]);

  const setPassword = useCallback(async (newPassword: string, confirmPassword: string) => {
    try {
      const res = await authApi.setPassword({
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      return res.message;
    } catch (err) {
      if (err instanceof ApiError) throw new Error(err.message);
      throw err;
    }
  }, []);

  const sendDoctorLoginOtp = useCallback(async (phone: string) => {
    try {
      const res = await authApi.sendDoctorLoginOtp(phone);
      return res.message;
    } catch (err) {
      if (err instanceof ApiError) throw new Error(err.message);
      throw err;
    }
  }, []);

  const verifyDoctorOtp = useCallback(async (phone: string, otp: string) => {
    try {
      const res = await authApi.verifyDoctorOtp({ phone, otp });
      setTokens({ access_token: res.access_token, refresh_token: res.refresh_token });
      const nextUser: User = {
        id: res.doctor.id,
        name: res.doctor.name,
        email: res.user?.email ?? "",
        phone: res.doctor.phone,
        role: "doctor",
      };
      setClinic(null);
      setStaffClinic(null);
      setStaffBranch(null);
      window.localStorage.removeItem("medinexa.clinic");
      window.localStorage.removeItem("medinexa.staffClinic");
      window.localStorage.removeItem("medinexa.staffBranch");
      await persist(nextUser);
      toast.success("Signed in successfully.");
    } catch (err) {
      if (err instanceof ApiError) throw new Error(err.message);
      throw err;
    }
  }, [persist]);

  const sendOwnerRegisterOtp = useCallback(async (input: {
    name: string;
    clinicName: string;
    phone: string;
    email?: string;
  }) => {
    try {
      const res = await authApi.sendClinicOwnerOtp(input);
      return res.message;
    } catch (err) {
      if (err instanceof ApiError) throw new Error(err.message);
      throw err;
    }
  }, []);

  const verifyOwnerRegisterOtp = useCallback(async (input: {
    name: string;
    clinicName: string;
    phone: string;
    email?: string;
    otp: string;
  }) => {
    try {
      const res = await authApi.registerClinicOwner(input);
      setTokens({ access_token: res.access_token, refresh_token: res.refresh_token });
      await persist(res.user, res.clinic);
      return { clinicId: res.clinic?.id };
    } catch (err) {
      if (err instanceof ApiError) throw new Error(err.message);
      throw err;
    }
  }, [persist]);

  const staffLogin = useCallback(async (phone: string) => {
    await authApi.branchStaffLogin(phone);
  }, []);

  const superAdminLogin = useCallback(
    async (phone: string, password: string) => {
      try {
        const res = await authApi.loginSuperAdmin({ phone, password });
        setTokens({ access_token: res.access_token, refresh_token: res.refresh_token });
        window.localStorage.removeItem("medinexa.clinic");
        window.localStorage.removeItem("medinexa.staffClinic");
        window.localStorage.removeItem("medinexa.staffBranch");
        setClinic(null);
        setStaffClinic(null);
        setStaffBranch(null);
        await persist(res.user);
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

  const verifyStaffOtp = useCallback(async (phone: string, otp: string) => {
    const res = await authApi.verifyStaffOtp({ phone, otp });
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
    await setStoredUser(userToStore);
    window.localStorage.removeItem("medinexa.clinic");
    setClinic(null);
    setStaffClinic(nextStaffClinic);
    setStaffBranch(nextStaffBranch);
    if (nextStaffClinic) {
      await setSecureItem("medinexa.staffClinic", nextStaffClinic);
    } else {
      window.localStorage.removeItem("medinexa.staffClinic");
    }
    if (nextStaffBranch) {
      await setSecureItem("medinexa.staffBranch", nextStaffBranch);
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
    const wasSuperAdmin = userRoleRef.current === "sys_admin";
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
    router.push(wasSuperAdmin ? "/super-admin-login" : "/signin");
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthReady,
        clinic,
        staffClinic,
        staffBranch,
        can,
        sendOwnerLoginOtp,
        verifyOwnerOtp,
        loginOwnerWithPassword,
        setPassword,
        sendDoctorLoginOtp,
        verifyDoctorOtp,
        superAdminLogin,
        sendOwnerRegisterOtp,
        verifyOwnerRegisterOtp,
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
