import React, { useState } from 'react';
import { Calendar, MapPin, Plus, Truck, Wallet, AlertTriangle } from 'lucide-react';
import {
  formatXaf,
  type Booking,
  type BookingStatus,
  type Complaint,
  type Payment,
  type RouteDraft,
  type User,
  type Vehicle,
} from '../types/movecam.ts';
import { BookingWizard } from './BookingWizard.tsx';
import { ProfilePanel } from './ProfilePanel.tsx';

interface CustomerDashboardProps {
  user: User;
  bookings: Booking[];
  vehicles: Vehicle[];
  payments: Payment[];
  complaints: Complaint[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  preselectedVehicleId?: number | null;
  routeDraft?: RouteDraft | null;
  onOpenBooking: (booking: Booking) => void;
  onBookingCreated: (booking: Booking) => void;
  onUserUpdated: (user: User) => void;
}

const STATUS_FILTERS: Array<'All' | BookingStatus> = [
  'All',
  'Pending',
  'Driver Assigned',
  'In Transit',
  'Completed',
  'Cancelled',
];

export function CustomerDashboard({
  user,
  bookings,
  vehicles,
  payments,
  complaints,
  activeTab,
  onTabChange,
  preselectedVehicleId,
  routeDraft,
  onOpenBooking,
  onBookingCreated,
  onUserUpdated,
}: CustomerDashboardProps) {
  const [statusFilter, setStatusFilter] = useState<'All' | BookingStatus>('All');

  const activeBookings = bookings.filter(
    (b) => !['Completed', 'Cancelled'].includes(b.status)
  );
  const filteredBookings =
    statusFilter === 'All'
      ? bookings
      : bookings.filter((b) => b.status === statusFilter);

  if (activeTab === 'book') {
    return (
      <BookingWizard
        user={user}
        vehicles={vehicles}
        preselectedVehicleId={preselectedVehicleId}
        routeDraft={routeDraft}
        onCancel={() => onTabChange('moves')}
        onCreated={(created) => {
          onBookingCreated(created);
          onTabChange('moves');
          onOpenBooking(created);
        }}
      />
    );
  }

  if (activeTab === 'payments') {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#0B2545]">Payment History</h2>
            <p className="text-xs text-slate-500">
              MTN Mobile Money, Orange Money, and Authorised Cash receipts
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500 tabular-nums">
            {payments.length} transactions
          </span>
        </div>

        {payments.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No payment records yet. Book a move to view receipts and Mobile Money references.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-6">Booking</th>
                  <th className="py-3 px-4">Method</th>
                  <th className="py-3 px-4">Reference</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-6 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80">
                    <td className="py-3.5 px-6 font-mono font-semibold text-[#0B2545]">
                      {p.booking_ref || `#${p.booking_id}`}
                    </td>
                    <td className="py-3.5 px-4 text-slate-700">
                      {p.method === 'mtn_momo'
                        ? 'MTN Mobile Money'
                        : p.method === 'orange_money'
                          ? 'Orange Money'
                          : 'Authorised Cash'}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-500">{p.transaction_ref}</td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`font-semibold uppercase ${
                          p.status === 'paid' || p.status === 'authorized'
                            ? 'text-emerald-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-right font-mono font-bold text-slate-900 tabular-nums">
                      {formatXaf(p.amount_xaf)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  if (activeTab === 'support') {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#0B2545]">Support & Complaints</h2>
            <p className="text-xs text-slate-500">
              Track issues reported from your move bookings
            </p>
          </div>
        </div>
        {complaints.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No support tickets filed. Open any booking to report an issue if needed.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {complaints.map((c) => (
              <div key={c.id} className="p-6 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-900">{c.subject}</span>
                  <span className="text-xs font-semibold uppercase text-[#0B2545]">
                    {c.status}
                  </span>
                </div>
                <div className="text-xs text-slate-500">
                  {c.booking_ref ? `Booking ${c.booking_ref}` : 'General Support'} ·{' '}
                  {new Date(c.created_at).toLocaleDateString()}
                </div>
                <p className="text-xs text-slate-700 pt-1">{c.description}</p>
                {c.admin_notes && (
                  <div className="mt-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
                    <strong className="text-[#0B2545]">Admin Response:</strong> {c.admin_notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (activeTab === 'profile') {
    return <ProfilePanel user={user} onUpdated={onUserUpdated} />;
  }

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Active Moves</div>
          <div className="text-2xl font-mono font-bold text-[#0B2545] tabular-nums mt-1">
            {activeBookings.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Live GPS & status tracking</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Total Bookings</div>
          <div className="text-2xl font-mono font-bold text-slate-900 tabular-nums mt-1">
            {bookings.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Across Cameroon</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Total Spent</div>
          <div className="text-2xl font-mono font-bold text-slate-900 tabular-nums mt-1">
            {formatXaf(
              payments
                .filter((p) => p.status === 'paid' || p.status === 'authorized')
                .reduce((sum, p) => sum + p.amount_xaf, 0)
            )}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">MoMo, OM & Authorised Cash</div>
        </div>
        <div className="bg-[#0B2545] text-white rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="text-xs text-slate-300">Need to relocate?</div>
            <div className="text-sm font-bold mt-0.5">Instant XAF quote</div>
          </div>
          <button
            type="button"
            onClick={() => onTabChange('book')}
            className="mt-3 w-full py-2 px-3 bg-yellow-400 hover:bg-yellow-300 text-[#0B2545] text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Book New Move</span>
          </button>
        </div>
      </div>

      {/* Bookings List */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-base font-bold text-[#0B2545]">My Moving Bookings</h2>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
            {STATUS_FILTERS.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === st
                    ? 'bg-white text-[#0B2545] shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {filteredBookings.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <Truck className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm text-slate-600">No moves match this filter.</p>
            <button
              type="button"
              onClick={() => onTabChange('book')}
              className="px-4 py-2 bg-[#0B2545] text-yellow-300 text-xs font-bold rounded-lg"
            >
              Book a Move Now
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredBookings.map((b) => (
              <div
                key={b.id}
                onClick={() => onOpenBooking(b)}
                className="px-6 py-4 hover:bg-slate-50/90 cursor-pointer transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono font-bold text-[#0B2545]">{b.reference_code}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-slate-800">{b.status}</span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {b.scheduled_date} {b.scheduled_time}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-slate-900 truncate flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[#0B2545] shrink-0" />
                    <span className="truncate">
                      {b.pickup_address} → {b.destination_address}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {b.vehicle_title || 'Vehicle'} · {b.distance_km} km ·{' '}
                    {b.assistants_needed > 0
                      ? `${b.assistants_needed} assistant(s)`
                      : 'Self-loading'}{' '}
                    {b.driver_name ? `· Driver: ${b.driver_name}` : ''}
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <div className="text-sm font-mono font-bold text-[#0B2545] tabular-nums">
                      {formatXaf(b.total_price_xaf)}
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center justify-end gap-1">
                      <Wallet className="w-3 h-3" />
                      <span className="uppercase">{b.payment?.status || 'pending'}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="px-3.5 py-2 text-xs font-bold rounded-lg bg-[#0B2545] text-yellow-300 hover:bg-[#13315C] whitespace-nowrap"
                  >
                    {b.status === 'In Transit' ? 'Track Live' : 'Manage'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {complaints.some((c) => c.status !== 'resolved') && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>You have an open support ticket under review by MoveCam administrators.</span>
          </div>
          <button
            type="button"
            onClick={() => onTabChange('support')}
            className="text-xs font-bold text-amber-950 underline whitespace-nowrap"
          >
            View Ticket
          </button>
        </div>
      )}
    </div>
  );
}
