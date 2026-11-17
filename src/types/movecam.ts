export type UserRole = 'customer' | 'driver' | 'assistant' | 'admin';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export type BookingStatus =
  | 'Pending'
  | 'Accepted'
  | 'Confirmed'
  | 'Driver Assigned'
  | 'In Transit'
  | 'Completed'
  | 'Cancelled';

export const BOOKING_STATUS_FLOW: readonly BookingStatus[] = [
  'Pending',
  'Accepted',
  'Confirmed',
  'Driver Assigned',
  'In Transit',
  'Completed',
];

export type VehicleType =
  | 'Pickup Truck'
  | 'Cargo Van'
  | 'Box Truck'
  | 'Heavy Lorry';

export type PaymentMethod = 'mtn_momo' | 'orange_money' | 'cash';

export type PaymentStatus = 'pending' | 'paid' | 'authorized' | 'failed';

export type ComplaintStatus = 'open' | 'investigating' | 'resolved';

export interface User {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  city: string;
  approval_status: ApprovalStatus;
  bio: string;
  license_number: string;
  avatar_url: string;
  created_at: string;
}

export interface Vehicle {
  id: number;
  owner_id: number;
  owner_name?: string;
  owner_phone?: string;
  title: string;
  vehicle_type: VehicleType;
  plate_number: string;
  capacity_label: string;
  max_weight_kg: number;
  base_fare_xaf: number;
  per_km_xaf: number;
  city: string;
  photo_url: string;
  is_available: number;
  is_approved: number;
  created_at: string;
}

export interface AssistantSchedule {
  id: number;
  assistant_id: number;
  day_of_week: string;
  start_time: string;
  end_time: string;
  is_available: number;
  city: string;
  hourly_rate_xaf: number;
}

export interface BookingAssistant {
  id: number;
  booking_id: number;
  assistant_id: number;
  assistant_name: string;
  assistant_phone: string;
  status: 'assigned' | 'accepted' | 'declined' | 'completed';
  created_at: string;
}

export interface Payment {
  id: number;
  booking_id: number;
  booking_ref?: string;
  customer_id: number;
  customer_name?: string;
  amount_xaf: number;
  method: PaymentMethod;
  phone_number: string;
  transaction_ref: string;
  status: PaymentStatus;
  authorized_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface Booking {
  id: number;
  reference_code: string;
  customer_id: number;
  customer_name?: string;
  customer_phone?: string;
  driver_id: number | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  vehicle_id: number | null;
  vehicle_title?: string | null;
  vehicle_type?: string | null;
  vehicle_plate?: string | null;
  vehicle_photo?: string | null;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  destination_address: string;
  destination_lat: number;
  destination_lng: number;
  distance_km: number;
  duration_mins: number;
  scheduled_date: string;
  scheduled_time: string;
  items_description: string;
  estimated_rooms: string;
  belongings_photos: string[];
  assistants_needed: number;
  assistant_fee_xaf: number;
  vehicle_fee_xaf: number;
  total_price_xaf: number;
  status: BookingStatus;
  driver_lat: number | null;
  driver_lng: number | null;
  driver_location_updated_at: string | null;
  created_at: string;
  updated_at: string;
  payment?: Payment | null;
  assistants?: BookingAssistant[];
  rating?: Rating | null;
}

export interface ChatMessage {
  id: number;
  booking_id: number;
  sender_id: number;
  sender_name: string;
  sender_role: UserRole;
  content: string;
  created_at: string;
}

export interface NotificationItem {
  id: number;
  user_id: number;
  title: string;
  body: string;
  type: 'booking' | 'assignment' | 'payment' | 'system';
  booking_id: number | null;
  is_read: number;
  created_at: string;
}

export interface Rating {
  id: number;
  booking_id: number;
  customer_id: number;
  driver_id: number;
  score: number;
  comment: string;
  created_at: string;
}

export interface Complaint {
  id: number;
  booking_id: number | null;
  booking_ref?: string | null;
  user_id: number;
  user_name?: string;
  user_role?: UserRole;
  subject: string;
  description: string;
  status: ComplaintStatus;
  admin_notes: string;
  created_at: string;
  updated_at: string;
}

export interface AdminStats {
  totalUsers: number;
  customersCount: number;
  driversCount: number;
  assistantsCount: number;
  pendingProviders: number;
  totalVehicles: number;
  totalBookings: number;
  activeMoves: number;
  completedMoves: number;
  totalRevenueXaf: number;
  openComplaints: number;
}

export const CAMEROON_CITIES = [
  { name: 'Douala', lat: 4.0511, lng: 9.7679 },
  { name: 'Yaoundé', lat: 3.848, lng: 11.5021 },
  { name: 'Bamenda', lat: 5.9597, lng: 10.146 },
  { name: 'Bafoussam', lat: 5.4778, lng: 10.4176 },
  { name: 'Limbe', lat: 4.0167, lng: 9.2167 },
  { name: 'Buea', lat: 4.155, lng: 9.2417 },
  { name: 'Kribi', lat: 2.9373, lng: 9.9077 },
  { name: 'Garoua', lat: 9.3014, lng: 13.3977 },
] as const;

export const ASSISTANT_RATE_PER_PERSON_XAF = 12000;

export interface RouteDraft {
  vehicleId?: number | null;
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  destinationAddress: string;
  destinationLat: number;
  destinationLng: number;
  distanceKm: number;
  durationMins: number;
  assistantsNeeded?: number;
}

export function formatXaf(amount: number): string {
  return `${Math.round(amount).toLocaleString('en-US')} XAF`;
}
