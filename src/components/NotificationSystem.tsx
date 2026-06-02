import React from 'react';
import { X, AlertTriangle, CheckCircle, Info } from 'lucide-react';

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
}

interface NotificationSystemProps {
  notifications: Notification[];
  onDismiss: (id: string) => void;
}

export function NotificationSystem({ notifications, onDismiss }: NotificationSystemProps) {
  if (notifications.length === 0) return null;

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-5 w-5" />;
      case 'error':
        return <AlertTriangle className="h-5 w-5" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5" />;
      case 'info':
        return <Info className="h-5 w-5" />;
    }
  };

  const getColors = (type: Notification['type']) => {
    switch (type) {
      case 'success':
        return 'bg-emerald-950/95 border-emerald-400/45 text-emerald-100';
      case 'error':
        return 'bg-red-950/95 border-red-400/45 text-red-100';
      case 'warning':
        return 'bg-amber-950/95 border-amber-400/45 text-amber-100';
      case 'info':
        return 'bg-cyan-950/95 border-cyan-400/45 text-cyan-100';
    }
  };

  return (
    <div className="fixed top-3 right-3 z-50 space-y-1.5 max-w-sm">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`${getColors(notification.type)} backdrop-blur-sm border rounded p-2.5 shadow-lg animate-in slide-in-from-right duration-300`}
        >
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              {getIcon(notification.type)}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-xs uppercase tracking-[0.1em]">{notification.title}</h4>
              <p className="text-xs opacity-90 mt-1">{notification.message}</p>
            </div>
            <button
              onClick={() => onDismiss(notification.id)}
              className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}