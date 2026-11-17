import React, { useCallback, useState } from 'react';
import { ArrowRight, MapPin, Navigation, ShieldCheck, Truck, Users, Wallet } from 'lucide-react';
import {
  ASSISTANT_RATE_PER_PERSON_XAF,
  CAMEROON_CITIES,
  formatXaf,
  type RouteDraft,
  type User,
  type UserRole,
  type Vehicle,
} from '../types/movecam.ts';
import { CameroonPlaceInput, MoveRouteMap, type SelectedLocation } from './MapsComponents.tsx';

interface LandingPageProps {
  currentUser: User | null;
  vehicles: Vehicle[];
  onOpenAuth: (mode: 'login' | 'register', role?: Exclude<UserRole, 'admin'>) => void;
  onStartBooking: (vehicleId?: number, draft?: RouteDraft) => void;
  onGoToDashboard: () => void;
}

export function LandingPage({
  currentUser,
  vehicles,
  onOpenAuth,
  onStartBooking,
  onGoToDashboard,
}: LandingPageProps) {
  const approvedVehicles = vehicles.filter((v) => v.is_approved === 1);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number>(0);
  const [cityCenter, setCityCenter] = useState<{ lat: number; lng: number }>({
    lat: 4.0511,
    lng: 9.7679,
  });
  const [pickupAddress, setPickupAddress] = useState('Bonapriso, Douala, Cameroon');
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number }>({
    lat: 4.0273,
    lng: 9.6989,
  });
  const [destinationAddress, setDestinationAddress] = useState('Makepe, Douala, Cameroon');
  const [destinationCoords, setDestinationCoords] = useState<{ lat: number; lng: number }>({
    lat: 4.0725,
    lng: 9.7448,
  });
  const [pickingMode, setPickingMode] = useState<'pickup' | 'destination' | null>(null);
  const [distanceKm, setDistanceKm] = useState<number>(9.2);
  const [durationMins, setDurationMins] = useState<number>(26);
  const [assistantsNeeded, setAssistantsNeeded] = useState<number>(1);

  const selectedVehicle =
    approvedVehicles.find((v) => v.id === selectedVehicleId) || approvedVehicles[0];
  const vehicleFee = selectedVehicle
    ? Math.round(selectedVehicle.base_fare_xaf + distanceKm * selectedVehicle.per_km_xaf)
    : Math.round(25000 + distanceKm * 1200);
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

  const handleCityPreset = (cityName: string) => {
    const cityObj = CAMEROON_CITIES.find((c) => c.name === cityName);
    if (!cityObj) return;
    setCityCenter({ lat: cityObj.lat, lng: cityObj.lng });
    setPickupCoords({ lat: cityObj.lat - 0.015, lng: cityObj.lng - 0.012 });
    setPickupAddress(`${cityObj.name} Central District, Cameroon`);
    setDestinationCoords({ lat: cityObj.lat + 0.018, lng: cityObj.lng + 0.016 });
    setDestinationAddress(`${cityObj.name} Residential Quarter, Cameroon`);
    setPickingMode(null);
  };

  const handleBookRoute = () => {
    onStartBooking(selectedVehicle?.id, {
      vehicleId: selectedVehicle?.id ?? null,
      pickupAddress,
      pickupLat: pickupCoords.lat,
      pickupLng: pickupCoords.lng,
      destinationAddress,
      destinationLat: destinationCoords.lat,
      destinationLng: destinationCoords.lng,
      distanceKm,
      durationMins,
      assistantsNeeded,
    });
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col">
      {/* Strict 3-Zone Top Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xs border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="font-display text-xl font-extrabold tracking-tight text-[#0B2545] whitespace-nowrap shrink-0"
          >
            MoveCam
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <a
              href="#route-map"
              className="hover:text-[#0B2545] transition-colors whitespace-nowrap shrink-0"
            >
              Route Map
            </a>
            <a
              href="#how-it-works"
              className="hover:text-[#0B2545] transition-colors whitespace-nowrap shrink-0"
            >
              How It Works
            </a>
            <a
              href="#fleet"
              className="hover:text-[#0B2545] transition-colors whitespace-nowrap shrink-0"
            >
              Fleet
            </a>
            <a
              href="#partners"
              className="hover:text-[#0B2545] transition-colors whitespace-nowrap shrink-0"
            >
              Partners
            </a>
            {currentUser ? (
              <button
                type="button"
                onClick={onGoToDashboard}
                className="hover:text-[#0B2545] transition-colors whitespace-nowrap shrink-0 font-semibold text-[#0B2545]"
              >
                Dashboard
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onOpenAuth('login', 'customer')}
                className="hover:text-[#0B2545] transition-colors whitespace-nowrap shrink-0"
              >
                Sign In
              </button>
            )}
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => (currentUser ? onGoToDashboard() : onStartBooking())}
              className="px-4 py-2.5 bg-[#0B2545] hover:bg-[#13315C] text-yellow-300 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {currentUser ? 'Open Workspace' : 'Book a Move'}
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="flex-1">
        {/* Hero Split */}
        <section className="max-w-7xl mx-auto px-6 pt-10 pb-12 lg:pt-14 lg:pb-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-between py-2">
              <div className="space-y-5">
                <p className="text-xs font-semibold tracking-wide text-[#0B2545]">
                  Your Trusted Moving Partner in Cameroon · Book • Move • Relocate
                </p>
                <h1
                  className="font-display font-extrabold text-[#0B2545] tracking-tight leading-[1.08]"
                  style={{ fontSize: 'clamp(2.25rem, 4vw, 3.65rem)', textWrap: 'balance' }}
                >
                  Household moving and relocation across Cameroon, built for certainty.
                </h1>
                <p className="text-base text-slate-600 leading-relaxed max-w-xl">
                  Connect directly with vetted vehicle owners, professional drivers, and trained loading assistants. Calculate routes on Google Maps, receive upfront XAF quotes, track your truck live, and pay via MTN Mobile Money, Orange Money, or authorised cash.
                </p>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => onStartBooking()}
                  className="px-6 py-3.5 bg-yellow-400 hover:bg-yellow-300 text-[#0B2545] font-bold text-sm rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap"
                >
                  <span>Book Your Move</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onOpenAuth('register', 'driver')}
                  className="px-5 py-3.5 border border-slate-300 hover:border-[#0B2545] text-[#0B2545] font-semibold text-sm rounded-lg transition-colors whitespace-nowrap"
                >
                  Register as Driver or Assistant
                </button>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-[#0B2545] h-72 sm:h-96 lg:h-full min-h-[340px]">
                <img
                  src="/src/assets/images/hero_movecam_douala_1794844159402.jpg"
                  alt="MoveCam crew loading household furniture into a moving truck in Douala, Cameroon"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0B2545]/90 via-[#0B2545]/25 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                  <div className="text-xs font-medium text-yellow-300">
                    Active Relocation Corridors
                  </div>
                  <div className="text-sm sm:text-base font-bold mt-1">
                    {CAMEROON_CITIES.slice(0, 6)
                      .map((c) => c.name)
                      .join(' · ')}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Full-width 4-Column Capability Strip below Hero Split */}
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border border-slate-200 rounded-2xl divide-y sm:divide-y-0 sm:divide-x divide-slate-200 bg-slate-50/70">
            <div className="p-5 space-y-1">
              <MapPin className="w-4 h-4 text-[#0B2545]" />
              <div className="text-sm font-bold text-[#0B2545]">Google Maps Route Quotes</div>
              <p className="text-xs text-slate-600">
                Pin pickup and destination addresses with live distance calculation and transparent XAF pricing.
              </p>
            </div>
            <div className="p-5 space-y-1">
              <Truck className="w-4 h-4 text-[#0B2545]" />
              <div className="text-sm font-bold text-[#0B2545]">Live GPS Trip Tracking</div>
              <p className="text-xs text-slate-600">
                Follow every status from Pending to In Transit with real-time driver coordinates and chat.
              </p>
            </div>
            <div className="p-5 space-y-1">
              <Users className="w-4 h-4 text-[#0B2545]" />
              <div className="text-sm font-bold text-[#0B2545]">On-Demand Loaders</div>
              <p className="text-xs text-slate-600">
                Request 1 to 4 verified moving assistants for heavy appliances, stairs, and fragile packing.
              </p>
            </div>
            <div className="p-5 space-y-1">
              <Wallet className="w-4 h-4 text-[#0B2545]" />
              <div className="text-sm font-bold text-[#0B2545]">MoMo, OM & Cash</div>
              <p className="text-xs text-slate-600">
                Built for Cameroon with MTN Mobile Money, Orange Money, and driver-authorised cash receipts.
              </p>
            </div>
          </div>
        </section>

        {/* Interactive Google Maps Route & Price Estimator */}
        <section id="route-map" className="border-t border-slate-200 bg-white py-16">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold text-[#0B2545]">
                  Google Maps Route & Fare Estimator
                </p>
                <h2
                  className="font-display text-2xl sm:text-3xl font-extrabold text-[#0B2545] mt-1 tracking-tight"
                  style={{ textWrap: 'balance' }}
                >
                  Plan your Cameroon moving route and inspect your XAF estimate live.
                </h2>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {['Douala', 'Yaoundé', 'Bamenda', 'Bafoussam', 'Limbe'].map((cityName) => (
                  <button
                    key={cityName}
                    type="button"
                    onClick={() => handleCityPreset(cityName)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 hover:border-[#0B2545] text-xs font-semibold text-[#0B2545] bg-slate-50 hover:bg-slate-100 transition-colors whitespace-nowrap"
                  >
                    {cityName}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4">
                <CameroonPlaceInput
                  label="Pickup Location"
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
                  label="Destination Location"
                  value={destinationAddress}
                  placeholder="Search destination street or quarter..."
                  onChangeText={setDestinationAddress}
                  onSelectPlace={handleDestSelect}
                  onActivateMapPick={() =>
                    setPickingMode((prev) => (prev === 'destination' ? null : 'destination'))
                  }
                  isPickingOnMap={pickingMode === 'destination'}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Vehicle Size
                    </label>
                    <select
                      value={selectedVehicle?.id || ''}
                      onChange={(e) => setSelectedVehicleId(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B2545]"
                    >
                      {approvedVehicles.length === 0 ? (
                        <option value="">Standard Moving Truck</option>
                      ) : (
                        approvedVehicles.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.vehicle_type} — {v.title}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Loading Assistants
                    </label>
                    <select
                      value={assistantsNeeded}
                      onChange={(e) => setAssistantsNeeded(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B2545]"
                    >
                      {[0, 1, 2, 3, 4].map((n) => (
                        <option key={n} value={n}>
                          {n === 0
                            ? 'None (Self-loading)'
                            : `${n} Assistant${n > 1 ? 's' : ''} (+${formatXaf(
                                n * ASSISTANT_RATE_PER_PERSON_XAF
                              )})`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#0B2545] text-white space-y-2.5">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>Measured Driving Route</span>
                    <span className="font-mono font-bold text-yellow-300 tabular-nums">
                      {distanceKm.toFixed(1)} km · ~{durationMins} mins
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>Vehicle & Fuel Estimate</span>
                    <span className="font-mono tabular-nums text-white">
                      {formatXaf(vehicleFee)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>Loading Crew ({assistantsNeeded})</span>
                    <span className="font-mono tabular-nums text-white">
                      {formatXaf(assistantFee)}
                    </span>
                  </div>
                  <div className="pt-2.5 border-t border-white/15 flex items-center justify-between">
                    <span className="text-xs font-bold text-yellow-300">Estimated Move Total</span>
                    <span className="text-lg font-mono font-bold text-yellow-300 tabular-nums">
                      {formatXaf(totalEstimate)}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleBookRoute}
                  className="w-full py-3 px-5 bg-yellow-400 hover:bg-yellow-300 text-[#0B2545] font-bold text-sm rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <span>Book This Route</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              <div className="lg:col-span-7 space-y-2.5">
                <MoveRouteMap
                  pickup={pickupCoords}
                  destination={destinationCoords}
                  center={cityCenter}
                  heightClass="h-80 lg:h-[440px]"
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
                <p className="text-xs text-slate-500 flex items-center gap-1.5">
                  <Navigation className="w-3.5 h-3.5 text-[#0B2545] shrink-0" />
                  <span>
                    Deep blue pin = Pickup · Yellow pin = Destination. Search any Cameroon address or click &ldquo;Pick on Map&rdquo; to adjust coordinates.
                  </span>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="border-t border-slate-200 bg-slate-50/60 py-16">
          <div className="max-w-7xl mx-auto px-6">
            <div className="max-w-2xl mb-10">
              <p className="text-xs font-semibold text-[#0B2545]">Workflow</p>
              <h2
                className="font-display text-2xl sm:text-3xl font-extrabold text-[#0B2545] mt-1 tracking-tight"
                style={{ textWrap: 'balance' }}
              >
                Four structured steps from request to final delivery.
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  num: '01.',
                  title: 'Map Your Route',
                  desc: 'Enter pickup and destination addresses or drop pins directly on Google Maps to measure exact driving distance.',
                },
                {
                  num: '02.',
                  title: 'Photograph & Choose Fleet',
                  desc: 'Describe household belongings, upload item photos, and pick a pickup, cargo van, box truck, or heavy lorry.',
                },
                {
                  num: '03.',
                  title: 'Add Moving Assistants',
                  desc: 'Request trained loaders for packing, carrying, and unloading, then pay via MTN MoMo, Orange Money, or cash.',
                },
                {
                  num: '04.',
                  title: 'Track & Rate Delivery',
                  desc: 'Chat directly with your driver, watch live truck GPS coordinates during transit, and rate the completed move.',
                },
              ].map((step) => (
                <div
                  key={step.num}
                  className="bg-white border border-slate-200 rounded-xl p-6 space-y-2.5"
                >
                  <div className="font-mono text-sm font-bold text-yellow-600">{step.num}</div>
                  <h3 className="text-base font-bold text-[#0B2545]">{step.title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Verified Fleet Showcase */}
        <section id="fleet" className="py-16 border-t border-slate-200 bg-white">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
              <div>
                <p className="text-xs font-semibold text-[#0B2545]">Verified Fleet</p>
                <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-[#0B2545] mt-1 tracking-tight">
                  Vehicles ready for household relocation.
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onStartBooking()}
                className="text-xs font-bold text-[#0B2545] hover:underline whitespace-nowrap"
              >
                Calculate custom route estimate →
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {vehicles.slice(0, 4).map((v) => (
                <div
                  key={v.id}
                  className="border border-slate-200 rounded-2xl overflow-hidden bg-white flex flex-col"
                >
                  <div className="aspect-4/3 bg-slate-100 overflow-hidden">
                    <img
                      src={v.photo_url}
                      alt={v.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div>
                      <div className="text-xs text-slate-500">
                        {v.vehicle_type} · {v.city} · {v.plate_number}
                      </div>
                      <h3 className="text-base font-bold text-[#0B2545] mt-1">{v.title}</h3>
                      <p className="text-xs text-slate-600 mt-1">{v.capacity_label}</p>
                    </div>
                    <div className="pt-3 border-t border-slate-100 space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">Starting Fare</span>
                        <span className="font-mono font-bold text-[#0B2545] tabular-nums">
                          {formatXaf(v.base_fare_xaf)} + {formatXaf(v.per_km_xaf)}/km
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onStartBooking(v.id)}
                        className="w-full py-2.5 bg-[#0B2545] hover:bg-[#13315C] text-yellow-300 text-xs font-bold rounded-lg transition-colors whitespace-nowrap"
                      >
                        Book This Vehicle
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Partners & Crew Section */}
        <section id="partners" className="py-16 bg-[#0B2545] text-white">
          <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-6 space-y-5">
              <div className="text-xs font-semibold text-yellow-300">
                Service Providers · Drivers & Moving Assistants
              </div>
              <h2
                className="font-display text-2xl sm:text-4xl font-extrabold tracking-tight leading-tight"
                style={{ textWrap: 'balance' }}
              >
                Own a moving truck or work as a relocation specialist in Cameroon?
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                Join MoveCam to receive verified household moving requests, manage your vehicle availability, share live trip updates, or set your weekly loading assistance schedule with transparent XAF payouts.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="p-4 rounded-xl border border-white/15 bg-white/5 space-y-2">
                  <div className="text-sm font-bold text-yellow-300">Drivers & Vehicle Owners</div>
                  <p className="text-xs text-slate-300">
                    Upload truck photos, set base & per-km rates, accept jobs, and broadcast live route GPS.
                  </p>
                  <button
                    type="button"
                    onClick={() => onOpenAuth('register', 'driver')}
                    className="text-xs font-bold text-white underline"
                  >
                    Register as Driver →
                  </button>
                </div>
                <div className="p-4 rounded-xl border border-white/15 bg-white/5 space-y-2">
                  <div className="text-sm font-bold text-yellow-300">Moving Assistants</div>
                  <p className="text-xs text-slate-300">
                    Manage weekly shifts, accept loading/unloading assignments, and earn 12,000 XAF per job.
                  </p>
                  <button
                    type="button"
                    onClick={() => onOpenAuth('register', 'assistant')}
                    className="text-xs font-bold text-white underline"
                  >
                    Register as Assistant →
                  </button>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="aspect-4/3 rounded-2xl overflow-hidden border border-white/15">
                <img
                  src="/src/assets/images/team_moving_crew_1794844161698.jpg"
                  alt="Trained MoveCam moving assistants wrapping household sofa with protective blankets"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="bg-slate-50 border-t border-slate-200 py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="font-display text-lg font-extrabold text-[#0B2545]">MoveCam</div>
            <div className="text-xs text-slate-600 mt-0.5">
              Book • Move • Relocate · Your Trusted Moving Partner in Cameroon.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#0B2545]" />
              <span>Admin-verified drivers & assistants</span>
            </span>
            <span>MTN MoMo · Orange Money · Authorised Cash</span>
            <span>Maps powered by Google Maps Platform</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
