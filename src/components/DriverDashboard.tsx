import React, { useState } from 'react';
import { Camera, MapPin, Plus, Power, Truck, Upload, Wallet } from 'lucide-react';
import { apiFetch, uploadImage } from '../lib/api.ts';
import {
  CAMEROON_CITIES,
  formatXaf,
  type Booking,
  type Payment,
  type User,
  type Vehicle,
  type VehicleType,
} from '../types/movecam.ts';
import { ProfilePanel } from './ProfilePanel.tsx';

interface DriverDashboardProps {
  user: User;
  bookings: Booking[];
  myVehicles: Vehicle[];
  payments: Payment[];
  activeTab: string;
  onOpenBooking: (booking: Booking) => void;
  onVehiclesChanged: () => void;
  onUserUpdated: (user: User) => void;
}

export function DriverDashboard({
  user,
  bookings,
  myVehicles,
  payments,
  activeTab,
  onOpenBooking,
  onVehiclesChanged,
  onUserUpdated,
}: DriverDashboardProps) {
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [vTitle, setVTitle] = useState('');
  const [vType, setVType] = useState<VehicleType>('Box Truck');
  const [vPlate, setVPlate] = useState('');
  const [vCapLabel, setVCapLabel] = useState('2-3 Bedroom Home · Up to 3,000 kg');
  const [vMaxKg, setVMaxKg] = useState('3000');
  const [vBaseFare, setVBaseFare] = useState('28000');
  const [vPerKm, setVPerKm] = useState('1500');
  const [vCity, setVCity] = useState(user.city || 'Douala');
  const [vPhotoUrl, setVPhotoUrl] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [vehicleError, setVehicleError] = useState<string | null>(null);

  const openRequests = bookings.filter((b) => b.driver_id === null && b.status === 'Pending');
  const myActiveTrips = bookings.filter(
    (b) => b.driver_id === user.id && !['Completed', 'Cancelled'].includes(b.status)
  );
  const completedTrips = bookings.filter(
    (b) => b.driver_id === user.id && b.status === 'Completed'
  );

  const handleVehiclePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    setVehicleError(null);
    try {
      const url = await uploadImage(file);
      setVPhotoUrl(url);
    } catch (err) {
      setVehicleError(err instanceof Error ? err.message : 'Failed to upload vehicle image.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleAddVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingVehicle(true);
    setVehicleError(null);
    try {
      await apiFetch('/api/vehicles', {
        method: 'POST',
        body: JSON.stringify({
          title: vTitle,
          vehicle_type: vType,
          plate_number: vPlate,
          capacity_label: vCapLabel,
          max_weight_kg: Number(vMaxKg),
          base_fare_xaf: Number(vBaseFare),
          per_km_xaf: Number(vPerKm),
          city: vCity,
          photo_url: vPhotoUrl || undefined,
        }),
      });
      setVTitle('');
      setVPlate('');
      setVPhotoUrl('');
      setShowAddVehicle(false);
      onVehiclesChanged();
    } catch (err) {
      setVehicleError(err instanceof Error ? err.message : 'Could not add vehicle.');
    } finally {
      setSavingVehicle(false);
    }
  };

  const handleToggleAvailability = async (v: Vehicle) => {
    try {
      await apiFetch(`/api/vehicles/${v.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_available: v.is_available ? 0 : 1 }),
      });
      onVehiclesChanged();
    } catch {
      // Ignore transient error
    }
  };

  if (activeTab === 'fleet') {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-[#0B2545]">My Fleet & Vehicles</h2>
            <p className="text-xs text-slate-500">
              Upload vehicle details, photographs, and manage availability for bookings.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddVehicle((s) => !s)}
            className="px-4 py-2 bg-[#0B2545] hover:bg-[#13315C] text-yellow-300 text-xs font-bold rounded-lg flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>{showAddVehicle ? 'Close Form' : 'Register Vehicle'}</span>
          </button>
        </div>

        {showAddVehicle && (
          <form
            onSubmit={handleAddVehicle}
            className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4"
          >
            <h3 className="text-sm font-bold text-[#0B2545]">Add New Moving Vehicle</h3>
            {vehicleError && (
              <div className="px-3.5 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {vehicleError}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Vehicle Model / Title
                </label>
                <input
                  type="text"
                  required
                  value={vTitle}
                  onChange={(e) => setVTitle(e.target.value)}
                  placeholder="e.g. Mitsubishi Canter Box Truck"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Vehicle Type
                </label>
                <select
                  value={vType}
                  onChange={(e) => setVType(e.target.value as VehicleType)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Pickup Truck">Pickup Truck</option>
                  <option value="Cargo Van">Cargo Van</option>
                  <option value="Box Truck">Box Truck</option>
                  <option value="Heavy Lorry">Heavy Lorry</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Plate Number
                </label>
                <input
                  type="text"
                  required
                  value={vPlate}
                  onChange={(e) => setVPlate(e.target.value)}
                  placeholder="e.g. LT 840 CM"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg uppercase"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
                <select
                  value={vCity}
                  onChange={(e) => setVCity(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {CAMEROON_CITIES.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Max Weight (kg)
                </label>
                <input
                  type="number"
                  required
                  value={vMaxKg}
                  onChange={(e) => setVMaxKg(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Base Fare (XAF)
                </label>
                <input
                  type="number"
                  required
                  value={vBaseFare}
                  onChange={(e) => setVBaseFare(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Per-km Rate (XAF)
                </label>
                <input
                  type="number"
                  required
                  value={vPerKm}
                  onChange={(e) => setVPerKm(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Capacity Description
                </label>
                <input
                  type="text"
                  required
                  value={vCapLabel}
                  onChange={(e) => setVCapLabel(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  <Camera className="w-3.5 h-3.5 inline mr-1" />
                  Vehicle Photograph
                </label>
                <div className="flex items-center gap-3">
                  <label className="px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{uploadingPhoto ? 'Uploading...' : 'Upload Photo'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => void handleVehiclePhotoUpload(e)}
                      className="hidden"
                    />
                  </label>
                  {vPhotoUrl && (
                    <img
                      src={vPhotoUrl}
                      alt="Uploaded vehicle preview"
                      referrerPolicy="no-referrer"
                      className="w-16 h-12 object-cover rounded border border-slate-200"
                    />
                  )}
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={savingVehicle}
              className="px-5 py-2.5 bg-[#0B2545] text-yellow-300 text-xs font-bold rounded-lg hover:bg-[#13315C]"
            >
              {savingVehicle ? 'Saving Vehicle...' : 'Save Vehicle to Fleet'}
            </button>
          </form>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {myVehicles.map((v) => (
            <div
              key={v.id}
              className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col"
            >
              <div className="aspect-4/3 w-full bg-slate-100 overflow-hidden">
                <img
                  src={v.photo_url}
                  alt={v.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                <div>
                  <div className="text-xs text-slate-500">
                    {v.vehicle_type} · {v.plate_number} · {v.city}
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 mt-0.5">{v.title}</h3>
                  <p className="text-xs text-slate-600 mt-1">{v.capacity_label}</p>
                  <div className="text-xs font-mono text-[#0B2545] mt-2 tabular-nums">
                    Base {formatXaf(v.base_fare_xaf)} + {formatXaf(v.per_km_xaf)}/km
                  </div>
                </div>
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600">
                    {v.is_approved ? 'Admin Approved' : 'Pending Approval'} ·{' '}
                    {v.is_available ? 'Available' : 'Unavailable'}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleToggleAvailability(v)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1 whitespace-nowrap ${
                      v.is_available
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}
                  >
                    <Power className="w-3.5 h-3.5" />
                    <span>{v.is_available ? 'Online' : 'Offline'}</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (activeTab === 'earnings') {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-[#0B2545]">Trip Payments & Cash Authorizations</h2>
          <p className="text-xs text-slate-500">
            Track MoMo settlements and authorize cash payments upon delivery.
          </p>
        </div>
        {payments.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No assigned trip payments yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-6">Booking</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Method</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-6 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="py-3.5 px-6 font-mono font-semibold text-[#0B2545]">
                      {p.booking_ref}
                    </td>
                    <td className="py-3.5 px-4 text-slate-700">{p.customer_name}</td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {p.method === 'mtn_momo'
                        ? 'MTN MoMo'
                        : p.method === 'orange_money'
                          ? 'Orange Money'
                          : 'Authorised Cash'}
                    </td>
                    <td className="py-3.5 px-4 font-semibold uppercase text-slate-800">{p.status}</td>
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

  if (activeTab === 'profile') {
    return <ProfilePanel user={user} onUpdated={onUserUpdated} />;
  }

  return (
    <div className="space-y-6">
      {user.approval_status !== 'approved' && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
          <strong>Verification Pending:</strong> Your driver account is currently{' '}
          <span className="uppercase font-bold">{user.approval_status}</span>. You can register
          vehicles now; an administrator must approve your account before accepting live jobs.
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Incoming Requests</div>
          <div className="text-2xl font-mono font-bold text-[#0B2545] tabular-nums mt-1">
            {openRequests.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Available to accept</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Active Assigned Trips</div>
          <div className="text-2xl font-mono font-bold text-slate-900 tabular-nums mt-1">
            {myActiveTrips.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Live GPS enabled</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Completed Moves</div>
          <div className="text-2xl font-mono font-bold text-slate-900 tabular-nums mt-1">
            {completedTrips.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Verified deliveries</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Registered Vehicles</div>
          <div className="text-2xl font-mono font-bold text-slate-900 tabular-nums mt-1">
            {myVehicles.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {myVehicles.filter((v) => v.is_available).length} online now
          </div>
        </div>
      </div>

      {/* Incoming Requests + Assigned Trips */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-bold text-[#0B2545]">Booking Requests & Active Trips</h2>
          <span className="text-xs text-slate-500">Click any job to accept, update status, or share live GPS</span>
        </div>

        {bookings.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No booking requests or trips right now.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {bookings.map((b) => (
              <div
                key={b.id}
                onClick={() => onOpenBooking(b)}
                className="px-6 py-4 hover:bg-slate-50 cursor-pointer transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono font-bold text-[#0B2545]">{b.reference_code}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-slate-800">{b.status}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {b.scheduled_date} {b.scheduled_time}
                    </span>
                    {b.driver_id === null && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-bold text-amber-700">Open Request</span>
                      </>
                    )}
                  </div>
                  <div className="text-sm font-bold text-slate-900 truncate flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[#0B2545] shrink-0" />
                    <span className="truncate">
                      {b.pickup_address} → {b.destination_address}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 flex items-center gap-2">
                    <Truck className="w-3.5 h-3.5" />
                    <span>
                      {b.customer_name} ({b.customer_phone}) · {b.distance_km} km · {b.estimated_rooms}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <div className="text-sm font-mono font-bold text-[#0B2545] tabular-nums">
                      {formatXaf(b.total_price_xaf)}
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center justify-end gap-1">
                      <Wallet className="w-3 h-3" />
                      <span>{b.payment?.method?.replace('_', ' ') || 'MoMo'}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="px-4 py-2 text-xs font-bold rounded-lg bg-[#0B2545] text-yellow-300 hover:bg-[#13315C] whitespace-nowrap"
                  >
                    {b.driver_id === null ? 'Review & Accept' : 'Open Trip Console'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
