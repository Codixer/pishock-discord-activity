import { useState, useCallback } from 'react';
import { Notification } from '../components/NotificationSystem';

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback((
    type: Notification['type'],
    title: string,
    message: string,
    duration: number = 5000
  ) => {
    const id = Math.random().toString(36).substr(2, 9);
    
    // Prevent duplicate notifications by checking recent notifications (more robust check)
    setNotifications(prev => {
      const isDuplicate = prev.some(n => 
        n.type === type && n.title === title && n.message === message
      );
      
      if (isDuplicate) {
        return prev; // Don't add duplicate
      }
      
      const notification: Notification = { id, type, title, message };
      
      // Auto-dismiss after duration
      if (duration > 0) {
        setTimeout(() => {
          setNotifications(current => current.filter(n => n.id !== id));
        }, duration);
      }
      
      return [...prev, notification];
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