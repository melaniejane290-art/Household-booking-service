import React, { useCallback, useState } from 'react';
import { Calendar, Camera, Check, Clock, Navigation, Truck, Upload, Users, Wallet, X } from 'lucide-react';
import { apiFetch, uploadImage } from '../lib/api.ts';
import {
  ASSISTANT_RATE_PER_PERSON_XAF,
  CAMEROON_CITIES,
  formatXaf,
  type Booking,
  type PaymentMethod,
  type RouteDraft,
  type User,
  type Vehicle,
} from '../types/movecam.ts';
import { CameroonPlaceInput, MoveRouteMap, type SelectedLocation } from './MapsComponents.tsx';

interface BookingWizardProps {
  user: User;
  vehicles: Vehicle[];
  preselectedVehicleId?: number | null;
  routeDraft?: RouteDraft | null;
  onCancel: () => void;
  onCreated: (booking: Booking) => void;
}

export function BookingWizard({
  user,
  vehicles,
  preselectedVehicleId,
  routeDraft,
  onCancel,
  onCreated,
}: BookingWizardProps) {
  const approvedVehicles = vehicles.filter((v) => v.is_approved === 1);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number>(
    preselectedVehicleId || routeDraft?.vehicleId || approvedVehicles[0]?.id || 0
  );

  const [cityCenter, setCityCenter] = useState<{ lat: number; lng: number }>({
    lat: routeDraft?.pickupLat ?? 4.0511,
    lng: routeDraft?.pickupLng ?? 9.7679,
  });
  const [pickupAddress, setPickupAddress] = useState(
    routeDraft?.pickupAddress || 'Bonapriso, Douala, Cameroon'
  );
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number }>({
    lat: routeDraft?.pickupLat ?? 4.0273,
    lng: routeDraft?.pickupLng ?? 9.6989,
  });
  const [destinationAddress, setDestinationAddress] = useState(
    routeDraft?.destinationAddress || 'Makepe, Douala, Cameroon'
  );
  const [destinationCoords, setDestinationCoords] = useState<{ lat: number; lng: number }>({
    lat: routeDraft?.destinationLat ?? 4.0725,
    lng: routeDraft?.destinationLng ?? 9.7448,
  });
  const [pickingMode, setPickingMode] = useState<'pickup' | 'destination' | null>(null);

  const [distanceKm, setDistanceKm] = useState<number>(routeDraft?.distanceKm ?? 9.2);
  const [durationMins, setDurationMins] = useState<number>(routeDraft?.durationMins ?? 26);

  const [scheduledDate, setScheduledDate] = useState(() => {
    const d = new Date(Date.now() + 86400000);
    return d.toISOString().split('T')[0];
  });
  const [scheduledTime, setScheduledTime] = useState('09:00');
  const [estimatedRooms, setEstimatedRooms] = useState('2-3 Bedroom Apartment');
  const [itemsDescription, setItemsDescription] = useState('');
  const [belongingsPhotos, setBelongingsPhotos] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [assistantsNeeded, setAssistantsNeeded] = useState<number>(
    routeDraft?.assistantsNeeded ?? 1
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('mtn_momo');
  const [paymentPhone, setPaymentPhone] = useState(user.phone || '+237 6');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedVehicle = approvedVehicles.find((v) => v.id === selectedVehicleId) || approvedVehicles[0];
  const vehicleFee = selectedVehicle
    ? Math.round(selectedVehicle.base_fare_xaf + distanceKm * selectedVehicle.per_km_xaf)
    : 0;
  const assistantFee = assistantsNeeded * ASSISTANT_RATE_PER_PERSON_XAF;
  const totalEstimate = vehicleFee + assistantFee;

  const handlePickupSelect = useCallback((loc: SelectedLocation) => {
    setPickupAddress(loc.address);
    setPickupCoords({ lat: loc.lat, lng: loc.lng });
    setPickingMode(null);
  }, []);

  const handleDestSelect = useCallback((loc: SelectedLocation) => {
    setDestinationAddress(loc.address);
    setDestinationCoords({ lat: loc.lat, lng: loc.lng });
    setPickingMode(null);
  }, []);

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      if (!pickingMode) return;
      const coordLabel = `Pinned Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
      if (pickingMode === 'pickup') {
        setPickupCoords({ lat, lng });
        setPickupAddress(coordLabel);
      } else {
        setDestinationCoords({ lat, lng });
        setDestinationAddress(coordLabel);
      }
      setPickingMode(null);
    },
    [pickingMode]
  );

  const handleRouteCalculated = useCallback((info: { distanceKm: number; durationMins: number }) => {
    setDistanceKm(info.distanceKm);
    setDurationMins(info.durationMins);
  }, []);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingPhoto(true);
    setError(null);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files).slice(0, 6 - belongingsPhotos.length)) {
        const url = await uploadImage(file);
        uploaded.push(url);
      }
      setBelongingsPhotos((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload belongings photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleCityJump = (cityName: string) => {
    const cityObj = CAMEROON_CITIES.find((c) => c.name === cityName);
    if (!cityObj) return;
    setCityCenter({ lat: cityObj.lat, lng: cityObj.lng });
    setPickupCoords({ lat: cityObj.lat - 0.015, lng: cityObj.lng - 0.012 });
    setPickupAddress(`${cityObj.name} Central District, Cameroon`);
    setDestinationCoords({ lat: cityObj.lat + 0.018, lng: cityObj.lng + 0.016 });
    setDestinationAddress(`${cityObj.name} Residential Quarter, Cameroon`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicle) {
      setError('Please select a vehicle for your move.');
      return;
    }
    if (!itemsDescription.trim()) {
      setError('Please describe the household items you want to transport.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{ booking: Booking }>('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({
          vehicle_id: selectedVehicle.id,
          pickup_address: pickupAddress,
          pickup_lat: pickupCoords.lat,
          pickup_lng: pickupCoords.lng,
          destination_address: destinationAddress,
          destination_lat: destinationCoords.lat,
          destination_lng: destinationCoords.lng,
          distance_km: distanceKm,
          duration_mins: durationMins,
          scheduled_date: scheduledDate,
          scheduled_time: scheduledTime,
          items_description: itemsDescription,
          estimated_rooms: estimatedRooms,
          belongings_photos: belongingsPhotos,
          assistants_needed: assistantsNeeded,
          payment_method: paymentMethod,
          payment_phone: paymentPhone,
        }),
      });
      onCreated(res.booking);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create booking.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="px-6 py-5 bg-[#0B2545] text-white flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Book a Household Move</h2>
          <p className="text-xs text-slate-300 mt-0.5">
            Select addresses on Google Maps, inspect transparent XAF pricing, and confirm your fleet.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium text-slate-200 hover:text-white border border-white/20 rounded-lg whitespace-nowrap"
        >
          Back to Overview
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-8">
        {error && (
          <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700">
            {error}
          </div>
        )}

        {/* Section 1: Route & Google Maps */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#0B2545]">01. Pickup & Destination</h3>
              <div className="flex items-center gap-1 flex-wrap">
                {['Douala', 'Yaoundé', 'Bamenda', 'Limbe'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => handleCityJump(c)}
                    className="text-[11px] font-medium px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors whitespace-nowrap"
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <CameroonPlaceInput
              label="Pickup Address"
              value={pickupAddress}
              placeholder="Search street or quarter in Cameroon..."
              onChangeText={setPickupAddress}
              onSelectPlace={handlePickupSelect}
              onActivateMapPick={() =>
                setPickingMode((prev) => (prev === 'pickup' ? null : 'pickup'))
              }
              isPickingOnMap={pickingMode === 'pickup'}
            />

            <CameroonPlaceInput
              label="Destination Address"
              value={destinationAddress}
              placeholder="Search destination street or quarter..."
              onChangeText={setDestinationAddress}
              onSelectPlace={handleDestSelect}
              onActivateMapPick={() =>
                setPickingMode((prev) => (prev === 'destination' ? null : 'destination'))
              }
              isPickingOnMap={pickingMode === 'destination'}
            />

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-[11px] text-slate-500">Estimated Distance</div>
                <div className="text-base font-mono font-bold text-[#0B2545] tabular-nums mt-0.5">
                  {distanceKm.toFixed(1)} km
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-[11px] text-slate-500">Driving Time</div>
                <div className="text-base font-mono font-bold text-[#0B2545] tabular-nums mt-0.5">
                  ~{durationMins} mins
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  <Calendar className="w-3.5 h-3.5 inline mr-1" />
                  Moving Date
                </label>
                <input
                  type="date"
                  required
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B2545]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  <Clock className="w-3.5 h-3.5 inline mr-1" />
                  Pickup Time
                </label>
                <input
                  type="time"
                  required
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B2545]"
                />
              </div>
            </div>
          </div>

          <div className="lg:col-span-7">
            <MoveRouteMap
              pickup={pickupCoords}
              destination={destinationCoords}
              center={cityCenter}
              heightClass="h-80 lg:h-96"
              onMapClick={handleMapClick}
              onRouteCalculated={handleRouteCalculated}
              interactiveHint={
                pickingMode === 'pickup'
                  ? 'Click anywhere on the map to set Pickup Pin'
                  : pickingMode === 'destination'
                    ? 'Click anywhere on the map to set Destination Pin'
                    : null
              }
            />
            <p className="text-[11px] text-slate-500 mt-2 flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-[#0B2545]" />
              <span>
                Deep blue marker = Pickup · Golden yellow marker = Destination. Click &ldquo;Pick on Map&rdquo; to adjust pins manually.
              </span>
            </p>
          </div>
        </div>

        {/* Section 2: Household Items & Photos */}
        <div className="pt-6 border-t border-slate-200 space-y-4">
          <h3 className="text-sm font-bold text-[#0B2545]">02. Belongings Inventory & Photos</h3>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Home / Load Size
                </label>
                <select
                  value={estimatedRooms}
                  onChange={(e) => setEstimatedRooms(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-[#0B2545]"
                >
                  <option value="Single Items / Appliances">Single Items / Appliances</option>
                  <option value="1-Bedroom Studio">1-Bedroom Studio</option>
                  <option value="2-3 Bedroom Apartment">2-3 Bedroom Apartment</option>
                  <option value="4+ Bedroom Villa / Office">4+ Bedroom Villa / Office</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Describe Items to Transport
                </label>
                <textarea
                  rows={3}
                  required
                  value={itemsDescription}
                  onChange={(e) => setItemsDescription(e.target.value)}
                  placeholder="List major furniture, appliances, fragile items, floor level (e.g., 3rd floor no elevator), and approximate number of boxes..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B2545]/20 focus:border-[#0B2545]"
                />
              </div>
            </div>

            <div className="lg:col-span-5">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                <Camera className="w-3.5 h-3.5 inline mr-1" />
                Upload Pictures of Belongings (Optional, up to 6)
              </label>
              <label className="flex flex-col items-center justify-center border border-dashed border-slate-300 hover:border-[#0B2545] rounded-xl p-4 cursor-pointer bg-slate-50/70 transition-colors">
                <Upload className="w-5 h-5 text-[#0B2545] mb-1.5" />
                <span className="text-xs font-semibold text-slate-700">
                  {uploadingPhoto ? 'Uploading photo...' : 'Choose images from device'}
                </span>
                <span className="text-[11px] text-slate-500 mt-0.5">JPG, PNG, WEBP up to 6MB</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={uploadingPhoto || belongingsPhotos.length >= 6}
                  onChange={(e) => void handlePhotoUpload(e)}
                  className="hidden"
                />
              </label>

              {belongingsPhotos.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {belongingsPhotos.map((url, idx) => (
                    <div key={idx} className="relative aspect-4/3 rounded-lg overflow-hidden border border-slate-200">
                      <img
                        src={url}
                        alt={`Belongings preview ${idx + 1}`}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setBelongingsPhotos((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="absolute top-1 right-1 p-1 rounded-full bg-slate-900/75 text-white hover:bg-red-600"
                        aria-label="Remove photo"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section 3: Vehicle Selection */}
        <div className="pt-6 border-t border-slate-200 space-y-4">
          <h3 className="text-sm font-bold text-[#0B2545]">03. Select Suitable Vehicle</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {approvedVehicles.map((v) => {
              const estVehicleCost = Math.round(v.base_fare_xaf + distanceKm * v.per_km_xaf);
              const isSelected = selectedVehicle?.id === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelectedVehicleId(v.id)}
                  className={`text-left rounded-xl border overflow-hidden transition-all ${
                    isSelected
                      ? 'border-[#0B2545] ring-2 ring-[#0B2545]/15 bg-slate-50/70'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="aspect-4/3 w-full bg-slate-100 overflow-hidden relative">
                    <img
                      src={v.photo_url}
                      alt={v.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#0B2545] text-yellow-300 flex items-center justify-center">
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </div>
                  <div className="p-3.5">
                    <div className="text-xs text-slate-500">
                      {v.vehicle_type} · {v.city}
                    </div>
                    <div className="text-sm font-bold text-slate-900 mt-0.5 truncate">{v.title}</div>
                    <div className="text-xs text-slate-600 mt-1 line-clamp-1">{v.capacity_label}</div>
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] text-slate-500">Est. Vehicle Fee</span>
                      <span className="text-xs font-mono font-bold text-[#0B2545] tabular-nums">
                        {formatXaf(estVehicleCost)}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 4: Loading Assistants & Payment */}
        <div className="pt-6 border-t border-slate-200 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 space-y-4">
            <h3 className="text-sm font-bold text-[#0B2545]">
              04. Loading & Unloading Assistance
            </h3>
            <p className="text-xs text-slate-600">
              Add trained MoveCam moving assistants to carry, wrap, load, and unload heavy furniture ({formatXaf(ASSISTANT_RATE_PER_PERSON_XAF)} per assistant).
            </p>
            <div className="grid grid-cols-5 gap-2">
              {[0, 1, 2, 3, 4].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setAssistantsNeeded(count)}
                  className={`py-2.5 rounded-lg border text-xs font-bold transition-colors flex flex-col items-center gap-0.5 ${
                    assistantsNeeded === count
                      ? 'bg-[#0B2545] text-yellow-300 border-[#0B2545]'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>{count === 0 ? 'None' : `${count}`}</span>
                </button>
              ))}
            </div>

            <div className="pt-3">
              <h4 className="text-xs font-bold text-slate-800 mb-2">
                <Wallet className="w-3.5 h-3.5 inline mr-1" />
                Payment Method (Cameroon)
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { id: 'mtn_momo' as const, label: 'MTN MoMo', sub: 'Mobile Money' },
                  { id: 'orange_money' as const, label: 'Orange Money', sub: 'OM Instant' },
                  { id: 'cash' as const, label: 'Authorised Cash', sub: 'Pay on Delivery' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPaymentMethod(opt.id)}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      paymentMethod === opt.id
                        ? 'border-[#0B2545] bg-[#0B2545]/5'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="text-xs font-bold text-[#0B2545]">{opt.label}</div>
                    <div className="text-[11px] text-slate-500">{opt.sub}</div>
                  </button>
                ))}
              </div>
              {paymentMethod !== 'cash' && (
                <div className="mt-3">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {paymentMethod === 'mtn_momo' ? 'MTN MoMo Number' : 'Orange Money Number'}
                  </label>
                  <input
                    type="tel"
                    required
                    value={paymentPhone}
                    onChange={(e) => setPaymentPhone(e.target.value)}
                    placeholder="+237 6XX XXX XXX"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B2545]"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="p-5 rounded-xl bg-[#0B2545] text-white space-y-3">
              <div className="flex items-center justify-between border-b border-white/15 pb-3">
                <span className="text-sm font-bold">Instant Move Estimate</span>
                <span className="text-xs font-mono text-yellow-300 tabular-nums">
                  {distanceKm.toFixed(1)} km · ~{durationMins} mins
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>
                  Vehicle ({selectedVehicle?.title || 'Select Vehicle'})
                </span>
                <span className="font-mono tabular-nums text-white">{formatXaf(vehicleFee)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>Loading Assistants ({assistantsNeeded} × {formatXaf(ASSISTANT_RATE_PER_PERSON_XAF)})</span>
                <span className="font-mono tabular-nums text-white">{formatXaf(assistantFee)}</span>
              </div>
              <div className="pt-3 border-t border-white/15 flex items-center justify-between">
                <span className="text-sm font-bold text-yellow-300">Total Estimated Cost</span>
                <span className="text-xl font-mono font-bold text-yellow-300 tabular-nums">
                  {formatXaf(totalEstimate)}
                </span>
              </div>
              <button
                type="submit"
                disabled={submitting || !selectedVehicle}
                className="w-full mt-2 py-3 px-5 bg-yellow-400 hover:bg-yellow-300 text-[#0B2545] font-bold text-sm rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60 whitespace-nowrap"
              >
                <Truck className="w-4 h-4" />
                <span>{submitting ? 'Submitting Booking...' : 'Confirm & Book Move'}</span>
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
