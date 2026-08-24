import React from 'react';
import { Bell, X, CheckCheck, AlertTriangle, CheckCircle2, Info, AlertOctagon } from 'lucide-react';
import { NotificationLog } from '../types';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationLog[];
  onMarkAllAsRead: () => void;
  onClearNotifications: () => void;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  isOpen,
  onClose,
  notifications,
  onMarkAllAsRead,
  onClearNotifications,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <Bell className="w-5 h-5 text-indigo-600" />
            <h3 className="text-base font-bold text-slate-900">
              Exam Cell Alerts & Alteration Broadcasts
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pb-1">
          <span>{notifications.length} Total Incident Logs</span>
          <div className="space-x-3">
            <button
              onClick={onMarkAllAsRead}
              className="text-indigo-600 hover:underline font-semibold"
            >
              Mark all as read
            </button>
            <button
              onClick={onClearNotifications}
              className="text-slate-400 hover:text-rose-600 font-semibold"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 divide-y divide-slate-100 text-xs">
          {notifications.length > 0 ? (
            notifications.map((notif) => (
              <div
                key={notif.id}
                className={`py-3 flex items-start space-x-3 ${
                  !notif.read ? 'bg-indigo-50/40 p-2 rounded-xl' : ''
                }`}
              >
                <div className="mt-0.5">
                  {notif.type === 'emergency' ? (
                    <AlertOctagon className="w-4 h-4 text-rose-600" />
                  ) : notif.type === 'warning' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                  ) : notif.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Info className="w-4 h-4 text-blue-500" />
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-800 text-xs">{notif.title}</h4>
                    <span className="text-[10px] text-slate-400">{notif.timestamp}</span>
                  </div>
                  <p className="text-slate-600 text-[11px] mt-0.5 leading-relaxed">
                    {notif.message}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="py-8 text-center text-slate-400">
              No recent notifications or alerts.
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
