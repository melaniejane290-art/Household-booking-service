import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  MapPin,
  MessageSquare,
  Navigation,
  Send,
  Star,
  Truck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import {
  BOOKING_STATUS_FLOW,
  formatXaf,
  type Booking,
  type BookingStatus,
  type ChatMessage,
  type PaymentMethod,
  type User,
} from '../types/movecam.ts';
import { MoveRouteMap } from './MapsComponents.tsx';

interface BookingDetailModalProps {
  booking: Booking;
  currentUser: User;
  incomingMessage?: ChatMessage | null;
  onClose: () => void;
  onUpdated: (booking: Booking) => void;
}

export function BookingDetailModal({
  booking,
  currentUser,
  incomingMessage,
  onClose,
  onUpdated,
}: BookingDetailModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);

  const [payMethod, setPayMethod] = useState<PaymentMethod>(booking.payment?.method || 'mtn_momo');
  const [payPhone, setPayPhone] = useState(booking.payment?.phone_number || currentUser.phone || '+237 6');
  const [txRefInput, setTxRefInput] = useState('');
  const [processingPay, setProcessingPay] = useState(false);

  const [ratingScore, setRatingScore] = useState<number>(booking.rating?.score || 5);
  const [ratingComment, setRatingComment] = useState(booking.rating?.comment || '');
  const [submittingRating, setSubmittingRating] = useState(false);

  const [showComplaintForm, setShowComplaintForm] = useState(false);
  const [complaintSubject, setComplaintSubject] = useState('');
  const [complaintDesc, setComplaintDesc] = useState('');
  const [complaintSaved, setComplaintSaved] = useState(false);

  const [gpsProgress, setGpsProgress] = useState<number>(0.35);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const canChat =
    currentUser.role === 'admin' ||
    booking.customer_id === currentUser.id ||
    booking.driver_id === currentUser.id;

  useEffect(() => {
    if (!canChat) return;
    apiFetch<{ messages: ChatMessage[] }>(`/api/bookings/${booking.id}/messages`)
      .then((res) => setMessages(res.messages))
      .catch(() => {
        // Ignore if user cannot access chat
      });
  }, [booking.id, canChat]);

  useEffect(() => {
    if (incomingMessage && incomingMessage.booking_id === booking.id) {
      setMessages((prev) =>
        prev.some((m) => m.id === incomingMessage.id) ? prev : [...prev, incomingMessage]
      );
    }
  }, [incomingMessage, booking.id]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    setSendingMsg(true);
    try {
      const res = await apiFetch<{ message: ChatMessage }>(`/api/bookings/${booking.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: newMessage }),
      });
      setMessages((prev) =>
        prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]
      );
      setNewMessage('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to send message.');
    } finally {
      setSendingMsg(false);
    }
  };

  const handleStatusChange = async (status: BookingStatus, action?: string) => {
    setUpdatingStatus(true);
    setActionError(null);
    setActionNotice(null);
    try {
      const res = await apiFetch<{ booking: Booking }>(`/api/bookings/${booking.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, action }),
      });
      onUpdated(res.booking);
      setActionNotice(`Booking status updated to ${res.booking.status}.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Status update failed.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleShareDeviceGps = () => {
    setActionError(null);
    if (!navigator.geolocation) {
      setActionError('Browser geolocation is unavailable on this device.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await apiFetch(`/api/bookings/${booking.id}/location`, {
            method: 'POST',
            body: JSON.stringify({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            }),
          });
          setActionNotice('Live device GPS coordinates broadcast to customer.');
        } catch (err) {
          setActionError(err instanceof Error ? err.message : 'Failed to share GPS.');
        }
      },
      () => {
        setActionError('Location permission denied. Use route checkpoint broadcast instead.');
      }
    );
  };

  const handleStepRouteGps = async () => {
    setActionError(null);
    const nextProgress = Math.min(1, Number((gpsProgress + 0.2).toFixed(2)));
    setGpsProgress(nextProgress);
    const lat =
      booking.pickup_lat + (booking.destination_lat - booking.pickup_lat) * nextProgress;
    const lng =
      booking.pickup_lng + (booking.destination_lng - booking.pickup_lng) * nextProgress;
    try {
      await apiFetch(`/api/bookings/${booking.id}/location`, {
        method: 'POST',
        body: JSON.stringify({ lat, lng }),
      });
      setActionNotice(
        `Broadcast live truck coordinates (${Math.round(nextProgress * 100)}% along route).`
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to broadcast location.');
    }
  };

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!booking.payment) return;
    setProcessingPay(true);
    setActionError(null);
    try {
      await apiFetch(`/api/payments/${booking.payment.id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          method: payMethod,
          phone_number: payPhone,
          transaction_ref: txRefInput,
        }),
      });
      const refreshed = await apiFetch<{ booking: Booking }>(`/api/bookings/${booking.id}`);
      onUpdated(refreshed.booking);
      setActionNotice('Payment record updated successfully.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Payment confirmation failed.');
    } finally {
      setProcessingPay(false);
    }
  };

  const handleRate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingRating(true);
    setActionError(null);
    try {
      const res = await apiFetch<{ booking: Booking }>(`/api/bookings/${booking.id}/rate`, {
        method: 'POST',
        body: JSON.stringify({ score: ratingScore, comment: ratingComment }),
      });
      onUpdated(res.booking);
      setActionNotice('Thank you! Your service rating has been saved.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not save rating.');
    } finally {
      setSubmittingRating(false);
    }
  };

  const handleFileComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    try {
      await apiFetch('/api/complaints', {
        method: 'POST',
        body: JSON.stringify({
          booking_id: booking.id,
          subject: complaintSubject,
          description: complaintDesc,
        }),
      });
      setComplaintSaved(true);
      setShowComplaintForm(false);
      setComplaintSubject('');
      setComplaintDesc('');
      setActionNotice('Support ticket filed. MoveCam administrators have been notified.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to submit complaint.');
    }
  };

  const activeStepIndex = BOOKING_STATUS_FLOW.indexOf(booking.status);
  const driverCoords =
    booking.driver_lat !== null && booking.driver_lng !== null
      ? { lat: booking.driver_lat, lng: booking.driver_lng }
      : null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-5xl overflow-hidden shadow-2xl my-6 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="bg-[#0B2545] text-white px-6 py-4 flex items-center justify-between gap-4 shrink-0">
          <div>
            <div className="flex items-center gap-2.5 text-xs text-yellow-300 font-mono">
              <span>{booking.reference_code}</span>
              <span aria-hidden="true">·</span>
              <span>{booking.scheduled_date} at {booking.scheduled_time}</span>
              <span aria-hidden="true">·</span>
              <span className="font-sans font-semibold text-white">{booking.status}</span>
            </div>
            <h2 className="text-base sm:text-lg font-bold mt-0.5 truncate">
              {booking.pickup_address} → {booking.destination_address}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close booking details"
            className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {actionError && (
            <div className="px-4 py-2.5 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700">
              {actionError}
            </div>
          )}
          {actionNotice && (
            <div className="px-4 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800">
              {actionNotice}
            </div>
          )}

          {/* Lifecycle Progress Bar */}
          {booking.status === 'Cancelled' ? (
            <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700">
              This move booking was Cancelled.
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {BOOKING_STATUS_FLOW.map((step, idx) => {
                const done = activeStepIndex >= idx;
                const current = activeStepIndex === idx;
                return (
                  <div
                    key={step}
                    className={`p-2.5 rounded-lg border text-center transition-colors ${
                      current
                        ? 'bg-[#0B2545] text-yellow-300 border-[#0B2545]'
                        : done
                          ? 'bg-slate-100 text-slate-900 border-slate-300'
                          : 'bg-white text-slate-400 border-slate-200'
                    }`}
                  >
                    <div className="text-[10px] font-mono tabular-nums opacity-75">0{idx + 1}</div>
                    <div className="text-xs font-semibold mt-0.5 whitespace-nowrap truncate">
                      {step}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Map + Info Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 space-y-4">
              <MoveRouteMap
                pickup={{ lat: booking.pickup_lat, lng: booking.pickup_lng }}
                destination={{ lat: booking.destination_lat, lng: booking.destination_lng }}
                driverLocation={driverCoords}
                heightClass="h-72"
              />

              {/* Driver Live GPS Controls */}
              {currentUser.role === 'driver' &&
                booking.driver_id === currentUser.id &&
                booking.status !== 'Completed' &&
                booking.status !== 'Cancelled' && (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-[#0B2545] flex items-center gap-1.5">
                        <Navigation className="w-3.5 h-3.5" />
                        <span>Live Trip Location Sharing</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {booking.driver_location_updated_at
                          ? `Last broadcast: ${new Date(booking.driver_location_updated_at).toLocaleTimeString()}`
                          : 'Share your GPS position so the customer can track arrival in real time.'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleShareDeviceGps}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#0B2545] text-[#0B2545] hover:bg-[#0B2545]/5 whitespace-nowrap"
                      >
                        Share Device GPS
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleStepRouteGps()}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#0B2545] text-yellow-300 hover:bg-[#13315C] whitespace-nowrap"
                      >
                        Broadcast Next Checkpoint
                      </button>
                    </div>
                  </div>
                )}

              {/* Driver Status Controls */}
              {currentUser.role === 'driver' &&
                booking.status !== 'Completed' &&
                booking.status !== 'Cancelled' && (
                  <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                    <div className="text-xs font-bold text-slate-800">Driver Trip Actions</div>
                    <div className="flex flex-wrap gap-2">
                      {booking.status === 'Pending' && (
                        <>
                          <button
                            type="button"
                            disabled={updatingStatus}
                            onClick={() => void handleStatusChange('Driver Assigned')}
                            className="px-4 py-2 text-xs font-bold rounded-lg bg-[#0B2545] text-yellow-300 hover:bg-[#13315C] whitespace-nowrap"
                          >
                            Accept & Assign Myself
                          </button>
                          <button
                            type="button"
                            disabled={updatingStatus}
                            onClick={() => void handleStatusChange('Pending', 'reject')}
                            className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                          >
                            Decline
                          </button>
                        </>
                      )}
                      {['Accepted', 'Confirmed'].includes(booking.status) && (
                        <button
                          type="button"
                          disabled={updatingStatus}
                          onClick={() => void handleStatusChange('Driver Assigned')}
                          className="px-4 py-2 text-xs font-bold rounded-lg bg-[#0B2545] text-yellow-300 hover:bg-[#13315C] whitespace-nowrap"
                        >
                          Mark Driver Assigned
                        </button>
                      )}
                      {booking.status === 'Driver Assigned' && (
                        <button
                          type="button"
                          disabled={updatingStatus}
                          onClick={() => void handleStatusChange('In Transit')}
                          className="px-4 py-2 text-xs font-bold rounded-lg bg-yellow-400 text-[#0B2545] hover:bg-yellow-300 whitespace-nowrap"
                        >
                          Start Trip (In Transit)
                        </button>
                      )}
                      {booking.status === 'In Transit' && (
                        <button
                          type="button"
                          disabled={updatingStatus}
                          onClick={() => void handleStatusChange('Completed')}
                          className="px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 whitespace-nowrap"
                        >
                          Complete Delivery
                        </button>
                      )}
                    </div>
                  </div>
                )}

              {/* Belongings & Photos */}
              <div className="p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-bold text-slate-900">Household Items</span>
                  <span>
                    {booking.estimated_rooms} · {booking.distance_km} km · ~{booking.duration_mins} mins
                  </span>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">{booking.items_description}</p>
                {booking.belongings_photos && booking.belongings_photos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 pt-2">
                    {booking.belongings_photos.map((url, idx) => (
                      <img
                        key={idx}
                        src={url}
                        alt={`Belongings item ${idx + 1}`}
                        referrerPolicy="no-referrer"
                        className="aspect-4/3 w-full object-cover rounded-lg border border-slate-200"
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Summary, Payment, Chat, Rating */}
            <div className="lg:col-span-5 space-y-4">
              {/* Crew & Pricing Card */}
              <div className="p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-[#0B2545]" />
                    <span>Assigned Fleet & Crew</span>
                  </span>
                  <span className="text-sm font-mono font-bold text-[#0B2545] tabular-nums">
                    {formatXaf(booking.total_price_xaf)}
                  </span>
                </div>

                <div className="text-xs space-y-1.5 text-slate-600">
                  <div>
                    <span className="text-slate-400">Customer:</span>{' '}
                    <span className="font-semibold text-slate-900">{booking.customer_name}</span> ({booking.customer_phone})
                  </div>
                  <div>
                    <span className="text-slate-400">Vehicle:</span>{' '}
                    <span className="font-semibold text-slate-900">
                      {booking.vehicle_title || 'Unassigned'} {booking.vehicle_plate ? `· ${booking.vehicle_plate}` : ''}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Driver:</span>{' '}
                    <span className="font-semibold text-slate-900">
                      {booking.driver_name ? `${booking.driver_name} (${booking.driver_phone})` : 'Awaiting driver acceptance'}
                    </span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                    <span>
                      Assistants requested: <strong>{booking.assistants_needed}</strong>
                      {booking.assistants && booking.assistants.length > 0 && (
                        <>
                          {' '}
                          ({booking.assistants.map((a) => `${a.assistant_name} [${a.status}]`).join(', ')})
                        </>
                      )}
                    </span>
                  </div>
                </div>

                {currentUser.role === 'customer' &&
                  ['Pending', 'Accepted'].includes(booking.status) && (
                    <button
                      type="button"
                      disabled={updatingStatus}
                      onClick={() => void handleStatusChange('Cancelled')}
                      className="w-full py-2 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-colors"
                    >
                      Cancel Booking
                    </button>
                  )}
              </div>

              {/* Payment Card */}
              {booking.payment && (
                <div className="p-4 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Wallet className="w-4 h-4 text-[#0B2545]" />
                      <span>Payment Status</span>
                    </span>
                    <span
                      className={`text-xs font-bold uppercase ${
                        booking.payment.status === 'paid' || booking.payment.status === 'authorized'
                          ? 'text-emerald-700'
                          : 'text-amber-700'
                      }`}
                    >
                      {booking.payment.status}
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 space-y-1">
                    <div>
                      Method:{' '}
                      <strong className="text-slate-900">
                        {booking.payment.method === 'mtn_momo'
                          ? 'MTN Mobile Money'
                          : booking.payment.method === 'orange_money'
                            ? 'Orange Money'
                            : 'Authorised Cash'}
                      </strong>
                    </div>
                    <div className="font-mono text-[11px] text-slate-500">
                      Ref: {booking.payment.transaction_ref} · {formatXaf(booking.payment.amount_xaf)}
                    </div>
                  </div>

                  {booking.payment.status === 'pending' &&
                    (currentUser.role === 'customer' ||
                      (currentUser.role === 'driver' && booking.payment.method === 'cash') ||
                      currentUser.role === 'admin') && (
                      <form onSubmit={handleConfirmPayment} className="pt-2 border-t border-slate-100 space-y-2">
                        {currentUser.role === 'customer' && (
                          <div className="grid grid-cols-2 gap-2">
                            <select
                              value={payMethod}
                              onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                            >
                              <option value="mtn_momo">MTN MoMo</option>
                              <option value="orange_money">Orange Money</option>
                              <option value="cash">Cash on Delivery</option>
                            </select>
                            <input
                              type="tel"
                              value={payPhone}
                              onChange={(e) => setPayPhone(e.target.value)}
                              placeholder="+237 6XX..."
                              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                            />
                          </div>
                        )}
                        <input
                          type="text"
                          value={txRefInput}
                          onChange={(e) => setTxRefInput(e.target.value)}
                          placeholder="Optional MoMo/OM transaction ID"
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                        />
                        <button
                          type="submit"
                          disabled={processingPay}
                          className="w-full py-2 text-xs font-bold rounded-lg bg-yellow-400 hover:bg-yellow-300 text-[#0B2545] transition-colors"
                        >
                          {processingPay
                            ? 'Processing...'
                            : currentUser.role === 'driver'
                              ? 'Authorize Cash Payment Receipt'
                              : payMethod === 'cash'
                                ? 'Switch to Authorised Cash'
                                : 'Confirm Mobile Money Payment'}
                        </button>
                      </form>
                    )}
                </div>
              )}

              {/* Communication Chat */}
              {canChat && (
                <div className="rounded-xl border border-slate-200 overflow-hidden flex flex-col">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <MessageSquare className="w-3.5 h-3.5 text-[#0B2545]" />
                    <span>Customer & Driver Messages</span>
                  </div>
                  <div className="p-3 space-y-2.5 max-h-48 overflow-y-auto bg-white">
                    {messages.length === 0 ? (
                      <div className="text-xs text-slate-400 py-4 text-center">
                        No messages yet. Coordinate pickup directions or arrival times here.
                      </div>
                    ) : (
                      messages.map((m) => {
                        const mine = m.sender_id === currentUser.id;
                        return (
                          <div
                            key={m.id}
                            className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
                          >
                            <div className="text-[10px] text-slate-400 mb-0.5">
                              {m.sender_name} · {m.sender_role}
                            </div>
                            <div
                              className={`px-3 py-2 rounded-lg text-xs max-w-[85%] ${
                                mine
                                  ? 'bg-[#0B2545] text-white'
                                  : 'bg-slate-100 text-slate-800'
                              }`}
                            >
                              {m.content}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <form onSubmit={handleSendMessage} className="p-2 border-t border-slate-200 flex gap-2 bg-slate-50">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Write a message..."
                      className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B2545]"
                    />
                    <button
                      type="submit"
                      disabled={sendingMsg || !newMessage.trim()}
                      className="px-3 py-1.5 rounded-lg bg-[#0B2545] text-yellow-300 hover:bg-[#13315C] disabled:opacity-50"
                      aria-label="Send message"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </div>
              )}

              {/* Rating (Completed Move) */}
              {booking.status === 'Completed' && currentUser.role === 'customer' && (
                <div className="p-4 rounded-xl border border-slate-200 space-y-3">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>{booking.rating ? 'Your Move Rating' : 'Rate Completed Move'}</span>
                  </div>
                  {booking.rating ? (
                    <div className="text-xs text-slate-700 space-y-1">
                      <div className="flex items-center gap-1 text-yellow-500">
                        {Array.from({ length: booking.rating.score }).map((_, idx) => (
                          <Star key={idx} className="w-4 h-4 fill-yellow-400 text-yellow-500" />
                        ))}
                      </div>
                      <p>{booking.rating.comment || 'No written comment.'}</p>
                    </div>
                  ) : (
                    <form onSubmit={handleRate} className="space-y-2.5">
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setRatingScore(s)}
                            className="p-1"
                            aria-label={`Rate ${s} stars`}
                          >
                            <Star
                              className={`w-5 h-5 ${
                                s <= ratingScore
                                  ? 'fill-yellow-400 text-yellow-500'
                                  : 'text-slate-300'
                              }`}
                            />
                          </button>
                        ))}
                      </div>
                      <textarea
                        rows={2}
                        value={ratingComment}
                        onChange={(e) => setRatingComment(e.target.value)}
                        placeholder="Share feedback on punctuality and item care..."
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                      <button
                        type="submit"
                        disabled={submittingRating}
                        className="w-full py-2 text-xs font-bold rounded-lg bg-[#0B2545] text-yellow-300 hover:bg-[#13315C]"
                      >
                        {submittingRating ? 'Saving...' : 'Submit Rating'}
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* Support Complaint Toggle */}
              {currentUser.role !== 'admin' && !complaintSaved && (
                <div>
                  {!showComplaintForm ? (
                    <button
                      type="button"
                      onClick={() => setShowComplaintForm(true)}
                      className="text-xs font-medium text-slate-500 hover:text-[#0B2545] flex items-center gap-1.5"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Report an issue or file a complaint</span>
                    </button>
                  ) : (
                    <form
                      onSubmit={handleFileComplaint}
                      className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">File Support Ticket</span>
                        <button
                          type="button"
                          onClick={() => setShowComplaintForm(false)}
                          className="text-xs text-slate-500"
                        >
                          Cancel
                        </button>
                      </div>
                      <input
                        type="text"
                        required
                        value={complaintSubject}
                        onChange={(e) => setComplaintSubject(e.target.value)}
                        placeholder="Issue subject (e.g., Late arrival, damaged item)"
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                      />
                      <textarea
                        rows={2}
                        required
                        value={complaintDesc}
                        onChange={(e) => setComplaintDesc(e.target.value)}
                        placeholder="Describe what happened..."
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                      />
                      <button
                        type="submit"
                        className="w-full py-2 text-xs font-bold rounded-lg bg-[#0B2545] text-yellow-300"
                      >
                        Submit to Admin Support
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
