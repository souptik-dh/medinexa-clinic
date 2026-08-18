"use client";
import React from "react";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import LabTestForm, { EMPTY_LAB_TEST_FORM } from "@/components/lab-tests/LabTestForm";
import { labTestsApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorMessage";

export default function NewLabTestPage() {
  const router = useRouter();
  const { clinicId } = useParams<{ clinicId: string }>();
  const cancelHref = `/clinics/${clinicId}/lab-tests`;

  return (
    <div>
      <PageBreadcrumb
        pageTitle="Create Lab Test"
        items={[{ label: "Lab Tests", href: cancelHref }]}
      />
      <LabTestForm
        mode="create"
        initial={EMPTY_LAB_TEST_FORM}
        submitLabel="Create"
        cancelHref={cancelHref}
        onSubmit={async (payload) => {
          try {
            await labTestsApi.create({ ...payload, clinic_id: clinicId });
            toast.success("Lab test created successfully.");
            router.push(cancelHref);
          } catch (err) {
            toast.error(getErrorMessage(err, "Failed to create lab test"));
            throw err;
          }
        }}
      />
    </div>
  );
}
