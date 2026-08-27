"use client";
import React, { useCallback, useEffect, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { EventClickArg, EventInput } from "@fullcalendar/core";
import { useModal } from "@/hooks/useModal";
import { Modal } from "@/components/ui/modal";
import Badge from "@/components/ui/badge/Badge";
import Link from "next/link";
import { Appointment, appointmentsApi } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton/Skeleton";
import {
  appointmentStatusColor,
  appointmentStatusLabel,
  formatCurrency,
  formatDateTime,
  relationshipLabel,
} from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";

interface CalendarEvent extends EventInput {
  extendedProps: {
    calendar: "danger" | "success" | "primary" | "warning";
    appointment: Appointment;
  };
}

const statusColor: Record<Appointment["status"], CalendarEvent["extendedProps"]["calendar"]> = {
  pending: "warning",
  confirmed: "primary",
  paid: "primary",
  completed: "success",
  cancelled: "danger",
  no_show: "danger",
};

const Calendar: React.FC = () => {
  const { t } = useTranslation();
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isOpen, openModal, closeModal } = useModal();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await appointmentsApi.list({ limit: 100 });
      const mapped: CalendarEvent[] = res.items.map((appt) => ({
        id: appt.id,
        title: `Appt · ${appt.scheduled_time}`,
        start: `${appt.scheduled_date}T${appt.scheduled_time}`,
        extendedProps: {
          calendar: statusColor[appt.status],
          appointment: appt,
        },
      }));
      setEvents(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load appointments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleEventClick = (clickInfo: EventClickArg) => {
    setSelectedEvent(clickInfo.event as unknown as CalendarEvent);
    openModal();
  };

  const selected = selectedEvent?.extendedProps.appointment;

  return (
    <div className="rounded-2xl border  border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      {loading ? (
        <div className="p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <Skeleton className="h-6 w-32" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-16" />
            </div>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 35 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 p-8 text-sm text-error-600 dark:text-error-400">
          <p>{error}</p>
          <button
            onClick={load}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
            {t("dashboard.retry")}
          </button>
        </div>
      ) : (
        <div className="custom-calendar">
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: "prev,next",
              center: "title",
              right: "dayGridMonth,timeGridWeek,timeGridDay",
            }}
            events={events}
            selectable={false}
            eventClick={handleEventClick}
            eventContent={renderEventContent}
            slotMinTime="08:00:00"
            slotMaxTime="22:00:00"
          />
        </div>
      )}
      <Modal
        isOpen={isOpen}
        onClose={closeModal}
        className="max-w-[700px] p-6 lg:p-10"
      >
        {selected && (
          <div className="px-2">
            <div className="flex items-center justify-between gap-3">
              <h5 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                {t("calendar.appointmentTitle")}
              </h5>

            </div>
              <Badge size="sm" color={appointmentStatusColor(selected.status)}>
                {appointmentStatusLabel(selected.status, t)}
              </Badge>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {formatDateTime(selected.created_at)}
            </p>
            <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Detail
                label={t("dashboard.patient")}
                value={
                  selected.patient_details
                    ? `${selected.patient_details.name}${
                        selected.patient_details.relationship !== "self"
                          ? ` (${relationshipLabel(selected.patient_details.relationship, t)})`
                          : ""
                      }`
                    : "—"
                }
              />
              <Detail label={t("schedule.date")} value={selected.scheduled_date} />
              <Detail label={t("calendar.time")} value={`${selected.scheduled_time} · ${selected.duration_minutes} min`} />
              <Detail label={t("dashboard.doctor")} value={selected.doctor_name ?? selected.doctor_id} />
              <Detail label={t("appointments.branch")} value={selected.branch_name ?? selected.branch_id} />
              <Detail label={t("dashboard.fee")} value={formatCurrency(selected.fee_amount, selected.currency)} />
              <Detail label={t("calendar.payment")} value={selected.payment_method ?? t("calendar.notPaid")} />
            </dl>
            <div className="mt-6 flex justify-end">
              <Link
                href="/appointments"
                onClick={closeModal}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
              >
                {t("calendar.manageInAppointments")}
              </Link>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-theme-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">{value}</dd>
    </div>
  );
}

const renderEventContent = (eventInfo: {
  event: EventInput & { extendedProps: { calendar?: string } };
  timeText?: string;
}) => {
  const colorClass = `fc-bg-${eventInfo.event.extendedProps?.calendar?.toLowerCase() ?? "primary"}`;
  return (
    <div
      className={`event-fc-color flex fc-event-main ${colorClass} p-1 rounded-sm`}
    >
      <div className="fc-daygrid-event-dot"></div>
      <div className="fc-event-time">{eventInfo.timeText}</div>
      <div className="fc-event-title">{eventInfo.event.title}</div>
    </div>
  );
};

export default Calendar;
