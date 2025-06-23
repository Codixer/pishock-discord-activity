import { useState, useCallback } from 'react';
import { Notification } from '../components/NotificationSystem';

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [recentNotifications, setRecentNotifications] = useState<Set<string>>(new Set());

  const addNotification = useCallback((
    type: Notification['type'],
    title: string,
    message: string,
    duration: number = 5000
  ) => {
    // Create a unique key for this notification
    const notificationKey = `${type}-${title}-${message}`;
    
    // Check if this exact notification was recently shown (within last 10 seconds)
    if (recentNotifications.has(notificationKey)) {
      return; // Skip duplicate
    }
    
    const id = Math.random().toString(36).substr(2, 9);
    
    // Add to recent notifications set
    setRecentNotifications(prev => new Set(prev).add(notificationKey));
    
    // Remove from recent notifications after 10 seconds
    setTimeout(() => {
      setRecentNotifications(prev => {
        const newSet = new Set(prev);
        newSet.delete(notificationKey);
        return newSet;
      });
    }, 10000);
    
    setNotifications(prev => {
      const notification: Notification = { id, type, title, message };
      
      // Auto-dismiss after duration
      if (duration > 0) {
        setTimeout(() => {
          setNotifications(current => current.filter(n => n.id !== id));
        }, duration);
      }
      
      // Limit to maximum 3 notifications at once
      return [...prev.slice(-2), notification];
    });
    
    return id;
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return {
    notifications,
    addNotification,
    dismissNotification,
    clearAll,
  };
}