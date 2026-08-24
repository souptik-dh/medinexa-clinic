"use client";
import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import Badge from "@/components/ui/badge/Badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, SuperAdminGrantItem, superAdminApi } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";

export default function SuperAdminAdminsPanel() {
  const [items, setItems] = useState<SuperAdminGrantItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [granting, setGranting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await superAdminApi.superAdmins();
      setItems(res.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load super admins");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const grant = async () => {
    setGranting(true);
    try {
      const res = await superAdminApi.grantSuperAdmin(email.trim());
      toast.success(res.message || `${email} is now a super admin.`);
      setEmail("");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to grant super admin");
    } finally {
      setGranting(false);
    }
  };

  const revoke = async (userId: string, userEmail: string) => {
    if (!window.confirm(`Revoke super admin access for ${userEmail}?`)) return;
    setRevokingId(userId);
    try {
      await superAdminApi.revokeSuperAdmin(userId);
      toast.success("Super admin access revoked.");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to revoke");
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:flex-row sm:items-end sm:p-6">
        <div className="flex-1">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
            Grant by email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
        </div>
        <button
          onClick={grant}
          disabled={granting || !email.includes("@")}
          className="inline-flex h-11 items-center rounded-lg bg-brand-500 px-5 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
        >
          {granting ? "Granting…" : "Grant"}
        </button>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        {error && <p className="p-6 text-sm text-error-500">{error}</p>}
        {!error && !loading && items.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No grants recorded.
          </p>
        )}
        {items.length > 0 && (
          <div className="overflow-x-auto p-4 sm:p-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">User</TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Status</TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Granted by</TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Actions</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((a) => (
                  <TableRow key={a.user_id}>
                    <TableCell className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-800 dark:text-white/90">{a.name}</p>
                      <span className="block text-xs text-gray-400">{a.email}</span>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Badge size="sm" color={a.revoked ? "error" : "success"}>
                        {a.revoked ? "Revoked" : a.account_status || "Active"}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-gray-400">
                      {a.granted_by_email ?? "—"}
                      <span className="block">{formatDateTime(a.granted_at)}</span>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {!a.revoked && (
                        <button
                          onClick={() => revoke(a.user_id, a.email)}
                          disabled={revokingId === a.user_id}
                          className="rounded-lg border border-error-500/40 px-3 py-1.5 text-xs font-medium text-error-500 hover:bg-error-50 disabled:opacity-60 dark:hover:bg-error-500/10"
                        >
                          {revokingId === a.user_id ? "Revoking…" : "Revoke"}
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {loading && (
          <p className="py-8 text-center text-sm text-gray-400">Loading…</p>
        )}
      </div>
    </div>
  );
}
