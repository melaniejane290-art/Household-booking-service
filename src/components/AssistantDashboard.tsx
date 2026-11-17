import React, { useState } from 'react';
import { Calendar, Check, Clock, MapPin, Users, X } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import {
  ASSISTANT_RATE_PER_PERSON_XAF,
  CAMEROON_CITIES,
  formatXaf,
  type AssistantSchedule,
  type Booking,
  type User,
} from '../types/movecam.ts';
import { ProfilePanel } from './ProfilePanel.tsx';

interface AssistantDashboardProps {
  user: User;
  bookings: Booking[];
  schedules: AssistantSchedule[];
  activeTab: string;
  onBookingUpdated: (booking: Booking) => void;
  onSchedulesUpdated: (schedules: AssistantSchedule[]) => void;
  onOpenBooking: (booking: Booking) => void;
  onUserUpdated: (user: User) => void;
}

export function AssistantDashboard({
  user,
  bookings,
  schedules,
  activeTab,
  onBookingUpdated,
  onSchedulesUpdated,
  onOpenBooking,
  onUserUpdated,
}: AssistantDashboardProps) {
  const [localSchedules, setLocalSchedules] = useState<AssistantSchedule[]>(schedules);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleMsg, setScheduleMsg] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    setLocalSchedules(schedules);
  }, [schedules]);

  const myAcceptedJobs = bookings.filter((b) =>
    b.assistants?.some((a) => a.assistant_id === user.id && ['accepted', 'completed'].includes(a.status))
  );
  const availableRequests = bookings.filter(
    (b) =>
      !['Completed', 'Cancelled'].includes(b.status) &&
      !b.assistants?.some((a) => a.assistant_id === user.id && a.status === 'accepted')
  );

  const handleRespond = async (bookingId: number, decision: 'accepted' | 'declined') => {
    setRespondingId(bookingId);
    setError(null);
    try {
      const res = await apiFetch<{ booking: Booking }>(
        `/api/bookings/${bookingId}/assistants/respond`,
        {
          method: 'POST',
          body: JSON.stringify({ decision }),
        }
      );
      onBookingUpdated(res.booking);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update assignment.');
    } finally {
      setRespondingId(null);
    }
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSchedule(true);
    setScheduleMsg(null);
    setError(null);
    try {
      const res = await apiFetch<{ schedules: AssistantSchedule[] }>('/api/assistant/schedules', {
        method: 'PUT',
        body: JSON.stringify({ schedules: localSchedules }),
      });
      onSchedulesUpdated(res.schedules);
      setScheduleMsg('Weekly work schedule saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save schedule.');
    } finally {
      setSavingSchedule(false);
    }
  };

  if (activeTab === 'schedule') {
    return (
      <form
        onSubmit={handleSaveSchedule}
        className="bg-white border border-slate-200 rounded-2xl overflow-hidden max-w-4xl"
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#0B2545]">Weekly Work Schedule</h2>
            <p className="text-xs text-slate-500">
              Set your active loading & unloading days, shift hours, city, and hourly rate.
            </p>
          </div>
          <button
            type="submit"
            disabled={savingSchedule}
            className="px-4 py-2 bg-[#0B2545] hover:bg-[#13315C] text-yellow-300 text-xs font-bold rounded-lg whitespace-nowrap"
          >
            {savingSchedule ? 'Saving...' : 'Save Schedule'}
          </button>
        </div>

        {scheduleMsg && (
          <div className="mx-6 mt-4 px-3.5 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800">
            {scheduleMsg}
          </div>
        )}
        {error && (
          <div className="mx-6 mt-4 px-3.5 py-2.5 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700">
            {error}
          </div>
        )}

        <div className="divide-y divide-slate-100">
          {localSchedules.map((row, idx) => (
            <div
              key={row.day_of_week}
              className="px-6 py-4 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center"
            >
              <div className="sm:col-span-3 flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={Boolean(row.is_available)}
                  onChange={(e) => {
                    const checked = e.target.checked ? 1 : 0;
                    setLocalSchedules((prev) =>
                      prev.map((item, i) =>
                        i === idx ? { ...item, is_available: checked } : item
                      )
                    );
                  }}
                  className="w-4 h-4 accent-[#0B2545]"
                />
                <span className="text-sm font-semibold text-slate-900">{row.day_of_week}</span>
              </div>

              <div className="sm:col-span-4 flex items-center gap-2">
                <input
                  type="time"
                  value={row.start_time}
                  disabled={!row.is_available}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLocalSchedules((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, start_time: val } : item))
                    );
                  }}
                  className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg disabled:bg-slate-100"
                />
                <span className="text-xs text-slate-400">to</span>
                <input
                  type="time"
                  value={row.end_time}
                  disabled={!row.is_available}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLocalSchedules((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, end_time: val } : item))
                    );
                  }}
                  className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg disabled:bg-slate-100"
                />
              </div>

              <div className="sm:col-span-3">
                <select
                  value={row.city}
                  disabled={!row.is_available}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLocalSchedules((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, city: val } : item))
                    );
                  }}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
                >
                  {CAMEROON_CITIES.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2 text-right">
                <span className="text-xs font-mono text-slate-600 tabular-nums">
                  {formatXaf(row.hourly_rate_xaf)}/hr
                </span>
              </div>
            </div>
          ))}
        </div>
      </form>
    );
  }

  if (activeTab === 'profile') {
    return <ProfilePanel user={user} onUpdated={onUserUpdated} />;
  }

  return (
    <div className="space-y-6">
      {user.approval_status !== 'approved' && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
          <strong>Account Verification Pending:</strong> Your moving assistant profile is currently{' '}
          <span className="uppercase font-bold">{user.approval_status}</span>. An administrator will
          approve you before you can accept live assignments.
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-700">
          {error}
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Open Loading Requests</div>
          <div className="text-2xl font-mono font-bold text-[#0B2545] tabular-nums mt-1">
            {availableRequests.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {formatXaf(ASSISTANT_RATE_PER_PERSON_XAF)} per booking slot
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">My Accepted Assignments</div>
          <div className="text-2xl font-mono font-bold text-slate-900 tabular-nums mt-1">
            {myAcceptedJobs.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Active & completed moves</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Available Shift Days</div>
          <div className="text-2xl font-mono font-bold text-slate-900 tabular-nums mt-1">
            {localSchedules.filter((s) => s.is_available).length} / 7
          </div>
          <div className="text-[11px] text-slate-400 mt-1">City: {user.city}</div>
        </div>
      </div>

      {/* Assignments List */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-bold text-[#0B2545]">
            Loading & Unloading Requests
          </h2>
          <span className="text-xs text-slate-500">
            Accept jobs matching your schedule
          </span>
        </div>

        {bookings.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No bookings currently requesting loading/unloading assistants.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {bookings.map((b) => {
              const myEntry = b.assistants?.find((a) => a.assistant_id === user.id);
              const acceptedCount =
                b.assistants?.filter((a) => ['accepted', 'completed'].includes(a.status)).length ||
                0;
              return (
                <div
                  key={b.id}
                  className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/70"
                >
                  <div
                    className="space-y-1 min-w-0 cursor-pointer"
                    onClick={() => onOpenBooking(b)}
                  >
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono font-bold text-[#0B2545]">
                        {b.reference_code}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-slate-800">{b.status}</span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {b.scheduled_date}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {b.scheduled_time}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-slate-900 truncate flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[#0B2545] shrink-0" />
                      <span className="truncate">
                        {b.pickup_address} → {b.destination_address}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 line-clamp-1">
                      {b.estimated_rooms} — {b.items_description}
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-1.5 pt-0.5">
                      <Users className="w-3.5 h-3.5" />
                      <span>
                        Slots filled: {acceptedCount} / {b.assistants_needed} · Payout:{' '}
                        <strong className="font-mono text-[#0B2545]">
                          {formatXaf(ASSISTANT_RATE_PER_PERSON_XAF)}
                        </strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {myEntry?.status === 'accepted' || myEntry?.status === 'completed' ? (
                      <button
                        type="button"
                        onClick={() => onOpenBooking(b)}
                        className="px-4 py-2 text-xs font-bold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap"
                      >
                        Assigned ({myEntry.status}) · View Details
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={
                            respondingId === b.id || acceptedCount >= b.assistants_needed
                          }
                          onClick={() => void handleRespond(b.id, 'accepted')}
                          className="px-3.5 py-2 text-xs font-bold rounded-lg bg-[#0B2545] hover:bg-[#13315C] text-yellow-300 flex items-center gap-1 disabled:opacity-50 whitespace-nowrap"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Accept Job</span>
                        </button>
                        <button
                          type="button"
                          disabled={respondingId === b.id}
                          onClick={() => void handleRespond(b.id, 'declined')}
                          className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 flex items-center gap-1 whitespace-nowrap"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Decline</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
