"use client";
import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import Badge, { type BadgeColor } from "@/components/ui/badge/Badge";
import { Modal } from "@/components/ui/modal";
import {
  AdCategory,
  AdLinkType,
  AdPlacement,
  AdStatus,
  ApiError,
  SuperAdminAdvertisement,
  SuperAdminAdvertisementInput,
  SuperAdminClinicListItem,
  superAdminApi,
  uploadFileToCloudinary,
} from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { Skeleton } from "@/components/ui/skeleton/Skeleton";
import { useAsyncAction, useKeyedAction } from "@/hooks/useAsyncAction";

const CATEGORIES: AdCategory[] = ["insurance", "clinic", "pharmacy", "diagnostic", "wellness", "other"];
const LINK_TYPES: AdLinkType[] = ["none", "url", "clinic", "phone"];
const PLACEMENTS: AdPlacement[] = ["top", "middle", "bottom"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const labelClass = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400";

interface FormState {
  title: string;
  description: string;
  sponsor_name: string;
  category: AdCategory;
  placement: AdPlacement;
  cta_label: string;
  link_type: AdLinkType;
  link_value: string;
  link_clinic_name: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  sort_order: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  sponsor_name: "",
  category: "insurance",
  placement: "top",
  cta_label: "",
  link_type: "none",
  link_value: "",
  link_clinic_name: "",
  starts_at: "",
  ends_at: "",
  is_active: true,
  sort_order: "0",
};

/** ISO → value for <input type="datetime-local"> in the admin's local time. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

const STATUS_COLOR: Record<AdStatus, BadgeColor> = {
  live: "success",
  scheduled: "info",
  expired: "light",
  inactive: "warning",
};

export default function SuperAdminAdsPanel() {
  const { t } = useTranslation();

  const [ads, setAds] = useState<SuperAdminAdvertisement[]>([]);
  const [loading, setLoading] = useState(true);
  const [placementFilter, setPlacementFilter] = useState<AdPlacement | "all">("all");
  const visibleAds = placementFilter === "all" ? ads : ads.filter((a) => a.placement === placementFilter);
  const countFor = (p: AdPlacement) => ads.filter((a) => a.placement === p).length;

  const load = useCallback(async () => {
    try {
      const res = await superAdminApi.advertisements();
      setAds(res.items);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("superAdminAds.failedToLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const replaceAd = (ad: SuperAdminAdvertisement) =>
    setAds((prev) => {
      const next = prev.some((a) => a.id === ad.id) ? prev.map((a) => (a.id === ad.id ? ad : a)) : [ad, ...prev];
      return [...next].sort((a, b) => a.sort_order - b.sort_order || b.created_at.localeCompare(a.created_at));
    });

  // ── create / edit drawer ──────────────────────────────────────────
  const [editing, setEditing] = useState<SuperAdminAdvertisement | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const { pending: saving, run: runSave } = useAsyncAction();

  const patchForm = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setImageFile(null);
    setImagePreview(null);
    setEditing("new");
  };

  const openEdit = (ad: SuperAdminAdvertisement) => {
    setForm({
      title: ad.title,
      description: ad.description ?? "",
      sponsor_name: ad.sponsor_name ?? "",
      category: ad.category,
      placement: ad.placement,
      cta_label: ad.cta_label ?? "",
      link_type: ad.link_type,
      link_value: ad.link_value ?? "",
      link_clinic_name: ad.linked_clinic_name ?? "",
      starts_at: toLocalInput(ad.starts_at),
      ends_at: toLocalInput(ad.ends_at),
      is_active: ad.is_active,
      sort_order: String(ad.sort_order),
    });
    setImageFile(null);
    setImagePreview(ad.image_url);
    setEditing(ad);
  };

  useEffect(() => {
    if (!imageFile) return;
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const onPickImage = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(t("superAdminAds.imageTypeError"));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(t("superAdminAds.imageTooLarge"));
      return;
    }
    setImageFile(file);
  };

  // Clinic picker for link_type "clinic".
  const [clinicQuery, setClinicQuery] = useState("");
  const [clinicResults, setClinicResults] = useState<SuperAdminClinicListItem[]>([]);
  useEffect(() => {
    if (!clinicQuery.trim()) {
      setClinicResults([]);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      superAdminApi
        .clinics({ q: clinicQuery.trim(), limit: 8 })
        .then((res) => {
          if (active) setClinicResults(res.items);
        })
        .catch(() => {});
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [clinicQuery]);

  const save = () =>
    runSave(async () => {
      if (!form.title.trim()) {
        toast.error(t("superAdminAds.titleRequired"));
        return;
      }
      if (editing === "new" && !imageFile) {
        toast.error(t("superAdminAds.imageRequired"));
        return;
      }
      if (form.link_type !== "none" && !form.link_value.trim()) {
        toast.error(t("superAdminAds.linkRequired"));
        return;
      }
      try {
        let imagePublicId: string | undefined;
        if (imageFile) {
          const grant = await superAdminApi.advertisementImageGrant();
          await uploadFileToCloudinary(grant, imageFile);
          imagePublicId = grant.public_id;
        }
        const input: SuperAdminAdvertisementInput = {
          title: form.title.trim(),
          description: form.description.trim() || null,
          sponsor_name: form.sponsor_name.trim() || null,
          category: form.category,
          placement: form.placement,
          cta_label: form.cta_label.trim() || null,
          link_type: form.link_type,
          link_value: form.link_type === "none" ? null : form.link_value.trim(),
          starts_at: fromLocalInput(form.starts_at),
          ends_at: fromLocalInput(form.ends_at),
          is_active: form.is_active,
          sort_order: Number(form.sort_order) || 0,
          ...(imagePublicId ? { image_public_id: imagePublicId } : {}),
        };
        const res =
          editing === "new" || editing === null
            ? await superAdminApi.createAdvertisement(input)
            : await superAdminApi.updateAdvertisement(editing.id, input);
        replaceAd(res.advertisement);
        toast.success(res.message);
        setEditing(null);
      } catch (err) {
        toast.error(err instanceof ApiError || err instanceof Error ? err.message : t("superAdminAds.failedToSave"));
      }
    });

  // ── row actions ───────────────────────────────────────────────────
  const { run: runRow, isPending: isRowPending } = useKeyedAction<string>();

  const toggleActive = (ad: SuperAdminAdvertisement) =>
    runRow(`${ad.id}:toggle`, async () => {
      try {
        const res = await superAdminApi.updateAdvertisement(ad.id, { is_active: !ad.is_active });
        replaceAd(res.advertisement);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : t("superAdminAds.failedToSave"));
      }
    });

  const [deleteTarget, setDeleteTarget] = useState<SuperAdminAdvertisement | null>(null);
  const deleting = deleteTarget ? isRowPending(`${deleteTarget.id}:delete`) : false;
  const confirmDelete = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    return runRow(`${target.id}:delete`, async () => {
      try {
        const res = await superAdminApi.deleteAdvertisement(target.id);
        setAds((prev) => prev.filter((a) => a.id !== target.id));
        toast.success(res.message);
        setDeleteTarget(null);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : t("superAdminAds.failedToDelete"));
      }
    });
  };

  const [notifyTarget, setNotifyTarget] = useState<SuperAdminAdvertisement | null>(null);
  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");
  const notifying = notifyTarget ? isRowPending(`${notifyTarget.id}:notify`) : false;
  const openNotify = (ad: SuperAdminAdvertisement) => {
    setPushTitle(ad.title);
    setPushBody(ad.description ?? "");
    setNotifyTarget(ad);
  };
  const confirmNotify = () => {
    if (!notifyTarget) return;
    const target = notifyTarget;
    return runRow(`${target.id}:notify`, async () => {
      try {
        const res = await superAdminApi.notifyAdvertisement(target.id, {
          title: pushTitle.trim() || null,
          body: pushBody.trim() || null,
        });
        replaceAd(res.advertisement);
        toast.success(res.message);
        setNotifyTarget(null);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : t("superAdminAds.failedToNotify"));
      }
    });
  };

  const linkSummary = (ad: SuperAdminAdvertisement): string => {
    switch (ad.link_type) {
      case "url":
        return ad.link_value ?? "";
      case "phone":
        return `${t("superAdminAds.linkType.phone")}: ${ad.link_value ?? ""}`;
      case "clinic":
        return `${t("superAdminAds.linkType.clinic")}: ${ad.linked_clinic_name ?? ad.link_value ?? ""}`;
      default:
        return t("superAdminAds.linkType.none");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">{t("superAdminAds.heading")}</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("superAdminAds.subheading")}</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex h-11 items-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
        >
          + {t("superAdminAds.newAd")}
        </button>
      </div>

      {!loading && ads.length > 0 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("superAdminAds.placementLabel")}>
          {(["all", ...PLACEMENTS] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={placementFilter === p}
              onClick={() => setPlacementFilter(p)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                placementFilter === p
                  ? "bg-brand-500 text-white"
                  : "border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
              }`}
            >
              {p === "all" ? t("superAdminAds.allPlacements") : t(`superAdminAds.placement.${p}`)}
              <span className="ml-1.5 opacity-70">{p === "all" ? ads.length : countFor(p)}</span>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div role="status" aria-busy="true" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <span className="sr-only">{t("common.loading")}</span>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
              <Skeleton className="aspect-[2/1] w-full rounded-xl" />
              <Skeleton className="mt-3 h-4 w-2/3" />
              <Skeleton className="mt-2 h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : visibleAds.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-10 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          {ads.length === 0 ? t("superAdminAds.empty") : t("superAdminAds.emptyPlacement")}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleAds.map((ad) => (
            <div
              key={ad.id}
              className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ad.image_url} alt={ad.title} className="aspect-[2/1] w-full object-cover" />
              <div className="flex flex-1 flex-col p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge size="sm" color={STATUS_COLOR[ad.status]}>
                    {t(`superAdminAds.status.${ad.status}`)}
                  </Badge>
                  <Badge size="sm" color="primary">
                    {t(`superAdminAds.placement.${ad.placement}`)}
                  </Badge>
                  <Badge size="sm" color="light">
                    {t(`superAdminAds.category.${ad.category}`)}
                  </Badge>
                  <span className="ml-auto text-xs text-gray-400">#{ad.sort_order}</span>
                </div>
                <h4 className="mt-2 font-semibold text-gray-800 dark:text-white/90">{ad.title}</h4>
                {ad.sponsor_name && <p className="text-xs text-gray-500 dark:text-gray-400">{ad.sponsor_name}</p>}
                {ad.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-gray-600 dark:text-gray-300">{ad.description}</p>
                )}
                <p className="mt-2 truncate text-xs text-gray-500 dark:text-gray-400" title={linkSummary(ad)}>
                  {linkSummary(ad)}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  {ad.starts_at || ad.ends_at
                    ? `${ad.starts_at ? formatDateTime(ad.starts_at) : "…"} → ${ad.ends_at ? formatDateTime(ad.ends_at) : "…"}`
                    : t("superAdminAds.alwaysOn")}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  {ad.push_sent_at
                    ? t("superAdminAds.lastPushed", { date: formatDateTime(ad.push_sent_at), count: ad.push_sent_count })
                    : t("superAdminAds.neverPushed")}
                </p>

                <div className="mt-4 flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => openEdit(ad)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                  >
                    {t("common.edit")}
                  </button>
                  <button
                    type="button"
                    disabled={isRowPending(`${ad.id}:toggle`)}
                    onClick={() => void toggleActive(ad)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                  >
                    {ad.is_active ? t("superAdminAds.deactivate") : t("superAdminAds.activate")}
                  </button>
                  <button
                    type="button"
                    disabled={ad.status !== "live"}
                    title={ad.status !== "live" ? t("superAdminAds.pushOnlyLive") : undefined}
                    onClick={() => openNotify(ad)}
                    className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t("superAdminAds.sendPush")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(ad)}
                    className="ml-auto rounded-lg px-3 py-1.5 text-xs font-medium text-error-500 hover:bg-error-50 dark:hover:bg-error-500/10"
                  >
                    {t("common.delete")}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / edit drawer */}
      <Modal isOpen={editing !== null} onClose={() => setEditing(null)} closeDisabled={saving} className="max-w-xl p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          {editing === "new" ? t("superAdminAds.newAd") : t("superAdminAds.editAd")}
        </h3>

        <div className="mt-4 space-y-4">
          <div>
            <label className={labelClass}>{t("superAdminAds.image")}</label>
            <label className="flex aspect-[2/1] w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-gray-300 bg-gray-50 text-sm text-gray-500 hover:border-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
              {imagePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imagePreview} alt="" className="h-full w-full object-cover" />
              ) : (
                <span>{t("superAdminAds.imageHint")}</span>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => onPickImage(e.target.files?.[0])}
              />
            </label>
            <p className="mt-1 text-xs text-gray-400">{t("superAdminAds.imageSpec")}</p>
          </div>

          <div>
            <label className={labelClass}>{t("superAdminAds.placementLabel")}</label>
            <div className="grid grid-cols-3 gap-2">
              {PLACEMENTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => patchForm({ placement: p })}
                  aria-pressed={form.placement === p}
                  className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                    form.placement === p
                      ? "border-brand-500 bg-brand-50 text-brand-600 dark:bg-brand-500/10"
                      : "border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300"
                  }`}
                >
                  <span className="block text-sm font-semibold">{t(`superAdminAds.placement.${p}`)}</span>
                  <span className="opacity-80">{t(`superAdminAds.placementHint.${p}`)}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelClass}>{t("superAdminAds.title")}</label>
            <input value={form.title} maxLength={120} onChange={(e) => patchForm({ title: e.target.value })} className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>{t("superAdminAds.description")}</label>
            <textarea
              value={form.description}
              maxLength={500}
              rows={3}
              onChange={(e) => patchForm({ description: e.target.value })}
              className={`${inputClass} h-auto py-2`}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>{t("superAdminAds.sponsor")}</label>
              <input
                value={form.sponsor_name}
                maxLength={150}
                placeholder={t("superAdminAds.sponsorPlaceholder")}
                onChange={(e) => patchForm({ sponsor_name: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t("superAdminAds.categoryLabel")}</label>
              <select
                value={form.category}
                onChange={(e) => patchForm({ category: e.target.value as AdCategory })}
                className={inputClass}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`superAdminAds.category.${c}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>{t("superAdminAds.linkTypeLabel")}</label>
              <select
                value={form.link_type}
                onChange={(e) => patchForm({ link_type: e.target.value as AdLinkType, link_value: "", link_clinic_name: "" })}
                className={inputClass}
              >
                {LINK_TYPES.map((l) => (
                  <option key={l} value={l}>
                    {t(`superAdminAds.linkType.${l}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>{t("superAdminAds.ctaLabel")}</label>
              <input
                value={form.cta_label}
                maxLength={40}
                placeholder={t("superAdminAds.ctaPlaceholder")}
                disabled={form.link_type === "none"}
                onChange={(e) => patchForm({ cta_label: e.target.value })}
                className={`${inputClass} disabled:opacity-50`}
              />
            </div>
          </div>

          {form.link_type === "url" && (
            <div>
              <label className={labelClass}>{t("superAdminAds.linkUrl")}</label>
              <input
                type="url"
                value={form.link_value}
                placeholder="https://"
                onChange={(e) => patchForm({ link_value: e.target.value })}
                className={inputClass}
              />
            </div>
          )}
          {form.link_type === "phone" && (
            <div>
              <label className={labelClass}>{t("superAdminAds.linkPhone")}</label>
              <input
                type="tel"
                value={form.link_value}
                placeholder="+91"
                onChange={(e) => patchForm({ link_value: e.target.value })}
                className={inputClass}
              />
            </div>
          )}
          {form.link_type === "clinic" && (
            <div>
              <label className={labelClass}>{t("superAdminAds.linkClinic")}</label>
              {form.link_value ? (
                <div className="flex items-center justify-between rounded-lg border border-gray-300 px-3 py-2.5 text-sm dark:border-gray-700">
                  <span className="text-gray-800 dark:text-white/90">{form.link_clinic_name || form.link_value}</span>
                  <button
                    type="button"
                    onClick={() => patchForm({ link_value: "", link_clinic_name: "" })}
                    className="text-xs font-medium text-error-500 hover:underline"
                  >
                    {t("superAdminAds.change")}
                  </button>
                </div>
              ) : (
                <>
                  <input
                    value={clinicQuery}
                    placeholder={t("superAdminAds.searchClinic")}
                    onChange={(e) => setClinicQuery(e.target.value)}
                    className={inputClass}
                  />
                  {clinicResults.length > 0 && (
                    <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-800">
                      {clinicResults.map((c) => (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => {
                            patchForm({ link_value: c.id, link_clinic_name: c.name });
                            setClinicQuery("");
                          }}
                          className="block w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50 dark:text-white/90 dark:hover:bg-white/[0.03]"
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>{t("superAdminAds.startsAt")}</label>
              <input
                type="datetime-local"
                value={form.starts_at}
                onChange={(e) => patchForm({ starts_at: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t("superAdminAds.endsAt")}</label>
              <input
                type="datetime-local"
                value={form.ends_at}
                onChange={(e) => patchForm({ ends_at: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-gray-400">{t("superAdminAds.scheduleHint")}</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>{t("superAdminAds.sortOrder")}</label>
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => patchForm({ sort_order: e.target.value })}
                className={inputClass}
              />
            </div>
            <label className="flex items-center gap-2 self-end pb-3 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => patchForm({ is_active: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              {t("superAdminAds.active")}
            </label>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => setEditing(null)}
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {saving ? t("common.savingEllipsis") : t("common.save")}
          </button>
        </div>
      </Modal>

      {/* Push confirmation */}
      <Modal isOpen={!!notifyTarget} onClose={() => setNotifyTarget(null)} closeDisabled={notifying} className="max-w-md p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{t("superAdminAds.confirmPushTitle")}</h3>
        <p className="mt-1 mb-4 text-sm text-gray-500 dark:text-gray-400">{t("superAdminAds.confirmPushDesc")}</p>
        <div className="space-y-3">
          <div>
            <label className={labelClass}>{t("superAdminAds.pushTitle")}</label>
            <input value={pushTitle} maxLength={120} onChange={(e) => setPushTitle(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t("superAdminAds.pushBody")}</label>
            <textarea
              value={pushBody}
              maxLength={300}
              rows={3}
              onChange={(e) => setPushBody(e.target.value)}
              className={`${inputClass} h-auto py-2`}
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            disabled={notifying}
            onClick={() => setNotifyTarget(null)}
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={notifying}
            onClick={() => void confirmNotify()}
            className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {notifying ? t("superAdminAds.sending") : t("superAdminAds.sendToAll")}
          </button>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} closeDisabled={deleting} className="max-w-md p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{t("superAdminAds.confirmDeleteTitle")}</h3>
        <p className="mt-1 mb-4 text-sm text-gray-500 dark:text-gray-400">
          {t("superAdminAds.confirmDeleteDesc", { title: deleteTarget?.title ?? "" })}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={deleting}
            onClick={() => setDeleteTarget(null)}
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={() => void confirmDelete()}
            className="rounded-lg bg-error-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-error-600 disabled:opacity-50"
          >
            {deleting ? t("common.deletingEllipsis") : t("common.delete")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
