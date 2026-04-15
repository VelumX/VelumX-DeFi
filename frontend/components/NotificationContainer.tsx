/**
 * NotificationContainer Component
 * Displays toast notifications with animations
 */

'use client';

import { useNotifications } from '../lib/hooks/useNotifications';
import { CheckCircle, XCircle, Info, Loader2, X } from 'lucide-react';

export function NotificationContainer() {
  const { notifications, removeNotification } = useNotifications();

  const getIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-400" />;
      case 'loading':
        return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
      default:
        return <Info className="w-5 h-5 text-blue-400" />;
    }
  };

  const getBackgroundColor = (type: string) => {
    switch (type) {
      case 'success':
        return 'bg-green-500/10 border-green-500/20';
      case 'error':
        return 'bg-red-500/10 border-red-500/20';
      case 'loading':
        return 'bg-blue-500/10 border-blue-500/20';
      default:
        return 'bg-blue-500/10 border-blue-500/20';
    }
  };

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-3 max-w-md">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`${getBackgroundColor(
            notification.type
          )} border backdrop-blur-xl rounded-xl p-4 shadow-2xl animate-in slide-in-from-right-full fade-in duration-300`}
        >
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className="flex-shrink-0 mt-0.5">{getIcon(notification.type)}</div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{notification.title}</h4>
              {notification.message && (
                <p className="text-sm opacity-80" style={{ color: 'var(--text-secondary)' }}>{notification.message}</p>
              )}
              {notification.action && (
                <button
                  onClick={notification.action.onClick}
                  className="mt-2 text-sm font-medium text-purple-400 hover:text-purple-300 transition-colors"
                >
                  {notification.action.label}
                </button>
              )}
            </div>

            {/* Close Button */}
            {notification.type !== 'loading' && (
              <button
                onClick={() => removeNotification(notification.id)}
                className="flex-shrink-0 opacity-40 hover:opacity-100 transition-all active:scale-90"
                style={{ color: 'var(--text-secondary)' }}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
