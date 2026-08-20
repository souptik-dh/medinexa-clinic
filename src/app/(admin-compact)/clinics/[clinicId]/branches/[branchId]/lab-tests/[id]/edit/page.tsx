"use client";
import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import BranchLabTestForm from "@/components/lab-tests/BranchLabTestForm";
import { BranchLabTest, branchLabTestsApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorMessage";
import TruckLoader from "@/components/common/TruckLoader";

export default function EditBranchLabTestPage() {
  const { branchId, id } = useParams<{ branchId: string; id: string }>();

  const [item, setItem] = useState<BranchLabTest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    branchLabTestsApi
      .list(branchId)
      .then((res) => {
        const found = res.items.find((i) => i.id === id) ?? null;
        setItem(found);
        if (!found) setError("Branch lab test not found.");
      })
      .catch((err) => setError(getErrorMessage(err, "Failed to load branch lab test")))
      .finally(() => setLoading(false));
  }, [branchId, id]);

  return (
    <div>
      <PageBreadcrumb
        pageTitle="Edit Branch Lab Test"
        items={[{ label: "Branches", href: "/branches" }]}
      />
      {loading ? (
        <TruckLoader />
      ) : error ? (
        <div className="max-w-[500px] rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      ) : item ? (
        <BranchLabTestForm editItem={item} />
      ) : null}
    </div>
  );
}
