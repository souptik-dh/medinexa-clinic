"use client";
import React, { useCallback, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import Badge from "@/components/ui/badge/Badge";
import TruckLoader from "@/components/common/TruckLoader";
import BranchSelect, { BranchSelectValue } from "@/components/branches/BranchSelect";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import ClinicTabs from "@/components/clinics/ClinicTabs";
import ConfirmDeleteModal from "@/components/common/ConfirmDeleteModal";
import FormDrawer from "@/components/common/FormDrawer";
import InviteDoctorForm from "@/components/doctors/InviteDoctorForm";
import Pagination from "@/components/tables/Pagination";
import { useModal } from "@/hooks/useModal";
import { usePagination } from "@/hooks/usePagination";
import { useAuth } from "@/context/AuthContext";
import {
  BranchDoctor,
  DoctorInvite,
  DoctorSearchResult,
  doctorInvitesApi,
  doctorsApi,
} from "@/lib/api";
import {
  formatCurrency,
  formatDate,
  inviteStatusColor,
  inviteStatusLabel,
} from "@/lib/utils";
import { getErrorMessage } from "@/lib/errorMessage";
import Link from "next/link";

type Tab = "doctors" | "invites" | "search";

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

const initials = (name: string): string =>
  name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export default function DoctorsPanel() {
  const { can } = useAuth();
  const canManage = can("doctors:manage");
  const searchParams = useSearchParams();
  const initialClinicId = searchParams.get("clinic_id") ?? undefined;
  const initialBranchId = searchParams.get("branch_id") ?? undefined;
  const [branch, setBranch] = useState<BranchSelectValue | null>(null);
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("doctors-panel-tab");
      if (saved === "doctors" || saved === "invites" || saved === "search") return saved;
    }
    return "doctors";
  });

  const [doctors, setDoctors] = useState<BranchDoctor[]>([]);
  const [invites, setInvites] = useState<DoctorInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [doctorToRemove, setDoctorToRemove] = useState<BranchDoctor | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  // doctor directory search (GET /doctors/search)
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DoctorSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // doctor photo (clinic level)
  const [photoDoctor, setPhotoDoctor] = useState<BranchDoctor | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoFileRef = React.useRef<HTMLInputElement>(null);
  const {
    isOpen: isPhotoOpen,
    openModal: openPhotoModal,
    closeModal: closePhotoModal,
  } = useModal();

  const {
    page: doctorsPage,
    setPage: setDoctorsPage,
    totalPages: doctorsTotalPages,
    pageItems: doctorsPageItems,
  } = usePagination(doctors, { resetKey: branch?.id });
  const {
    page: invitesPage,
    setPage: setInvitesPage,
    totalPages: invitesTotalPages,
    pageItems: invitesPageItems,
  } = usePagination(invites, { resetKey: branch?.id });

  const load = useCallback(
    async (b: BranchSelectValue | null, activeTab: Tab) => {
      if (!b) {
        setDoctors([]);
        setInvites([]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        if (activeTab === "doctors") {
          const res = await doctorsApi.listByBranch(b.id);
          setDoctors(res.items);
        } else {
          const res = await doctorInvitesApi.list(b.id);
          setInvites(res.items);
        }
      } catch (err) {
        setDoctors([]);
        setInvites([]);
        setError(getErrorMessage(err, "Failed to load doctors"));
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const onBranchChange = (b: BranchSelectValue | null) => {
    setBranch(b);
    load(b, tab);
  };

  const onTabChange = (t: Tab) => {
    setTab(t);
    sessionStorage.setItem("doctors-panel-tab", t);
    if (t !== "search") load(branch, t);
  };

  const runSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearchLoading(true);
    setSearchError(null);
    try {
      const res = await doctorsApi.search(q, 20);
      setSearchResults(res.items);
      setHasSearched(true);
    } catch (err) {
      setSearchResults([]);
      setSearchError(getErrorMessage(err, "Search failed"));
    } finally {
      setSearchLoading(false);
    }
  };

  const revokeInvite = async (invite: DoctorInvite) => {
    if (!canManage) {
      toast.error("You do not have permission to perform this action.");
      return;
    }
    if (!window.confirm(`Revoke the invite for ${invite.email}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await doctorInvitesApi.revoke(invite.id);
      if (branch) await load(branch, "invites");
      toast.success("Invite revoked successfully.");
    } catch (err) {
      const message = getErrorMessage(err, "Unable to revoke invite. Please try again.");
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const confirmRemoveDoctor = async () => {
    const doc = doctorToRemove;
    if (!doc) return;
    if (!canManage) {
      toast.error("You do not have permission to perform this action.");
      return;
    }
    setError(null);
    try {
      await doctorsApi.removeAssignment(doc.assignment_id);
      if (branch) await load(branch, "doctors");
      toast.success("Doctor removed from branch successfully.");
      setDoctorToRemove(null);
    } catch (err) {
      toast.error(getErrorMessage(err, "Unable to remove doctor. Please try again."));
    }
  };

  const openPhoto = (doc: BranchDoctor) => {
    setPhotoDoctor(doc);
    setPhotoUrl(null);
    setPhotoError(null);
    openPhotoModal();
  };

  const uploadDoctorPhoto = async (file: File) => {
    if (!photoDoctor || !branch) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const res = await doctorsApi.uploadBranchDoctorPhoto(
        branch.id,
        photoDoctor.id,
        file
      );
      setPhotoUrl(res.photo_url);
      setDoctors((prev) =>
        prev.map((d) =>
          d.id === photoDoctor.id ? { ...d, photo_url: res.photo_url } : d
        )
      );
      toast.success("Doctor photo updated successfully.");
    } catch (err) {
      const message = getErrorMessage(err, "Photo upload failed");
      setPhotoError(message);
      toast.error(message);
    } finally {
      setPhotoBusy(false);
    }
  };

  const formatNextSlot = (iso: string | null): string => {
    if (!iso) return "—";
    return iso.replace("T", " ").slice(0, 16);
  };

  const nextUnavailable = (doc: BranchDoctor): string => {
    const upcoming = doc.unavailable_dates
      .slice()
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
    const next = upcoming[0];
    if (!next) return "—";
    const range =
      next.start_date === next.end_date
        ? formatDate(next.start_date)
        : `${formatDate(next.start_date)} – ${formatDate(next.end_date)}`;
    return next.reason ? `${range} (${next.reason})` : range;
  };

  const tabClass = (t: Tab) =>
    `px-4 py-2.5 text-sm font-medium transition ${
      tab === t
        ? "border-b-2 border-brand-500 text-brand-500"
        : "border-b-2 border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
    }`;

  return (
    <div className="space-y-4">
      <ClinicTabs />
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Branch doctors
        </h3>
        <BranchSelect
          value={branch?.id ?? ""}
          onChange={onBranchChange}
          initialClinicId={initialClinicId}
          initialBranchId={initialBranchId}
        />
      </div>

      {error && (
        <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 pb-4 pt-4 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-6">
            <button onClick={() => onTabChange("doctors")} className={tabClass("doctors")}>
              Doctors
            </button>
            <button onClick={() => onTabChange("invites")} className={tabClass("invites")}>
              Invites
            </button>
            <button onClick={() => onTabChange("search")} className={tabClass("search")}>
              Search
            </button>
          </div>
          {tab === "invites" && canManage && (
            <button
              onClick={() => setInviteOpen(true)}
              disabled={!branch}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
            >
              + New invite
            </button>
          )}
        </div>

        {tab === "search" ? (
          <div className="py-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                placeholder="Search by name, specialization, or registration no."
                className={inputClass}
              />
              <button
                onClick={runSearch}
                disabled={searchLoading || !searchQuery.trim()}
                className="h-11 shrink-0 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-brand-300"
              >
                {searchLoading ? "Searching…" : "Search"}
              </button>
            </div>

            {searchError && (
              <div className="mt-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
                {searchError}
              </div>
            )}

            {!hasSearched ? (
              <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                Search the doctor directory by name, specialization, or registration number.
              </p>
            ) : searchLoading ? (
              <TruckLoader label="Searching…" />
            ) : searchResults.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                No doctors found for &quot;{searchQuery}&quot;.
              </p>
            ) : (
              <div className="mt-4 max-w-full overflow-x-auto">
                <Table>
                  <TableHeader className="border-gray-100 dark:border-gray-800 border-y">
                    <TableRow>
                      <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                        Doctor
                      </TableCell>
                      <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                        Specialization
                      </TableCell>
                      <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                        Reg. no
                      </TableCell>
                      <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                        Phone
                      </TableCell>
                      <TableCell isHeader className="py-3 font-medium text-gray-500 text-end text-theme-xs dark:text-gray-400">
                        Clinics
                      </TableCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {searchResults.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-white">
                              {initials(d.name)}
                            </div>
                            <p className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
                              {d.name}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                          {d.specialization ?? "—"}
                        </TableCell>
                        <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                          {d.reg_no ?? "—"}
                        </TableCell>
                        <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                          {d.phone ?? "—"}
                        </TableCell>
                        <TableCell className="py-3 text-end text-gray-500 text-theme-sm dark:text-gray-400">
                          {d.clinic_count}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        ) : !branch ? (
          <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            Select a branch to view its doctors and invites.
          </p>
        ) : loading ? (
          <TruckLoader label="Loading doctors…" />
        ) : tab === "doctors" ? (
          doctors.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
              No doctors assigned to this branch yet. Invite one from the Invites tab.
            </p>
          ) : (
            <>
            <div className="max-w-full overflow-x-auto">
              <Table>
                <TableHeader className="border-gray-100 dark:border-gray-800 border-y">
                  <TableRow>
                    <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                      Doctor
                    </TableCell>
                    <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                      Specialization
                    </TableCell>
                    <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                      Fee
                    </TableCell>
                    <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                      Booking type
                    </TableCell>
                    <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                      Next slot
                    </TableCell>
                    <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                      Next unavailable
                    </TableCell>
                    <TableCell isHeader className="py-3 font-medium text-gray-500 text-end text-theme-xs dark:text-gray-400">
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {doctorsPageItems.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="py-3">
                        <Link
                          href={`/doctors/${branch.id}/${doc.id}`}
                          className="flex items-center gap-3 hover:opacity-80"
                        >
                          {doc.photo_url ? (
                            <Image
                              src={doc.photo_url}
                              alt={`${doc.name} photo`}
                              width={40}
                              height={40}
                              unoptimized
                              className="h-10 w-10 shrink-0 rounded-full border border-gray-200 object-cover dark:border-gray-800"
                            />
                          ) : (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-white">
                              {initials(doc.name)}
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-gray-800 text-theme-sm hover:text-brand-500 dark:text-white/90">
                              {doc.name}
                            </p>
                            <span className="text-gray-400 text-theme-xs dark:text-gray-500">
                              {doc.phone ?? "—"}
                            </span>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                        {doc.specialization ?? "—"}
                      </TableCell>
                      <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                        {formatCurrency(doc.fee_amount, doc.currency)}
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge size="sm" color={doc.slot_type === "sequential" ? "info" : "light"}>
                          {doc.slot_type === "sequential" ? "Sequential" : "Fixed"}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                        {formatNextSlot(doc.next_available_slot)}
                      </TableCell>
                      <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                        {nextUnavailable(doc)}
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex justify-end gap-1">
                          {canManage && (
                            <button
                              onClick={() => openPhoto(doc)}
                              disabled={busy}
                              className="rounded-lg px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800"
                            >
                              Photo
                            </button>
                          )}
                          {canManage && (
                            <Link
                              href={`/doctors/${branch.id}/${doc.id}/edit`}
                              className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-500 hover:bg-brand-50 disabled:opacity-50 dark:hover:bg-brand-500/10"
                            >
                              Edit
                            </Link>
                          )}
                          {canManage && (
                            <button
                              onClick={() => setDoctorToRemove(doc)}
                              disabled={busy}
                              className="rounded-lg px-2 py-1.5 text-xs font-medium text-error-600 hover:bg-error-50 disabled:opacity-50 dark:hover:bg-error-500/10"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {doctors.length > 10 && (
              <div className="mt-4 flex justify-center">
                <Pagination
                  currentPage={doctorsPage}
                  totalPages={doctorsTotalPages}
                  onPageChange={setDoctorsPage}
                />
              </div>
            )}
            </>
          )
        ) : invites.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            No invites for this branch yet.
          </p>
        ) : (
          <>
          <div className="max-w-full overflow-x-auto">
            <Table>
              <TableHeader className="border-gray-100 dark:border-gray-800 border-y">
                <TableRow>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    Doctor
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    Reg. no
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    Status
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    Expires
                  </TableCell>
                  <TableCell isHeader className="py-3 font-medium text-gray-500 text-end text-theme-xs dark:text-gray-400">
                    Actions
                  </TableCell>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                {invitesPageItems.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="py-3">
                      <p className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
                        {inv.name ?? inv.email}
                      </p>
                      <span className="text-gray-400 text-theme-xs dark:text-gray-500">
                        {inv.email}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                      {inv.reg_no ?? "—"}
                      {inv.smc_name && (
                        <span className="block text-gray-400 text-theme-xs dark:text-gray-500">
                          {inv.smc_name}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="py-3">
                      <Badge size="sm" color={inviteStatusColor(inv.status)}>
                        {inviteStatusLabel(inv.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                      {new Date(inv.expires_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex justify-end">
                        {inv.status === "pending" && canManage && (
                          <button
                            onClick={() => revokeInvite(inv)}
                            disabled={busy}
                            className="rounded-lg px-2 py-1.5 text-xs font-medium text-error-600 hover:bg-error-50 disabled:opacity-50 dark:hover:bg-error-500/10"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {invites.length > 10 && (
            <div className="mt-4 flex justify-center">
              <Pagination
                currentPage={invitesPage}
                totalPages={invitesTotalPages}
                onPageChange={setInvitesPage}
              />
            </div>
          )}
          </>
        )}
      </div>

      {/* Doctor photo modal */}
      <Modal
        isOpen={isPhotoOpen}
        onClose={closePhotoModal}
        className="max-w-[480px] p-6 lg:p-8"
      >
        <h5 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Doctor photo — {photoDoctor?.name}
        </h5>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Upload a profile photo for this doctor. Signed preview links expire
          after 15 minutes.
        </p>

        {photoError && (
          <div className="mt-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
            {photoError}
          </div>
        )}

        {photoUrl && (
          <div className="mt-4 flex items-center gap-4 rounded-lg border border-success-500/30 bg-success-50 px-4 py-3 dark:bg-success-500/10">
            <Image
              src={photoUrl}
              alt={`${photoDoctor?.name ?? "Doctor"} photo`}
              width={64}
              height={64}
              unoptimized
              className="h-16 w-16 rounded-full border border-gray-200 object-cover dark:border-gray-800"
            />
            <p className="text-sm text-success-700 dark:text-success-500">
              Photo uploaded successfully.
            </p>
          </div>
        )}

        <div className="mt-6">
          <input
            ref={photoFileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadDoctorPhoto(file);
            }}
            disabled={photoBusy}
            className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200 dark:text-gray-400 dark:file:bg-gray-800 dark:file:text-gray-200"
          />
          <div className="mt-4 flex justify-end gap-3">
            <button
              onClick={closePhotoModal}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            >
              {photoUrl ? "Done" : "Cancel"}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDeleteModal
        isOpen={doctorToRemove !== null}
        onClose={() => setDoctorToRemove(null)}
        onConfirm={confirmRemoveDoctor}
        title={doctorToRemove ? `Remove ${doctorToRemove.name} from this branch?` : ""}
        description="This does not delete the doctor's account — they can be re-invited later."
        impactItems={["The doctor's upcoming schedule at this branch"]}
        confirmLabel="Remove doctor"
      />

      {/* New invite opens as a slide-over so the user stays on the Invites tab */}
      <FormDrawer
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite doctor"
        description="A single-use invite code is emailed to the doctor."
      >
        <InviteDoctorForm
          onDone={() => {
            setInviteOpen(false);
            if (branch) load(branch, "invites");
          }}
          onCancel={() => setInviteOpen(false)}
        />
      </FormDrawer>
    </div>
  );
}
