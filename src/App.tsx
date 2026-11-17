import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  Calendar,
  ClipboardList,
  Globe,
  LogOut,
  Plus,
  ShieldAlert,
  Truck,
  User as UserIcon,
  Users,
  Wallet,
} from 'lucide-react';
import {
  apiFetch,
  getStoredToken,
  setStoredToken,
  useMoveCamSocket,
  type SocketEventPayload,
} from './lib/api.ts';
import type {
  AdminStats,
  AssistantSchedule,
  Booking,
  ChatMessage,
  Complaint,
  NotificationItem,
  Payment,
  RouteDraft,
  User,
  UserRole,
  Vehicle,
} from './types/movecam.ts';
import { MoveCamAPIProvider } from './components/MapsComponents.tsx';
import { LandingPage } from './components/LandingPage.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { NotificationsDrawer } from './components/NotificationsDrawer.tsx';
import { BookingDetailModal } from './components/BookingDetailModal.tsx';
import { CustomerDashboard } from './components/CustomerDashboard.tsx';
import { DriverDashboard } from './components/DriverDashboard.tsx';
import { AssistantDashboard } from './components/AssistantDashboard.tsx';
import { AdminDashboard } from './components/AdminDashboard.tsx';

export default function App() {
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);

  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(Boolean(getStoredToken()));
  const [viewMode, setViewMode] = useState<'landing' | 'workspace'>('landing');

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  const [authModalRole, setAuthModalRole] = useState<Exclude<UserRole, 'admin'>>('customer');

  const [activeTab, setActiveTab] = useState<string>('overview');
  const [preselectedVehicleId, setPreselectedVehicleId] = useState<number | null>(null);
  const [routeDraft, setRouteDraft] = useState<RouteDraft | null>(null);

  const [publicVehicles, setPublicVehicles] = useState<Vehicle[]>([]);
  const [myVehicles, setMyVehicles] = useState<Vehicle[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [assistantSchedules, setAssistantSchedules] = useState<AssistantSchedule[]>([]);

  // Admin state
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [adminVehicles, setAdminVehicles] = useState<Vehicle[]>([]);

  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [latestMessage, setLatestMessage] = useState<ChatMessage | null>(null);
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);

  useEffect(() => {
    const onQuota = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  const loadPublicVehicles = useCallback(async () => {
    try {
      const res = await apiFetch<{ vehicles: Vehicle[] }>('/api/vehicles?scope=public');
      setPublicVehicles(res.vehicles);
    } catch {
      // Ignore transient error
    }
  }, []);

  const loadWorkspaceData = useCallback(async (user: User) => {
    try {
      const [bookingsRes, notifRes] = await Promise.all([
        apiFetch<{ bookings: Booking[] }>('/api/bookings'),
        apiFetch<{ notifications: NotificationItem[] }>('/api/notifications'),
      ]);
      setBookings(bookingsRes.bookings);
      setNotifications(notifRes.notifications);

      if (user.role === 'customer' || user.role === 'driver' || user.role === 'admin') {
        const payRes = await apiFetch<{ payments: Payment[] }>('/api/payments');
        setPayments(payRes.payments);
      }

      if (user.role === 'customer' || user.role === 'admin') {
        const compRes = await apiFetch<{ complaints: Complaint[] }>('/api/complaints');
        setComplaints(compRes.complaints);
      }

      if (user.role === 'driver') {
        const myVehRes = await apiFetch<{ vehicles: Vehicle[] }>('/api/vehicles?scope=mine');
        setMyVehicles(myVehRes.vehicles);
      }

      if (user.role === 'assistant') {
        const schedRes = await apiFetch<{ schedules: AssistantSchedule[] }>(
          '/api/assistant/schedules'
        );
        setAssistantSchedules(schedRes.schedules);
      }

      if (user.role === 'admin') {
        const [statsRes, usersRes, allVehRes] = await Promise.all([
          apiFetch<{ stats: AdminStats }>('/api/admin/stats'),
          apiFetch<{ users: User[] }>('/api/admin/users'),
          apiFetch<{ vehicles: Vehicle[] }>('/api/vehicles?scope=all'),
        ]);
        setAdminStats(statsRes.stats);
        setAdminUsers(usersRes.users);
        setAdminVehicles(allVehRes.vehicles);
      }
    } catch {
      // Ignore partial load error
    }
  }, []);

  useEffect(() => {
    void loadPublicVehicles();
  }, [loadPublicVehicles]);

  useEffect(() => {
    if (!token) {
      setCurrentUser(null);
      setAuthLoading(false);
      return;
    }
    setAuthLoading(true);
    apiFetch<{ user: User }>('/api/auth/me')
      .then((res) => {
        setCurrentUser(res.user);
        setViewMode('workspace');
        setActiveTab(res.user.role === 'customer' ? 'moves' : 'overview');
        return loadWorkspaceData(res.user);
      })
      .catch(() => {
        setStoredToken(null);
        setToken(null);
        setCurrentUser(null);
      })
      .finally(() => setAuthLoading(false));
  }, [token, loadWorkspaceData]);

  // Real-Time WebSocket Event Handler
  const handleSocketEvent = useCallback(
    (payload: SocketEventPayload) => {
      if (payload.event === 'booking:updated' || payload.event === 'booking:created') {
        const updated = payload.data as Booking;
        setBookings((prev) => {
          const exists = prev.some((b) => b.id === updated.id);
          if (exists) return prev.map((b) => (b.id === updated.id ? updated : b));
          return [updated, ...prev];
        });
        setSelectedBooking((prev) => (prev && prev.id === updated.id ? updated : prev));
        if (currentUser?.role === 'admin') {
          void loadWorkspaceData(currentUser);
        }
      } else if (payload.event === 'booking:location') {
        const loc = payload.data as { bookingId: number; lat: number; lng: number; updatedAt: string };
        setBookings((prev) =>
          prev.map((b) =>
            b.id === loc.bookingId
              ? {
                  ...b,
                  driver_lat: loc.lat,
                  driver_lng: loc.lng,
                  driver_location_updated_at: loc.updatedAt,
                }
              : b
          )
        );
        setSelectedBooking((prev) =>
          prev && prev.id === loc.bookingId
            ? {
                ...prev,
                driver_lat: loc.lat,
                driver_lng: loc.lng,
                driver_location_updated_at: loc.updatedAt,
              }
            : prev
        );
      } else if (payload.event === 'notification:new') {
        const notif = payload.data as NotificationItem;
        setNotifications((prev) =>
          prev.some((n) => n.id === notif.id) ? prev : [notif, ...prev]
        );
      } else if (payload.event === 'message:new') {
        setLatestMessage(payload.data as ChatMessage);
      }
    },
    [currentUser, loadWorkspaceData]
  );

  useMoveCamSocket(token, handleSocketEvent);

  const handleOpenAuth = (
    mode: 'login' | 'register',
    role: Exclude<UserRole, 'admin'> = 'customer'
  ) => {
    setAuthModalMode(mode);
    setAuthModalRole(role);
    setAuthModalOpen(true);
  };

  const handleStartBooking = (vehicleId?: number, draft?: RouteDraft) => {
    setPreselectedVehicleId(vehicleId ?? draft?.vehicleId ?? null);
    setRouteDraft(draft ?? null);
    if (!currentUser) {
      handleOpenAuth('login', 'customer');
      return;
    }
    if (currentUser.role === 'customer') {
      setViewMode('workspace');
      setActiveTab('book');
    } else {
      setViewMode('workspace');
    }
  };

  const handleAuthSuccess = (user: User, newToken: string) => {
    setToken(newToken);
    setCurrentUser(user);
    setViewMode('workspace');
    setActiveTab(
      (preselectedVehicleId !== null || routeDraft !== null) && user.role === 'customer'
        ? 'book'
        : user.role === 'customer'
          ? 'moves'
          : 'overview'
    );
    void loadWorkspaceData(user);
  };

  const handleLogout = () => {
    setStoredToken(null);
    setToken(null);
    setCurrentUser(null);
    setBookings([]);
    setPayments([]);
    setNotifications([]);
    setSelectedBooking(null);
    setViewMode('landing');
  };

  const handleMarkAllRead = async () => {
    await apiFetch('/api/notifications/read-all', { method: 'PATCH' });
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
  };

  const handleMarkOneRead = async (id: number) => {
    await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)));
  };

  const handleOpenBookingById = async (bookingId: number) => {
    const found = bookings.find((b) => b.id === bookingId);
    if (found) {
      setSelectedBooking(found);
      return;
    }
    try {
      const res = await apiFetch<{ booking: Booking }>(`/api/bookings/${bookingId}`);
      setSelectedBooking(res.booking);
    } catch {
      // Ignore if inaccessible
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const sidebarItems =
    currentUser?.role === 'customer'
      ? [
          { id: 'moves', label: 'My Bookings', Icon: Truck },
          { id: 'book', label: 'Book a Move', Icon: Plus },
          { id: 'payments', label: 'Payment History', Icon: Wallet },
          { id: 'support', label: 'Support & Issues', Icon: ShieldAlert },
          { id: 'profile', label: 'Profile', Icon: UserIcon },
        ]
      : currentUser?.role === 'driver'
        ? [
            { id: 'overview', label: 'Requests & Trips', Icon: Truck },
            { id: 'fleet', label: 'My Fleet Vehicles', Icon: ClipboardList },
            { id: 'earnings', label: 'Trip Payments', Icon: Wallet },
            { id: 'profile', label: 'Profile', Icon: UserIcon },
          ]
        : currentUser?.role === 'assistant'
          ? [
              { id: 'overview', label: 'Job Assignments', Icon: Users },
              { id: 'schedule', label: 'Work Schedule', Icon: Calendar },
              { id: 'profile', label: 'Profile', Icon: UserIcon },
            ]
          : [
              { id: 'overview', label: 'Overview & Dispatch', Icon: ClipboardList },
              { id: 'users', label: 'Users & Approvals', Icon: Users },
              { id: 'vehicles', label: 'Fleet Vehicles', Icon: Truck },
              { id: 'payments', label: 'Payments Ledger', Icon: Wallet },
              { id: 'complaints', label: 'Complaints Desk', Icon: ShieldAlert },
            ];

  return (
    <MoveCamAPIProvider>
      {gmpQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {authLoading ? (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm font-medium text-slate-600">
          Loading MoveCam workspace...
        </div>
      ) : !currentUser || viewMode === 'landing' ? (
        <LandingPage
          currentUser={currentUser}
          vehicles={publicVehicles}
          onOpenAuth={handleOpenAuth}
          onStartBooking={handleStartBooking}
          onGoToDashboard={() => setViewMode('workspace')}
        />
      ) : (
        <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
          {/* Workspace Sidebar */}
          <aside className="w-full lg:w-64 bg-[#0B2545] text-white flex flex-col shrink-0">
            <div className="px-6 py-5 border-b border-white/10">
              <div className="font-display text-xl font-extrabold tracking-tight text-white">
                MoveCam
              </div>
              <div className="text-[11px] text-yellow-300 mt-0.5">
                Book • Move • Relocate
              </div>
            </div>

            <div className="px-5 py-4 border-b border-white/10">
              <div className="text-sm font-bold text-white truncate">{currentUser.name}</div>
              <div className="text-xs text-slate-300 capitalize">
                {currentUser.role} · {currentUser.city}
              </div>
            </div>

            <nav className="flex-1 p-3 flex lg:flex-col gap-1 overflow-x-auto">
              {sidebarItems.map(({ id, label, Icon }) => {
                const active = activeTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveTab(id)}
                    className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-yellow-400 text-[#0B2545]'
                        : 'text-slate-200 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="p-3 border-t border-white/10 flex lg:flex-col gap-1">
              <button
                type="button"
                onClick={() => setViewMode('landing')}
                className="flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white whitespace-nowrap"
              >
                <Globe className="w-4 h-4 shrink-0" />
                <span>Public Website</span>
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-red-500/20 hover:text-red-200 whitespace-nowrap"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span>Sign Out</span>
              </button>
            </div>
          </aside>

          {/* Main Workspace Area */}
          <div className="flex-1 flex flex-col min-w-0">
            <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-4">
              <div className="text-sm font-semibold text-slate-800 capitalize truncate">
                MoveCam / {currentUser.role} Portal /{' '}
                <span className="text-[#0B2545] font-bold">{activeTab}</span>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setNotifDrawerOpen(true)}
                  className="relative px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Bell className="w-4 h-4 text-[#0B2545]" />
                  <span>Alerts</span>
                  {unreadCount > 0 && (
                    <span className="font-mono font-bold text-[#0B2545] tabular-nums">
                      ({unreadCount})
                    </span>
                  )}
                </button>

                {currentUser.role === 'customer' && activeTab !== 'book' && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('book')}
                    className="px-4 py-2 rounded-lg bg-[#0B2545] hover:bg-[#13315C] text-yellow-300 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Book Move</span>
                  </button>
                )}
              </div>
            </header>

            <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
              {currentUser.role === 'customer' && (
                <CustomerDashboard
                  user={currentUser}
                  bookings={bookings}
                  vehicles={publicVehicles}
                  payments={payments}
                  complaints={complaints}
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                  preselectedVehicleId={preselectedVehicleId}
                  routeDraft={routeDraft}
                  onOpenBooking={(b) => setSelectedBooking(b)}
                  onBookingCreated={(created) => {
                    setRouteDraft(null);
                    setBookings((prev) => [created, ...prev]);
                    void loadWorkspaceData(currentUser);
                  }}
                  onUserUpdated={setCurrentUser}
                />
              )}

              {currentUser.role === 'driver' && (
                <DriverDashboard
                  user={currentUser}
                  bookings={bookings}
                  myVehicles={myVehicles}
                  payments={payments}
                  activeTab={activeTab}
                  onOpenBooking={(b) => setSelectedBooking(b)}
                  onVehiclesChanged={() => {
                    void loadWorkspaceData(currentUser);
                    void loadPublicVehicles();
                  }}
                  onUserUpdated={setCurrentUser}
                />
              )}

              {currentUser.role === 'assistant' && (
                <AssistantDashboard
                  user={currentUser}
                  bookings={bookings}
                  schedules={assistantSchedules}
                  activeTab={activeTab}
                  onBookingUpdated={(updated) => {
                    setBookings((prev) =>
                      prev.map((b) => (b.id === updated.id ? updated : b))
                    );
                  }}
                  onSchedulesUpdated={setAssistantSchedules}
                  onOpenBooking={(b) => setSelectedBooking(b)}
                  onUserUpdated={setCurrentUser}
                />
              )}

              {currentUser.role === 'admin' && (
                <AdminDashboard
                  stats={adminStats}
                  users={adminUsers}
                  vehicles={adminVehicles}
                  bookings={bookings}
                  payments={payments}
                  complaints={complaints}
                  activeTab={activeTab}
                  onRefreshAll={() => {
                    void loadWorkspaceData(currentUser);
                    void loadPublicVehicles();
                  }}
                  onOpenBooking={(b) => setSelectedBooking(b)}
                />
              )}
            </main>
          </div>
        </div>
      )}

      <AuthModal
        isOpen={authModalOpen}
        initialMode={authModalMode}
        initialRole={authModalRole}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />

      {currentUser && (
        <NotificationsDrawer
          isOpen={notifDrawerOpen}
          notifications={notifications}
          onClose={() => setNotifDrawerOpen(false)}
          onMarkAllRead={() => void handleMarkAllRead()}
          onMarkOneRead={(id) => void handleMarkOneRead(id)}
          onOpenBooking={(bookingId) => void handleOpenBookingById(bookingId)}
        />
      )}

      {currentUser && selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          currentUser={currentUser}
          incomingMessage={latestMessage}
          onClose={() => setSelectedBooking(null)}
          onUpdated={(updated) => {
            setSelectedBooking(updated);
            setBookings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
            void loadWorkspaceData(currentUser);
          }}
        />
      )}
    </MoveCamAPIProvider>
  );
}
