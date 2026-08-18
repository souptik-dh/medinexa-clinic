"use client";
import React, { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  description: string;
  impactItems?: string[];
  confirmLabel?: string;
}

const CONFIRM_WORD = "DELETE";

export default function ConfirmDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  impactItems,
  confirmLabel = "Delete",
}: ConfirmDeleteModalProps) {
  const [confirmText, setConfirmText] = useState("");
  const [confirming, setConfirming] = useState(false);

  // Clear stale input whenever the modal is (re)opened, including for a
  // different record — otherwise a previous "DELETE" carries over.
  useEffect(() => {
    if (isOpen) setConfirmText("");
  }, [isOpen]);

  const canConfirm = confirmText === CONFIRM_WORD && !confirming;

  const handleClose = () => {
    if (confirming) return;
    onClose();
  };

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setConfirming(true);
    try {
      await onConfirm();
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} className="m-4 max-w-md">
      <div className="p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Are you sure you want to delete?
        </h3>
        <p className="mt-2 text-sm font-medium text-gray-700 dark:text-gray-300">{title}</p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>

        {impactItems && impactItems.length > 0 && (
          <div className="mt-4 rounded-lg border border-warning-500/30 bg-warning-50 p-3 dark:border-warning-500/20 dark:bg-warning-500/10">
            <p className="text-sm font-medium text-warning-700 dark:text-orange-400">
              This will also affect:
            </p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-warning-700 dark:text-orange-400">
              {impactItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5">
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Type <span className="font-semibold text-error-500">{CONFIRM_WORD}</span> to confirm
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            disabled={confirming}
            autoFocus
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            onClick={handleClose}
            disabled={confirming}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="rounded-lg bg-error-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-error-600 disabled:cursor-not-allowed disabled:bg-error-300"
          >
            {confirming ? "Deleting…" : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
