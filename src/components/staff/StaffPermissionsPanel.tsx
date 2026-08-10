"use client";
import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Checkbox from "@/components/form/input/Checkbox";
import { useAuth } from "@/context/AuthContext";
import { ApiError, StaffMember, staffApi } from "@/lib/api";
import {
  BRANCH_STAFF_PERMISSION_MODULES,
  BRANCH_STAFF_PERMISSION_META,
  BranchStaffPermission,
} from "@/lib/permissions";

export default function StaffPermissionsPanel() {
  const router = useRouter();
  const params = useParams<{ branchId?: string; staffId?: string }>();
  const branchId = typeof params.branchId === "string" ? params.branchId : "";
  const staffId = typeof params.staffId === "string" ? params.staffId : "";

  const { can } = useAuth();
  const canManage = can("staff:manage");

  const [member, setMember] = useState<StaffMember | null>(null);
  const [permValues, setPermValues] = useState<BranchStaffPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!branchId || !staffId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [staffRes, permRes] = await Promise.all([
        staffApi.list(branchId),
        staffApi.getPermissions(branchId, staffId),
      ]);
      const found = staffRes.items.find((s) => s.id === staffId) ?? null;
      if (!found) {
        setError("Staff member not found.");
      } else {
        setMember(found);
      }
      setPermValues(permRes.permissions as BranchStaffPermission[]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load permissions");
    } finally {
      setLoading(false);
    }
  }, [branchId, staffId]);

  useEffect(() => {
    load();
  }, [load]);

  const togglePermission = (perm: BranchStaffPermission) => {
    setPermValues((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await staffApi.setPermissions(branchId, staffId, permValues);
      router.push("/staff");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
        Permissions{member && ` — ${member.name}`}
      </h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {member
          ? `Grant actions ${member.name} can perform at this branch.`
          : "Grant actions this staff member can perform at the branch."}
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      {loading ? (
        <p className="mt-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          Loading…
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          {BRANCH_STAFF_PERMISSION_MODULES.map((mod) => (
            <div key={mod.module}>
              <h6 className="mb-2 text-sm font-semibold text-gray-800 dark:text-white/90">
                {mod.label}
              </h6>
              <div className="space-y-3">
                {BRANCH_STAFF_PERMISSION_META.filter(
                  (m) => m.module === mod.module
                ).map((meta) => (
                  <div
                    key={meta.permission}
                    className="flex items-start justify-between gap-4 rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-800"
                  >
                    <div>
                      <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
                        {meta.label}
                      </p>
                      <p className="mt-0.5 text-theme-xs text-gray-500 dark:text-gray-400">
                        {meta.description}
                      </p>
                    </div>
                    <Checkbox
                      checked={permValues.includes(meta.permission)}
                      onChange={() => togglePermission(meta.permission)}
                      disabled={!canManage}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          onClick={() => router.push("/staff")}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          Back to staff
        </button>
        {canManage && (
          <button
            onClick={save}
            disabled={busy || loading}
            className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
          >
            {busy ? "Saving…" : "Save permissions"}
          </button>
        )}
      </div>
    </div>
  );
}
