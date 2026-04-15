/**
 * Notifications Hook
 * Global notification system for success, error, and loading states
 */

import { useState, useCallback, useEffect } from 'react';

export type NotificationType = 'success' | 'error' | 'info' | 'loading';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

let globalNotifications: Notification[] = [];
let globalListeners: Array<(notifications: Notification[]) => void> = [];

const notifyListeners = () => {
  globalListeners.forEach(listener => listener([...globalNotifications]));
};

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>(globalNotifications);

  useEffect(() => {
    const listener = (newNotifications: Notification[]) => {
      setNotifications(newNotifications);
    };
    globalListeners.push(listener);

    return () => {
      globalListeners = globalListeners.filter(l => l !== listener);
    };
  }, []);

  const addNotification = useCallback((notification: Omit<Notification, 'id'>) => {
    const id = Math.random().toString(36).substring(7);
    const newNotification: Notification = {
      id,
      duration: 5000, // Default 5 seconds
      ...notification,
    };

    globalNotifications = [...globalNotifications, newNotification];
    notifyListeners();

    // Auto-remove after duration (unless it's a loading notification)
    if (notification.type !== 'loading' && newNotification.duration) {
      setTimeout(() => {
        removeNotification(id);
      }, newNotification.duration);
    }

    return id;
  }, []);

  const removeNotification = useCallback((id: string) => {
    globalNotifications = globalNotifications.filter(n => n.id !== id);
    notifyListeners();
  }, []);

  const updateNotification = useCallback((id: string, updates: Partial<Notification>) => {
    globalNotifications = globalNotifications.map(n =>
      n.id === id ? { ...n, ...updates } : n
    );
    notifyListeners();
  }, []);

  const clearAll = useCallback(() => {
    globalNotifications = [];
    notifyListeners();
  }, []);

  // Convenience methods
  const success = useCallback((title: string, message?: string, action?: Notification['action']) => {
    return addNotification({ type: 'success', title, message, action });
  }, [addNotification]);

  const error = useCallback((title: string, message?: string, action?: Notification['action']) => {
    return addNotification({ type: 'error', title, message, action, duration: 7000 });
  }, [addNotification]);

  const info = useCallback((title: string, message?: string, action?: Notification['action']) => {
    return addNotification({ type: 'info', title, message, action });
  }, [addNotification]);

  const loading = useCallback((title: string, message?: string) => {
    return addNotification({ type: 'loading', title, message, duration: undefined });
  }, [addNotification]);

  return {
    notifications,
    addNotification,
    removeNotification,
    updateNotification,
    clearAll,
    success,
    error,
    info,
    loading,
  };
}
