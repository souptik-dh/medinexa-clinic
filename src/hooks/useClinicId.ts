"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { clinicsApi } from "@/lib/api";

// AuthContext's `clinic` is only populated from the login/register response,
// so a clinic_owner/sys_admin session restored from an older stored session
// (or one where the login payload didn't echo `clinic`) would otherwise have
// no clinic id at all. Falls back to GET /clinics (same source BranchesPanel
// uses) and takes the first one, mirroring how the rest of the app already
// handles a clinic_owner potentially owning more than one clinic.
export function useClinicId(): string | null {
  const { user, clinic, staffClinic } = useAuth();
  const [fetchedClinicId, setFetchedClinicId] = useState<string | null>(null);

  const isBranchStaff = user?.role === "branch_staff";
  const hasKnownClinic = isBranchStaff ? !!staffClinic?.id : !!clinic?.id;

  useEffect(() => {
    if (!user || isBranchStaff || hasKnownClinic) return;
    clinicsApi
      .list({ limit: 1 })
      .then((res) => setFetchedClinicId(res.items[0]?.id ?? null))
      .catch(() => {});
  }, [user, isBranchStaff, hasKnownClinic]);

  if (isBranchStaff) return staffClinic?.id ?? null;
  return clinic?.id ?? fetchedClinicId;
}
