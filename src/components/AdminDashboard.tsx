import React, { useState } from 'react';
import { Check, ShieldAlert, Truck, Users, Wallet, X } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import {
  formatXaf,
  type AdminStats,
  type Booking,
  type Complaint,
  type ComplaintStatus,
  type Payment,
  type User,
  type Vehicle,
} from '../types/movecam.ts';

interface AdminDashboardProps {
  stats: AdminStats | null;
  users: User[];
  vehicles: Vehicle[];
  bookings: Booking[];
  payments: Payment[];
  complaints: Complaint[];
  activeTab: string;
  onRefreshAll: () => void;
  onOpenBooking: (booking: Booking) => void;
}

export function AdminDashboard({
  stats,
  users,
  vehicles,
  bookings,
  payments,
  complaints,
  activeTab,
  onRefreshAll,
  onOpenBooking,
}: AdminDashboardProps) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [assigningDriver, setAssigningDriver] = useState<Record<number, number>>({});
  const [complaintDrafts, setComplaintDrafts] = useState<Record<number, { status: ComplaintStatus; notes: string }>>({});

  const approvedDrivers = users.filter((u) => u.role === 'driver' && u.approval_status === 'approved');
  const pendingUsers = users.filter((u) => u.approval_status === 'pending');

  const handleApproval = async (
    userId: number,
    approval_status: 'approved' | 'rejected' | 'suspended'
  ) => {
    setBusyKey(`user-${userId}`);
    try {
      await apiFetch(`/api/admin/users/${userId}/approval`, {
        method: 'PATCH',
        body: JSON.stringify({ approval_status }),
      });
      onRefreshAll();
    } finally {
      setBusyKey(null);
    }
  };

  const handleToggleVehicleApproval = async (v: Vehicle) => {
    setBusyKey(`veh-${v.id}`);
    try {
      await apiFetch(`/api/vehicles/${v.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_approved: v.is_approved ? 0 : 1 }),
      });
      onRefreshAll();
    } finally {
      setBusyKey(null);
    }
  };

  const handleAssignDriver = async (bookingId: number) => {
    const driverId = assigningDriver[bookingId] || approvedDrivers[0]?.id;
    if (!driverId) return;
    setBusyKey(`assign-${bookingId}`);
    try {
      await apiFetch(`/api/admin/bookings/${bookingId}/assign-driver`, {
        method: 'POST',
        body: JSON.stringify({ driver_id: driverId }),
      });
      onRefreshAll();
    } finally {
      setBusyKey(null);
    }
  };

  const handleAdminConfirmPayment = async (p: Payment) => {
    setBusyKey(`pay-${p.id}`);
    try {
      await apiFetch(`/api/payments/${p.id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ method: p.method }),
      });
      onRefreshAll();
    } finally {
      setBusyKey(null);
    }
  };

  const handleSaveComplaint = async (c: Complaint) => {
    const draft = complaintDrafts[c.id] || { status: c.status, notes: c.admin_notes };
    setBusyKey(`comp-${c.id}`);
    try {
      await apiFetch(`/api/complaints/${c.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: draft.status, admin_notes: draft.notes }),
      });
      onRefreshAll();
    } finally {
      setBusyKey(null);
    }
  };

  if (activeTab === 'users') {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#0B2545]">Users & Service Provider Approvals</h2>
            <p className="text-xs text-slate-500">
              Approve newly registered drivers and moving assistants, or manage user access.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500 tabular-nums">{users.length} accounts</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                <th className="py-3 px-6">User</th>
                <th className="py-3 px-4">Role & City</th>
                <th className="py-3 px-4">License / ID</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/80">
                  <td className="py-3.5 px-6">
                    <div className="font-bold text-slate-900">{u.name}</div>
                    <div className="text-slate-500">
                      {u.email} · {u.phone}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 capitalize text-slate-700">
                    {u.role} · {u.city}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-600">
                    {u.license_number || '—'}
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`font-bold uppercase ${
                        u.approval_status === 'approved'
                          ? 'text-emerald-700'
                          : u.approval_status === 'pending'
                            ? 'text-amber-700'
                            : 'text-red-700'
                      }`}
                    >
                      {u.approval_status}
                    </span>
                  </td>
                  <td className="py-3.5 px-6 text-right">
                    {u.role !== 'admin' && (
                      <div className="inline-flex items-center gap-1.5">
                        {u.approval_status !== 'approved' && (
                          <button
                            type="button"
                            disabled={busyKey === `user-${u.id}`}
                            onClick={() => void handleApproval(u.id, 'approved')}
                            className="px-2.5 py-1 bg-emerald-600 text-white rounded font-semibold hover:bg-emerald-700 whitespace-nowrap"
                          >
                            Approve
                          </button>
                        )}
                        {u.approval_status === 'pending' && (
                          <button
                            type="button"
                            disabled={busyKey === `user-${u.id}`}
                            onClick={() => void handleApproval(u.id, 'rejected')}
                            className="px-2.5 py-1 border border-slate-300 text-slate-700 rounded font-semibold hover:bg-slate-100 whitespace-nowrap"
                          >
                            Reject
                          </button>
                        )}
                        {u.approval_status === 'approved' && (
                          <button
                            type="button"
                            disabled={busyKey === `user-${u.id}`}
                            onClick={() => void handleApproval(u.id, 'suspended')}
                            className="px-2.5 py-1 border border-red-200 text-red-700 bg-red-50 rounded font-semibold hover:bg-red-100 whitespace-nowrap"
                          >
                            Suspend
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (activeTab === 'vehicles') {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#0B2545]">Fleet Vehicles Directory</h2>
            <p className="text-xs text-slate-500">Approve vehicles and monitor availability across Cameroon.</p>
          </div>
          <span className="text-xs font-mono text-slate-500 tabular-nums">{vehicles.length} vehicles</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                <th className="py-3 px-6">Vehicle</th>
                <th className="py-3 px-4">Owner & City</th>
                <th className="py-3 px-4">Rates (XAF)</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {vehicles.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50/80">
                  <td className="py-3.5 px-6 flex items-center gap-3">
                    <img
                      src={v.photo_url}
                      alt={v.title}
                      referrerPolicy="no-referrer"
                      className="w-12 h-9 rounded object-cover border border-slate-200 shrink-0"
                    />
                    <div>
                      <div className="font-bold text-slate-900">{v.title}</div>
                      <div className="text-slate-500">
                        {v.vehicle_type} · {v.plate_number}
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-slate-700">
                    {v.owner_name} · {v.city}
                  </td>
                  <td className="py-3.5 px-4 font-mono tabular-nums text-slate-700">
                    {formatXaf(v.base_fare_xaf)} + {formatXaf(v.per_km_xaf)}/km
                  </td>
                  <td className="py-3.5 px-4">
                    <span className={v.is_approved ? 'font-bold text-emerald-700' : 'font-bold text-amber-700'}>
                      {v.is_approved ? 'Approved' : 'Unapproved'}
                    </span>{' '}
                    · {v.is_available ? 'Online' : 'Offline'}
                  </td>
                  <td className="py-3.5 px-6 text-right">
                    <button
                      type="button"
                      disabled={busyKey === `veh-${v.id}`}
                      onClick={() => void handleToggleVehicleApproval(v)}
                      className="px-3 py-1.5 rounded border border-slate-300 font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                    >
                      {v.is_approved ? 'Revoke Approval' : 'Approve Vehicle'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (activeTab === 'payments') {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#0B2545]">Payments & Mobile Money Oversight</h2>
            <p className="text-xs text-slate-500">
              Monitor MTN Mobile Money, Orange Money, and Authorised Cash settlements.
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-[#0B2545] tabular-nums">
            Total Confirmed: {formatXaf(stats?.totalRevenueXaf || 0)}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                <th className="py-3 px-6">Booking</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Method & Phone</th>
                <th className="py-3 px-4">Reference</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/80">
                  <td className="py-3.5 px-6 font-mono font-bold text-[#0B2545]">{p.booking_ref}</td>
                  <td className="py-3.5 px-4 text-slate-700">{p.customer_name}</td>
                  <td className="py-3.5 px-4 text-slate-600">
                    {p.method === 'mtn_momo'
                      ? 'MTN MoMo'
                      : p.method === 'orange_money'
                        ? 'Orange Money'
                        : 'Cash'}{' '}
                    {p.phone_number ? `· ${p.phone_number}` : ''}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-500">{p.transaction_ref}</td>
                  <td className="py-3.5 px-4 font-bold uppercase text-slate-800">{p.status}</td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums">
                    {formatXaf(p.amount_xaf)}
                  </td>
                  <td className="py-3.5 px-6 text-right">
                    {p.status === 'pending' && (
                      <button
                        type="button"
                        disabled={busyKey === `pay-${p.id}`}
                        onClick={() => void handleAdminConfirmPayment(p)}
                        className="px-3 py-1 bg-[#0B2545] text-yellow-300 rounded font-semibold hover:bg-[#13315C] whitespace-nowrap"
                      >
                        {p.method === 'cash' ? 'Authorize Cash' : 'Verify Paid'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (activeTab === 'complaints') {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-[#0B2545]">Complaints & Dispute Resolution</h2>
          <p className="text-xs text-slate-500">Review user issues, document findings, and mark resolved.</p>
        </div>
        {complaints.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No complaints recorded.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {complaints.map((c) => {
              const draft = complaintDrafts[c.id] || {
                status: c.status,
                notes: c.admin_notes,
              };
              return (
                <div key={c.id} className="p-6 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-sm font-bold text-slate-900">{c.subject}</span>
                      <div className="text-xs text-slate-500">
                        Filed by {c.user_name} ({c.user_role}) ·{' '}
                        {c.booking_ref ? `Move ${c.booking_ref}` : 'General'} ·{' '}
                        {new Date(c.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <select
                      value={draft.status}
                      onChange={(e) =>
                        setComplaintDrafts((prev) => ({
                          ...prev,
                          [c.id]: { ...draft, status: e.target.value as ComplaintStatus },
                        }))
                      }
                      className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="open">Open</option>
                      <option value="investigating">Investigating</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">{c.description}</p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={draft.notes}
                      onChange={(e) =>
                        setComplaintDrafts((prev) => ({
                          ...prev,
                          [c.id]: { ...draft, notes: e.target.value },
                        }))
                      }
                      placeholder="Write admin resolution notes..."
                      className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                    <button
                      type="button"
                      disabled={busyKey === `comp-${c.id}`}
                      onClick={() => void handleSaveComplaint(c)}
                      className="px-4 py-2 bg-[#0B2545] text-yellow-300 text-xs font-bold rounded-lg whitespace-nowrap"
                    >
                      Save Resolution
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-[#0B2545]" />
            <span>Total Users</span>
          </div>
          <div className="text-2xl font-mono font-bold text-[#0B2545] tabular-nums mt-1">
            {stats?.totalUsers || users.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {stats?.customersCount || 0} cust · {stats?.driversCount || 0} drv ·{' '}
            {stats?.assistantsCount || 0} ast
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
            <span>Pending Approvals</span>
          </div>
          <div className="text-2xl font-mono font-bold text-amber-700 tabular-nums mt-1">
            {stats?.pendingProviders ?? pendingUsers.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Providers awaiting review</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Truck className="w-3.5 h-3.5 text-[#0B2545]" />
            <span>Active / Total Moves</span>
          </div>
          <div className="text-2xl font-mono font-bold text-slate-900 tabular-nums mt-1">
            {stats?.activeMoves || 0} / {stats?.totalBookings || bookings.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {stats?.completedMoves || 0} completed
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Settled Revenue</span>
          </div>
          <div className="text-xl font-mono font-bold text-emerald-700 tabular-nums mt-1">
            {formatXaf(stats?.totalRevenueXaf || 0)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">MoMo, OM & Authorised Cash</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Open Complaints</div>
          <div className="text-2xl font-mono font-bold text-slate-900 tabular-nums mt-1">
            {stats?.openComplaints || 0}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">{stats?.totalVehicles || vehicles.length} fleet trucks</div>
        </div>
      </div>

      {/* Pending Provider Approvals Queue */}
      {pendingUsers.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-amber-50/60">
            <h2 className="text-sm font-bold text-[#0B2545]">
              Service Providers Awaiting Approval ({pendingUsers.length})
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            {pendingUsers.map((u) => (
              <div
                key={u.id}
                className="px-6 py-4 flex flex-wrap items-center justify-between gap-4"
              >
                <div>
                  <div className="text-sm font-bold text-slate-900">
                    {u.name} · <span className="capitalize text-[#0B2545]">{u.role}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {u.city} · {u.phone} · License/ID: <span className="font-mono">{u.license_number || 'N/A'}</span>
                  </div>
                  {u.bio && <p className="text-xs text-slate-600 mt-1">{u.bio}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busyKey === `user-${u.id}`}
                    onClick={() => void handleApproval(u.id, 'approved')}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-1 whitespace-nowrap"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Approve</span>
                  </button>
                  <button
                    type="button"
                    disabled={busyKey === `user-${u.id}`}
                    onClick={() => void handleApproval(u.id, 'rejected')}
                    className="px-3.5 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 flex items-center gap-1 whitespace-nowrap"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Reject</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bookings Monitor */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#0B2545]">All Platform Bookings</h2>
            <p className="text-xs text-slate-500">
              Monitor moving operations, assign drivers to pending requests, and inspect live GPS routes.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                <th className="py-3 px-6">Ref & Schedule</th>
                <th className="py-3 px-4">Route</th>
                <th className="py-3 px-4">Customer & Driver</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Total</th>
                <th className="py-3 px-6 text-right">Dispatch</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {bookings.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50/80">
                  <td className="py-3.5 px-6">
                    <button
                      type="button"
                      onClick={() => onOpenBooking(b)}
                      className="font-mono font-bold text-[#0B2545] hover:underline"
                    >
                      {b.reference_code}
                    </button>
                    <div className="text-[11px] text-slate-500">
                      {b.scheduled_date} {b.scheduled_time}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 max-w-xs">
                    <div className="truncate font-medium text-slate-800">{b.pickup_address}</div>
                    <div className="truncate text-slate-500">→ {b.destination_address}</div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="text-slate-900 font-medium">{b.customer_name}</div>
                    <div className="text-slate-500">
                      Driver: {b.driver_name || 'Unassigned'}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 font-semibold text-slate-800">{b.status}</td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums">
                    {formatXaf(b.total_price_xaf)}
                  </td>
                  <td className="py-3.5 px-6 text-right">
                    {!b.driver_id && b.status === 'Pending' && approvedDrivers.length > 0 ? (
                      <div className="inline-flex items-center gap-1.5">
                        <select
                          value={assigningDriver[b.id] || approvedDrivers[0].id}
                          onChange={(e) =>
                            setAssigningDriver((prev) => ({
                              ...prev,
                              [b.id]: Number(e.target.value),
                            }))
                          }
                          className="px-2 py-1 border border-slate-300 rounded bg-white text-xs"
                        >
                          {approvedDrivers.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name} ({d.city})
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={busyKey === `assign-${b.id}`}
                          onClick={() => void handleAssignDriver(b.id)}
                          className="px-2.5 py-1 bg-[#0B2545] text-yellow-300 font-semibold rounded whitespace-nowrap"
                        >
                          Assign
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onOpenBooking(b)}
                        className="px-3 py-1 border border-slate-300 rounded font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                      >
                        Inspect
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
