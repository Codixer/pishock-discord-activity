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

  // No-op functions for compatibility
  const forceShutdown = () => {
    console.log('Version checking disabled');
  };

  const checkVersion = () => {
    console.log('Version checking disabled - current version:', currentVersion);
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