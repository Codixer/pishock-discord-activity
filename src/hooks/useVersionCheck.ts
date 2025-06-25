import { useState } from 'react';

interface UseVersionCheckProps {
  currentVersion: string;
  onOutdated?: (timeRemaining: number) => void;
  onShutdown?: () => void;
  addNotification?: (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => void;
}

// Simplified version hook that just returns static values
export function useVersionCheck({ 
  currentVersion, 
  onOutdated, 
  onShutdown, 
  addNotification 
}: UseVersionCheckProps) {
  const [isOutdated] = useState(false);
  const [isShuttingDown] = useState(false);
  const [isChecking] = useState(false);
  const [timeRemaining] = useState(0);

  const forceShutdown = () => {
    // No-op for compatibility
  };

  const checkVersion = () => {
    // No-op for compatibility
  };

  return {
    isOutdated,
    isShuttingDown,
    isChecking,
    timeRemaining,
    forceShutdown,
    checkVersion
  };
}