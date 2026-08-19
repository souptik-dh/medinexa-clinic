"use client";
import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import LabTestForm, { LabTestFormValues } from "@/components/lab-tests/LabTestForm";
import { LabTest, labTestsApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorMessage";

export default function EditLabTestPage() {
  const router = useRouter();
  const { clinicId, id } = useParams<{ clinicId: string; id: string }>();
  const cancelHref = `/clinics/${clinicId}/lab-tests`;

  const [item, setItem] = useState<LabTest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    labTestsApi
      .list({ clinic_id: clinicId, limit: 100 })
      .then((res) => {
        const found = res.items.find((t) => t.id === id) ?? null;
        setItem(found);
        if (!found) setError("Lab test not found.");
      })
      .catch((err) => setError(getErrorMessage(err, "Failed to load lab test")))
      .finally(() => setLoading(false));
  }, [clinicId, id]);

  const initial: LabTestFormValues | null = item
    ? {
        name: item.name,
        code: item.code,
        description: item.description ?? "",
        category: item.category,
        instructions: item.instructions ?? "",
        default_precautions: (item.default_precautions ?? []).join(", "),
      }
    : null;

  return (
    <div>
      <PageBreadcrumb
        pageTitle="Edit Lab Test"
        items={[{ label: "Lab Tests", href: cancelHref }]}
      />
      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
      ) : error ? (
        <div className="max-w-[560px] rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      ) : initial ? (
        <LabTestForm
          mode="edit"
          initial={initial}
          submitLabel="Update"
          cancelHref={cancelHref}
          onSubmit={async (payload) => {
            try {
              await labTestsApi.update(id, payload);
              toast.success("Lab test updated successfully.");
              router.push(cancelHref);
            } catch (err) {
              toast.error(getErrorMessage(err, "Failed to update lab test"));
              throw err;
            }
          }}
        />
      ) : null}
    </div>
  );
}
