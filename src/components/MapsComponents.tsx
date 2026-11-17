import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  Map as GoogleMap,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { MapPin, Navigation, Truck } from 'lucide-react';

const ENV_MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || '';
const MapsKeyContext = React.createContext<string>(ENV_MAPS_API_KEY);

export function triggerQuotaWarningIfNeeded(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('OVER_QUERY_LIMIT') ||
    msg.includes('Quota') ||
    msg.includes('429')
  ) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return Math.max(1, Number((2 * R * Math.asin(Math.sqrt(h)) * 1.25).toFixed(1)));
}

export function MoveCamAPIProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKey] = useState<string>(ENV_MAPS_API_KEY);

  useEffect(() => {
    if (apiKey) return;
    fetch('/api/config/maps')
      .then((r) => r.json())
      .then((data: { apiKey?: string }) => {
        if (data.apiKey) setApiKey(data.apiKey);
      })
      .catch(() => {
        // Ignore if offline
      });
  }, [apiKey]);

  if (!apiKey) {
    return <MapsKeyContext.Provider value="">{children}</MapsKeyContext.Provider>;
  }
  return (
    <MapsKeyContext.Provider value={apiKey}>
      <APIProvider apiKey={apiKey} language="en" region="CM">
        {children}
      </APIProvider>
    </MapsKeyContext.Provider>
  );
}

interface PlaceLocationLike {
  lat: () => number;
  lng: () => number;
}

interface PlaceLike {
  location?: PlaceLocationLike | null;
  displayName?: string | null;
  formattedAddress?: string | null;
  fetchFields: (opts: { fields: string[] }) => Promise<void>;
}

interface AutocompleteSuggestionItem {
  placePrediction?: {
    text: { text: string };
    toPlace: () => PlaceLike;
  };
}

interface AutocompleteReturn {
  suggestions: AutocompleteSuggestionItem[];
  isLoading: boolean;
  resetSession: () => void;
}

