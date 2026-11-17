import React from 'react';
import { Bell, CheckCheck, X } from 'lucide-react';
import type { NotificationItem } from '../types/movecam.ts';

interface NotificationsDrawerProps {
  isOpen: boolean;
  notifications: NotificationItem[];
  onClose: () => void;
  onMarkAllRead: () => void;
  onMarkOneRead: (id: number) => void;
  onOpenBooking?: (bookingId: number) => void;
}

export function NotificationsDrawer({
  isOpen,
  notifications,
  onClose,
  onMarkAllRead,
  onMarkOneRead,
  onOpenBooking,
}: NotificationsDrawerProps) {
  if (!isOpen) return null;

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/30 flex justify-end">
      <div className="w-full max-w-md bg-white h-full border-l border-slate-200 shadow-2xl flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-[#0B2545] text-white">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-yellow-400" />
            <h3 className="text-sm font-bold">Notifications</h3>
            {unreadCount > 0 && (
              <span className="text-xs font-mono tabular-nums text-yellow-300">
                · {unreadCount} unread
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="text-xs font-medium text-slate-200 hover:text-white flex items-center gap-1 px-2 py-1 rounded hover:bg-white/10 whitespace-nowrap"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close notifications"
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No notifications yet. Booking confirmations, driver updates, and payment alerts appear here in real time.
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => {
                  if (!n.is_read) onMarkOneRead(n.id);
                  if (n.booking_id && onOpenBooking) {
                    onOpenBooking(n.booking_id);
                    onClose();
                  }
                }}
                className={`px-5 py-4 cursor-pointer transition-colors hover:bg-slate-50 ${
                  n.is_read ? 'bg-white' : 'bg-yellow-50/60'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                  <span className="text-[11px] font-mono text-slate-400 whitespace-nowrap shrink-0">
                    {new Date(n.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">{n.body}</p>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
                  <span className="capitalize">{n.type}</span>
                  {n.booking_id && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#0B2545] font-medium">View Move</span>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