function useAutocompleteSuggestions(inputString: string): AutocompleteReturn {
  const placesLib = useMapsLibrary('places');
  const sessionTokenRef = useRef<unknown>(null);
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestionItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!placesLib) return;
    const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib as unknown as {
      AutocompleteSessionToken: new () => unknown;
      AutocompleteSuggestion: {
        fetchAutocompleteSuggestions: (req: unknown) => Promise<{ suggestions?: AutocompleteSuggestionItem[] }>;
      };
    };

    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new AutocompleteSessionToken();
    }

    if (!inputString || inputString.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    const timer = setTimeout(() => {
      AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: inputString,
        sessionToken: sessionTokenRef.current,
        includedRegionCodes: ['cm'],
      })
        .then((res: { suggestions?: AutocompleteSuggestionItem[] }) => {
          if (!cancelled) {
            setSuggestions(res.suggestions || []);
            setIsLoading(false);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setIsLoading(false);
            triggerQuotaWarningIfNeeded(err);
          }
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [placesLib, inputString]);

  return {
    suggestions,
    isLoading,
    resetSession: () => {
      sessionTokenRef.current = null;
      setSuggestions([]);
    },
  };
}

export interface SelectedLocation {
  address: string;
  lat: number;
  lng: number;
}

interface CameroonPlaceInputProps {
  label: string;
  value: string;
  placeholder: string;
  onChangeText: (val: string) => void;
  onSelectPlace: (loc: SelectedLocation) => void;
  onActivateMapPick?: () => void;
  isPickingOnMap?: boolean;
}

export function CameroonPlaceInput({
  label,
  value,
  placeholder,
  onChangeText,
  onSelectPlace,
  onActivateMapPick,
  isPickingOnMap,
}: CameroonPlaceInputProps) {
  const placesLib = useMapsLibrary('places');
  const [focused, setFocused] = useState(false);
  const { suggestions, isLoading, resetSession } = useAutocompleteSuggestions(focused ? value : '');

  const handleSelectSuggestion = useCallback(
    async (suggestion: AutocompleteSuggestionItem) => {
      if (!placesLib || !suggestion.placePrediction) return;
      try {
        const place = suggestion.placePrediction.toPlace();
        await place.fetchFields({
          fields: ['location', 'viewport', 'displayName', 'formattedAddress'],
        });
        const loc = place.location;
        if (loc) {
          const formatted =
            place.formattedAddress ||
            place.displayName ||
            suggestion.placePrediction.text.text;
          onChangeText(formatted);
          onSelectPlace({
            address: formatted,
            lat: loc.lat(),
            lng: loc.lng(),
          });
        }
        resetSession();
        setFocused(false);
      } catch (err) {
        triggerQuotaWarningIfNeeded(err);
      }
    },
    [placesLib, onChangeText, onSelectPlace, resetSession]
  );

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-semibold text-slate-700">{label}</label>
        {onActivateMapPick && (
          <button
            type="button"
            onClick={onActivateMapPick}
            className={`text-xs font-medium px-2 py-0.5 rounded transition-colors whitespace-nowrap shrink-0 ${
              isPickingOnMap
                ? 'bg-[#0B2545] text-yellow-300'
                : 'text-[#0B2545] hover:bg-slate-100'
            }`}
          >
            {isPickingOnMap ? 'Click map to drop pin' : 'Pick on Map'}
          </button>
        )}
      </div>
      <div className="relative">
        <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={value}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          onChange={(e) => onChangeText(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0B2545]/20 focus:border-[#0B2545]"
        />
      </div>

      {focused && (suggestions.length > 0 || isLoading) && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {isLoading && suggestions.length === 0 ? (
            <div className="px-3 py-2.5 text-xs text-slate-500">Searching locations in Cameroon...</div>
          ) : (
            suggestions.map((suggestion, idx) => (
              <button
                key={idx}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  void handleSelectSuggestion(suggestion);
                }}
                className="w-full text-left px-3 py-2.5 text-xs text-slate-800 hover:bg-slate-50 border-b border-slate-100 last:border-b-0 flex items-start gap-2"
              >
                <MapPin className="w-3.5 h-3.5 text-[#0B2545] mt-0.5 shrink-0" />
                <span>{suggestion.placePrediction?.text.text}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface RoutePolylineLike {
  setMap: (map: unknown) => void;
  setOptions: (opts: { strokeColor: string; strokeWeight: number; strokeOpacity: number }) => void;
}

interface RouteOverlayProps {
  origin: { lat: number; lng: number } | null;
  destination: { lat: number; lng: number } | null;
  onRouteCalculated?: (info: { distanceKm: number; durationMins: number }) => void;
}

function RouteOverlay({ origin, destination, onRouteCalculated }: RouteOverlayProps) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<RoutePolylineLike[]>([]);
  const callbackRef = useRef(onRouteCalculated);
  callbackRef.current = onRouteCalculated;

  useEffect(() => {
    if (!map || !origin || !destination) return;

    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    if (!routesLib) {
      const fallbackKm = haversineKm(origin, destination);
      callbackRef.current?.({ distanceKm: fallbackKm, durationMins: Math.round(fallbackKm * 2.8) });
      return;
    }

    let cancelled = false;
    const request = {
      origin,
      destination,
      travelMode: 'DRIVING',
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
    };

    const RouteCls = (routesLib as unknown as { Route?: { computeRoutes?: (req: unknown) => Promise<{ routes?: unknown[] }> } }).Route;

    if (!RouteCls?.computeRoutes) {
      const fallbackKm = haversineKm(origin, destination);
      callbackRef.current?.({ distanceKm: fallbackKm, durationMins: Math.round(fallbackKm * 2.8) });
      return;
    }

    RouteCls.computeRoutes(request)
      .then((res) => {
        if (cancelled) return;
        const routes = res?.routes as Array<{
          createPolylines?: () => RoutePolylineLike[];
          viewport?: Parameters<typeof map.fitBounds>[0];
          distanceMeters?: number;
          durationMillis?: number;
        }>;
        if (!routes || routes.length === 0) {
          const fallbackKm = haversineKm(origin, destination);
          callbackRef.current?.({ distanceKm: fallbackKm, durationMins: Math.round(fallbackKm * 2.8) });
          return;
        }
        const primaryRoute = routes[0];
        if (primaryRoute.createPolylines) {
          const lines = primaryRoute.createPolylines();
          lines.forEach((line) => {
            line.setOptions({
              strokeColor: '#0B2545',
              strokeWeight: 5,
              strokeOpacity: 0.9,
            });
            line.setMap(map);
          });
          polylinesRef.current = lines;
        }
        if (primaryRoute.viewport) {
          map.fitBounds(primaryRoute.viewport);
        }
        const distanceKm = Math.max(1, Number(((primaryRoute.distanceMeters || 5000) / 1000).toFixed(1)));
        const durationMins = Math.max(10, Math.round((primaryRoute.durationMillis || 900000) / 60000));
        callbackRef.current?.({ distanceKm, durationMins });
      })
      .catch((err) => {
        if (cancelled) return;
        triggerQuotaWarningIfNeeded(err);
        const fallbackKm = haversineKm(origin, destination);
        callbackRef.current?.({ distanceKm: fallbackKm, durationMins: Math.round(fallbackKm * 2.8) });
      });

    return () => {
      cancelled = true;
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [map, routesLib, origin?.lat, origin?.lng, destination?.lat, destination?.lng]);

  return null;
}

interface MoveRouteMapProps {
  pickup: { lat: number; lng: number } | null;
  destination: { lat: number; lng: number } | null;
  driverLocation?: { lat: number; lng: number } | null;
  center?: { lat: number; lng: number };
  heightClass?: string;
  onMapClick?: (lat: number, lng: number) => void;
  onRouteCalculated?: (info: { distanceKm: number; durationMins: number }) => void;
  interactiveHint?: string | null;
}

function CameraSync({ center }: { center: { lat: number; lng: number } }) {
  const map = useMap();
  useEffect(() => {
    if (map && center) {
      map.panTo(center);
    }
  }, [map, center.lat, center.lng]);
  return null;
}

export function MoveRouteMap({
  pickup,
  destination,
  driverLocation,
  center = { lat: 4.0511, lng: 9.7679 },
  heightClass = 'h-72',
  onMapClick,
  onRouteCalculated,
  interactiveHint,
}: MoveRouteMapProps) {
  const apiKey = React.useContext(MapsKeyContext);
  const effectiveCenter = driverLocation || pickup || destination || center;

  if (!apiKey) {
    return (
      <div className={`${heightClass} w-full rounded-xl bg-slate-100 border border-slate-200 flex flex-col items-center justify-center p-6 text-center`}>
        <Navigation className="w-8 h-8 text-[#0B2545] mb-2" />
        <p className="text-sm font-semibold text-slate-800">Map View Initializing</p>
        <p className="text-xs text-slate-500 mt-1">
          Loading Google Maps Platform view for Cameroon routes and live driver tracking...
        </p>
      </div>
    );
  }

  return (
    <div className={`relative w-full ${heightClass} rounded-xl overflow-hidden border border-slate-200 bg-slate-100`}>
      <GoogleMap
        mapId="DEMO_MAP_ID"
        defaultCenter={effectiveCenter}
        defaultZoom={12}
        gestureHandling="greedy"
        disableDefaultUI={false}
        streetViewControl={false}
        mapTypeControl={false}
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        style={{ width: '100%', height: '100%' }}
        onClick={(e) => {
          if (onMapClick && e.detail.latLng) {
            onMapClick(e.detail.latLng.lat, e.detail.latLng.lng);
          }
        }}
      >
        <CameraSync center={effectiveCenter} />

        {pickup && (
          <AdvancedMarker position={pickup} title="Pickup Location">
            <Pin background="#0B2545" borderColor="#FFFFFF" glyphColor="#FACC15" />
          </AdvancedMarker>
        )}

        {destination && (
          <AdvancedMarker position={destination} title="Destination">
            <Pin background="#EAB308" borderColor="#0B2545" glyphColor="#0B2545" />
          </AdvancedMarker>
        )}

        {driverLocation && (
          <AdvancedMarker position={driverLocation} title="Assigned Driver Live Location">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0B2545] text-yellow-300 border-2 border-yellow-400 shadow-lg">
              <Truck className="w-4 h-4" />
              <span className="text-[11px] font-bold whitespace-nowrap">Driver Live</span>
            </div>
          </AdvancedMarker>
        )}

        <RouteOverlay
          origin={pickup}
          destination={destination}
          onRouteCalculated={onRouteCalculated}
        />
      </GoogleMap>

      {interactiveHint && (
        <div className="absolute top-3 left-3 z-10 bg-[#0B2545] text-yellow-300 text-xs font-medium px-3 py-1.5 rounded-lg shadow">
          {interactiveHint}
        </div>
      )}
    </div>
  );
}
